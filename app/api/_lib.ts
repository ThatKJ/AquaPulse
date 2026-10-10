// Shared plumbing for the route handlers: request ids, error envelope, logging, auth, rate limit,
// the host-allowlisted media fetcher and the report ingestion used by both report webhooks.
import { createHash, createHmac, randomUUID } from "node:crypto";
import type { z } from "zod";
import { AiError, logOp, safeEqual, sniffImageType } from "@/lib/aws/clients";
import { analyzeEvidence } from "@/lib/aws/evidence";
import { repo } from "@/lib/db";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from "@/lib/schemas/api";
import { serverEnv } from "@/lib/schemas/env";
import type { EvidenceAnalysis } from "@/lib/schemas/evidence";

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

const AI_STATUS: Record<string, number> = { THROTTLED: 429, CREDENTIALS: 503, NO_OBSERVER: 503, UNSUPPORTED_IMAGE: 415 };

export function json(requestId: string, body: object, status = 200): Response {
  return Response.json({ requestId, ...body }, { status, headers: { "x-request-id": requestId, "cache-control": "no-store" } });
}

/** Wraps a handler: request id, one JSON log line, ErrorResponseSchema envelope, no stack traces or secrets. */
export function handle(route: string, fn: (req: Request, requestId: string) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    const requestId = randomUUID();
    const start = Date.now();
    let res: Response;
    let code: string | undefined;
    try {
      res = await fn(req, requestId);
    } catch (err) {
      let status = 500;
      let message = "Unexpected server error.";
      code = "INTERNAL";
      if (err instanceof HttpError) [status, code, message] = [err.status, err.code, err.message];
      else if (err instanceof AiError) [status, code, message] = [AI_STATUS[err.code] ?? 502, `AI_${err.code}`, err.fix];
      else if (err instanceof Error && err.name === "DbError") [status, code, message] = [502, "DB_ERROR", "The database rejected the operation."];
      if (status === 500 || code === "DB_ERROR") console.error(JSON.stringify({ requestId, route, error: err instanceof Error ? err.message : String(err) }));
      res = json(requestId, { error: { code, message } }, status);
    }
    logOp({ service: "api", op: route, requestId, durationMs: Date.now() - start, status: res.status < 400 ? "ok" : "error", httpStatus: res.status, code });
    return res;
  };
}

// ponytail: per-instance sliding window; behind several instances the real limit is N x this. Move to the DB or an edge limiter when that matters.
const hits = new Map<string, number[]>();
export function rateLimit(req: Request, max = 10, windowMs = 60_000) {
  // x-real-ip is set by the host platform; a client can forge x-forwarded-for only where no proxy overwrites it (local runs).
  // Counted per route: the console polls /api/reports, which must not use up the budget of /api/ask or /api/evidence.
  const ip = `${new URL(req.url).pathname}|${req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local"}`;
  const now = Date.now();
  if (hits.size > 5000) hits.clear();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) throw new HttpError(429, "RATE_LIMITED", `Too many requests: at most ${max} per minute.`);
  recent.push(now);
  hits.set(ip, recent);
}

/** n8n webhooks: `x-aquapulse-secret` must equal WEBHOOK_SECRET. Unset secret = 503, never open. */
export function requireWebhookSecret(req: Request) {
  const secret = serverEnv().WEBHOOK_SECRET;
  if (!secret) throw new HttpError(503, "NOT_CONFIGURED", "WEBHOOK_SECRET is not set on the server; webhooks are disabled.");
  const given = req.headers.get("x-aquapulse-secret");
  if (!given || !safeEqual(given, secret)) throw new HttpError(401, "UNAUTHORIZED", "Missing or incorrect x-aquapulse-secret header.");
}

export async function readText(req: Request, maxBytes: number): Promise<string> {
  if (Number(req.headers.get("content-length") ?? 0) > maxBytes) throw new HttpError(413, "PAYLOAD_TOO_LARGE", `Body exceeds ${maxBytes} bytes.`);
  const text = await req.text();
  if (Buffer.byteLength(text) > maxBytes) throw new HttpError(413, "PAYLOAD_TOO_LARGE", `Body exceeds ${maxBytes} bytes.`);
  return text;
}

export async function readJson<S extends z.ZodType>(req: Request, schema: S, maxBytes = 32 * 1024): Promise<z.output<S>> {
  let body: unknown;
  try {
    body = JSON.parse(await readText(req, maxBytes));
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(400, "INVALID_JSON", "Body is not valid JSON.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new HttpError(400, "INVALID_REQUEST", parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ").slice(0, 500));
  return parsed.data;
}

/** Declared type must be allowed, size within the cap, and the magic bytes must agree with the declared type. */
export function assertImage(bytes: Uint8Array, declaredType: string) {
  const type = declaredType.split(";")[0].trim().toLowerCase();
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(type))
    throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", `Image type "${type || "unknown"}" is not allowed. Use ${ALLOWED_IMAGE_TYPES.join(", ")}.`);
  if (bytes.length === 0) throw new HttpError(400, "EMPTY_IMAGE", "The image is empty.");
  if (bytes.length > MAX_IMAGE_BYTES) throw new HttpError(413, "IMAGE_TOO_LARGE", `Image is ${bytes.length} bytes; the limit is ${MAX_IMAGE_BYTES}.`);
  if (sniffImageType(bytes) !== type) throw new HttpError(415, "IMAGE_TYPE_MISMATCH", `File content does not match the declared type ${type}.`);
  return type;
}

// ---------- media fetch (SSRF guard) ----------

/** `redirected` = this URL came from a redirect issued by an allowed host, never from the caller. */
export function mediaUrlAllowed(u: URL, redirected = false): boolean {
  if (u.protocol !== "https:" || u.port !== "" || u.username !== "" || u.password !== "") return false;
  if (u.hostname === "api.twilio.com" || u.hostname.endsWith(".twiliocdn.com")) return true;
  // Twilio redirects media to its own S3 bucket. Only that bucket, and only as a redirect target.
  // UNVERIFIED against live Twilio: written from Twilio's documented behaviour.
  return (
    redirected &&
    ((/^s3[.-][a-z0-9-]+\.amazonaws\.com$/.test(u.hostname) && u.pathname.startsWith("/media.twiliocdn.com/")) ||
      /^media\.twiliocdn\.com\.s3[.-][a-z0-9.-]*amazonaws\.com$/.test(u.hostname))
  );
}

/** Fetch an image only from Twilio hosts over https. Redirects are followed by hand (max 3) and every hop is re-checked. */
export async function fetchTwilioMedia(rawUrl: string): Promise<{ bytes: Uint8Array; contentType: string; host: string }> {
  const env = serverEnv();
  const bad = (m: string) => new HttpError(422, "MEDIA_REJECTED", m);
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw bad("mediaUrl is not a valid URL.");
  }
  for (let hop = 0; hop <= 3; hop++) {
    if (!mediaUrlAllowed(url, hop > 0)) throw bad("Media can only be fetched from Twilio hosts.");
    const headers: Record<string, string> = {};
    // Credentials go to api.twilio.com only, never to a redirect target.
    if (url.hostname === "api.twilio.com" && env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN)
      headers.authorization = "Basic " + Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64");
    let res: Response;
    try {
      res = await fetch(url, { headers, redirect: "manual", signal: AbortSignal.timeout(10_000) });
    } catch {
      throw new HttpError(502, "MEDIA_FETCH_FAILED", "Could not reach the media host.");
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      await res.body?.cancel();
      if (!loc) throw bad("Media host sent a redirect without a location.");
      url = new URL(loc, url);
      continue;
    }
    if (!res.ok) throw new HttpError(502, "MEDIA_FETCH_FAILED", `Media host returned ${res.status}.`);
    const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(contentType)) {
      await res.body?.cancel();
      throw bad(`Media type "${contentType || "unknown"}" is not allowed.`);
    }
    if (Number(res.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES) {
      await res.body?.cancel();
      throw bad(`Media exceeds ${MAX_IMAGE_BYTES} bytes.`);
    }
    // Streamed cap: stop reading as soon as the limit is crossed, whatever content-length claimed.
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = res.body!.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_IMAGE_BYTES) {
        await reader.cancel();
        throw bad(`Media exceeds ${MAX_IMAGE_BYTES} bytes.`);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(Buffer.concat(chunks));
    assertImage(bytes, contentType);
    return { bytes, contentType, host: url.hostname };
  }
  throw bad("Too many redirects from the media host.");
}

// ---------- report ingestion (Twilio webhook + n8n report webhook) ----------

export const sha256Hex = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");

/** Keyed hash of a phone number, and the reporter id derived from it. The raw number is never stored. */
export function reporterKey(from: string): { phoneHash?: string; reporterId?: string } {
  const phone = from.replace(/^whatsapp:/i, "").replace(/[^\d+]/g, "");
  if (!phone) return {};
  const phoneHash = createHmac("sha256", serverEnv().WEBHOOK_SECRET ?? "aquapulse").update(phone).digest("hex");
  return { phoneHash, reporterId: `r_${phoneHash.slice(0, 16)}` };
}

export type IngestResult = {
  evidenceId: string;
  duplicate: boolean;
  analysis: EvidenceAnalysis | null;
  /** Why there is no analysis, when media was supplied but could not be analysed. */
  analysisError?: { code: string; message: string };
};

/**
 * Store a citizen report once (idempotent on messageId), then fetch and analyse its media.
 * ponytail: analysis runs inline; a failed analysis is reported but not retried (the row already exists,
 * so a webhook retry is a duplicate). Queue it if reprocessing matters.
 */
export async function ingestReport(r: {
  messageId: string; from: string; text: string; lat?: number; lng?: number; mediaUrl?: string; timestamp?: string;
}): Promise<IngestResult> {
  const isWhatsApp = r.from.toLowerCase().startsWith("whatsapp:");
  const { phoneHash } = reporterKey(r.from);
  const { row, duplicate } = await repo().insertEvidence({
    messageId: r.messageId,
    channel: isWhatsApp ? "whatsapp" : "sms",
    phoneHash,
    body: r.text,
    lat: r.lat,
    lng: r.lng,
    receivedAt: r.timestamp,
  });
  if (duplicate || !r.mediaUrl) return { evidenceId: row.id, duplicate, analysis: row.analysis ?? null };
  try {
    const media = await fetchTwilioMedia(r.mediaUrl);
    const analysis = await analyzeEvidence({ bytes: media.bytes, contentType: media.contentType }, r.text || undefined);
    await repo().attachAnalysis(row.id, analysis, {
      contentType: media.contentType, sizeBytes: media.bytes.length, sha256: sha256Hex(media.bytes), sourceHost: media.host,
    });
    return { evidenceId: row.id, duplicate, analysis };
  } catch (err) {
    if (err instanceof HttpError) return { evidenceId: row.id, duplicate, analysis: null, analysisError: { code: err.code, message: err.message } };
    if (err instanceof AiError) return { evidenceId: row.id, duplicate, analysis: null, analysisError: { code: `AI_${err.code}`, message: err.fix } };
    throw err;
  }
}

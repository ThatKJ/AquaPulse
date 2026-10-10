// AquaPulse AI Lambda: the same lib/aws code behind a Function URL, so the public web host needs no AWS credentials.
// POST /evidence {imageBase64, contentType, text?}   POST /ask {question, context}   POST /health {}
import { randomUUID } from "node:crypto";
import { askGrounded } from "../../lib/aws/ask";
import { AiError, awsAiHealth, logOp, RemoteEvidenceRequestSchema, safeEqual, sniffImageType } from "../../lib/aws/clients";
import { analyzeEvidence } from "../../lib/aws/evidence";
import { AskRequestSchema, MAX_IMAGE_BYTES } from "../../lib/schemas/api";

type Event = {
  rawPath?: string;
  headers?: Record<string, string | undefined>;
  body?: string;
  isBase64Encoded?: boolean;
  requestContext?: { http?: { method?: string } };
};
type Result = { statusCode: number; headers: Record<string, string>; body: string };

const MAX_CONTEXT_BYTES = 20 * 1024;

class Reject extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

async function route(path: string, body: unknown): Promise<object> {
  if (path === "/health") return awsAiHealth();
  if (path === "/evidence") {
    const p = RemoteEvidenceRequestSchema.safeParse(body);
    if (!p.success) throw new Reject(400, "INVALID_REQUEST", "Expected {imageBase64, contentType, text?} with an allowed image type.");
    // Base64 is 4 chars per 3 bytes: reject before decoding anything oversized.
    if (p.data.imageBase64.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) throw new Reject(413, "IMAGE_TOO_LARGE", `Image exceeds ${MAX_IMAGE_BYTES} bytes.`);
    const bytes = new Uint8Array(Buffer.from(p.data.imageBase64, "base64"));
    if (sniffImageType(bytes) !== p.data.contentType) throw new Reject(415, "IMAGE_TYPE_MISMATCH", "File content does not match the declared type.");
    return analyzeEvidence({ bytes, contentType: p.data.contentType }, p.data.text);
  }
  if (path === "/ask") {
    const p = AskRequestSchema.safeParse(body);
    if (!p.success) throw new Reject(400, "INVALID_REQUEST", "Expected {question, context}.");
    if (Buffer.byteLength(JSON.stringify(p.data.context)) > MAX_CONTEXT_BYTES) throw new Reject(413, "CONTEXT_TOO_LARGE", `Context exceeds ${MAX_CONTEXT_BYTES} bytes.`);
    return askGrounded(p.data.question, p.data.context);
  }
  throw new Reject(404, "NOT_FOUND", "Unknown path.");
}

export async function handler(event: Event): Promise<Result> {
  const requestId = randomUUID();
  const start = Date.now();
  const path = (event.rawPath ?? "").replace(/\/+$/, "") || "/";
  const reply = (statusCode: number, body: object): Result => {
    logOp({ service: "ai-lambda", op: path, requestId, durationMs: Date.now() - start, status: statusCode < 400 ? "ok" : "error", httpStatus: statusCode });
    return { statusCode, headers: { "content-type": "application/json", "x-request-id": requestId, "cache-control": "no-store" }, body: JSON.stringify(body) };
  };
  const fail = (status: number, code: string, message: string) => reply(status, { requestId, error: { code, message } });

  try {
    const secret = process.env.AI_ENDPOINT_SECRET;
    if (!secret) return fail(503, "NOT_CONFIGURED", "AI_ENDPOINT_SECRET is not set on the function.");
    const given = event.headers?.["x-aquapulse-secret"]; // Function URLs lower-case header names
    if (!given || !safeEqual(given, secret)) return fail(401, "UNAUTHORIZED", "Missing or incorrect x-aquapulse-secret header.");
    if (event.requestContext?.http?.method !== "POST") return fail(405, "METHOD_NOT_ALLOWED", "Use POST.");

    let body: unknown;
    try {
      body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body ?? "", "base64").toString("utf8") : event.body || "{}");
    } catch {
      return fail(400, "INVALID_JSON", "Body is not valid JSON.");
    }
    return reply(200, await route(path, body));
  } catch (err) {
    if (err instanceof Reject) return fail(err.status, err.code, err.message);
    if (err instanceof AiError) return fail(({ THROTTLED: 429, CREDENTIALS: 503, NO_OBSERVER: 503, UNSUPPORTED_IMAGE: 415 } as Record<string, number>)[err.code] ?? 502, `AI_${err.code}`, err.fix);
    console.error(JSON.stringify({ requestId, error: err instanceof Error ? err.name : "unknown" }));
    return fail(500, "INTERNAL", "Unexpected server error.");
  }
}

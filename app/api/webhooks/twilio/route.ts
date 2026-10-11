import { z } from "zod";
import { validTwilioSignature } from "@/lib/alerts";
import { safeEqual } from "@/lib/aws/clients";
import { serverEnv } from "@/lib/schemas/env";
import { repo } from "@/lib/db";
import { logOp } from "@/lib/aws/clients";
import { handle, HttpError, ingestReport, readText, reporterKey } from "../../_lib";

const num = (min: number, max: number) =>
  z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().min(min).max(max).optional());
const TwilioInboundSchema = z.object({
  MessageSid: z.string().min(1).max(128),
  From: z.string().max(64),
  To: z.string().max(64).optional(),
  Body: z.string().default("").transform((s) => s.slice(0, 1000)),
  Latitude: num(-90, 90),
  Longitude: num(-180, 180),
  MediaUrl0: z.string().url().optional(),
  MediaContentType0: z.string().max(64).optional(),
});

/** The URL Twilio signed is the public one, so rebuild it from the proxy headers. */
function publicUrl(req: Request): string {
  const u = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim() ?? u.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? u.host;
  return `${proto}://${host}${u.pathname}${u.search}`;
}

export const POST = handle("webhooks/twilio", async (req, requestId) => {
  const env = serverEnv();
  const params = Object.fromEntries(new URLSearchParams(await readText(req, 64 * 1024))) as Record<string, string>;

  const secretOk = Boolean(env.WEBHOOK_SECRET && req.headers.get("x-aquapulse-secret") && safeEqual(req.headers.get("x-aquapulse-secret")!, env.WEBHOOK_SECRET));
  if (env.TWILIO_AUTH_TOKEN) {
    // One authoritative check, here. Twilio signs the URL it called: normally this route's public URL; when an
    // orchestrator (n8n) received the message and forwarded it, that orchestrator's URL, which it passes in
    // x-twilio-original-url. The override is honoured only from a caller holding the server secret, and the
    // Twilio signature must still verify, so a forwarder cannot invent messages.
    const forwardedUrl = secretOk ? req.headers.get("x-twilio-original-url") : null;
    const signature = req.headers.get("x-twilio-signature");
    // TWILIO_FORWARDER_URL is the same idea without a shared secret: the one orchestrator URL this server accepts
    // signatures for. Only Twilio can produce a signature for it, so the forwarder needs no credential at all.
    const signedUrls = [forwardedUrl || publicUrl(req), env.TWILIO_FORWARDER_URL].filter((u): u is string => Boolean(u));
    if (!signature || !signedUrls.some((u) => validTwilioSignature(env.TWILIO_AUTH_TOKEN!, u, params, signature)))
      throw new HttpError(403, "INVALID_SIGNATURE", "Missing or invalid X-Twilio-Signature.");
  } else {
    // No Twilio token: only a caller holding WEBHOOK_SECRET may use this endpoint. It is never open.
    if (!env.WEBHOOK_SECRET) throw new HttpError(503, "NOT_CONFIGURED", "Neither TWILIO_AUTH_TOKEN nor WEBHOOK_SECRET is set; this webhook is disabled.");
    if (!secretOk) throw new HttpError(403, "FORBIDDEN", "Missing or incorrect x-aquapulse-secret header.");
  }

  const parsed = TwilioInboundSchema.safeParse(params);
  if (!parsed.success) throw new HttpError(400, "INVALID_REQUEST", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const m = parsed.data;
  const { reporterId } = reporterKey(m.From);
  const reply = (text: string) => acknowledge(requestId, m.To, m.From, text);
  const since = new Date(Date.now() - PAIR_WINDOW_MIN * 60_000).toISOString();
  const hasContent = Boolean(m.Body.trim() || m.MediaUrl0);
  // The Twilio sandbox opt-in ("join <code>") reaches this webhook too. It is not a report.
  if (/^join [a-z]+(-[a-z]+)*$/i.test(m.Body.trim()) && !m.MediaUrl0 && m.Latitude == null) return twiml(requestId, "");
  let lat = m.Latitude;
  let lng = m.Longitude;

  // WhatsApp delivers a photo and a location pin as two messages. Pair them per reporter within a short window.
  // A pin that only completes an earlier report is not stored as a report of its own.
  if (lat != null && lng != null && !hasContent && reporterId) {
    const filled = await repo().fillReporterLocation(reporterId, lat, lng, since);
    if (filled > 0) return reply("Location added to your report.\nEvidence is being checked.");
  }
  if ((lat == null || lng == null) && reporterId) {
    const recent = await repo().reporterRecentLocation(reporterId, since);
    if (recent) ({ lat, lng } = recent);
  }

  const result = await ingestReport({ messageId: m.MessageSid, from: m.From, text: m.Body, lat, lng, mediaUrl: m.MediaUrl0, timestamp: new Date().toISOString() });
  if (result.analysisError) console.error(JSON.stringify({ requestId, route: "webhooks/twilio", analysisError: result.analysisError }));

  // The reply never claims an emergency: one report is evidence to check, not a confirmed incident.
  const ref = `AQ-${result.evidenceId.replace(/-/g, "").slice(0, 5).toUpperCase()}`;
  if (result.duplicate) return reply(`AquaPulse already has this report.\nReference: ${ref}`);
  if (lat == null || lng == null) return reply(`AquaPulse received your report.\nPlease share your location so it can be placed on the map.\nReference: ${ref}`);
  if (m.MediaUrl0) return reply(`Photo received for ${ref}.\nEvidence is being checked.`);
  return reply(`AquaPulse received your report.\nEvidence is being checked.\nReference: ${ref}`);
});

/**
 * Acknowledge to the sender of a signed inbound message, and to nobody else. The reply goes through the REST API
 * because Twilio's trial WhatsApp number rejects TwiML replies (error 12300). If the REST send is not possible or
 * is refused, the same text is returned as TwiML, which the regular sandbox and production senders accept.
 */
async function acknowledge(requestId: string, ourNumber: string | undefined, sender: string, message: string): Promise<Response> {
  const env = serverEnv();
  if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && ourNumber) {
    const start = Date.now();
    let status = 0;
    let code: string | undefined;
    try {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(env.TWILIO_ACCOUNT_SID)}/Messages.json`, {
        method: "POST",
        headers: { authorization: "Basic " + Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64"), "content-type": "application/x-www-form-urlencoded" },
        // Trial accounts refuse Body (error 21654) and accept only a Twilio-provided template; its wording is Twilio's, not ours.
        body: new URLSearchParams({ From: ourNumber, To: sender, ...(env.TWILIO_ACK_CONTENT_SID ? { ContentSid: env.TWILIO_ACK_CONTENT_SID } : { Body: message }) }),
        signal: AbortSignal.timeout(5000),
      });
      status = res.status;
      if (!res.ok) code = String(((await res.json().catch(() => ({}))) as { code?: number }).code ?? "");
    } catch {
      // falls back to TwiML below
    }
    const ok = status >= 200 && status < 300;
    logOp({ service: "twilio", op: "reply", requestId, durationMs: Date.now() - start, status: ok ? "ok" : "error", httpStatus: status, code });
    if (ok) return twiml(requestId, "");
  }
  return twiml(requestId, message);
}

const PAIR_WINDOW_MIN = 15;
const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function twiml(requestId: string, message: string): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${message ? `<Message>${xml(message)}</Message>` : ""}</Response>`, {
    headers: { "content-type": "text/xml; charset=utf-8", "x-request-id": requestId },
  });
}

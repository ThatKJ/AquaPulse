import { z } from "zod";
import { validTwilioSignature } from "@/lib/alerts";
import { safeEqual } from "@/lib/aws/clients";
import { serverEnv } from "@/lib/schemas/env";
import { handle, HttpError, ingestReport, readText } from "../../_lib";

const num = (min: number, max: number) =>
  z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().min(min).max(max).optional());
const TwilioInboundSchema = z.object({
  MessageSid: z.string().min(1).max(128),
  From: z.string().max(64),
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

  if (env.TWILIO_AUTH_TOKEN) {
    const signature = req.headers.get("x-twilio-signature");
    if (!signature || !validTwilioSignature(env.TWILIO_AUTH_TOKEN, publicUrl(req), params, signature))
      throw new HttpError(403, "INVALID_SIGNATURE", "Missing or invalid X-Twilio-Signature.");
  } else {
    // No Twilio token: only a caller holding WEBHOOK_SECRET may use this endpoint. It is never open.
    if (!env.WEBHOOK_SECRET) throw new HttpError(503, "NOT_CONFIGURED", "Neither TWILIO_AUTH_TOKEN nor WEBHOOK_SECRET is set; this webhook is disabled.");
    const given = req.headers.get("x-aquapulse-secret");
    if (!given || !safeEqual(given, env.WEBHOOK_SECRET)) throw new HttpError(403, "FORBIDDEN", "Missing or incorrect x-aquapulse-secret header.");
  }

  const parsed = TwilioInboundSchema.safeParse(params);
  if (!parsed.success) throw new HttpError(400, "INVALID_REQUEST", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const m = parsed.data;
  const result = await ingestReport({
    messageId: m.MessageSid, from: m.From, text: m.Body, lat: m.Latitude, lng: m.Longitude,
    mediaUrl: m.MediaUrl0, timestamp: new Date().toISOString(),
  });

  if (result.analysisError) console.error(JSON.stringify({ requestId, route: "webhooks/twilio", analysisError: result.analysisError }));

  // Empty TwiML: acknowledge without replying to the citizen.
  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    headers: { "content-type": "text/xml; charset=utf-8", "x-request-id": requestId },
  });
});

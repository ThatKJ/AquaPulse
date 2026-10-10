// Alerts: a Twilio transport (plain fetch to the REST API) and a demo transport that only records.
// The result always names the transport that actually ran.
import { createHash, createHmac } from "node:crypto";
import { logOp, safeEqual } from "../aws/clients";
import { repo } from "../db";
import { serverEnv } from "../schemas/env";

/** Twilio request signature: base64(HMAC-SHA1(authToken, url + each POST param as key+value, sorted by key)). */
export function twilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  const data = Object.keys(params).sort().reduce((acc, k) => acc + k + params[k], url);
  return createHmac("sha1", authToken).update(data, "utf8").digest("base64");
}
export const validTwilioSignature = (authToken: string, url: string, params: Record<string, string>, signature: string) =>
  safeEqual(twilioSignature(authToken, url, params), signature);

export type AlertResult = {
  alertId: string;
  transport: "twilio" | "demo";
  status: "sent" | "failed" | "queued";
  sent: number;
  failed: number;
  detail: string;
};

const E164 = /^(whatsapp:)?\+[1-9]\d{7,14}$/;

export async function sendAlert(input: { incidentId: string; audience: string; body: string; to?: string[]; idempotencyKey?: string }): Promise<AlertResult> {
  const { idempotencyKey, ...a } = input;
  // Default key: same payload within the same 10-minute window is one alert, so a webhook retry cannot send twice.
  const key = idempotencyKey ?? createHash("sha256").update(JSON.stringify([a.incidentId, a.audience, a.body, a.to ?? [], Math.floor(Date.now() / 600_000)])).digest("hex");
  const dup = (c: { id: string; transport: "twilio" | "demo"; status: AlertResult["status"] }): AlertResult => ({
    alertId: c.id, transport: c.transport, status: c.status, sent: 0, failed: 0, detail: "Duplicate request: this alert was already handled; nothing was sent again.",
  });
  const env = serverEnv();
  // Live mode can only reach numbers on the allowlist: a workflow bug cannot message the public.
  const allowed = new Set((env.TWILIO_ALLOWED_TO ?? "").split(",").map((n) => n.trim()).filter(Boolean));
  const to = (a.to ?? []).filter((n) => E164.test(n) && allowed.has(n.replace(/^whatsapp:/, "")));
  const skipped = (a.to?.length ?? 0) - to.length;
  const twilioReady = env.TWILIO_MODE === "live" && env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_PHONE_NUMBER;

  if (!twilioReady || to.length === 0) {
    const detail = !twilioReady
      ? "Demo transport (TWILIO_MODE is not live or Twilio is not configured): the alert was recorded only, nothing was sent."
      : "No recipient in `to` is a valid E.164 number on TWILIO_ALLOWED_TO: the alert was recorded only, nothing was sent.";
    const claim = await repo().recordAlert({ ...a, transport: "demo", status: "queued", idempotencyKey: key });
    if (claim.duplicate) return dup(claim);
    return { alertId: claim.id, transport: "demo", status: "queued", sent: 0, failed: 0, detail };
  }

  const auth = "Basic " + Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64");
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(env.TWILIO_ACCOUNT_SID!)}/Messages.json`;
  // Claim the key BEFORE sending: a retry that arrives mid-send or after a late failure finds the row and stops.
  const claim = await repo().recordAlert({ ...a, transport: "twilio", status: "queued", idempotencyKey: key });
  if (claim.duplicate) return dup(claim);
  const id = claim.id;
  let sent = 0;
  let firstSid: string | undefined;
  // ponytail: sequential sends, fine for <= 50 recipients; use a Messaging Service / queue beyond that.
  for (const number of to) {
    const start = Date.now();
    // Match the sender's channel to the recipient's (WhatsApp recipients need a whatsapp: sender).
    const from = number.startsWith("whatsapp:") && !env.TWILIO_PHONE_NUMBER!.startsWith("whatsapp:") ? `whatsapp:${env.TWILIO_PHONE_NUMBER}` : env.TWILIO_PHONE_NUMBER!;
    let status = 0;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { authorization: auth, "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ From: from, To: number, Body: a.body }),
        signal: AbortSignal.timeout(10_000),
      });
      status = res.status;
      const json = (await res.json().catch(() => ({}))) as { sid?: string };
      if (res.ok && json.sid) {
        sent++;
        firstSid ??= json.sid;
      }
    } catch {
      // counted as failed below
    }
    logOp({ service: "twilio", op: "Messages.create", durationMs: Date.now() - start, status: status >= 200 && status < 300 ? "ok" : "error", httpStatus: status });
  }
  const failed = to.length - sent;
  const status = sent > 0 ? "sent" : "failed";
  await repo().updateAlert(id, { status, providerId: firstSid });
  return {
    alertId: id, transport: "twilio", status, sent, failed,
    detail: `Twilio accepted ${sent} of ${to.length} messages${skipped ? `; ${skipped} recipients skipped (not E.164 or not on the allowlist)` : ""}.`,
  };
}

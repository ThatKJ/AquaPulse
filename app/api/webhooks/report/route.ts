import { ReportWebhookSchema } from "@/lib/schemas/api";
import { handle, ingestReport, json, readJson, requireWebhookSecret } from "../../_lib";

export const POST = handle("webhooks/report", async (req, requestId) => {
  requireWebhookSecret(req);
  const r = await readJson(req, ReportWebhookSchema);
  // mediaUrl goes through the Twilio-host allowlist inside ingestReport; arbitrary URLs are never fetched.
  return json(requestId, await ingestReport(r));
});

import { sendAlert } from "@/lib/alerts";
import { AlertWebhookSchema } from "@/lib/schemas/api";
import { handle, HttpError, json, readJson, requireWebhookSecret } from "../../_lib";

export const POST = handle("webhooks/alert", async (req, requestId) => {
  requireWebhookSecret(req);
  const a = await readJson(req, AlertWebhookSchema);
  const result = await sendAlert(a);
  if (result.status === "failed") throw new HttpError(502, "ALERT_FAILED", `${result.detail} The attempt was recorded as alert ${result.alertId}.`);
  return json(requestId, result);
});

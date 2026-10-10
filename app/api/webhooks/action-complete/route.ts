import { repo } from "@/lib/db";
import { ActionCompleteWebhookSchema } from "@/lib/schemas/api";
import { handle, json, readJson, requireWebhookSecret } from "../../_lib";

export const POST = handle("webhooks/action-complete", async (req, requestId) => {
  requireWebhookSecret(req);
  const c = await readJson(req, ActionCompleteWebhookSchema);
  await repo().recordActionCompletion(c);
  return json(requestId, { recorded: true, adapter: repo().adapter });
});

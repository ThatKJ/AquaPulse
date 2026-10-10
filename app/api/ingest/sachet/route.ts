import { syncSachet } from "@/lib/national/store";
import { handle, json, requireWebhookSecret } from "../../_lib";

export const maxDuration = 60;

// Forced sync for a scheduler or an operator. Requires the server secret; the public never triggers a forced fetch.
export const POST = handle("ingest/sachet", async (req, requestId) => {
  requireWebhookSecret(req);
  return json(requestId, await syncSachet(true));
});

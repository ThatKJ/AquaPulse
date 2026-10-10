import { syncAll } from "@/lib/national/store";
import { handle, json, requireWebhookSecret } from "../../_lib";

export const maxDuration = 60;

// Scheduled refresh of every national source. Requires the server secret: only the scheduler or an operator calls it.
// `?force=1` ignores the cadence window; without it the single-flight rules apply, so overlapping calls are harmless.
export const POST = handle("ingest/national", async (req, requestId) => {
  requireWebhookSecret(req);
  return json(requestId, await syncAll(new URL(req.url).searchParams.get("force") === "1"));
});

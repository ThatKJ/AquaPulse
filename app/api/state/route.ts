import { repo } from "@/lib/db";
import { StateSyncSchema } from "@/lib/schemas/api";
import { handle, json, rateLimit, readJson, requireWebhookSecret } from "../_lib";

// Service-to-service only: arbitrary engine state may be written only by a caller holding the server secret
// (`x-aquapulse-secret`, the same secret the webhooks use). The browser never has it; the console mirrors
// its demo state through /api/demo/sync, which accepts no state at all.
export const POST = handle("state", async (req, requestId) => {
  requireWebhookSecret(req);
  rateLimit(req, 30);
  const state = await readJson(req, StateSyncSchema, 256 * 1024);
  const written = await repo().syncState(state);
  return json(requestId, { adapter: repo().adapter, written });
});

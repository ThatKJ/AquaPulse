import { repo } from "@/lib/db";
import { StateSyncSchema } from "@/lib/schemas/api";
import { handle, json, rateLimit, readJson } from "../_lib";

// ponytail: no operator auth in this build, so this write is open to the console's origin. It is bounded
// (schema caps, 256 KB body, rate limit) and only upserts rows keyed by engine ids. Add auth before real use.
export const POST = handle("state", async (req, requestId) => {
  rateLimit(req, 30);
  const state = await readJson(req, StateSyncSchema, 256 * 1024);
  const written = await repo().syncState(state);
  return json(requestId, { adapter: repo().adapter, written });
});

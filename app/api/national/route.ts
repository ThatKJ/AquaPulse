import { after, connection } from "next/server";
import { nationalSnapshot, syncAll, type NationalSnapshot } from "@/lib/national/store";
import { handle, HttpError, json, rateLimit } from "../_lib";

let cached: { at: number; body: NationalSnapshot } | undefined;

// Read-only national picture for the console. It never calls the official feed inline: it answers from the
// database, then refreshes from the feed after the response (at most once per cadence window, single flight).
const run = handle("national", async (req, requestId) => {
  rateLimit(req, 60);
  after(() => syncAll().catch(() => undefined));
  if (cached && Date.now() - cached.at < 30_000) return json(requestId, cached.body);
  const body = await nationalSnapshot();
  if (!body) throw new HttpError(503, "NOT_CONFIGURED", "The national layer needs the database; it is not configured on this server.");
  cached = { at: Date.now(), body };
  return json(requestId, body);
});

export async function GET(req: Request) {
  await connection();
  return run(req);
}

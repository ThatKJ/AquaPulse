import { connection } from "next/server";
import { repo } from "@/lib/db";
import { handle, json, rateLimit } from "../_lib";

// Read-only feed of reports that arrived through the webhooks, for the console to poll.
// Carries no reporter identity (numbers are stored only as keyed hashes and are not selected here).
const run = handle("reports", async (req, requestId) => {
  rateLimit(req, 60);
  return json(requestId, { adapter: repo().adapter, serverTime: new Date().toISOString(), reports: await repo().listLiveReports(20) });
});

export async function GET(req: Request) {
  await connection();
  return run(req);
}

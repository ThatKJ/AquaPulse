// npm run demo:reset — remove rows created by demo runs; reference seed tables are left alone.
import { supabaseAdmin } from "../lib/db";
import { loadEnv, run } from "./_shared";

// Children first. Cascades cover evidence_media, incident_evidence, predictions, intervention_results, resource_assignments.
const RUN_TABLES = ["alerts", "verification_requests", "interventions", "evidence_events", "incidents", "reporters"] as const;

run(async () => {
  loadEnv();
  const db = supabaseAdmin();
  if (!db) {
    console.log("NOT_CONFIGURED Supabase is not configured: the demo adapter is in memory. Use the browser Reset button (or restart the server) to restore state.");
    return 0;
  }
  let failed = 0;
  for (const table of RUN_TABLES) {
    // supabase-js refuses an unfiltered delete; every row has a non-null primary key.
    const { error, count } = await db.from(table).delete({ count: "exact" }).not("id", "is", null);
    if (error) failed++;
    console.log(error ? `FAIL ${table}: ${error.message}` : `PASS ${table}: ${count ?? 0} rows removed`);
  }
  console.log(failed ? "FAIL reset incomplete" : "PASS database is back to the seed state");
  return 0;
});

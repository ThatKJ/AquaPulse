// npm run verify:db — calls the aquapulse_health() RPC with the service role key.
import { supabaseAdmin } from "../lib/db";
import { serverEnv } from "../lib/schemas/env";
import { isMain, line, loadEnv, run, type Check } from "./_shared";

export async function verifyDb(): Promise<{ supabase: Check; postgis: Check; counts?: Record<string, unknown> }> {
  const env = serverEnv();
  const missing = (["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const).filter((k) => !env[k]);
  const db = supabaseAdmin();
  if (!db) {
    const c: Check = { state: "NOT_CONFIGURED", detail: `missing ${missing.join(", ")}; the app uses the in-memory adapter` };
    return { supabase: c, postgis: c };
  }
  const { data, error } = await db.rpc("aquapulse_health");
  if (error) {
    const hint = error.code === "PGRST202" ? " (function missing: apply supabase/migrations/0001_init.sql)" : "";
    const c: Check = { state: "FAIL", detail: `aquapulse_health() ${error.code ?? ""} ${error.message}${hint}`.slice(0, 300) };
    return { supabase: c, postgis: { state: "UNVERIFIED", detail: "not reached" } };
  }
  const h = (data ?? {}) as Record<string, unknown>;
  return {
    supabase: { state: "PASS", detail: `${h.tables} tables; hydro_cells=${h.hydro_cells}, incidents=${h.incidents}` },
    postgis: h.postgis ? { state: "PASS", detail: `PostGIS ${h.postgis}` } : { state: "FAIL", detail: "postgis_version() returned nothing" },
    counts: h,
  };
}

if (isMain("verify-db.ts"))
  run(async () => {
    loadEnv();
    const r = await verifyDb();
    line("Supabase", r.supabase);
    line("PostGIS", r.postgis);
    if (r.supabase.state === "PASS") console.log("SUPABASE_OK");
    if (r.postgis.state === "PASS") console.log(`POSTGIS_OK ${r.counts?.postgis}`);
    if (r.counts) console.log(`TABLES=${r.counts.tables} HYDRO_CELLS=${r.counts.hydro_cells} INCIDENTS=${r.counts.incidents}`);
    return r.supabase.state === "FAIL" || r.postgis.state === "FAIL" ? 1 : 0;
  });

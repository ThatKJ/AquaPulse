// npm run sync:national — one forced pull of the NDMA SACHET feed into Supabase, then a summary of what is stored.
import { loadEnv } from "./_shared";

loadEnv();

async function main() {
  const { syncAll, nationalSnapshot } = await import("../lib/national/store");
  for (const [id, r] of Object.entries(await syncAll(true))) console.log(`SYNC ${id} ${r.status.toUpperCase()} seen=${r.seen} inserted=${r.inserted}${r.reason ? ` (${r.reason})` : ""}`);
  const s = await nationalSnapshot();
  if (!s) return console.log("NOT_CONFIGURED: Supabase env vars are missing");
  for (const x of s.sources) console.log(`SOURCE ${x.name} ${x.freshness} lastSuccess=${x.lastSuccessAt} newest=${x.newestAt} active=${x.active}`);
  console.log("SUMMARY", JSON.stringify(s.summary));
  for (const h of s.hotspots) console.log(`  ${String(h.risk).padStart(3)}  ${h.name}, ${h.state} — ${h.reason}`);
}
main();

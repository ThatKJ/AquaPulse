// npm run sync:national — one forced pull of the NDMA SACHET feed into Supabase, then a summary of what is stored.
import { loadEnv } from "./_shared";

loadEnv();

async function main() {
  const { syncSachet, nationalSnapshot } = await import("../lib/national/store");
  const r = await syncSachet(true);
  console.log(`SYNC ${r.status.toUpperCase()} seen=${r.seen} inserted=${r.inserted}${r.reason ? ` (${r.reason})` : ""}`);
  const s = await nationalSnapshot();
  if (!s) return console.log("NOT_CONFIGURED: Supabase env vars are missing");
  console.log(`SOURCE ${s.source.name} ${s.source.freshness} lastSuccess=${s.source.lastSuccessAt} newestAlert=${s.source.newestAlertAt}`);
  console.log("SUMMARY", JSON.stringify(s.summary));
  for (const h of s.hotspots) console.log(`  ${String(h.risk).padStart(3)}  ${h.name}, ${h.state} — ${h.reason}`);
}
main();

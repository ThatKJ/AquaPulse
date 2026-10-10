// National layer storage and sync. Browsers never call the official feed: they read /api/national, which reads
// Supabase, and the server refreshes from the feed at most once per cadence window (single flight via sync_runs).
import { supabaseAdmin } from "@/lib/db";
import { logOp } from "@/lib/aws/clients";
import { DISTRICTS, matchDistricts } from "./match";
import { fetchNowcasts, NOWCAST } from "./nowcast";
import { districtRisk, freshness, waterRelevance, type AlertLite, type DistrictRisk, type Freshness, type NowcastLite } from "./risk";
import { fetchAlert, fetchIndex, SACHET, type OfficialAlert } from "./sachet";

const MAX_NEW_PER_RUN = 60;
const CONCURRENCY = 4;

export type SyncResult = { status: "ok" | "skipped" | "failed" | "not_configured"; seen: number; inserted: number; reason?: string };

/** Pull new alerts from NDMA SACHET. Safe to call often: it does nothing inside the cadence window unless forced. */
export async function syncSachet(force = false): Promise<SyncResult> {
  const db = supabaseAdmin();
  if (!db) return { status: "not_configured", seen: 0, inserted: 0, reason: "Supabase is not configured" };
  const start = Date.now();
  const last = await db.from("sync_runs").select("status, started_at, finished_at").eq("source_id", SACHET.id).order("started_at", { ascending: false }).limit(1);
  const prev = last.data?.[0] as { status: string; started_at: string; finished_at: string | null } | undefined;
  if (!force && prev) {
    const ageMin = (Date.now() - Date.parse(prev.finished_at ?? prev.started_at)) / 60_000;
    if (prev.status === "running" && ageMin < 3) return { status: "skipped", seen: 0, inserted: 0, reason: "a sync is already running" };
    if (prev.status === "ok" && ageMin < SACHET.cadenceMin) return { status: "skipped", seen: 0, inserted: 0, reason: "inside the cadence window" };
    // Back off after a failure instead of retrying on every page view.
    if (prev.status === "failed" && ageMin < 3) return { status: "skipped", seen: 0, inserted: 0, reason: "backing off after a failed sync" };
  }
  const run = await db.from("sync_runs").insert({ source_id: SACHET.id }).select("id").single();
  const runId = (run.data as { id: string } | null)?.id;
  const finish = async (status: "ok" | "failed", seen: number, inserted: number, reason?: string): Promise<SyncResult> => {
    if (runId) await db.from("sync_runs").update({ status, finished_at: new Date().toISOString(), records_seen: seen, records_inserted: inserted, failure_reason: reason ?? null }).eq("id", runId);
    logOp({ service: "national", op: "sync", source: SACHET.id, durationMs: Date.now() - start, status: status === "ok" ? "ok" : "error", seen, inserted, reason });
    return { status, seen, inserted, reason };
  };
  try {
    const ids = await fetchIndex();
    const known = await db.from("official_alerts").select("id").in("id", ids.length ? ids.map((i) => `IN-${i}`).concat(ids) : ["-"]);
    // CAP identifiers look like "IN-<number>_<n>"; the index only gives the number, so compare on that.
    const have = new Set(((known.data ?? []) as { id: string }[]).map((r) => r.id));
    const seenNumbers = await db.from("official_alerts").select("id").eq("source_id", SACHET.id).order("fetched_at", { ascending: false }).limit(1000);
    const haveNumbers = new Set(((seenNumbers.data ?? []) as { id: string }[]).map((r) => r.id.replace(/^IN-/, "").replace(/_\d+$/, "")));
    const fresh = ids.filter((i) => !have.has(i) && !haveNumbers.has(i)).slice(0, MAX_NEW_PER_RUN);
    const rows: Record<string, unknown>[] = [];
    let failed = 0;
    for (let i = 0; i < fresh.length; i += CONCURRENCY) {
      const batch = await Promise.allSettled(fresh.slice(i, i + CONCURRENCY).map(fetchAlert));
      for (const r of batch) {
        if (r.status === "rejected") {
          failed++;
          continue;
        }
        rows.push(toRow(r.value));
      }
    }
    if (rows.length) {
      const up = await db.from("official_alerts").upsert(rows, { onConflict: "id", ignoreDuplicates: true });
      if (up.error) return finish("failed", ids.length, 0, `upsert: ${up.error.message}`.slice(0, 200));
    }
    // One bad alert must not fail the run, but a run where every fetch failed is a failure.
    if (fresh.length > 0 && rows.length === 0) return finish("failed", ids.length, 0, `all ${failed} alert fetches failed`);
    return finish("ok", ids.length, rows.length, failed ? `${failed} alert(s) could not be parsed or fetched` : undefined);
  } catch (err) {
    return finish("failed", 0, 0, (err instanceof Error ? err.message : "unknown error").slice(0, 200));
  }
}

function toRow(a: OfficialAlert) {
  const m = matchDistricts(a.areaDesc, `${a.sender} ${a.headline}`);
  return {
    id: a.id, source_id: SACHET.id, sender: a.sender, event: a.event, severity: a.severity, urgency: a.urgency, certainty: a.certainty,
    headline: a.headline, description: a.description, area_desc: a.areaDesc, language: a.language ?? null,
    sent_at: a.sentAt, onset_at: a.onsetAt ?? null, expires_at: a.expiresAt ?? null,
    state: m.state, district_ids: m.districtIds, raw_hash: a.rawHash,
  };
}

/** Pull the IMD district nowcast feed. Same single-flight and back-off rules as the alert sync. */
export async function syncNowcast(force = false): Promise<SyncResult> {
  const db = supabaseAdmin();
  if (!db) return { status: "not_configured", seen: 0, inserted: 0, reason: "Supabase is not configured" };
  const start = Date.now();
  const last = await db.from("sync_runs").select("status, started_at, finished_at").eq("source_id", NOWCAST.id).order("started_at", { ascending: false }).limit(1);
  const prev = last.data?.[0] as { status: string; started_at: string; finished_at: string | null } | undefined;
  if (!force && prev) {
    const ageMin = (Date.now() - Date.parse(prev.finished_at ?? prev.started_at)) / 60_000;
    if (prev.status === "running" && ageMin < 3) return { status: "skipped", seen: 0, inserted: 0, reason: "a sync is already running" };
    if (prev.status === "ok" && ageMin < NOWCAST.cadenceMin) return { status: "skipped", seen: 0, inserted: 0, reason: "inside the cadence window" };
    if (prev.status === "failed" && ageMin < 5) return { status: "skipped", seen: 0, inserted: 0, reason: "backing off after a failed sync" };
  }
  const run = await db.from("sync_runs").insert({ source_id: NOWCAST.id }).select("id").single();
  const runId = (run.data as { id: string } | null)?.id;
  const finish = async (status: "ok" | "failed", seen: number, inserted: number, reason?: string): Promise<SyncResult> => {
    if (runId) await db.from("sync_runs").update({ status, finished_at: new Date().toISOString(), records_seen: seen, records_inserted: inserted, failure_reason: reason ?? null }).eq("id", runId);
    logOp({ service: "national", op: "sync", source: NOWCAST.id, durationMs: Date.now() - start, status: status === "ok" ? "ok" : "error", seen, inserted, reason });
    return { status, seen, inserted, reason };
  };
  try {
    const items = await fetchNowcasts();
    if (items.length) {
      const up = await db.from("nowcasts").upsert(items.map((n) => ({
        id: n.id, source_id: NOWCAST.id, district_name: n.districtName, district_id: n.districtId, rain_band: n.rainBand, thunderstorm: n.thunderstorm,
        description: n.description, sent_at: n.sentAt, onset_at: n.onsetAt ?? null, expires_at: n.expiresAt ?? null,
      })), { onConflict: "id", ignoreDuplicates: true }).select("id");
      if (up.error) return finish("failed", items.length, 0, `upsert: ${up.error.message}`.slice(0, 200));
      return finish("ok", items.length, (up.data ?? []).length);
    }
    return finish("ok", 0, 0);
  } catch (err) {
    return finish("failed", 0, 0, (err instanceof Error ? err.message : "unknown error").slice(0, 200));
  }
}

/** Refresh every national source. One failing source never blocks the other. */
export async function syncAll(force = false) {
  const [alerts, nowcast] = await Promise.allSettled([syncSachet(force), syncNowcast(force)]);
  const unwrap = (r: PromiseSettledResult<SyncResult>): SyncResult => (r.status === "fulfilled" ? r.value : { status: "failed", seen: 0, inserted: 0, reason: String(r.reason).slice(0, 160) });
  return { [SACHET.id]: unwrap(alerts), [NOWCAST.id]: unwrap(nowcast) };
}

export type SourceStatus = { id: string; name: string; organization: string; attribution: string; cadenceMin: number; freshness: Freshness; lastSuccessAt: string | null; lastAttemptAt: string | null; lastFailure: string | null; newestAt: string | null; active: number };

export type NationalAlert = AlertLite & { areaDesc: string; state: string | null; districtIds: string[]; domain: "flood" | "stress" | "other" };
export type NationalSnapshot = {
  generatedAt: string;
  /** Kept for callers that show one headline status: the alert feed. */
  source: { id: string; name: string; organization: string; attribution: string; cadenceMin: number; freshness: Freshness; lastSuccessAt: string | null; lastAttemptAt: string | null; lastFailure: string | null; newestAlertAt: string | null };
  /** Every connected source with its own freshness. */
  sources: SourceStatus[];
  summary: { activeNowcasts: number; districtsWithRainNowcast: number; activeAlerts: number; waterAlerts: number; districtsUnderWaterAlert: number; floodAlerts: number; rainAlerts: number; heatAlerts: number; statesWithAlerts: number; unlocatedAlerts: number };
  /** Only districts with at least one active alert. Absent = no active alert placed there (not "safe": unknown beyond alerts). */
  districts: Record<string, DistrictRisk & { alertIds: string[] }>;
  alerts: NationalAlert[];
  hotspots: { districtId: string; name: string; state: string; risk: number; reason: string; sentAt: string }[];
};

/** Current national picture from the database. Returns null when Supabase is not configured. */
export async function nationalSnapshot(): Promise<NationalSnapshot | null> {
  const db = supabaseAdmin();
  if (!db) return null;
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const [nowRes, nowRunsRes, alertsRes, runsRes] = await Promise.all([
    db.from("nowcasts").select("district_id, district_name, rain_band, thunderstorm, description, sent_at, expires_at").gt("expires_at", now.toISOString()).order("sent_at", { ascending: false }).limit(800),
    db.from("sync_runs").select("status, started_at, finished_at, failure_reason").eq("source_id", NOWCAST.id).order("started_at", { ascending: false }).limit(20),
    db.from("official_alerts").select("id, sender, event, severity, urgency, certainty, headline, area_desc, sent_at, expires_at, state, district_ids")
      .or(`expires_at.gt.${now.toISOString()},and(expires_at.is.null,sent_at.gt.${dayAgo})`).order("sent_at", { ascending: false }).limit(500),
    db.from("sync_runs").select("status, started_at, finished_at, failure_reason").eq("source_id", SACHET.id).order("started_at", { ascending: false }).limit(20),
  ]);
  if (alertsRes.error) throw new Error(`read alerts: ${alertsRes.error.message}`);
  type Row = { id: string; sender: string; event: string; severity: string; urgency: string; certainty: string; headline: string; area_desc: string; sent_at: string; expires_at: string | null; state: string | null; district_ids: string[] };
  const alerts: NationalAlert[] = ((alertsRes.data ?? []) as Row[]).map((r) => ({
    id: r.id, sender: r.sender, event: r.event, severity: r.severity, urgency: r.urgency, certainty: r.certainty, headline: r.headline,
    sentAt: r.sent_at, expiresAt: r.expires_at ?? undefined, areaDesc: r.area_desc, state: r.state, districtIds: r.district_ids ?? [], domain: waterRelevance(r.event).domain,
  }));
  const runs = (runsRes.data ?? []) as { status: string; started_at: string; finished_at: string | null; failure_reason: string | null }[];
  const lastOk = runs.find((r) => r.status === "ok");
  const lastFailed = runs[0]?.status === "failed" ? runs[0] : undefined;

  const nowRuns = (nowRunsRes.data ?? []) as { status: string; started_at: string; finished_at: string | null; failure_reason: string | null }[];
  const nowOk = nowRuns.find((r) => r.status === "ok");
  const nowFresh = freshness(nowOk?.finished_at ?? null, NOWCAST.cadenceMin, now.getTime());
  // The nowcast input is "known" only while its feed is current or merely delayed; otherwise it is unknown.
  const nowcastKnown = nowFresh === "CURRENT" || nowFresh === "DELAYED";
  type NowRow = { district_id: string | null; district_name: string; rain_band: string; thunderstorm: boolean; description: string; sent_at: string; expires_at: string | null };
  const nowRows = (nowRes.data ?? []) as NowRow[];
  const nowByDistrict = new Map<string, NowcastLite>();
  for (const r of nowRows) if (r.district_id && !nowByDistrict.has(r.district_id)) nowByDistrict.set(r.district_id, { rainBand: r.rain_band, thunderstorm: r.thunderstorm, description: r.description, sentAt: r.sent_at, expiresAt: r.expires_at ?? undefined });

  const byDistrict = new Map<string, NationalAlert[]>();
  for (const a of alerts) for (const d of a.districtIds) byDistrict.set(d, [...(byDistrict.get(d) ?? []), a]);
  const districts: NationalSnapshot["districts"] = {};
  for (const id of new Set([...byDistrict.keys(), ...nowByDistrict.keys()])) {
    const list = byDistrict.get(id) ?? [];
    districts[id] = { ...districtRisk(list, nowcastKnown ? (nowByDistrict.get(id) ?? null) : undefined), alertIds: list.map((a) => a.id) };
  }
  const meta = new Map(DISTRICTS.map((d) => [d.id, d]));
  const hotspots = Object.entries(districts).filter(([, r]) => r.risk > 0).sort((a, b) => b[1].risk - a[1].risk || Date.parse(b[1].top?.sentAt ?? "") - Date.parse(a[1].top?.sentAt ?? "")).slice(0, 8)
    .map(([id, r]) => ({
      districtId: id, name: meta.get(id)?.name ?? id, state: meta.get(id)?.state ?? "", risk: r.risk,
      reason: [r.top && r.factors[0].contribution > 0 ? `${r.top.severity} ${r.top.event.toLowerCase()} alert` : null, r.nowcast && r.factors[1].contribution > 0 ? "rain nowcast" : null].filter(Boolean).join(" + "),
      sentAt: r.top?.sentAt ?? r.nowcast?.sentAt ?? "",
    }));
  const water = alerts.filter((a) => a.domain !== "other");
  return {
    generatedAt: now.toISOString(),
    source: {
      id: SACHET.id, name: SACHET.name, organization: SACHET.organization, attribution: SACHET.attribution, cadenceMin: SACHET.cadenceMin,
      freshness: freshness(lastOk?.finished_at ?? null, SACHET.cadenceMin, now.getTime()),
      lastSuccessAt: lastOk?.finished_at ?? null, lastAttemptAt: runs[0]?.started_at ?? null, lastFailure: lastFailed?.failure_reason ?? null,
      newestAlertAt: alerts[0]?.sentAt ?? null,
    },
    sources: [
      { id: SACHET.id, name: SACHET.name, organization: SACHET.organization, attribution: SACHET.attribution, cadenceMin: SACHET.cadenceMin, freshness: freshness(lastOk?.finished_at ?? null, SACHET.cadenceMin, now.getTime()), lastSuccessAt: lastOk?.finished_at ?? null, lastAttemptAt: runs[0]?.started_at ?? null, lastFailure: lastFailed?.failure_reason ?? null, newestAt: alerts[0]?.sentAt ?? null, active: alerts.length },
      { id: NOWCAST.id, name: NOWCAST.name, organization: NOWCAST.organization, attribution: NOWCAST.attribution, cadenceMin: NOWCAST.cadenceMin, freshness: nowFresh, lastSuccessAt: nowOk?.finished_at ?? null, lastAttemptAt: nowRuns[0]?.started_at ?? null, lastFailure: nowRuns[0]?.status === "failed" ? nowRuns[0].failure_reason : null, newestAt: nowRows[0]?.sent_at ?? null, active: nowRows.length },
    ],
    summary: {
      activeNowcasts: nowRows.length, districtsWithRainNowcast: [...nowByDistrict.values()].filter((n) => n.rainBand !== "none").length,
      activeAlerts: alerts.length, waterAlerts: water.length,
      districtsUnderWaterAlert: Object.values(districts).filter((d) => d.risk > 0).length,
      floodAlerts: alerts.filter((a) => /flood|river|dam|reservoir/i.test(a.event)).length,
      rainAlerts: alerts.filter((a) => /rain|thunderstorm|shower|cyclon/i.test(a.event)).length,
      heatAlerts: alerts.filter((a) => a.domain === "stress").length,
      statesWithAlerts: new Set(alerts.map((a) => a.state).filter(Boolean)).size,
      unlocatedAlerts: alerts.filter((a) => a.districtIds.length === 0).length,
    },
    districts, alerts: alerts.slice(0, 200), hotspots,
  };
}

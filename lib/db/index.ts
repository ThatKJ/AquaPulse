// Repository with two real implementations: Supabase (service role, server only) and in-memory.
// Chosen by whether NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.
// All writes go through supabase-js (parameterised PostgREST); no SQL is ever built from input.
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { StateSync, HealthResponse } from "../schemas/api";
import { serverEnv } from "../schemas/env";
import type { EvidenceAnalysis } from "../schemas/evidence";

export type NewEvidence = {
  messageId: string;
  channel: "whatsapp" | "sms" | "web" | "demo";
  /** SHA-256 of the normalised phone number. The raw number is never stored. */
  phoneHash?: string;
  body: string;
  lat?: number;
  lng?: number;
  receivedAt?: string;
};
export type EvidenceRow = {
  id: string;
  messageId: string;
  channel: NewEvidence["channel"];
  reporterId?: string;
  body: string;
  analysis?: EvidenceAnalysis;
  receivedAt: string;
};
export type MediaMeta = { contentType: string; sizeBytes: number; sha256: string; sourceHost?: string };
/** A report that arrived from outside (webhook), as the console needs it. No reporter identity. */
export type LiveReport = { id: string; channel: NewEvidence["channel"]; text: string; receivedAt: string; lat?: number; lng?: number; analysis?: EvidenceAnalysis };

export type NewAlert = { incidentId: string; audience: string; body: string; transport: "twilio" | "sns" | "demo"; status: "queued" | "sent" | "failed"; providerId?: string; idempotencyKey?: string };
export type AlertClaim = { id: string; duplicate: boolean; transport: "twilio" | "sns" | "demo"; status: "queued" | "sent" | "failed" };

export type Repo = {
  adapter: "supabase" | "memory";
  /** Idempotent on messageId: a duplicate returns the existing row and `duplicate: true`. */
  insertEvidence(e: NewEvidence): Promise<{ row: EvidenceRow; duplicate: boolean }>;
  attachAnalysis(evidenceId: string, analysis: EvidenceAnalysis, media?: MediaMeta): Promise<void>;
  /** Idempotent on idempotencyKey: a second call with the same key returns the first row and `duplicate: true`. */
  recordAlert(a: NewAlert): Promise<AlertClaim>;
  updateAlert(id: string, patch: { status: "sent" | "failed"; providerId?: string }): Promise<void>;
  recordVerification(v: { incidentId: string; lat: number; lng: number; radiusM: number; question: string }): Promise<{ id: string }>;
  /** Marks the intervention completed, creating its row if the engine-side intervention was never persisted. */
  recordActionCompletion(c: { incidentId: string; bundleId: string; completedAt: string; note?: string }): Promise<void>;
  /** Mirror engine state. Idempotent: rows are upserted by their engine ids. Returns row counts written. */
  syncState(s: StateSync): Promise<{ incidents: number; evidence: number; interventions: number }>;
  listRecentEvidence(limit?: number): Promise<EvidenceRow[]>;
  /** Give a location to this reporter's recent reports that have none (a pin sent after a photo). Returns how many were updated. */
  fillReporterLocation(reporterId: string, lat: number, lng: number, sinceIso: string): Promise<number>;
  /** This reporter's most recent located report since `sinceIso` (a pin sent before a photo). */
  reporterRecentLocation(reporterId: string, sinceIso: string): Promise<{ lat: number; lng: number } | null>;
  /** Newest first. Excludes rows mirrored from the engine. */
  listLiveReports(limit?: number): Promise<LiveReport[]>;
  health(): Promise<HealthResponse["db"]>;
};

const ewkt = (lng: number, lat: number) => `SRID=4326;POINT(${Number(lng)} ${Number(lat)})`;
const reporterId = (phoneHash: string) => `r_${phoneHash.slice(0, 16)}`;

// ---------- Supabase ----------

/** Service-role client, or null when Supabase is not configured. Never import from client components. */
export function supabaseAdmin(): SupabaseClient | null {
  const env = serverEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

class DbError extends Error {
  constructor(op: string, e: { code?: string; message: string }) {
    super(`db ${op} failed${e.code ? ` (${e.code})` : ""}: ${e.message}`);
    this.name = "DbError";
  }
}

const EVIDENCE_COLS = "id, message_id, channel, reporter_id, body, analysis, received_at";
type EvidenceDb = { id: string; message_id: string; channel: NewEvidence["channel"]; reporter_id: string | null; body: string; analysis: EvidenceAnalysis | null; received_at: string };
const toRow = (r: EvidenceDb): EvidenceRow => ({
  id: r.id, messageId: r.message_id, channel: r.channel, reporterId: r.reporter_id ?? undefined,
  body: r.body, analysis: r.analysis ?? undefined, receivedAt: r.received_at,
});
const UNIQUE_VIOLATION = "23505";

function supabaseRepo(db: SupabaseClient): Repo {
  return {
    adapter: "supabase",
    async insertEvidence(e) {
      let rid: string | null = null;
      if (e.phoneHash) {
        rid = reporterId(e.phoneHash);
        // ponytail: report_count is not incremented (needs an RPC for an atomic +1).
        const { error } = await db.from("reporters").upsert({ id: rid, phone_hash: e.phoneHash }, { onConflict: "id", ignoreDuplicates: true });
        if (error) throw new DbError("upsert reporter", error);
      }
      const { data, error } = await db
        .from("evidence_events")
        .insert({
          message_id: e.messageId, channel: e.channel, reporter_id: rid, body: e.body,
          location: e.lat != null && e.lng != null ? ewkt(e.lng, e.lat) : null,
          ...(e.receivedAt ? { received_at: e.receivedAt } : {}),
        })
        .select(EVIDENCE_COLS)
        .single();
      if (!error) return { row: toRow(data as EvidenceDb), duplicate: false };
      if (error.code !== UNIQUE_VIOLATION) throw new DbError("insert evidence", error);
      const existing = await db.from("evidence_events").select(EVIDENCE_COLS).eq("message_id", e.messageId).single();
      if (existing.error) throw new DbError("read duplicate evidence", existing.error);
      return { row: toRow(existing.data as EvidenceDb), duplicate: true };
    },
    async attachAnalysis(evidenceId, analysis, media) {
      const { error } = await db.from("evidence_events").update({ analysis, analysis_source: analysis.source }).eq("id", evidenceId);
      if (error) throw new DbError("attach analysis", error);
      if (!media) return;
      const m = await db.from("evidence_media").insert({
        evidence_id: evidenceId, content_type: media.contentType, size_bytes: media.sizeBytes, sha256: media.sha256, source_host: media.sourceHost ?? null,
      });
      if (m.error) throw new DbError("insert media", m.error);
    },
    async recordAlert(a) {
      const row = { incident_id: a.incidentId, audience: a.audience, body: a.body, transport: a.transport, status: a.status, provider_id: a.providerId ?? null, idempotency_key: a.idempotencyKey ?? null };
      const r = await db.from("alerts").insert(row).select("id").single();
      if (r.error?.code === UNIQUE_VIOLATION && a.idempotencyKey) {
        const prev = await db.from("alerts").select("id, transport, status").eq("idempotency_key", a.idempotencyKey).single();
        if (prev.error) throw new DbError("read alert", prev.error);
        const p = prev.data as { id: string; transport: "twilio" | "sns" | "demo"; status: "queued" | "sent" | "failed" };
        return { id: p.id, duplicate: true, transport: p.transport, status: p.status };
      }
      if (r.error) throw new DbError("insert alert", r.error);
      return { id: (r.data as { id: string }).id, duplicate: false, transport: a.transport, status: a.status };
    },
    async updateAlert(id, patch) {
      const { error } = await db.from("alerts").update({ status: patch.status, provider_id: patch.providerId ?? null }).eq("id", id);
      if (error) throw new DbError("update alert", error);
    },
    async recordVerification(v) {
      const { data, error } = await db
        .from("verification_requests")
        .insert({ incident_id: v.incidentId, location: ewkt(v.lng, v.lat), radius_m: v.radiusM, question: v.question })
        .select("id")
        .single();
      if (error) throw new DbError("insert verification", error);
      return { id: (data as { id: string }).id };
    },
    async recordActionCompletion(c) {
      // Interventions are created by the engine in the browser, so the row may not exist yet: upsert by id.
      const { error } = await db
        .from("interventions")
        .upsert({ id: c.bundleId, incident_id: c.incidentId, status: "completed", completed_at: c.completedAt, note: c.note ?? null }, { onConflict: "id" });
      if (error) throw new DbError("complete intervention", error);
    },
    async syncState(s) {
      const must = (what: string, r: { error: unknown }) => {
        if (r.error) throw new DbError(what, r.error as { code?: string; message: string });
      };
      if (s.incidents.length)
        must("upsert incidents", await db.from("incidents").upsert(s.incidents.map((i) => ({
          id: i.id, kind: i.kind, type: i.type, status: i.status, cell_id: i.cellId, location: ewkt(i.location.lng, i.location.lat),
          severity: i.severity, evidence_score: i.evidenceScore ?? null, suspected_asset_id: i.suspectedAssetId ?? null,
          provenance: i.provenance, updated_at: new Date().toISOString(),
        })), { onConflict: "id" }));
      // Engine evidence ids become message ids, so a re-sync updates the same row.
      const idOf = new Map<string, string>();
      if (s.evidence.length) {
        const r = await db.from("evidence_events").upsert(s.evidence.map((e) => ({
          message_id: `engine:${e.id}`, channel: e.channel, body: e.text, location: ewkt(e.location.lng, e.location.lat),
          analysis: e.analysis ?? null, analysis_source: e.analysis?.source ?? null, provenance: e.provenance,
        })), { onConflict: "message_id" }).select("id, message_id");
        must("upsert evidence", r);
        for (const row of (r.data ?? []) as { id: string; message_id: string }[]) idOf.set(row.message_id.slice(7), row.id);
      }
      const links = s.incidents.flatMap((i) => i.evidenceIds.flatMap((e) => (idOf.has(e) ? [{ incident_id: i.id, evidence_id: idOf.get(e)! }] : [])));
      if (links.length) must("link evidence", await db.from("incident_evidence").upsert(links, { onConflict: "incident_id,evidence_id" }));
      if (s.interventions.length) {
        must("upsert interventions", await db.from("interventions").upsert(s.interventions.map((r) => ({ id: r.id, incident_id: r.incidentId, bundle: r.bundle ?? {}, status: "applied" })), { onConflict: "id", ignoreDuplicates: true }));
        must("upsert results", await db.from("intervention_results").upsert(s.interventions.map((r) => ({
          intervention_id: r.id, before_state: r.before ?? {}, expected_state: r.expected ?? {}, observed_state: r.observed ?? {},
          effectiveness: r.effectiveness, confidence: r.confidence, provenance: r.provenance,
        })), { onConflict: "intervention_id" }));
      }
      return { incidents: s.incidents.length, evidence: s.evidence.length, interventions: s.interventions.length };
    },
    async fillReporterLocation(reporterId, lat, lng, sinceIso) {
      const { data, error } = await db.from("evidence_events").update({ location: ewkt(lng, lat) }).eq("reporter_id", reporterId).is("location", null).gt("received_at", sinceIso).select("id");
      if (error) throw new DbError("fill location", error);
      return (data ?? []).length;
    },
    async reporterRecentLocation(reporterId, sinceIso) {
      const { data, error } = await db.rpc("reporter_recent_location", { reporter: reporterId, since: sinceIso });
      if (error) throw new DbError("recent location", error);
      const row = ((data ?? []) as { lng: number; lat: number }[])[0];
      return row ? { lat: row.lat, lng: row.lng } : null;
    },
    async listLiveReports(limit = 20) {
      const { data, error } = await db.rpc("recent_live_reports", { max_rows: limit });
      if (error) throw new DbError("list live reports", error);
      return ((data ?? []) as { id: string; channel: NewEvidence["channel"]; body: string; received_at: string; lng: number | null; lat: number | null; analysis: EvidenceAnalysis | null }[]).map((r) => ({
        id: r.id, channel: r.channel, text: r.body, receivedAt: r.received_at, lat: r.lat ?? undefined, lng: r.lng ?? undefined, analysis: r.analysis ?? undefined,
      }));
    },
    async listRecentEvidence(limit = 20) {
      const { data, error } = await db.from("evidence_events").select(EVIDENCE_COLS).order("received_at", { ascending: false }).limit(limit);
      if (error) throw new DbError("list evidence", error);
      return (data as EvidenceDb[]).map(toRow);
    },
    async health() {
      const { data, error } = await db.rpc("aquapulse_health");
      if (error) return { state: "FAIL", adapter: "supabase", postgis: false, detail: `aquapulse_health() failed${error.code ? ` (${error.code})` : ""}: ${error.message}`.slice(0, 240) };
      const h = (data ?? {}) as { postgis?: string; tables?: number };
      return { state: "PASS", adapter: "supabase", postgis: Boolean(h.postgis), detail: `PostGIS ${h.postgis ?? "missing"}, ${h.tables ?? "?"} tables` };
    },
  };
}

// ---------- in-memory ----------

function memoryRepo(): Repo {
  // ponytail: per-process state, lost on restart and not shared between instances. Supabase is the durable adapter.
  const evidence = new Map<string, EvidenceRow>();
  const log: { kind: "alert" | "verification" | "action"; id: string; data: unknown }[] = [];
  const alerts = new Map<string, AlertClaim>();
  const mirror = new Map<string, unknown>();
  const where = new Map<string, { lat?: number; lng?: number }>();
  const record = (kind: (typeof log)[number]["kind"], data: unknown) => {
    const id = randomUUID();
    log.push({ kind, id, data });
    return { id };
  };
  return {
    adapter: "memory",
    async insertEvidence(e) {
      const existing = evidence.get(e.messageId);
      if (existing) return { row: existing, duplicate: true };
      const row: EvidenceRow = {
        id: randomUUID(), messageId: e.messageId, channel: e.channel, body: e.body,
        reporterId: e.phoneHash ? reporterId(e.phoneHash) : undefined, receivedAt: e.receivedAt ?? new Date().toISOString(),
      };
      evidence.set(e.messageId, row);
      where.set(row.id, { lat: e.lat, lng: e.lng });
      return { row, duplicate: false };
    },
    async attachAnalysis(evidenceId, analysis) {
      for (const row of evidence.values()) if (row.id === evidenceId) row.analysis = analysis;
    },
    async recordAlert(a) {
      const prev = a.idempotencyKey ? alerts.get(a.idempotencyKey) : undefined;
      if (prev) return { ...prev, duplicate: true };
      const claim: AlertClaim = { id: record("alert", a).id, duplicate: false, transport: a.transport, status: a.status };
      if (a.idempotencyKey) alerts.set(a.idempotencyKey, claim);
      return claim;
    },
    async updateAlert(id, patch) {
      for (const c of alerts.values()) if (c.id === id) c.status = patch.status;
    },
    recordVerification: async (v) => record("verification", v),
    recordActionCompletion: async (c) => void record("action", c),
    async syncState(s) {
      for (const i of s.incidents) mirror.set(`incident:${i.id}`, i);
      for (const e of s.evidence) mirror.set(`evidence:${e.id}`, e);
      for (const r of s.interventions) mirror.set(`intervention:${r.id}`, r);
      return { incidents: s.incidents.length, evidence: s.evidence.length, interventions: s.interventions.length };
    },
    async fillReporterLocation(reporterId, lat, lng, sinceIso) {
      let n = 0;
      for (const r of evidence.values()) {
        const w = where.get(r.id) ?? {};
        if (r.reporterId === reporterId && w.lat == null && r.receivedAt > sinceIso) {
          where.set(r.id, { lat, lng });
          n++;
        }
      }
      return n;
    },
    async reporterRecentLocation(reporterId, sinceIso) {
      const hit = [...evidence.values()].filter((r) => r.reporterId === reporterId && r.receivedAt > sinceIso && where.get(r.id)?.lat != null).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))[0];
      const w = hit ? where.get(hit.id) : undefined;
      return w?.lat != null && w.lng != null ? { lat: w.lat, lng: w.lng } : null;
    },
    async listLiveReports(limit = 20) {
      return [...evidence.values()].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)).slice(0, limit)
        .map((r) => ({ id: r.id, channel: r.channel, text: r.body, receivedAt: r.receivedAt, ...where.get(r.id), analysis: r.analysis }));
    },
    async listRecentEvidence(limit = 20) {
      return [...evidence.values()].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)).slice(0, limit);
    },
    health: async () => ({ state: "NOT_CONFIGURED", adapter: "memory", postgis: false, detail: "Supabase env vars not set; using the in-memory adapter (not durable)." }),
  };
}

let _repo: Repo | undefined;
export function repo(): Repo {
  if (_repo) return _repo;
  const db = supabaseAdmin();
  return (_repo = db ? supabaseRepo(db) : memoryRepo());
}

// Repository with two real implementations: Supabase (service role, server only) and in-memory.
// Chosen by whether NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.
// All writes go through supabase-js (parameterised PostgREST); no SQL is ever built from input.
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { HealthResponse } from "../schemas/api";
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
export type NewAlert = { incidentId: string; audience: string; body: string; transport: "twilio" | "demo"; status: "queued" | "sent" | "failed"; providerId?: string };

export type Repo = {
  adapter: "supabase" | "memory";
  /** Idempotent on messageId: a duplicate returns the existing row and `duplicate: true`. */
  insertEvidence(e: NewEvidence): Promise<{ row: EvidenceRow; duplicate: boolean }>;
  attachAnalysis(evidenceId: string, analysis: EvidenceAnalysis, media?: MediaMeta): Promise<void>;
  recordAlert(a: NewAlert): Promise<{ id: string }>;
  /** null = the incident is not in the database (verification_requests.incident_id is a required FK). */
  recordVerification(v: { incidentId: string; lat: number; lng: number; radiusM: number; question: string }): Promise<{ id: string } | null>;
  /** false = no matching intervention row to complete. */
  recordActionCompletion(c: { incidentId: string; bundleId: string; completedAt: string }): Promise<boolean>;
  listRecentEvidence(limit?: number): Promise<EvidenceRow[]>;
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
const FK_VIOLATION = "23503";
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
      const row = { incident_id: a.incidentId as string | null, audience: a.audience, body: a.body, transport: a.transport, status: a.status, provider_id: a.providerId ?? null };
      let r = await db.from("alerts").insert(row).select("id").single();
      // ponytail: incidents live in the browser engine, so the FK usually has no target; keep the alert, drop the link.
      if (r.error?.code === FK_VIOLATION) r = await db.from("alerts").insert({ ...row, incident_id: null }).select("id").single();
      if (r.error) throw new DbError("insert alert", r.error);
      return { id: (r.data as { id: string }).id };
    },
    async recordVerification(v) {
      const { data, error } = await db
        .from("verification_requests")
        .insert({ incident_id: v.incidentId, location: ewkt(v.lng, v.lat), radius_m: v.radiusM, question: v.question })
        .select("id")
        .single();
      if (error?.code === FK_VIOLATION) return null;
      if (error) throw new DbError("insert verification", error);
      return { id: (data as { id: string }).id };
    },
    async recordActionCompletion(c) {
      // ponytail: the webhook's `note` has no column in 0001_init.sql and is not stored.
      const { data, error } = await db
        .from("interventions")
        .update({ status: "completed", completed_at: c.completedAt })
        .eq("id", c.bundleId)
        .eq("incident_id", c.incidentId)
        .select("id");
      if (error) throw new DbError("complete intervention", error);
      return (data ?? []).length > 0;
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
      return { row, duplicate: false };
    },
    async attachAnalysis(evidenceId, analysis) {
      for (const row of evidence.values()) if (row.id === evidenceId) row.analysis = analysis;
    },
    recordAlert: async (a) => record("alert", a),
    recordVerification: async (v) => record("verification", v),
    recordActionCompletion: async (c) => Boolean(record("action", c)),
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

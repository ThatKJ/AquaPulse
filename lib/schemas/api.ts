import { z } from "zod";
import { EvidenceAnalysisSchema } from "./evidence";

/** Explicit integration states. Never report PASS without a real call. */
export const CheckStateSchema = z.enum(["PASS", "FAIL", "NOT_CONFIGURED", "UNVERIFIED"]);
export type CheckState = z.infer<typeof CheckStateSchema>;

const CheckSchema = z.object({ state: CheckStateSchema, detail: z.string().optional() });

/** GET /api/health */
export const HealthResponseSchema = z.object({
  aws: CheckSchema.extend({ region: z.string().optional() }),
  ai: CheckSchema.extend({
    /** Which observer the evidence route will use right now. */
    observer: z.enum(["bedrock", "rekognition", "none"]),
    modelId: z.string().optional(),
  }),
  db: CheckSchema.extend({ adapter: z.enum(["supabase", "memory"]), postgis: z.boolean() }),
  twilio: CheckSchema,
  checkedAt: z.string(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** POST /api/evidence — multipart form: image (file), text?, lat?, lng? */
export const EvidenceFieldsSchema = z.object({
  text: z.string().max(1000).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});
export const EvidenceResponseSchema = z.object({
  requestId: z.string(),
  durationMs: z.number(),
  analysis: EvidenceAnalysisSchema,
});
export type EvidenceResponse = z.infer<typeof EvidenceResponseSchema>;

/** POST /api/ask — the client sends a compact snapshot of engine output as the only source of facts. */
export const AskRequestSchema = z.object({
  question: z.string().min(3).max(400),
  context: z.record(z.string(), z.unknown()),
});
export const AskResponseSchema = z.object({
  requestId: z.string(),
  answer: z.string(),
  /** "template" = deterministic answer built from context without an LLM. */
  source: z.enum(["bedrock", "template"]),
  modelId: z.string().optional(),
});
export type AskRequest = z.infer<typeof AskRequestSchema>;
export type AskResponse = z.infer<typeof AskResponseSchema>;

/** POST /api/webhooks/report — n8n-compatible normalised citizen report. */
export const ReportWebhookSchema = z.object({
  /** Idempotency key (Twilio MessageSid or caller-supplied). */
  messageId: z.string().min(1).max(128),
  from: z.string().max(64),
  text: z.string().max(1000).default(""),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  mediaUrl: z.string().url().optional(),
  mediaContentType: z.string().max(64).optional(),
  timestamp: z.string().datetime().optional(),
});
export type ReportWebhook = z.infer<typeof ReportWebhookSchema>;

/** POST /api/webhooks/verification — ask trusted reporters near an incident to confirm. */
export const VerificationWebhookSchema = z.object({
  incidentId: z.string().max(32),
  lat: z.number(),
  lng: z.number(),
  radiusM: z.number().positive().max(5000).default(500),
  question: z.string().max(300),
});

/** POST /api/webhooks/alert — emergency alert to an audience. */
export const AlertWebhookSchema = z.object({
  incidentId: z.string().max(32),
  audience: z.string().max(120),
  body: z.string().max(600),
  to: z.array(z.string().max(32)).max(50).optional(),
  /** A retry with the same key returns the first result and sends nothing. Defaults to a hash of the payload. */
  idempotencyKey: z.string().min(8).max(128).optional(),
});

/** POST /api/webhooks/action-complete — a field crew reports an action finished. */
export const ActionCompleteWebhookSchema = z.object({
  incidentId: z.string().max(32),
  bundleId: z.string().max(64),
  completedAt: z.string().datetime(),
  note: z.string().max(500).optional(),
});

/**
 * POST /api/state — the operator console mirrors engine state so incidents, their evidence membership,
 * interventions and results are durable. The engine stays the source of truth; this is a write-through copy.
 */
const pt = z.object({ lng: z.number().min(-180).max(180), lat: z.number().min(-90).max(90) });
const prov = z.enum(["LIVE", "STATIC_REAL", "SIMULATED", "DERIVED"]);
const id = z.string().min(1).max(40);
export const StateSyncSchema = z.object({
  incidents: z.array(z.object({
    id, kind: z.enum(["flood", "scarcity"]), type: z.string().max(40),
    status: z.enum(["unverified", "verifying", "verified", "dismissed", "resolved"]),
    cellId: id, location: pt, severity: z.number().int().min(1).max(10),
    evidenceIds: z.array(id).max(40), evidenceScore: z.unknown().optional(), suspectedAssetId: id.optional(), provenance: prov,
  })).max(20),
  evidence: z.array(z.object({
    id, channel: z.enum(["whatsapp", "sms", "web", "demo"]), text: z.string().max(1000), location: pt,
    analysis: EvidenceAnalysisSchema.optional(), provenance: prov,
  })).max(60),
  interventions: z.array(z.object({
    id, incidentId: id, bundle: z.unknown(), before: z.unknown(), expected: z.unknown(), observed: z.unknown(),
    effectiveness: z.number().min(0).max(1), confidence: z.number().min(0).max(1), provenance: prov,
  })).max(20),
});
export type StateSync = z.infer<typeof StateSyncSchema>;

export const ErrorResponseSchema = z.object({
  requestId: z.string(),
  error: z.object({ code: z.string(), message: z.string() }),
});

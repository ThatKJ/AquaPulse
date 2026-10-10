import { z } from "zod";
import { INCIDENT_TYPES } from "./domain";

const unit = z.number().min(0).max(1);

export const CauseSchema = z.object({
  cause: z.enum(INCIDENT_TYPES),
  probability: unit,
  rationale: z.string().max(300),
});

/**
 * What an AI observer emits for one piece of media. It never creates incident
 * state directly; fusion and scoring decide what happens next.
 * `source` says which observer actually produced it and drives the UI badge.
 */
export const EvidenceAnalysisSchema = z.object({
  source: z.enum(["bedrock", "rekognition", "fixture"]),
  modelId: z.string().optional(),
  validHazard: z.boolean(),
  incidentType: z.enum(INCIDENT_TYPES),
  severity: z.number().int().min(1).max(10),
  confidence: unit,
  observations: z.array(z.string().max(300)).max(12),
  likelyCauses: z.array(CauseSchema).max(5),
  materialsObserved: z.array(z.string().max(80)).max(12),
  structuralDamageProbability: unit,
  blockageProbability: unit,
  estimatedWaterDepthCm: z.object({ min: z.number().min(0), max: z.number().min(0) }).optional(),
  spamProbability: unit,
  summary: z.string().max(600),
});
export type EvidenceAnalysis = z.infer<typeof EvidenceAnalysisSchema>;
export type Cause = z.infer<typeof CauseSchema>;

/** The model-facing subset: `source`/`modelId` are stamped by our code, not the model. */
export const ModelEvidenceSchema = EvidenceAnalysisSchema.omit({ source: true, modelId: true });

export type ScoreComponentKey =
  | "ai_confidence"
  | "gps_consistency"
  | "time_consistency"
  | "independent_confirmations"
  | "weather_consistency"
  | "duplicate_check"
  | "validator"
  | "infrastructure_correlation";

export type ScoreComponent = {
  key: ScoreComponentKey;
  label: string;
  /** 0..100 */
  value: number;
  /** Weights across components sum to 1. */
  weight: number;
  /** Short human value for the UI, e.g. "PASS", "4 reports", "HIGH". */
  display: string;
  status: "pass" | "warn" | "fail";
};

/** Explainable 0..100 score. `total` is always the weighted sum of `components`. */
export type EvidenceScore = {
  total: number;
  components: ScoreComponent[];
  /** escalate >= 70, verify 40..69, hold < 40 (thresholds live in engine config). */
  verdict: "escalate" | "verify" | "hold";
};

import type { Provenance, WorldState, EvidenceEvent, Incident } from "./domain";
import type { EvidenceScore } from "./evidence";

export const HORIZONS = [0, 15, 30, 60] as const;
/** Minutes ahead of the scenario clock. 0 = NOW. */
export type Horizon = (typeof HORIZONS)[number];

/** One explainable term of a score: contribution = weight * value (signed for penalties). */
export type Contributor = { factor: string; label: string; weight: number; value: number; contribution: number };

export type CellPrediction = {
  cellId: string;
  /** 0..100 */
  floodRisk: number;
  /** 0..100 */
  scarcityRisk: number;
  /** 0..1, decreases with horizon. */
  confidence: number;
  /** Top flood contributors, largest first. */
  contributors: Contributor[];
  /** Estimated people exposed to flooding in this cell. */
  exposedPopulation: number;
  /** Estimated people affected by scarcity in this cell. */
  populationShort: number;
  /** Estimated daily water deficit, litres. */
  deficitLiters: number;
  trend: "rising" | "steady" | "falling";
};

export type PredictionTotals = {
  exposedPopulation: number;
  populationShort: number;
  deficitLiters: number;
  maxFloodRisk: number;
  maxScarcityRisk: number;
  /** Facility ids whose cell flood risk crosses the at-risk threshold. */
  facilitiesAtRisk: string[];
  /** Facility ids whose cell scarcity risk crosses the threshold. */
  facilitiesShort: string[];
  meanConfidence: number;
};

export type Prediction = {
  horizon: Horizon;
  cells: Record<string, CellPrediction>;
  totals: PredictionTotals;
};

export const INTERVENTION_KINDS = [
  "CLEAR_DRAIN",
  "DEPLOY_PUMP",
  "REPAIR_PIPE",
  "SEND_TANKER",
  "CLOSE_ROAD",
  "DISPATCH_CREW",
  "ISSUE_ALERT",
] as const;
export type InterventionKind = (typeof INTERVENTION_KINDS)[number];

export type Intervention = {
  kind: InterventionKind;
  /** Asset id (CLEAR_DRAIN, REPAIR_PIPE), cell id (DEPLOY_PUMP, CLOSE_ROAD, ISSUE_ALERT) or facility/cell id (SEND_TANKER). */
  targetId: string;
  resourceIds: string[];
  /** e.g. "Clear Drain D104". */
  label: string;
};

export type ActionBundle = { id: string; label: string; interventions: Intervention[] };

/** Baseline vs bundle at one horizon. Every number comes from the engine, never from an LLM. */
export type InterventionOutcome = {
  bundleId: string;
  horizon: Horizon;
  baselineExposure: number;
  exposure: number;
  /** Negative = fewer people exposed. e.g. -58 */
  exposureChangePct: number;
  /** Change in max risk, points (negative = lower). */
  riskChange: number;
  facilitiesProtected: string[];
  /** Estimated change in incident duration, minutes (negative = shorter). */
  durationChangeMin: number;
  costProxyLakh: number;
  responseTimeMin: number;
  confidence: number;
  /** 0..100: share of the exposure reduction that lands on vulnerable cells and critical facilities. */
  equityScore: number;
  /** Change in vulnerability-weighted exposure (negative = better). */
  vulnerableExposureChange: number;
  /** Litres of deficit removed (scarcity bundles). */
  deficitReductionLiters: number;
};

export type AuctionWeights = {
  exposureReduction: number;
  facilitiesProtected: number;
  equity: number;
  confidence: number;
  costPenalty: number;
  responseTimePenalty: number;
};

export type AuctionOption = {
  rank: number;
  bundle: ActionBundle;
  outcome: InterventionOutcome;
  score: number;
  breakdown: Contributor[];
};

export type AuctionResult = {
  incidentId: string;
  horizon: Horizon;
  baselineExposure: number;
  /** Top 3, best first. */
  options: AuctionOption[];
  /** How many feasible bundles were simulated. */
  evaluated: number;
  /** Deterministic, data-derived sentences explaining why options[0] won. */
  winnerReasons: string[];
};

/** One historical (or current) failure of an asset. Historical rows are SIMULATED. */
export type InfraHistoryRecord = {
  assetId: string;
  year: number;
  month: number;
  /** 1..10 */
  severity: number;
  exposedPopulation: number;
  note: string;
  interventionKind?: InterventionKind;
  /** 0..1 observed effectiveness of that intervention. */
  effectiveness?: number;
  provenance: Provenance;
};

export type InfraPriority = {
  assetId: string;
  rank: number;
  /** 0..100 */
  score: number;
  tier: 1 | 2 | 3;
  incidentCount: number;
  yearsSpan: number;
  avgSeverity: number;
  recurringExposure: number;
  interventionCount: number;
  /** 0..1, low = fixes do not hold, which raises upgrade priority. */
  avgEffectiveness: number;
  lastIncident: { year: number; month: number };
  factors: Contributor[];
  recommendation: string;
};

/** Intervention -> proof -> learning. `observed` is simulated in the hackathon build. */
export type InterventionRecord = {
  id: string;
  incidentId: string;
  bundle: ActionBundle;
  appliedAtMin: number;
  before: { risk: number; exposure: number };
  expected: { risk: number; exposure: number };
  observed: { risk: number; exposure: number };
  /** 0..1 = (before - observed) / before on exposure. */
  effectiveness: number;
  confidence: number;
  provenance: Provenance;
};

export type Counterfactual = {
  incidentId: string;
  bundleLabel: string;
  minutesEarlier: number;
  currentExposure: number;
  counterfactualExposure: number;
  avoidableExposure: number;
};

export type TankerAssignment = {
  resourceId: string;
  /** Facility id or cell id. */
  targetId: string;
  targetLabel: string;
  liters: number;
  /** 0..100 */
  equityScore: number;
  reason: string;
};

/**
 * The engine contract. All functions are pure and deterministic: same input,
 * same output, no I/O, no Date.now(), no Math.random().
 * Implemented in lib/simulation, lib/evidence, lib/optimization; re-exported from lib/engine.ts.
 */
export type Engine = {
  predict(state: WorldState, horizon: Horizon): Prediction;
  /** Clone the state and mutate cell factors for the bundle. Does not touch records/stream. */
  applyBundle(state: WorldState, bundle: ActionBundle): WorldState;
  simulateBundle(state: WorldState, bundle: ActionBundle, horizon: Horizon): InterventionOutcome;
  runAuction(state: WorldState, incidentId: string, horizon?: Horizon, weights?: AuctionWeights): AuctionResult;
  /** Add an event: attach to a nearby matching incident or open a new one; rescore; add relationships. */
  fuse(state: WorldState, event: EvidenceEvent): WorldState;
  scoreEvidence(state: WorldState, incident: Incident): EvidenceScore;
  infraPriorities(state: WorldState): InfraPriority[];
  counterfactual(state: WorldState, incidentId: string, minutesEarlier: number): Counterfactual;
  allocateTankers(state: WorldState): TankerAssignment[];
  /** Apply the bundle for real: applyBundle + InterventionRecord + history row + stream entry. */
  commitBundle(state: WorldState, incidentId: string, bundle: ActionBundle): WorldState;
};

export type DemoStep = {
  id: string;
  /** Short label for the demo control strip. */
  label: string;
  /** One sentence the presenter can read aloud. */
  narration: string;
  /** Minutes the scenario clock advances before this step applies. */
  advanceMin: number;
  apply(state: WorldState): WorldState;
  /** UI hints: what to focus after the step. */
  focus?: { incidentId?: string; horizon?: Horizon; mode?: "combined" | "flood" | "scarcity" | "fix-first"; openPanel?: "evidence" | "simulate" | "tankers" };
};

export type DemoScenario = { id: "flood-cascade" | "scarcity" | "false-report"; name: string; steps: DemoStep[] };

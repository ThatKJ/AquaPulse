// Shared domain contracts. FROZEN after M1: only the orchestrator edits this folder.
// Internal engine state is plain TypeScript; anything crossing a trust boundary
// (AI output, HTTP, env) has a Zod schema in evidence.ts / api.ts / env.ts.
import type { EvidenceAnalysis, EvidenceScore } from "./evidence";
import type { Intervention, InterventionRecord, InfraHistoryRecord } from "./simulation";

/** Where a value comes from. Every entity the UI shows carries one. */
export type Provenance = "LIVE" | "STATIC_REAL" | "SIMULATED" | "DERIVED";

export type LngLat = { lng: number; lat: number };

/** All factors are normalised 0..1. Higher = worse, except where noted. */
export type FloodFactors = {
  rainfallPressure: number;
  upstreamPressure: number;
  drainageFailure: number;
  elevationSusceptibility: number;
  historicSusceptibility: number;
  incidentPressure: number;
  evidenceConfidence: number;
};

export type ScarcityFactors = {
  /** Higher = better. */
  supplyAvailability: number;
  demandPressure: number;
  heatStress: number;
  pipelineFailure: number;
  outageReports: number;
  /** Higher = better. */
  storageAvailability: number;
  populationPressure: number;
  criticalFacilityDemand: number;
};

export type HydroCell = {
  /** H3 index, resolution 9. */
  id: string;
  center: LngLat;
  /** Elevation proxy 0..1, higher = higher ground. Water flows to lower neighbours. */
  elevation: number;
  population: number;
  /** Synthetic equity proxy 0..1 (vulnerable-population share). Always SIMULATED. */
  vulnerability: number;
  /** Share of the cell's exposure that is road/transport, 0..1. */
  roadExposure: number;
  flood: FloodFactors;
  scarcity: ScarcityFactors;
  drainAssetId?: string;
  pipeAssetId?: string;
  provenance: Provenance;
};

export type FacilityKind = "hospital" | "school" | "shelter" | "pump_station" | "substation";

export type Facility = {
  id: string;
  name: string;
  kind: FacilityKind;
  location: LngLat;
  cellId: string;
  /** Litres/day the facility needs; drives scarcity priority. */
  dailyDemandLiters: number;
  provenance: Provenance;
};

export type InfraKind = "drain" | "pipe" | "pump_station" | "valve";

export type InfraAsset = {
  /** e.g. "D104", "P031". Synthetic identifiers, never real municipal IDs. */
  id: string;
  name: string;
  kind: InfraKind;
  location: LngLat;
  /** Cells this asset serves. */
  cellIds: string[];
  /** 0..1, higher = better condition. */
  condition: number;
  upgradeCostProxyLakh: number;
  provenance: Provenance;
};

export type Relation =
  | "EVIDENCE_OF"
  | "CONFIRMS"
  | "CONTRADICTS"
  | "UPSTREAM_OF"
  | "DOWNSTREAM_OF"
  | "AFFECTS"
  | "CONNECTED_TO";

/** Lightweight relational graph edge between any two entity ids. */
export type Relationship = { from: string; to: string; relation: Relation };

export type ResourceKind = "pump" | "crew" | "tanker";

export type Resource = {
  /** e.g. "P02", "C01", "T01". */
  id: string;
  name: string;
  kind: ResourceKind;
  location: LngLat;
  available: boolean;
  /** pump: litres/min removed; tanker: litres carried; crew: 1. */
  capacity: number;
  costProxyLakh: number;
};

export const INCIDENT_TYPES = [
  "blocked_drain",
  "pipe_burst",
  "waterlogging",
  "flash_flood",
  "dry_supply_line",
  "pipeline_leak",
  "overflow",
  "infrastructure_damage",
  "none",
] as const;
export type IncidentType = (typeof INCIDENT_TYPES)[number];

export type EvidenceChannel = "whatsapp" | "sms" | "web" | "demo";

export type EvidenceEvent = {
  id: string;
  /** Scenario clock, minutes. */
  tMin: number;
  channel: EvidenceChannel;
  reporterId: string;
  /** 0..1 prior trust in this reporter. */
  reporterTrust: number;
  text: string;
  location: LngLat;
  /** Reported GPS accuracy in metres, if known. */
  locationAccuracyM?: number;
  mediaUrl?: string;
  analysis?: EvidenceAnalysis;
  provenance: Provenance;
};

export type IncidentStatus = "unverified" | "verifying" | "verified" | "dismissed" | "resolved";

export type Incident = {
  /** Display id, e.g. "F-03" (flood) or "S-01" (scarcity). */
  id: string;
  kind: "flood" | "scarcity";
  type: IncidentType;
  status: IncidentStatus;
  cellId: string;
  location: LngLat;
  /** 1..10 */
  severity: number;
  evidenceIds: string[];
  evidenceScore?: EvidenceScore;
  suspectedAssetId?: string;
  openedAtMin: number;
  provenance: Provenance;
};

export type Alert = {
  id: string;
  incidentId: string;
  tMin: number;
  audience: string;
  body: string;
  /** "demo" transport is a simulation and must be labelled as such in the UI. */
  transport: "twilio" | "demo";
  status: "queued" | "sent" | "failed";
};

export type StreamKind =
  | "report"
  | "analysis"
  | "fusion"
  | "score"
  | "prediction"
  | "recommendation"
  | "action"
  | "alert"
  | "learning"
  | "system";

/** One line in the Live Intelligence Stream. */
export type StreamEntry = {
  id: string;
  tMin: number;
  kind: StreamKind;
  title: string;
  detail?: string;
  incidentId?: string;
  provenance: Provenance;
};

/** The single state object the UI renders and demo scenarios mutate. Treat as immutable. */
export type WorldState = {
  tMin: number;
  cells: Record<string, HydroCell>;
  facilities: Facility[];
  assets: InfraAsset[];
  resources: Resource[];
  relationships: Relationship[];
  evidence: EvidenceEvent[];
  incidents: Incident[];
  /** Interventions currently in effect (already applied to cell factors). */
  activeInterventions: Intervention[];
  /** Intervention -> proof -> learning records. */
  interventionRecords: InterventionRecord[];
  /** Multi-year failure memory per asset. */
  history: InfraHistoryRecord[];
  alerts: Alert[];
  stream: StreamEntry[];
};

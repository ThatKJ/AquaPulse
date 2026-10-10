import type { WorldState } from "@/lib/schemas/domain";
import type { StateSync } from "@/lib/schemas/api";

/** Engine world -> the rows the database mirror stores. Pure. */
export function toStateSync(world: WorldState): StateSync {
  return {
    incidents: world.incidents.map((i) => ({
      id: i.id, kind: i.kind, type: i.type, status: i.status, cellId: i.cellId, location: i.location, severity: i.severity,
      evidenceIds: i.evidenceIds, evidenceScore: i.evidenceScore, suspectedAssetId: i.suspectedAssetId, provenance: i.provenance,
    })),
    evidence: world.evidence.map((e) => ({ id: e.id, channel: e.channel, text: e.text, location: e.location, analysis: e.analysis, provenance: e.provenance })),
    interventions: world.interventionRecords.map((r) => ({
      id: r.id, incidentId: r.incidentId, bundle: r.bundle, before: r.before, expected: r.expected, observed: r.observed,
      effectiveness: r.effectiveness, confidence: r.confidence, provenance: r.provenance,
    })),
  };
}

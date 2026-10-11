// Evidence fusion and the explainable Evidence Score. AI output never creates state directly:
// it is one of eight scored components, and the score decides how far the twin moves.
import type { EvidenceEvent, Incident, IncidentType, Relationship, WorldState } from "@/lib/schemas/domain";
import type { EvidenceScore, ScoreComponent, ScoreComponentKey } from "@/lib/schemas/evidence";
import { cellAt, haversineM } from "@/lib/geo";
import { CONFIG } from "@/lib/simulation/config";
import { clamp, cloneCell, round1, withStream } from "@/lib/simulation/state";

const SCARCITY_TYPES: IncidentType[] = ["pipe_burst", "dry_supply_line", "pipeline_leak"];
const DRAIN_TYPES: IncidentType[] = ["blocked_drain", "overflow"];

function kindOf(e: EvidenceEvent): "flood" | "scarcity" {
  const t = e.analysis?.incidentType;
  if (t && t !== "none") return SCARCITY_TYPES.includes(t) ? "scarcity" : "flood";
  // ponytail: keyword guess until an analysis arrives; fine for demo text, swap for a classifier on real traffic.
  return /no water|dry|tap|supply|leak|pipe|tanker/i.test(e.text) ? "scarcity" : "flood";
}
const contradicts = (e: EvidenceEvent) => !!e.analysis && (!e.analysis.validHazard || e.analysis.incidentType === "none");
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

const LABELS: Record<ScoreComponentKey, string> = {
  ai_confidence: "AI confidence",
  gps_consistency: "GPS consistency",
  time_consistency: "Time consistency",
  independent_confirmations: "Independent confirmations",
  weather_consistency: "Weather consistency",
  duplicate_check: "Duplicate check",
  validator: "Validator",
  infrastructure_correlation: "Infrastructure correlation",
};

export function scoreEvidence(state: WorldState, incident: Incident): EvidenceScore {
  const E = CONFIG.evidence;
  const events = state.evidence.filter((e) => incident.evidenceIds.includes(e.id));
  const cell = state.cells[incident.cellId];
  const supporting = events.filter((e) => !contradicts(e));
  const values = {} as Record<ScoreComponentKey, [value: number, display: string]>;

  const analysed = events.filter((e) => e.analysis);
  const ai = mean(events.map((e) => {
    const a = e.analysis;
    return a ? 100 * a.confidence * (a.validHazard ? 1 : E.invalidHazardFactor) * (1 - a.spamProbability) : E.pendingAiValue;
  }));
  values.ai_confidence = [ai, analysed.length ? `${analysed.length}/${events.length} analysed` : "PENDING"];

  const spread = mean(events.map((e) => haversineM(e.location, incident.location)));
  const accuracy = mean(events.map((e) =>
    e.locationAccuracyM === undefined ? E.unknownAccuracy : clamp(1 - (e.locationAccuracyM - E.gpsGoodM) / (E.gpsBadM - E.gpsGoodM), 0.1, 1)));
  values.gps_consistency = [100 * clamp(1 - spread / E.fuseRadiusM) * accuracy, `${Math.round(spread)} m spread`];

  const times = events.map((e) => e.tMin);
  const span = times.length ? Math.max(...times) - Math.min(...times) : 0;
  values.time_consistency = events.length > 1 ? [100 * clamp(1 - span / E.fuseWindowMin), `${span} min apart`] : [E.singleReportTimeValue, "single report"];

  // Distinct reporters, each counted once at their trust.
  const trust = new Map<string, number>();
  for (const e of supporting) trust.set(e.reporterId, Math.max(trust.get(e.reporterId) ?? 0, e.reporterTrust));
  const trustSum = [...trust.values()].reduce((a, b) => a + b, 0);
  values.independent_confirmations = [100 * clamp((trustSum - E.confirmationOffset) / E.confirmationSpan), `${trust.size} ${trust.size === 1 ? "reporter" : "reporters"}`];

  const stress = !cell ? 0 : incident.kind === "flood"
    ? cell.flood.rainfallPressure
    : Math.max(cell.scarcity.heatStress, 1 - cell.scarcity.supplyAvailability, cell.scarcity.pipelineFailure);
  const weather = 100 * clamp(stress / E.weatherRef);
  values.weather_consistency = [weather, weather >= E.passAt ? "HIGH" : weather >= E.warnAt ? "MEDIUM" : "LOW"];

  const repeats = events.length - new Set(events.map((e) => `${e.reporterId}|${e.text}`)).size;
  const dup = mean(events.map((e) => (e.analysis ? 100 * (1 - e.analysis.spamProbability) : E.pendingDuplicateValue))) * (repeats ? 0.5 : 1);
  values.duplicate_check = [dup, repeats ? `${repeats} duplicate` : dup >= E.passAt ? "PASS" : "SUSPECT"];

  const best = Math.max(0, ...supporting.map((e) => e.reporterTrust));
  values.validator = [100 * best, best >= E.trustedReporter ? "TRUSTED" : best >= 0.4 ? "KNOWN" : "UNKNOWN"];

  const asset = state.assets.find((a) => a.id === incident.suspectedAssetId);
  const failures = asset ? state.history.filter((h) => h.assetId === asset.id).length : 0;
  values.infrastructure_correlation = asset
    ? [100 * (E.infraConditionShare * (1 - asset.condition) + (1 - E.infraConditionShare) * clamp(failures / E.infraHistoryRef)), `${asset.id}: ${failures} past failures`]
    : [0, "no asset nearby"];

  const components: ScoreComponent[] = (Object.keys(LABELS) as ScoreComponentKey[]).map((key) => {
    const value = events.length ? Math.round(values[key][0]) : 0;
    return { key, label: LABELS[key], value, weight: E.weights[key], display: values[key][1], status: value >= E.passAt ? "pass" : value >= E.warnAt ? "warn" : "fail" };
  });
  const total = round1(components.reduce((sum, c) => sum + c.weight * c.value, 0));
  return { total, components, verdict: total >= E.escalateAt ? "escalate" : total >= E.verifyAt ? "verify" : "hold" };
}

/**
 * Add (or update, when the id is already known, e.g. an analysis arriving later) one event.
 * It joins a nearby open incident of the same category or opens a new one; the incident is rescored
 * and the twin moves in proportion to the score.
 */
export function fuse(state: WorldState, event: EvidenceEvent): WorldState {
  const E = CONFIG.evidence;
  const known = state.evidence.some((e) => e.id === event.id);
  const evidence = known ? state.evidence.map((e) => (e.id === event.id ? event : e)) : [...state.evidence, event];
  const kind = kindOf(event);
  const lastSeen = (i: Incident) => Math.max(i.openedAtMin, ...evidence.filter((e) => i.evidenceIds.includes(e.id)).map((e) => e.tMin));

  let incident = state.incidents.find((i) => i.evidenceIds.includes(event.id));
  let note = "";
  if (!incident) {
    const match = state.incidents
      .filter((i) => i.kind === kind && i.status !== "resolved" && i.status !== "dismissed")
      .map((i) => ({ i, dist: haversineM(i.location, event.location) }))
      .filter(({ i, dist }) => dist <= E.fuseRadiusM && Math.abs(event.tMin - lastSeen(i)) <= E.fuseWindowMin)
      .sort((a, b) => a.dist - b.dist)[0];
    if (match) {
      incident = { ...match.i, evidenceIds: [...match.i.evidenceIds, event.id] };
      note = `${event.id} fused into ${incident.id} (${Math.round(match.dist)} m away, ${incident.evidenceIds.length} reports)`;
    } else {
      const cellId = cellAt(state.cells, event.location);
      const cell = state.cells[cellId];
      const prefix = kind === "flood" ? "F" : "S";
      const id = `${prefix}-${String(state.incidents.filter((i) => i.kind === kind).length + 1).padStart(2, "0")}`;
      incident = {
        id, kind, cellId,
        type: kind === "flood" ? "waterlogging" : "dry_supply_line",
        status: "unverified",
        location: event.location,
        severity: E.defaultSeverity,
        evidenceIds: [event.id],
        suspectedAssetId: kind === "flood" ? cell?.drainAssetId : cell?.pipeAssetId,
        openedAtMin: event.tMin,
        provenance: "DERIVED",
      };
      note = `${id} opened from ${event.id}${incident.suspectedAssetId ? `, suspected asset ${incident.suspectedAssetId}` : ""}`;
    }
  }

  const memberIds = incident.evidenceIds;
  const events = evidence.filter((e) => memberIds.includes(e.id));
  const valid = events.filter((e) => e.analysis && !contradicts(e)).sort((a, b) => b.analysis!.confidence - a.analysis!.confidence);
  if (valid.length) {
    incident = { ...incident, type: valid[0].analysis!.incidentType, severity: Math.round(mean(valid.map((e) => e.analysis!.severity))) };
  }

  const others = events.filter((e) => e.id !== event.id);
  const links: Relationship[] = [{ from: event.id, to: incident.id, relation: "EVIDENCE_OF" }];
  if (others.length && contradicts(event)) links.push({ from: event.id, to: incident.id, relation: "CONTRADICTS" });
  else if (others.some((e) => e.reporterId !== event.reporterId)) links.push({ from: event.id, to: others[0].id, relation: "CONFIRMS" });

  let next: WorldState = {
    ...state,
    evidence,
    relationships: [...state.relationships.filter((r) => r.from !== event.id), ...links],
    incidents: state.incidents.some((i) => i.id === incident.id) ? state.incidents.map((i) => (i.id === incident.id ? incident : i)) : [...state.incidents, incident],
  };
  const score = scoreEvidence(next, incident);
  const open = incident.status !== "resolved" && incident.status !== "dismissed";
  const scored: Incident = {
    ...incident,
    evidenceScore: score,
    status: !open ? incident.status : score.verdict === "escalate" ? "verified" : score.verdict === "verify" ? "verifying" : "unverified",
  };
  next = { ...next, incidents: next.incidents.map((i) => (i.id === scored.id ? scored : i)), cells: moveTwin(next, scored, score) };
  if (note) next = withStream(next, { kind: "fusion", incidentId: scored.id, title: note });
  return withStream(next, {
    kind: "score", incidentId: scored.id,
    title: `${scored.id} confidence ${score.total} → ${score.verdict.toUpperCase()}`,
    detail: score.components.map((c) => `${c.label} ${c.value}`).join(" · "),
  });
}

/** Belief update: factors only ever rise here, and only as far as the score allows. */
function moveTwin(state: WorldState, incident: Incident, score: EvidenceScore): WorldState["cells"] {
  const E = CONFIG.evidence;
  const s = score.total / 100;
  const cells = { ...state.cells };
  const raise = (id: string, fn: (c: (typeof cells)[string]) => void) => {
    if (!cells[id]) return;
    cells[id] = cloneCell(cells[id]);
    fn(cells[id]);
  };
  const asset = score.verdict === "hold" ? undefined : state.assets.find((a) => a.id === incident.suspectedAssetId);
  if (incident.kind === "flood") {
    raise(incident.cellId, (c) => {
      c.flood.incidentPressure = Math.max(c.flood.incidentPressure, (s * incident.severity) / 10);
      c.flood.evidenceConfidence = Math.max(c.flood.evidenceConfidence, s);
    });
    if (asset?.kind === "drain" && DRAIN_TYPES.includes(incident.type)) {
      for (const id of asset.cellIds) raise(id, (c) => (c.flood.drainageFailure = Math.max(c.flood.drainageFailure, s * E.blockedDrainFailure)));
    }
  } else {
    for (const id of new Set([incident.cellId, ...(asset?.kind === "pipe" ? asset.cellIds : [])])) {
      raise(id, (c) => (c.scarcity.outageReports = Math.max(c.scarcity.outageReports, s)));
    }
  }
  return cells;
}

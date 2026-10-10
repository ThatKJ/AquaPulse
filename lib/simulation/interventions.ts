// Interventions change model parameters on a copy; the prediction is then rerun and compared with baseline.
import type { Alert, HydroCell, WorldState } from "@/lib/schemas/domain";
import type { ActionBundle, Horizon, InterventionOutcome, InterventionRecord, Prediction } from "@/lib/schemas/simulation";
import { haversineM } from "@/lib/geo";
import { CONFIG } from "./config";
import { predict } from "./predict";
import { clamp, cloneCell, fmt, locate, round1, unitHash, withStream } from "./state";

/**
 * Clone-and-mutate. CLEAR_DRAIN, REPAIR_PIPE and DISPATCH_CREW change cell factors; the other kinds have no
 * factor of their own and act through `activeInterventions`, which `predict` reads.
 * ponytail: effects apply instantly; response time is reported and penalised in the auction, not simulated.
 * Add a start time to Intervention if staged roll-out ever needs to be shown.
 */
export function applyBundle(state: WorldState, bundle: ActionBundle): WorldState {
  const I = CONFIG.interventions;
  const cells = { ...state.cells };
  const edit = (ids: string[], fn: (c: HydroCell) => void) => {
    for (const id of ids) {
      if (!cells[id]) continue;
      const c = cloneCell(cells[id]);
      fn(c);
      cells[id] = c;
    }
  };
  for (const iv of bundle.interventions) {
    const asset = state.assets.find((a) => a.id === iv.targetId);
    const assetCells = asset?.cellIds ?? [];
    if (iv.kind === "CLEAR_DRAIN") {
      const cleared = I.clearDrainBase + I.clearDrainByCondition * (1 - (asset?.condition ?? 1));
      edit(assetCells, (c) => {
        c.flood.drainageFailure = Math.min(c.flood.drainageFailure, cleared);
        c.flood.incidentPressure *= I.clearDrainIncident;
      });
    } else if (iv.kind === "REPAIR_PIPE") {
      edit(assetCells, (c) => {
        c.scarcity.supplyAvailability += (1 - c.scarcity.supplyAvailability) * I.repairSupplyRecovery;
        c.scarcity.pipelineFailure *= I.repairFailureResidual;
        c.scarcity.outageReports *= I.repairOutageResidual;
      });
    } else if (iv.kind === "DISPATCH_CREW") {
      edit([iv.targetId], (c) => {
        c.flood.incidentPressure *= I.crewIncidentRelief;
      });
    }
  }
  return { ...state, cells, activeInterventions: [...state.activeInterventions, ...bundle.interventions] };
}

const affected = (p: Prediction) => p.totals.exposedPopulation + p.totals.populationShort;
const peakRisk = (p: Prediction) => Math.max(p.totals.maxFloodRisk, p.totals.maxScarcityRisk);
const troubled = (p: Prediction) => [...new Set([...p.totals.facilitiesAtRisk, ...p.totals.facilitiesShort])];

/**
 * Bundle vs a precomputed baseline. "Exposure" here is people affected: flood-exposed plus water-short,
 * so the same outcome shape serves flood and scarcity bundles.
 */
export function evaluate(state: WorldState, baseline: Prediction, bundle: ActionBundle, horizon: Horizon): { outcome: InterventionOutcome; after: Prediction } {
  const I = CONFIG.interventions;
  const after = predict(applyBundle(state, bundle), horizon);
  const baselineExposure = affected(baseline);
  const exposure = affected(after);

  let reduction = 0;
  let vulnReduction = 0;
  for (const id in baseline.cells) {
    const b = baseline.cells[id];
    const a = after.cells[id];
    const d = b.exposedPopulation + b.populationShort - a.exposedPopulation - a.populationShort;
    reduction += d;
    vulnReduction += d * state.cells[id].vulnerability;
  }
  const stillTroubled = new Set(troubled(after));
  const facilitiesProtected = troubled(baseline).filter((f) => !stillTroubled.has(f));
  const hospitalProtected = facilitiesProtected.some((id) => state.facilities.find((f) => f.id === id)?.kind === "hospital");
  const equity = reduction > 0
    ? I.equityVulnShare * clamp(vulnReduction / reduction / I.equityVulnRef) + (1 - I.equityVulnShare) * (hospitalProtected ? 1 : facilitiesProtected.length ? 0.5 : 0)
    : 0;

  // Resources travel in parallel, so the slowest intervention sets the response time.
  const hasCrew = bundle.interventions.some((iv) => iv.kind === "DISPATCH_CREW");
  let responseTimeMin = 0;
  let costProxyLakh = 0;
  let confidence = after.totals.meanConfidence;
  for (const iv of bundle.interventions) {
    const target = locate(state, iv.targetId);
    let travel = 0;
    for (const rid of iv.resourceIds) {
      const r = state.resources.find((x) => x.id === rid);
      if (!r) continue;
      costProxyLakh += r.costProxyLakh;
      if (target) travel = Math.max(travel, (haversineM(r.location, target) / 1000 / I.travelSpeedKmh) * 60);
    }
    const setup = I.setupMin[iv.kind] * (hasCrew && iv.kind !== "DISPATCH_CREW" ? I.crewSpeedup : 1);
    responseTimeMin = Math.max(responseTimeMin, travel + setup);
    costProxyLakh += I.kindCostLakh[iv.kind];
    confidence = Math.min(confidence, after.totals.meanConfidence * I.kindConfidence[iv.kind]);
  }

  const cut = baselineExposure > 0 ? (baselineExposure - exposure) / baselineExposure : 0;
  return {
    after,
    outcome: {
      bundleId: bundle.id,
      horizon,
      baselineExposure,
      exposure,
      exposureChangePct: round1(-100 * cut),
      riskChange: round1(peakRisk(after) - peakRisk(baseline)),
      facilitiesProtected,
      // ponytail: duration is a proportional proxy (no incident-lifetime model); replace if recovery is simulated.
      durationChangeMin: -Math.round(I.incidentDurationMin * cut),
      costProxyLakh: Math.round(costProxyLakh * 100) / 100,
      responseTimeMin: Math.round(responseTimeMin),
      confidence: Math.round(confidence * 100) / 100,
      equityScore: Math.round(100 * equity),
      vulnerableExposureChange: -Math.round(vulnReduction),
      deficitReductionLiters: baseline.totals.deficitLiters - after.totals.deficitLiters,
    },
  };
}

export function simulateBundle(state: WorldState, bundle: ActionBundle, horizon: Horizon): InterventionOutcome {
  return evaluate(state, predict(state, horizon), bundle, horizon).outcome;
}

/** Apply for real: factors, used resources, proof record, history row, alert and stream entries. */
export function commitBundle(state: WorldState, incidentId: string, bundle: ActionBundle): WorldState {
  const I = CONFIG.interventions;
  const horizon = I.commitHorizon;
  const baseline = predict(state, horizon);
  const { outcome, after } = evaluate(state, baseline, bundle, horizon);
  const incident = state.incidents.find((i) => i.id === incidentId);

  // Observed result is simulated: expected, nudged deterministically by a few percent.
  const nudge = (salt: string) => 1 + I.observedJitter * (2 * unitHash(`${bundle.id}|${incidentId}|${state.tMin}|${salt}`) - 1);
  const before = { risk: peakRisk(baseline), exposure: outcome.baselineExposure };
  const expected = { risk: peakRisk(after), exposure: outcome.exposure };
  const observed = { risk: round1(clamp(expected.risk * nudge("risk"), 0, 100)), exposure: Math.round(expected.exposure * nudge("exposure")) };
  const effectiveness = before.exposure > 0 ? Math.round(clamp((before.exposure - observed.exposure) / before.exposure) * 100) / 100 : 0;
  const record: InterventionRecord = {
    id: `IR-${String(state.interventionRecords.length + 1).padStart(2, "0")}`,
    incidentId, bundle, appliedAtMin: state.tMin, before, expected, observed, effectiveness,
    confidence: outcome.confidence,
    provenance: "SIMULATED",
  };

  const used = new Set(bundle.interventions.flatMap((iv) => iv.resourceIds));
  const fix = bundle.interventions.find((iv) => iv.kind === "CLEAR_DRAIN" || iv.kind === "REPAIR_PIPE");
  const assetId = fix?.targetId ?? incident?.suspectedAssetId;
  const place = state.assets.find((a) => a.id === assetId)?.name ?? "the reported location";
  const alert: Alert = {
    id: `AL-${String(state.alerts.length + 1).padStart(2, "0")}`,
    incidentId, tMin: state.tMin,
    audience: `Residents and facilities near ${place}`,
    body: `${incident?.kind === "scarcity" ? "Water supply disruption" : "Flood risk"} near ${place}. Response under way: ${bundle.label}. About ${fmt(before.exposure)} people affected; expected to fall to ${fmt(expected.exposure)} within ${horizon} min.`,
    transport: "demo",
    status: "queued",
  };

  let next: WorldState = {
    ...applyBundle(state, bundle),
    resources: state.resources.map((r) => (used.has(r.id) ? { ...r, available: false } : r)),
    interventionRecords: [...state.interventionRecords, record],
    alerts: [...state.alerts, alert],
    history: assetId
      ? [...state.history, {
          assetId, year: CONFIG.clock.year, month: CONFIG.clock.month,
          severity: incident?.severity ?? CONFIG.evidence.defaultSeverity,
          exposedPopulation: before.exposure,
          note: `${incidentId}: ${bundle.label} (observed result simulated)`,
          interventionKind: (fix ?? bundle.interventions[0])?.kind,
          effectiveness,
          provenance: "SIMULATED",
        }]
      : state.history,
  };
  next = withStream(next, {
    kind: "action", incidentId, title: `Action committed: ${bundle.label}`,
    detail: `Expected at +${horizon} min: ${fmt(before.exposure)} → ${fmt(expected.exposure)} people affected (${outcome.exposureChangePct}%). Response ${outcome.responseTimeMin} min, cost proxy ₹${outcome.costProxyLakh} lakh.`,
  });
  next = withStream(next, { kind: "alert", incidentId, title: `Alert queued for ${alert.audience}`, detail: alert.body, provenance: "SIMULATED" });
  return withStream(next, {
    kind: "learning", incidentId, provenance: "SIMULATED",
    title: `Effectiveness recorded: ${Math.round(effectiveness * 100)}%`,
    detail: `Before ${fmt(before.exposure)}, expected ${fmt(expected.exposure)}, observed ${fmt(observed.exposure)} (observed is simulated).${assetId ? ` Added to ${assetId} failure memory.` : ""}`,
  });
}

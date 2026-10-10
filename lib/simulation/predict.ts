// Explainable cell-propagation model for flood and scarcity. Not hydrodynamics.
import type { FloodFactors, WorldState } from "@/lib/schemas/domain";
import type { CellPrediction, Contributor, Horizon, Prediction } from "@/lib/schemas/simulation";
import { disk } from "@/lib/geo";
import { CONFIG } from "./config";
import { clamp, round1 } from "./state";

const FLOOD_LABELS: Record<keyof FloodFactors, string> = {
  rainfallPressure: "Rainfall",
  upstreamPressure: "Upstream pressure",
  drainageFailure: "Drainage failure",
  elevationSusceptibility: "Low elevation",
  historicSusceptibility: "Flood history",
  incidentPressure: "Verified incident",
  evidenceConfidence: "Evidence confidence",
};
const FLOOD_KEYS = Object.keys(FLOOD_LABELS) as (keyof FloodFactors)[];

/** Share of a cell's population exposed at a given flood risk (0 below the floor, convex above). */
export function exposureShare(risk: number): number {
  const F = CONFIG.flood;
  if (risk <= F.exposureRiskFloor) return 0;
  return F.exposureMaxShare * ((risk - F.exposureRiskFloor) / (100 - F.exposureRiskFloor)) ** F.exposureGamma;
}

export function predict(state: WorldState, horizon: Horizon): Prediction {
  const F = CONFIG.flood;
  const S = CONFIG.scarcity;
  const I = CONFIG.interventions;
  const ids = Object.keys(state.cells);
  const n = ids.length;
  const index = new Map(ids.map((id, i) => [id, i]));
  const cells = ids.map((id) => state.cells[id]);

  // Interventions without a cell factor of their own act here, as overlays.
  const pump = new Float64Array(n);
  const roadClosed = new Uint8Array(n);
  const alerted = new Uint8Array(n);
  const tankerLiters = new Float64Array(n);
  const facilityTanker: Record<string, number> = {};
  const capacity = (resIds: string[]) => resIds.reduce((sum, id) => sum + (state.resources.find((r) => r.id === id)?.capacity ?? 0), 0);
  const mark = (arr: Uint8Array, target: string, radius: number) => {
    for (const id of disk(target, radius)) {
      const i = index.get(id);
      if (i !== undefined) arr[i] = 1;
    }
  };
  for (const iv of state.activeInterventions) {
    if (iv.kind === "DEPLOY_PUMP") {
      const strength = (I.pumpOutflowPerStep * capacity(iv.resourceIds)) / I.pumpRefCapacity;
      const seen = new Set<string>();
      for (let k = 0; k <= I.pumpRadius; k++) {
        for (const id of disk(iv.targetId, k)) {
          const i = index.get(id);
          if (i === undefined || seen.has(id)) continue;
          seen.add(id);
          pump[i] += strength * I.pumpFalloff ** k;
        }
      }
    } else if (iv.kind === "CLOSE_ROAD") mark(roadClosed, iv.targetId, I.roadRadius);
    else if (iv.kind === "ISSUE_ALERT") mark(alerted, iv.targetId, I.alertRadius);
    else if (iv.kind === "SEND_TANKER") {
      const facility = state.facilities.find((f) => f.id === iv.targetId);
      const i = index.get(facility ? facility.cellId : iv.targetId);
      if (i === undefined) continue;
      const liters = capacity(iv.resourceIds);
      tankerLiters[i] += liters;
      if (facility) facilityTanker[facility.id] = (facilityTanker[facility.id] ?? 0) + liters;
    }
  }

  // ---- Flood: weighted base, then step-by-step downhill propagation.
  const base = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let b = 0;
    for (const k of FLOOD_KEYS) b += F.weights[k] * cells[i].flood[k];
    base[i] = b;
  }
  // Each cell spills to its lower neighbours in proportion to the drop.
  const lower: [number, number][][] = cells.map((c) => {
    const out: [number, number][] = [];
    let total = 0;
    for (const id of disk(c.id)) {
      const j = index.get(id);
      if (j === undefined || cells[j].elevation >= c.elevation) continue;
      const drop = c.elevation - cells[j].elevation;
      out.push([j, drop]);
      total += drop;
    }
    for (const o of out) o[1] /= total;
    return out;
  });

  const steps = horizon / F.stepMin;
  const run = steps || 15 / F.stepMin; // at NOW, look one horizon ahead only to label the trend
  const p = new Float64Array(n);
  for (let i = 0; i < n; i++) p[i] = clamp(base[i] - pump[i], 0, F.maxPressure);
  const start = Float64Array.from(p);
  const inflow = new Float64Array(n);
  const feeders = new Uint8Array(n);
  const spilled = new Float64Array(n);
  for (let k = 1; k <= run; k++) {
    inflow.fill(0);
    feeders.fill(0);
    spilled.fill(0);
    const decay = F.flowDecay ** k;
    for (let i = 0; i < n; i++) {
      const excess = p[i] - F.flowThreshold;
      if (excess <= 0) continue;
      const out = F.flowRate * excess * decay;
      if (lower[i].length) spilled[i] = out * F.flowLoss;
      for (const [j, share] of lower[i]) {
        inflow[j] += out * share;
        feeders[j]++;
      }
    }
    for (let i = 0; i < n; i++) {
      const fl = cells[i].flood;
      const gain = inflow[i] * (1 + F.convergenceBoost * Math.max(0, feeders[i] - 1)) * (1 - F.drainRelief * (1 - fl.drainageFailure));
      p[i] = clamp(p[i] + gain - spilled[i] + F.rainAccum * fl.rainfallPressure * fl.drainageFailure - pump[i], 0, F.maxPressure);
    }
  }
  const pressure = steps ? p : start;

  // ---- Per-cell output, with scarcity computed alongside.
  const hours = horizon / 60;
  const facilityDemand = new Float64Array(n);
  for (const f of state.facilities) {
    const i = index.get(f.cellId);
    if (i !== undefined) facilityDemand[i] += f.dailyDemandLiters;
  }
  const out: Record<string, CellPrediction> = {};
  const deficitFrac = new Float64Array(n);
  const totals = { exposedPopulation: 0, populationShort: 0, deficitLiters: 0, maxFloodRisk: 0, maxScarcityRisk: 0, confidence: 0 };

  for (let i = 0; i < n; i++) {
    const c = cells[i];
    const floodRisk = round1(100 * clamp(pressure[i]));
    const pumped = pump[i] * (steps + 1);
    const contributors: Contributor[] = FLOOD_KEYS.map((k) => ({
      factor: k, label: FLOOD_LABELS[k], weight: F.weights[k], value: c.flood[k], contribution: F.weights[k] * c.flood[k],
    }));
    const flowIn = pressure[i] - base[i] + pumped;
    if (Math.abs(flowIn) > 1e-4) {
      contributors.push({ factor: "propagation", label: flowIn > 0 ? `Inflow from uphill cells (+${horizon} min)` : `Runoff to lower cells (+${horizon} min)`, weight: 1, value: flowIn, contribution: flowIn });
    }
    if (pumped > 0) contributors.push({ factor: "pumpOutflow", label: "Pump outflow", weight: -1, value: pumped, contribution: -pumped });
    contributors.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

    const delta = 100 * (p[i] - start[i]);
    const exposedPopulation = Math.round(
      c.population * exposureShare(floodRisk) * (1 - c.roadExposure * roadClosed[i]) * (1 - I.alertExposureCut * alerted[i]),
    );

    const sc = c.scarcity;
    const demandFactor = S.demandBase + S.demandSpan * sc.demandPressure + S.heatDemand * sc.heatStress;
    const gap = clamp(1 - (sc.supplyAvailability * (1 - S.pipeLoss * sc.pipelineFailure)) / demandFactor);
    const storage = clamp(sc.storageAvailability - S.storageDrainPerHour * gap * hours); // storage drains while the gap lasts
    const demandLiters = c.population * S.litersPerCapitaDay * demandFactor + facilityDemand[i];
    const rawFrac = Math.max(0, gap - storage * S.storageBuffer);
    const rawDeficit = demandLiters * rawFrac;
    const deficitLiters = Math.max(0, rawDeficit - tankerLiters[i]);
    const covered = rawDeficit > 0 ? 1 - deficitLiters / rawDeficit : 0;
    deficitFrac[i] = rawFrac;
    const W = S.weights;
    const scarcityRaw =
      W.supplyAvailability * (1 - sc.supplyAvailability) + W.demandPressure * sc.demandPressure + W.heatStress * sc.heatStress +
      W.pipelineFailure * sc.pipelineFailure + W.outageReports * sc.outageReports + W.storageAvailability * (1 - storage) +
      W.populationPressure * sc.populationPressure + W.criticalFacilityDemand * sc.criticalFacilityDemand;
    const scarcityRisk = round1(100 * clamp(scarcityRaw) * (1 - S.tankerRiskRelief * covered));
    const populationShort = Math.round(c.population * rawFrac * (1 - covered));

    const Cf = CONFIG.confidence;
    const confidence = clamp(Cf.base - Cf.horizonDecayPerHour * hours + Cf.evidenceGain * c.flood.evidenceConfidence, Cf.min, Cf.max);

    out[c.id] = {
      cellId: c.id, floodRisk, scarcityRisk, confidence,
      contributors: contributors.slice(0, F.contributorsShown),
      exposedPopulation, populationShort,
      deficitLiters: Math.round(deficitLiters),
      trend: delta > F.trendDelta ? "rising" : delta < -F.trendDelta ? "falling" : "steady",
    };
    totals.exposedPopulation += exposedPopulation;
    totals.populationShort += populationShort;
    totals.deficitLiters += Math.round(deficitLiters);
    totals.maxFloodRisk = Math.max(totals.maxFloodRisk, floodRisk);
    totals.maxScarcityRisk = Math.max(totals.maxScarcityRisk, scarcityRisk);
    totals.confidence += confidence;
  }

  const { confidence, ...rest } = totals;
  return {
    horizon,
    cells: out,
    totals: {
      ...rest,
      meanConfidence: n ? confidence / n : 0,
      facilitiesAtRisk: state.facilities.filter((f) => (out[f.cellId]?.floodRisk ?? 0) >= F.facilityRiskThreshold).map((f) => f.id),
      // A facility whose own shortfall a tanker covers is no longer short, even if its cell still is.
      facilitiesShort: state.facilities
        .filter((f) => {
          const i = index.get(f.cellId);
          if (i === undefined || out[f.cellId].scarcityRisk < S.facilityShortThreshold) return false;
          return (facilityTanker[f.id] ?? 0) < f.dailyDemandLiters * deficitFrac[i];
        })
        .map((f) => f.id),
    },
  };
}

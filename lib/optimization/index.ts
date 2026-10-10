// Decisions built on the prediction model: action auction, counterfactual, tanker allocation, fix-first ranking.
import type { Incident, LngLat, Resource, ResourceKind, WorldState } from "@/lib/schemas/domain";
import type {
  ActionBundle, AuctionOption, AuctionResult, AuctionWeights, Contributor, Counterfactual, Horizon,
  InfraPriority, Intervention, TankerAssignment,
} from "@/lib/schemas/simulation";
import { haversineM } from "@/lib/geo";
import { CONFIG } from "@/lib/simulation/config";
import { evaluate } from "@/lib/simulation/interventions";
import { predict } from "@/lib/simulation/predict";
import { clamp, fmt, round1 } from "@/lib/simulation/state";

const nearestFree = (state: WorldState, kind: ResourceKind, to: LngLat): Resource | undefined =>
  state.resources
    .filter((r) => r.kind === kind && r.available)
    .sort((a, b) => haversineM(a.location, to) - haversineM(b.location, to) || a.id.localeCompare(b.id))[0];

/** Feasible single actions for an incident, given the resources that are free right now. */
function singleActions(state: WorldState, incident: Incident, shortFacilityIds: string[]): Intervention[] {
  const out: Intervention[] = [];
  const asset = state.assets.find((a) => a.id === incident.suspectedAssetId);
  const crew = nearestFree(state, "crew", incident.location);
  if (incident.kind === "flood") {
    if (asset?.kind === "drain" && crew) out.push({ kind: "CLEAR_DRAIN", targetId: asset.id, resourceIds: [crew.id], label: `Clear Drain ${asset.id}` });
    for (const r of state.resources) {
      if (r.kind === "pump" && r.available) out.push({ kind: "DEPLOY_PUMP", targetId: incident.cellId, resourceIds: [r.id], label: `Deploy Pump ${r.id}` });
    }
    out.push({ kind: "CLOSE_ROAD", targetId: incident.cellId, resourceIds: [], label: `Close Roads near ${asset?.id ?? incident.id}` });
  } else {
    if (asset?.kind === "pipe" && crew) out.push({ kind: "REPAIR_PIPE", targetId: asset.id, resourceIds: [crew.id], label: `Repair Pipe ${asset.id}` });
    // Tankers go to the most critical short facility the incident touches, else to the incident cell.
    const served = new Set([incident.cellId, ...(asset?.cellIds ?? [])]);
    const facility = state.facilities
      .filter((f) => shortFacilityIds.includes(f.id) && served.has(f.cellId))
      .sort((a, b) => Number(b.kind === "hospital") - Number(a.kind === "hospital") || b.dailyDemandLiters - a.dailyDemandLiters)[0];
    for (const r of state.resources) {
      if (r.kind === "tanker" && r.available) {
        out.push({ kind: "SEND_TANKER", targetId: facility?.id ?? incident.cellId, resourceIds: [r.id], label: `Send Tanker ${r.id} to ${facility?.name ?? "incident area"}` });
      }
    }
  }
  out.push({ kind: "ISSUE_ALERT", targetId: incident.cellId, resourceIds: [], label: "Issue Local Alert" });
  if (crew) out.push({ kind: "DISPATCH_CREW", targetId: incident.cellId, resourceIds: [crew.id], label: `Dispatch Crew ${crew.id}` });
  return out;
}

const bundleOf = (ivs: Intervention[]): ActionBundle => ({
  id: ivs.map((iv) => `${iv.kind}:${iv.targetId}:${iv.resourceIds.join(",")}`).join("+"),
  label: ivs.map((iv) => iv.label).join(" + "),
  interventions: ivs,
});

export function runAuction(state: WorldState, incidentId: string, horizon: Horizon = 30, weights: AuctionWeights = CONFIG.auction.weights): AuctionResult {
  const A = CONFIG.auction;
  const incident = state.incidents.find((i) => i.id === incidentId);
  const baseline = predict(state, horizon);
  const baselineExposure = baseline.totals.exposedPopulation + baseline.totals.populationShort;
  if (!incident) return { incidentId, horizon, baselineExposure, options: [], evaluated: 0, winnerReasons: [] };

  // Singles first, then pairs that do not share a resource, up to the candidate cap.
  const singles = singleActions(state, incident, baseline.totals.facilitiesShort);
  const bundles = singles.map((s) => bundleOf([s]));
  for (let i = 0; i < singles.length; i++) {
    for (let j = i + 1; j < singles.length && bundles.length < A.maxCandidates; j++) {
      if (singles[i].resourceIds.some((r) => singles[j].resourceIds.includes(r))) continue;
      bundles.push(bundleOf([singles[i], singles[j]]));
    }
  }

  const facilityWeight = (id: string) => (state.facilities.find((f) => f.id === id)?.kind === "hospital" ? A.hospitalWeight : A.otherFacilityWeight);
  const scored = bundles.map((bundle) => {
    const { outcome } = evaluate(state, baseline, bundle, horizon);
    const term = (factor: string, label: string, weight: number, value: number): Contributor => ({ factor, label, weight, value, contribution: weight * value });
    const breakdown = [
      term("exposureReduction", "Exposure reduction", weights.exposureReduction, clamp(-outcome.exposureChangePct / 100)),
      term("facilitiesProtected", "Facilities protected", weights.facilitiesProtected, clamp(outcome.facilitiesProtected.reduce((s, id) => s + facilityWeight(id), 0) / A.facilityRef)),
      term("equity", "Equity", weights.equity, outcome.equityScore / 100),
      term("confidence", "Confidence", weights.confidence, outcome.confidence),
      term("costPenalty", "Cost penalty", -weights.costPenalty, clamp(outcome.costProxyLakh / A.costRefLakh)),
      term("responseTimePenalty", "Response-time penalty", -weights.responseTimePenalty, clamp(outcome.responseTimeMin / A.responseRefMin)),
    ];
    return { bundle, outcome, breakdown, score: round1(100 * breakdown.reduce((s, t) => s + t.contribution, 0)) };
  });
  scored.sort((a, b) => b.score - a.score || a.bundle.id.localeCompare(b.bundle.id));
  const options: AuctionOption[] = scored.slice(0, 3).map((o, i) => ({ rank: i + 1, ...o }));

  const winnerReasons: string[] = [];
  const [win, next] = options;
  if (win) {
    const o = win.outcome;
    if (next && next.outcome.exposure > o.exposure) winnerReasons.push(`Protects ${fmt(next.outcome.exposure - o.exposure)} more people than the next option (${next.bundle.label})`);
    winnerReasons.push(`Cuts people affected at +${horizon} min from ${fmt(o.baselineExposure)} to ${fmt(o.exposure)} (${o.exposureChangePct}%)`);
    const name = (id: string) => state.facilities.find((f) => f.id === id)?.name ?? id;
    const contested = (id: string) => scored.some((s) => s.bundle.id !== win.bundle.id && s.outcome.facilitiesProtected.includes(id));
    const only = o.facilitiesProtected.filter((id) => !contested(id)).map(name);
    const shared = o.facilitiesProtected.filter(contested).map(name);
    if (only.length) winnerReasons.push(`Only option that keeps ${only.join(", ")} below the risk threshold`);
    if (shared.length) winnerReasons.push(`Keeps ${shared.join(", ")} below the risk threshold`);
    if (o.deficitReductionLiters > 0) winnerReasons.push(`Removes ${fmt(o.deficitReductionLiters)} L of daily deficit`);
    winnerReasons.push(`Equity score ${o.equityScore}/100, on site in ${o.responseTimeMin} min, cost proxy ₹${o.costProxyLakh} lakh`);
  }
  return { incidentId, horizon, baselineExposure, options, evaluated: scored.length, winnerReasons };
}

/**
 * What acting `minutesEarlier` sooner is worth.
 * ponytail: estimate only. With no stored past states, "now" stands in
 * for the earlier moment, so the delayed path is the unmitigated forecast and the early path is the winner applied now.
 */
export function counterfactual(state: WorldState, incidentId: string, minutesEarlier: number): Counterfactual {
  const horizon: Horizon = minutesEarlier <= 15 ? 15 : minutesEarlier <= 30 ? 30 : 60;
  const winner = runAuction(state, incidentId, horizon).options[0];
  const baseline = predict(state, horizon);
  const currentExposure = baseline.totals.exposedPopulation + baseline.totals.populationShort;
  const counterfactualExposure = winner ? winner.outcome.exposure : currentExposure;
  return {
    incidentId,
    bundleLabel: winner?.bundle.label ?? "No feasible action",
    minutesEarlier,
    currentExposure,
    counterfactualExposure,
    avoidableExposure: Math.max(0, currentExposure - counterfactualExposure),
  };
}

/** Greedy by equity-weighted need: short hospitals, then high-deficit vulnerable cells, then schools and shelters. */
export function allocateTankers(state: WorldState): TankerAssignment[] {
  const T = CONFIG.tankers;
  const p = predict(state, T.horizon);
  type Need = { tier: number; targetId: string; label: string; at: LngLat; liters: number; equity: number; why: string };
  const needs: Need[] = [];
  for (const f of state.facilities) {
    if (!p.totals.facilitiesShort.includes(f.id)) continue;
    const cell = state.cells[f.cellId];
    // Facility shortfall = its share of the cell deficit.
    const cp = p.cells[f.cellId];
    const liters = Math.round(f.dailyDemandLiters * clamp(cp.populationShort / Math.max(1, cell.population)));
    if (liters <= 0) continue;
    const hospital = f.kind === "hospital";
    needs.push({
      tier: hospital ? 0 : 2, targetId: f.id, label: f.name, at: f.location, liters,
      equity: hospital ? T.hospitalEquityBase + (1 - T.hospitalEquityBase) * cell.vulnerability : 0.5 * (1 + cell.vulnerability) * 0.8,
      why: hospital ? `Hospital short by ${fmt(liters)} L/day; critical care is served first` : `${f.kind === "school" ? "School" : "Community point"} short by ${fmt(liters)} L/day`,
    });
  }
  for (const cp of Object.values(p.cells)) {
    if (cp.deficitLiters <= 0) continue;
    const cell = state.cells[cp.cellId];
    needs.push({
      tier: 1, targetId: cp.cellId, label: `Cell near ${cell.pipeAssetId ?? "unserved area"} (${fmt(cp.populationShort)} people short)`, at: cell.center,
      liters: cp.deficitLiters, equity: cell.vulnerability,
      why: `Deficit ${fmt(cp.deficitLiters)} L/day, vulnerability ${cell.vulnerability.toFixed(2)}`,
    });
  }
  // Within a tier, need is weighted by equity so a vulnerable cell outranks a slightly drier comfortable one.
  needs.sort((a, b) => a.tier - b.tier || b.liters * (0.5 + b.equity) - a.liters * (0.5 + a.equity) || a.targetId.localeCompare(b.targetId));

  const free = state.resources.filter((r) => r.kind === "tanker" && r.available);
  const out: TankerAssignment[] = [];
  for (const need of needs) {
    let left = need.liters;
    // Hospitals are topped up until covered; every other target gets one tanker so the fleet spreads out.
    for (let sent = 0; left > 0 && free.length && (need.tier === 0 || sent < 1); sent++) {
      free.sort((a, b) => haversineM(a.location, need.at) - haversineM(b.location, need.at) || a.id.localeCompare(b.id));
      const t = free.shift()!;
      const liters = Math.min(t.capacity, left);
      left -= liters;
      out.push({
        resourceId: t.id, targetId: need.targetId, targetLabel: need.label, liters,
        equityScore: Math.round(100 * clamp(need.equity)),
        reason: `${need.why}. ${t.id} is ${(haversineM(t.location, need.at) / 1000).toFixed(1)} km away.`,
      });
    }
    if (!free.length) break;
  }
  return out;
}

/** Fix-first ranking: which asset most deserves a permanent upgrade, from failure memory and current risk. */
export function infraPriorities(state: WorldState): InfraPriority[] {
  const P = CONFIG.priorities;
  const p = predict(state, P.riskHorizon);
  const rows = state.assets.map((a) => {
    const hist = state.history.filter((h) => h.assetId === a.id);
    const fixes = hist.filter((h) => h.effectiveness !== undefined);
    const years = hist.map((h) => h.year);
    const last = hist.reduce((m, h) => (h.year > m.year || (h.year === m.year && h.month > m.month) ? h : m), hist[0] ?? { year: 0, month: 0 });
    const avgSeverity = hist.length ? hist.reduce((s, h) => s + h.severity, 0) / hist.length : 0;
    const recurringExposure = hist.length ? Math.round(hist.reduce((s, h) => s + h.exposedPopulation, 0) / hist.length) : 0;
    const avgEffectiveness = fixes.length ? fixes.reduce((s, h) => s + (h.effectiveness ?? 0), 0) / fixes.length : 1;
    const linked = state.relationships.filter((r) => r.from === a.id && r.relation === "AFFECTS").map((r) => state.facilities.find((f) => f.id === r.to));
    const facilityWeight = linked.reduce((s, f) => s + (f?.kind === "hospital" ? 1 : f ? 0.5 : 0), 0);
    const risk = a.cellIds.length
      ? a.cellIds.reduce((s, id) => s + (a.kind === "pipe" ? p.cells[id].scarcityRisk : p.cells[id].floodRisk), 0) / a.cellIds.length / 100
      : 0;

    const f = (factor: keyof typeof P.weights, label: string, value: number): Contributor => ({ factor, label, weight: P.weights[factor], value, contribution: P.weights[factor] * value });
    const factors = [
      f("recurrence", "Recurrence", clamp(hist.length / P.recurrenceRef)),
      f("severity", "Average severity", avgSeverity / 10),
      f("exposure", "Recurring exposure", clamp(recurringExposure / P.exposureRef)),
      f("criticalFacilities", "Critical facilities affected", clamp(facilityWeight / P.facilityRef)),
      f("lowEffectiveness", "Temporary fixes do not hold", hist.length ? 1 - avgEffectiveness : 0),
      f("condition", "Poor condition", 1 - a.condition),
      f("costEfficiency", "Upgrade affordability", 1 - clamp(a.upgradeCostProxyLakh / P.costRefLakh)),
      f("currentRisk", `Predicted risk at +${P.riskHorizon} min`, risk),
    ];
    const score = round1(100 * factors.reduce((s, t) => s + t.contribution, 0));
    const tier: 1 | 2 | 3 = score >= P.tier1At ? 1 : score >= P.tier2At ? 2 : 3;
    const yearsSpan = years.length ? Math.max(...years) - Math.min(...years) + 1 : 0;
    const facts = `${hist.length} failures in ${yearsSpan} ${yearsSpan === 1 ? "year" : "years"}, average severity ${avgSeverity.toFixed(1)}`;
    const recommendation =
      tier === 1 ? `Fix first: permanent upgrade of ${a.id} (cost proxy ₹${a.upgradeCostProxyLakh} lakh). ${facts}; temporary fixes hold only ${Math.round(avgEffectiveness * 100)}%.`
      : tier === 2 ? `Schedule ${a.id} for preventive works this season. ${facts}.`
      : `Monitor ${a.id}; routine maintenance is sufficient. ${facts}.`;
    return {
      assetId: a.id, rank: 0, score, tier,
      incidentCount: hist.length, yearsSpan,
      avgSeverity: round1(avgSeverity), recurringExposure,
      interventionCount: fixes.length,
      avgEffectiveness: Math.round(avgEffectiveness * 100) / 100,
      lastIncident: { year: last.year, month: last.month },
      factors, recommendation,
    };
  });
  rows.sort((a, b) => b.score - a.score || a.assetId.localeCompare(b.assetId));
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

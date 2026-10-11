// Seeded demo: the world plus three scripted scenarios. Steps only feed inputs (rain, reports, faults) and
// call the engine; every number they write to the stream is computed, never typed in.
import type { EvidenceEvent, LngLat, WorldState } from "@/lib/schemas/domain";
import type { EvidenceAnalysis } from "@/lib/schemas/evidence";
import type { DemoScenario, DemoStep } from "@/lib/schemas/simulation";
import { engine } from "@/lib/engine";
import { disk, haversineM } from "@/lib/geo";
import { CONFIG } from "@/lib/simulation/config";
import { clamp, cloneCell, fmt, withStream } from "@/lib/simulation/state";
import { initialWorld } from "./world";

export { DISTRICT, initialWorld } from "./world";

/** Advance the clock by the step's `advanceMin`, then apply it. `apply` itself never moves the clock. */
export const playStep = (state: WorldState, step: DemoStep): WorldState => step.apply({ ...state, tMin: state.tMin + step.advanceMin });

/** State after the first `count` steps of a scenario (all of them by default), from a fresh world. */
export function playScenario(id: DemoScenario["id"], count = Infinity): WorldState {
  const steps = scenarios.find((s) => s.id === id)?.steps ?? [];
  return steps.slice(0, count).reduce(playStep, initialWorld());
}

const offset = (p: LngLat, eastM: number, northM: number): LngLat => ({ lng: p.lng + eastM / 108500, lat: p.lat + northM / 110574 });
const asset = (s: WorldState, id: string) => s.assets.find((a) => a.id === id)!;
const people = (s: WorldState, h: 0 | 15 | 30 | 60) => engine.predict(s, h).totals;

/** A storm centred on `centre`: sets rainfall, then derives upstream pressure from rain on the uphill cells. */
function rain(state: WorldState, centre: LngLat, peak: number, sigmaKm: number): WorldState {
  const W = CONFIG.weather;
  const cells = { ...state.cells };
  for (const id in cells) {
    const c = (cells[id] = cloneCell(cells[id]));
    c.flood.rainfallPressure = Math.max(c.flood.rainfallPressure, peak * Math.exp(-((haversineM(c.center, centre) / 1000 / sigmaKm) ** 2)));
  }
  for (const id in cells) {
    const c = cells[id];
    const around = disk(id, W.upstreamRings).filter((n) => n !== id);
    const uphill = around.filter((n) => cells[n] && cells[n].elevation > c.elevation);
    const meanRain = uphill.reduce((s, n) => s + cells[n].flood.rainfallPressure, 0) / Math.max(1, uphill.length);
    c.flood.upstreamPressure = Math.max(c.flood.upstreamPressure, clamp((W.upstreamGain * uphill.length * meanRain) / around.length));
  }
  return { ...state, cells };
}

const report = (s: WorldState, e: Omit<EvidenceEvent, "tMin" | "provenance">): EvidenceEvent => ({ ...e, tMin: s.tMin, provenance: "SIMULATED" });
const announce = (s: WorldState, e: EvidenceEvent) =>
  withStream(s, { kind: "report", provenance: "SIMULATED", title: `${e.channel === "whatsapp" ? "WhatsApp" : e.channel.toUpperCase()} report ${e.id} from ${e.reporterId}`, detail: e.text });
const analysed = (s: WorldState, id: string, analysis: EvidenceAnalysis) => {
  const e = s.evidence.find((x) => x.id === id)!;
  const next = withStream(s, {
    kind: "analysis", provenance: "SIMULATED",
    title: `AI analysis of ${id} (fixture): ${analysis.incidentType.replace(/_/g, " ")}, severity ${analysis.severity}, confidence ${Math.round(analysis.confidence * 100)}%`,
    detail: analysis.summary,
  });
  return engine.fuse(next, { ...e, analysis });
};

// Fixture analyses: the shape a live observer returns, labelled `source: "fixture"` so the UI never shows a live badge.
const blockedDrain = (confidence: number, blockage: number, depth: [number, number], summary: string): EvidenceAnalysis => ({
  source: "fixture",
  validHazard: true,
  incidentType: "blocked_drain",
  severity: 8,
  confidence,
  observations: ["Storm drain inlet covered by solid waste", "Water backing up onto the carriageway", "Flow visible around, not through, the inlet"],
  likelyCauses: [
    { cause: "blocked_drain", probability: blockage, rationale: "Debris mat covers the inlet grating; water is ponding upstream of it." },
    { cause: "waterlogging", probability: Math.round((1 - blockage) * 100) / 100, rationale: "Low-lying road section holds runoff." },
  ],
  materialsObserved: ["plastic waste", "silt", "construction debris"],
  structuralDamageProbability: 0.12,
  blockageProbability: blockage,
  estimatedWaterDepthCm: { min: depth[0], max: depth[1] },
  spamProbability: 0.03,
  summary,
});
const dryLine = (confidence: number, summary: string): EvidenceAnalysis => ({
  source: "fixture",
  validHazard: true,
  incidentType: "dry_supply_line",
  severity: 7,
  confidence,
  observations: ["Open tap with no flow", "Empty storage drums queued at a public standpost"],
  likelyCauses: [
    { cause: "dry_supply_line", probability: 0.7, rationale: "No flow at several outlets on the same line." },
    { cause: "pipeline_leak", probability: 0.25, rationale: "Wet patch on the road shoulder upstream of the standpost." },
  ],
  materialsObserved: ["plastic drums", "standpost"],
  structuralDamageProbability: 0.2,
  blockageProbability: 0.05,
  spamProbability: 0.04,
  summary,
});
const spam: EvidenceAnalysis = {
  source: "fixture",
  validHazard: false,
  incidentType: "none",
  severity: 2,
  confidence: 0.22,
  observations: ["Image is a forwarded graphic with overlaid text", "No water, drain or street visible"],
  likelyCauses: [{ cause: "none", probability: 0.85, rationale: "Nothing in the image shows a water hazard." }],
  materialsObserved: [],
  structuralDamageProbability: 0.02,
  blockageProbability: 0.03,
  spamProbability: 0.81,
  summary: "Forwarded image with no visible hazard; likely a chain message.",
};

const E1 = "E-01", E2 = "E-02", E3 = "E-03";
const floodReports = (s: WorldState): EvidenceEvent[] => {
  const d = asset(s, "D104").location;
  return [
    report(s, { id: E2, channel: "whatsapp", reporterId: "resident-2208", reporterTrust: 0.5, locationAccuracyM: 35, location: offset(d, -90, 60), text: "Same drain overflowing, knee deep water outside the shops now." }),
    report(s, { id: E3, channel: "sms", reporterId: "ward-volunteer-17", reporterTrust: 0.55, locationAccuracyM: 25, location: offset(d, 110, -70), text: "Storm drain choked with debris at the valley road culvert. Two-wheelers stalling." }),
  ];
};

const floodCascade: DemoStep[] = [
  {
    id: "normal", label: "Normal city", advanceMin: 0,
    narration: "A normal day in the district: low flood and scarcity risk everywhere, with the valley floor only slightly elevated.",
    focus: { mode: "combined", horizon: 0 },
    apply: (s) => {
      const t = people(s, 0);
      return withStream(s, { kind: "system", title: "Normal operating day", detail: `Peak flood risk ${t.maxFloodRisk}, peak scarcity risk ${t.maxScarcityRisk}, ${fmt(t.exposedPopulation)} people exposed.` });
    },
  },
  {
    id: "rain-report", label: "Rain + first report", advanceMin: 20,
    narration: "Heavy rain begins over the valley, and a resident sends a WhatsApp report of a blocked drain near D104.",
    focus: { mode: "flood", horizon: 0, incidentId: "F-01", openPanel: "evidence" },
    apply: (s) => {
      const d = asset(s, "D104").location;
      const wet = withStream(rain(s, d, 0.6, 1.5), { kind: "system", provenance: "SIMULATED", title: "Heavy rain begins over the valley", detail: "Rainfall pressure rising around the Agara valley (simulated weather input)." });
      const e = report(wet, { id: E1, channel: "whatsapp", reporterId: "resident-4471", reporterTrust: 0.6, locationAccuracyM: 20, location: offset(d, 60, 40), text: "Drain near the valley junction is completely blocked with garbage. Water is coming onto the road." });
      return engine.fuse(announce(wet, e), e);
    },
  },
  {
    id: "analysis", label: "AI evidence analysis", advanceMin: 1,
    narration: "The photo is analysed: a blocked storm drain, severity 8, with the debris and water depth it can see. This is one input to the score, not a decision.",
    focus: { mode: "flood", horizon: 0, incidentId: "F-01", openPanel: "evidence" },
    apply: (s) => analysed(s, E1, blockedDrain(0.86, 0.88, [15, 30], "Storm drain inlet blocked by plastic waste and silt; water 15–30 cm deep is backing onto the road.")),
  },
  {
    id: "more-reports", label: "Two more reports", advanceMin: 4,
    narration: "Two more reports arrive from different people, by WhatsApp and SMS, within a few hundred metres.",
    focus: { mode: "flood", horizon: 0, incidentId: "F-01", openPanel: "evidence" },
    apply: (s) => floodReports(s).reduce((acc, e) => announce({ ...acc, evidence: [...acc.evidence, e] }, e), s),
  },
  {
    id: "fusion", label: "Fusion", advanceMin: 1,
    narration: "The three reports are fused into one incident, F-01, instead of three separate alarms.",
    focus: { mode: "flood", horizon: 0, incidentId: "F-01", openPanel: "evidence" },
    apply: (s) => [E2, E3].reduce((acc, id) => engine.fuse(acc, acc.evidence.find((e) => e.id === id)!), s),
  },
  {
    id: "escalate", label: "Score escalates", advanceMin: 2,
    narration: "With independent confirmations, matching rain and D104's failure history, confidence crosses the escalate threshold and the incident is verified.",
    focus: { mode: "flood", horizon: 0, incidentId: "F-01", openPanel: "evidence" },
    apply: (s) => {
      const a = analysed(s, E2, blockedDrain(0.81, 0.8, [25, 45], "Drain overflow with standing water 25–45 cm deep along a shop frontage."));
      return analysed(a, E3, blockedDrain(0.84, 0.85, [20, 40], "Culvert mouth choked with debris; water 20–40 cm deep across the road."));
    },
  },
  {
    id: "cells-red", label: "Cells turn red", advanceMin: 5,
    narration: "Rain intensifies. With the drain confirmed blocked, the cells D104 serves turn orange and red.",
    focus: { mode: "flood", horizon: 0, incidentId: "F-01" },
    apply: (s) => {
      const wet = rain(s, asset(s, "D104").location, 0.9, 1.5);
      const t = people(wet, 0);
      return withStream(wet, { kind: "prediction", incidentId: "F-01", title: `Now: peak flood risk ${t.maxFloodRisk}, ${fmt(t.exposedPopulation)} people exposed`, detail: "Rain intensifying over a blocked trunk drain (rain is a simulated input)." });
    },
  },
  {
    id: "forecast", label: "+30 reaches hospital", advanceMin: 1,
    narration: "Thirty minutes ahead, the water moves down the valley and reaches Agara General Hospital.",
    focus: { mode: "flood", horizon: 30, incidentId: "F-01" },
    apply: (s) => {
      const t = people(s, 30);
      const names = t.facilitiesAtRisk.map((id) => s.facilities.find((f) => f.id === id)!.name);
      return withStream(s, { kind: "prediction", incidentId: "F-01", title: `+30 min: ${fmt(t.exposedPopulation)} people exposed, peak risk ${t.maxFloodRisk}`, detail: names.length ? `At risk: ${names.join(", ")}.` : "No facility crosses the risk threshold." });
    },
  },
  {
    id: "auction", label: "Best response", advanceMin: 1,
    narration: "The engine simulates every feasible action and pair with the crews and pumps that are free, and recommends the best one.",
    focus: { mode: "flood", horizon: 30, incidentId: "F-01", openPanel: "simulate" },
    apply: (s) => {
      const a = engine.runAuction(s, "F-01", 30);
      const win = a.options[0];
      return win ? withStream(s, { kind: "recommendation", incidentId: "F-01", title: `Recommended: ${win.bundle.label} (score ${win.score}, ${a.evaluated} options simulated)`, detail: a.winnerReasons.join(". ") + "." }) : s;
    },
  },
  {
    id: "act", label: "Apply winning bundle", advanceMin: 2,
    narration: "The operator approves. The crew clears the drain and the pump is deployed.",
    focus: { mode: "flood", horizon: 30, incidentId: "F-01", openPanel: "simulate" },
    apply: (s) => {
      const win = engine.runAuction(s, "F-01", 30).options[0];
      return win ? engine.commitBundle(s, "F-01", win.bundle) : s;
    },
  },
  {
    id: "contract", label: "Risk contracts", advanceMin: 10,
    narration: "The same forecast, rerun with the action in place: the red contracts and the hospital drops below the threshold.",
    focus: { mode: "flood", horizon: 30, incidentId: "F-01" },
    apply: (s) => {
      const t = people(s, 30);
      const before = s.interventionRecords[s.interventionRecords.length - 1]?.before;
      return withStream(s, { kind: "prediction", incidentId: "F-01", title: `+30 min after action: ${fmt(t.exposedPopulation)} people exposed${before ? ` (was ${fmt(before.exposure)})` : ""}`, detail: t.facilitiesAtRisk.length ? `Still at risk: ${t.facilitiesAtRisk.join(", ")}.` : "No facility remains above the risk threshold." });
    },
  },
  {
    id: "alert", label: "Local alert", advanceMin: 1,
    narration: "A local alert goes to the people near the drain. In this build the transport is a labelled simulation.",
    focus: { mode: "flood", horizon: 30, incidentId: "F-01" },
    apply: (s) => {
      const sent = { ...s, alerts: s.alerts.map((a) => (a.status === "queued" ? { ...a, status: "sent" as const } : a)) };
      const a = sent.alerts[sent.alerts.length - 1];
      return a ? withStream(sent, { kind: "alert", incidentId: a.incidentId, provenance: "SIMULATED", title: `Alert ${a.id} sent (demo transport, simulated)`, detail: `${a.audience}: ${a.body}` }) : sent;
    },
  },
  {
    id: "prove", label: "Effectiveness recorded", advanceMin: 20,
    narration: "The engine records what was expected against what was observed. The proof stays with the incident.",
    focus: { mode: "flood", horizon: 0, incidentId: "F-01" },
    apply: (s) => {
      const r = s.interventionRecords[s.interventionRecords.length - 1];
      return r ? withStream(s, { kind: "learning", incidentId: r.incidentId, provenance: "SIMULATED", title: `${r.id}: ${r.bundle.label} was ${Math.round(r.effectiveness * 100)}% effective`, detail: `Exposure ${fmt(r.before.exposure)} → expected ${fmt(r.expected.exposure)}, observed ${fmt(r.observed.exposure)}. Peak risk ${r.before.risk} → ${r.observed.risk}. Observed values are simulated.` }) : s;
    },
  },
  {
    id: "prevent", label: "D104 priority rises", advanceMin: 1,
    narration: "The failure is added to D104's memory. It was already the top fix-first candidate, and its upgrade priority rises again.",
    focus: { mode: "fix-first", horizon: 0 },
    apply: (s) => {
      const was = engine.infraPriorities(initialWorld()).find((p) => p.assetId === "D104")!;
      const now = engine.infraPriorities(s).find((p) => p.assetId === "D104")!;
      return withStream(s, { kind: "learning", title: `D104 fix-first score ${was.score} → ${now.score} (rank #${now.rank}, tier ${now.tier})`, detail: `${now.incidentCount} failures in ${now.yearsSpan} years, average severity ${now.avgSeverity}. ${now.recommendation}` });
    },
  },
];

const scarcity: DemoStep[] = [
  {
    id: "normal", label: "Normal supply", advanceMin: 0,
    narration: "A hot, dry day. Supply is holding and no cell is short of water.",
    focus: { mode: "scarcity", horizon: 0 },
    apply: (s) => {
      const t = people(s, 0);
      return withStream(s, { kind: "system", title: "Supply normal", detail: `Peak scarcity risk ${t.maxScarcityRisk}, deficit ${fmt(t.deficitLiters)} L/day.` });
    },
  },
  {
    id: "fault", label: "P031 fault + heat", advanceMin: 30,
    narration: "Trunk main P031 fails during a heat spell: supply drops across the cells it serves while demand climbs.",
    focus: { mode: "scarcity", horizon: 0 },
    apply: (s) => {
      const served = new Set(asset(s, "P031").cellIds);
      const cells = { ...s.cells };
      for (const id in cells) {
        const c = (cells[id] = cloneCell(cells[id]));
        c.scarcity.heatStress = Math.max(c.scarcity.heatStress, 0.75);
        c.scarcity.demandPressure = clamp(c.scarcity.demandPressure + 0.12);
        if (served.has(id)) {
          c.scarcity.supplyAvailability = 0.3;
          c.scarcity.pipelineFailure = 0.85;
        }
      }
      return withStream({ ...s, cells }, { kind: "system", provenance: "SIMULATED", title: "Pressure loss on trunk main P031 during heat spell", detail: `${served.size} cells lose most of their supply (simulated telemetry and weather inputs).` });
    },
  },
  {
    id: "incident", label: "Shortage incident S-01", advanceMin: 15,
    narration: "Residents report dry taps. Two independent reports fuse into shortage incident S-01, tied to P031.",
    focus: { mode: "scarcity", horizon: 0, incidentId: "S-01", openPanel: "evidence" },
    apply: (s) => {
      const p = asset(s, "P031").location;
      const events = [
        report(s, { id: "E-11", channel: "whatsapp", reporterId: "resident-3120", reporterTrust: 0.65, locationAccuracyM: 30, location: offset(p, 80, -50), text: "No water in the taps since morning, whole street is dry.", analysis: dryLine(0.8, "Open tap with no flow and empty drums queued at the standpost.") }),
        report(s, { id: "E-12", channel: "sms", reporterId: "ward-volunteer-09", reporterTrust: 0.8, locationAccuracyM: 25, location: offset(p, -120, 90), text: "Supply line dry at the public standpost, families waiting with drums.", analysis: dryLine(0.83, "Dry standpost with residents queuing; wet patch suggests a leak upstream.") }),
      ];
      return events.reduce((acc, e) => engine.fuse(announce(acc, e), e), s);
    },
  },
  {
    id: "deficit", label: "Deficit predicted", advanceMin: 5,
    narration: "As local storage drains, the predicted deficit grows over the next hour.",
    focus: { mode: "scarcity", horizon: 60, incidentId: "S-01" },
    apply: (s) => {
      const now = people(s, 0);
      const later = people(s, 60);
      return withStream(s, { kind: "prediction", incidentId: "S-01", title: `+60 min: deficit ${fmt(later.deficitLiters)} L/day, ${fmt(later.populationShort)} people short`, detail: `Now: ${fmt(now.deficitLiters)} L/day, ${fmt(now.populationShort)} people short. Storage is draining.` });
    },
  },
  {
    id: "hospital", label: "Hospital prioritised", advanceMin: 2,
    narration: "A hospital is inside the shortage. The engine puts it first and recommends the response.",
    focus: { mode: "scarcity", horizon: 60, incidentId: "S-01", openPanel: "simulate" },
    apply: (s) => {
      const short = people(s, 60).facilitiesShort.map((id) => s.facilities.find((f) => f.id === id)!);
      const a = engine.runAuction(s, "S-01", 60);
      const win = a.options[0];
      const listed = withStream(s, { kind: "prediction", incidentId: "S-01", title: `${short.length} facilities short of water at +60 min`, detail: short.map((f) => f.name).join(", ") || "None." });
      return win ? withStream(listed, { kind: "recommendation", incidentId: "S-01", title: `Recommended: ${win.bundle.label} (score ${win.score}, ${a.evaluated} options simulated)`, detail: a.winnerReasons.join(". ") + "." }) : listed;
    },
  },
  {
    id: "tankers", label: "Tankers allocated", advanceMin: 3,
    narration: "Tankers are allocated by equity-weighted need: the hospital first, then the most vulnerable short cells.",
    focus: { mode: "scarcity", horizon: 60, incidentId: "S-01", openPanel: "tankers" },
    // The plan is proposed, not dispatched, so the tanker panel can keep showing it from allocateTankers(state).
    apply: (s) =>
      engine.allocateTankers(s).reduce((acc, t) => withStream(acc, { kind: "recommendation", incidentId: "S-01", title: `${t.resourceId} → ${t.targetLabel}: ${fmt(t.liters)} L (equity ${t.equityScore})`, detail: t.reason }), s),
  },
];

const falseReport: DemoStep[] = [
  {
    id: "normal", label: "Normal city", advanceMin: 0,
    narration: "A normal day, no rain, nothing unusual in the district.",
    focus: { mode: "combined", horizon: 0 },
    apply: (s) => withStream(s, { kind: "system", title: "Normal operating day", detail: `Peak flood risk ${people(s, 0).maxFloodRisk}.` }),
  },
  {
    id: "report", label: "Suspicious report", advanceMin: 10,
    narration: "A single alarming message arrives from an unknown sender, on dry high ground with no drain nearby.",
    focus: { mode: "flood", horizon: 0, incidentId: "F-01", openPanel: "evidence" },
    apply: (s) => {
      // Highest cell with no drain or pipe asset: as far from rain and infrastructure as the district gets.
      const spot = Object.values(s.cells).filter((c) => !c.drainAssetId && !c.pipeAssetId).sort((a, b) => b.elevation - a.elevation || a.id.localeCompare(b.id))[0];
      const e = report(s, { id: "E-21", channel: "whatsapp", reporterId: "unknown-9003", reporterTrust: 0.15, location: spot.center, text: "URGENT!!! Whole area flooded, 10 feet water, forward to all groups!!!", analysis: spam });
      return engine.fuse(announce(s, e), e);
    },
  },
  {
    id: "held", label: "Held, twin unchanged", advanceMin: 1,
    narration: "No confirmation, no rain, no asset, and the image shows no hazard. The score stays below the hold threshold, so the incident stays unverified and the twin barely moves.",
    focus: { mode: "flood", horizon: 0, incidentId: "F-01", openPanel: "evidence" },
    apply: (s) => {
      const i = s.incidents[s.incidents.length - 1];
      const calm = people(initialWorld(), 30);
      const now = people(s, 30);
      return withStream(s, { kind: "system", incidentId: i?.id, title: `${i?.id} held at confidence ${i?.evidenceScore?.total} (${i?.status})`, detail: `+30 peak flood risk ${calm.maxFloodRisk} → ${now.maxFloodRisk}; people exposed ${fmt(calm.exposedPopulation)} → ${fmt(now.exposedPopulation)}. No action recommended.` });
    },
  },
];

export const scenarios: DemoScenario[] = [
  { id: "flood-cascade", name: "Flood cascade: blocked drain D104", steps: floodCascade },
  { id: "scarcity", name: "Scarcity: trunk main P031 fault", steps: scarcity },
  { id: "false-report", name: "False report: held, not escalated", steps: falseReport },
];

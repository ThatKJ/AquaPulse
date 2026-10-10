import { describe, expect, it } from "vitest";
import type { EvidenceEvent, WorldState } from "@/lib/schemas/domain";
import { EvidenceAnalysisSchema, type EvidenceAnalysis } from "@/lib/schemas/evidence";
import type { ActionBundle, Intervention } from "@/lib/schemas/simulation";
import { initialWorld, playScenario } from "@/lib/demo";
import { CONFIG, engine } from "@/lib/engine";
import { disk, haversineM } from "@/lib/geo";

const bundle = (...interventions: Intervention[]): ActionBundle => ({ id: "t", label: "t", interventions });
const iv = (kind: Intervention["kind"], targetId: string, ...resourceIds: string[]): Intervention => ({ kind, targetId, resourceIds, label: kind });
/** Copy of the world with one cell's factors patched. */
function patch(s: WorldState, id: string, flood: object = {}, scarcity: object = {}): WorldState {
  const c = s.cells[id];
  return { ...s, cells: { ...s.cells, [id]: { ...c, flood: { ...c.flood, ...flood }, scarcity: { ...c.scarcity, ...scarcity } } } };
}
const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

const analysis: EvidenceAnalysis = {
  source: "fixture", validHazard: true, incidentType: "blocked_drain", severity: 7, confidence: 0.8, observations: ["inlet covered"],
  likelyCauses: [{ cause: "blocked_drain", probability: 0.8, rationale: "debris" }], materialsObserved: ["plastic"],
  structuralDamageProbability: 0.1, blockageProbability: 0.8, spamProbability: 0.05, summary: "Blocked inlet.",
};

describe("evidence schema", () => {
  it("accepts a valid analysis and rejects invalid ones", () => {
    expect(EvidenceAnalysisSchema.safeParse(analysis).success).toBe(true);
    expect(EvidenceAnalysisSchema.safeParse({ ...analysis, confidence: 1.4 }).success).toBe(false);
    expect(EvidenceAnalysisSchema.safeParse({ ...analysis, incidentType: "meteor" }).success).toBe(false);
    expect(EvidenceAnalysisSchema.safeParse({ ...analysis, severity: 0 }).success).toBe(false);
    expect(EvidenceAnalysisSchema.safeParse({ ...analysis, source: undefined }).success).toBe(false);
  });
});

describe("geo", () => {
  it("haversine matches a known distance", () => {
    expect(haversineM({ lng: 0, lat: 0 }, { lng: 0, lat: 1 })).toBeCloseTo(111195, -1);
    expect(haversineM({ lng: 77.64, lat: 12.925 }, { lng: 77.64, lat: 12.925 })).toBe(0);
  });
});

describe("evidence fusion and score", () => {
  const w = initialWorld();
  const d104 = w.assets.find((a) => a.id === "D104")!.location;
  const ev = (id: string, reporterId: string, dLat = 0, extra: Partial<EvidenceEvent> = {}): EvidenceEvent => ({
    id, tMin: 5, channel: "demo", reporterId, reporterTrust: 0.6, text: "drain blocked, water on road", locationAccuracyM: 20,
    location: { lng: d104.lng, lat: d104.lat + dLat }, provenance: "SIMULATED", ...extra,
  });

  it("weights sum to 1 and total equals the weighted sum", () => {
    expect(sum(CONFIG.evidence.weights)).toBeCloseTo(1);
    const score = engine.fuse(w, ev("a", "r1", 0, { analysis: { ...analysis } })).incidents[0].evidenceScore!;
    expect(score.components).toHaveLength(8);
    expect(score.total).toBeCloseTo(score.components.reduce((t, c) => t + c.weight * c.value, 0), 1);
  });

  it("fuses near reports of the same category and raises the score with confirmations", () => {
    const one = engine.fuse(w, ev("a", "r1"));
    const two = engine.fuse(one, ev("b", "r2", 0.001)); // ~111 m away
    expect(two.incidents).toHaveLength(1);
    expect(two.incidents[0]).toMatchObject({ id: "F-01", evidenceIds: ["a", "b"], suspectedAssetId: "D104" });
    expect(two.incidents[0].evidenceScore!.total).toBeGreaterThan(one.incidents[0].evidenceScore!.total);
    expect(two.relationships).toContainEqual({ from: "b", to: "a", relation: "CONFIRMS" });
    expect(two.relationships).toContainEqual({ from: "b", to: "F-01", relation: "EVIDENCE_OF" });
    expect(w.incidents).toHaveLength(0); // input untouched
  });

  it("opens a new incident when far away or a different category", () => {
    const one = engine.fuse(w, ev("a", "r1"));
    expect(engine.fuse(one, ev("b", "r2", 0.02)).incidents.map((i) => i.id)).toEqual(["F-01", "F-02"]);
    expect(engine.fuse(one, ev("c", "r3", 0.0005, { text: "no water in taps since morning" })).incidents.map((i) => i.id)).toEqual(["F-01", "S-01"]);
    expect(engine.fuse(one, ev("d", "r4", 0.0005, { tMin: 5 + CONFIG.evidence.fuseWindowMin + 1 })).incidents).toHaveLength(2);
  });

  it("a contradicting analysis is linked as CONTRADICTS and lowers the score", () => {
    const one = engine.fuse(w, ev("a", "r1", 0, { analysis: { ...analysis } }));
    const two = engine.fuse(one, ev("b", "r2", 0.0005, { analysis: { ...analysis, validHazard: false, incidentType: "none", spamProbability: 0.7 } }));
    expect(two.relationships).toContainEqual({ from: "b", to: "F-01", relation: "CONTRADICTS" });
    expect(two.incidents[0].evidenceScore!.total).toBeLessThan(one.incidents[0].evidenceScore!.total);
  });
});

describe("flood risk", () => {
  const w = initialWorld();
  const ids = Object.keys(w.cells);

  it("base risk is the configured weighted sum", () => {
    expect(sum(CONFIG.flood.weights)).toBeCloseTo(1);
    const p = engine.predict(w, 0);
    for (const id of ids.slice(0, 40)) {
      const f = w.cells[id].flood as Record<string, number>;
      const expected = 100 * Object.entries(CONFIG.flood.weights).reduce((t, [k, wt]) => t + wt * f[k], 0);
      expect(p.cells[id].floodRisk).toBeCloseTo(expected, 0);
    }
    expect(p.totals.maxFloodRisk).toBeLessThan(35); // calm day
    expect(p.totals.exposedPopulation).toBe(0);
  });

  it("more rain means more risk, and confidence falls with horizon", () => {
    const id = ids[100];
    const wet = patch(w, id, { rainfallPressure: 0.9 });
    expect(engine.predict(wet, 30).cells[id].floodRisk).toBeGreaterThan(engine.predict(w, 30).cells[id].floodRisk + 10);
    const conf = ([0, 15, 30, 60] as const).map((h) => engine.predict(w, h).totals.meanConfidence);
    expect(conf[0]).toBeGreaterThan(conf[1]);
    expect(conf[1]).toBeGreaterThan(conf[2]);
    expect(conf[2]).toBeGreaterThan(conf[3]);
  });

  it("water moves downhill", () => {
    // A mid-slope cell with both higher and lower neighbours.
    const id = ids.find((c) => {
      const n = disk(c).filter((x) => x !== c && w.cells[x]);
      return n.length === 6 && n.some((x) => w.cells[x].elevation > w.cells[c].elevation + 0.02) && n.some((x) => w.cells[x].elevation < w.cells[c].elevation - 0.02);
    })!;
    const flooded = patch(w, id, { rainfallPressure: 1, upstreamPressure: 1, drainageFailure: 1 });
    const before = engine.predict(w, 30).cells;
    const after = engine.predict(flooded, 30).cells;
    const rise = (x: string) => after[x].floodRisk - before[x].floodRisk;
    const neighbours = disk(id).filter((x) => x !== id);
    const lower = neighbours.filter((x) => w.cells[x].elevation < w.cells[id].elevation);
    const higher = neighbours.filter((x) => w.cells[x].elevation > w.cells[id].elevation);
    expect(Math.min(...lower.map(rise))).toBeGreaterThan(0);
    expect(Math.max(...higher.map(rise))).toBe(0);
    expect(engine.predict(flooded, 60).cells[lower[0]].floodRisk).toBeGreaterThan(engine.predict(flooded, 15).cells[lower[0]].floodRisk);
  });
});

describe("scarcity risk", () => {
  const w = initialWorld();
  const id = Object.keys(w.cells)[50];

  it("is calm on a normal day and rises when supply fails", () => {
    expect(sum(CONFIG.scarcity.weights)).toBeCloseTo(1);
    const calm = engine.predict(w, 60);
    expect(calm.totals.deficitLiters).toBe(0);
    expect(calm.totals.facilitiesShort).toEqual([]);
    const dry = patch(w, id, {}, { supplyAvailability: 0.2, pipelineFailure: 0.9 });
    const now = engine.predict(dry, 0).cells[id];
    const later = engine.predict(dry, 60).cells[id];
    expect(now.scarcityRisk).toBeGreaterThan(calm.cells[id].scarcityRisk + 20);
    expect(now.deficitLiters).toBeGreaterThan(0);
    expect(later.deficitLiters).toBeGreaterThan(now.deficitLiters); // storage drains
    expect(later.populationShort).toBeGreaterThan(now.populationShort);
  });
});

describe("interventions", () => {
  const flood = playScenario("flood-cascade", 9);
  const dry = playScenario("scarcity", 3);
  const cell = flood.incidents[0].cellId;

  it("never mutates the input state", () => {
    const snapshot = JSON.stringify(flood);
    const b = bundle(iv("CLEAR_DRAIN", "D104", "C01"), iv("DEPLOY_PUMP", cell, "P02"));
    engine.applyBundle(flood, b);
    engine.simulateBundle(flood, b, 30);
    engine.runAuction(flood, "F-01");
    engine.commitBundle(flood, "F-01", b);
    engine.fuse(flood, { ...flood.evidence[0], id: "new" });
    expect(JSON.stringify(flood)).toBe(snapshot);
  });

  it("each kind moves the right factor", () => {
    const d104 = flood.assets.find((a) => a.id === "D104")!;
    const cleared = engine.applyBundle(flood, bundle(iv("CLEAR_DRAIN", "D104", "C01")));
    for (const id of d104.cellIds) expect(cleared.cells[id].flood.drainageFailure).toBeLessThan(flood.cells[id].flood.drainageFailure);

    const p031 = dry.assets.find((a) => a.id === "P031")!;
    const repaired = engine.applyBundle(dry, bundle(iv("REPAIR_PIPE", "P031", "C02")));
    for (const id of p031.cellIds) {
      expect(repaired.cells[id].scarcity.supplyAvailability).toBeGreaterThan(dry.cells[id].scarcity.supplyAvailability);
      expect(repaired.cells[id].scarcity.pipelineFailure).toBeLessThan(dry.cells[id].scarcity.pipelineFailure);
    }

    const base = engine.predict(flood, 30);
    const pumped = engine.predict(engine.applyBundle(flood, bundle(iv("DEPLOY_PUMP", cell, "P02"))), 30);
    expect(pumped.cells[cell].floodRisk).toBeLessThan(base.cells[cell].floodRisk);
    const small = engine.predict(engine.applyBundle(flood, bundle(iv("DEPLOY_PUMP", cell, "P01"))), 30);
    expect(pumped.cells[cell].floodRisk).toBeLessThan(small.cells[cell].floodRisk); // scaled by capacity

    const road = engine.simulateBundle(flood, bundle(iv("CLOSE_ROAD", cell)), 30);
    expect(road.exposure).toBeLessThan(road.baselineExposure);
    const alert = engine.simulateBundle(flood, bundle(iv("ISSUE_ALERT", cell)), 30);
    expect(alert.exposure).toBeLessThan(alert.baselineExposure);
    expect(alert.riskChange).toBe(0); // behaviour, not water

    const dryCell = dry.incidents[0].cellId;
    const dryBase = engine.predict(dry, 30).cells[dryCell];
    const tanked = engine.predict(engine.applyBundle(dry, bundle(iv("SEND_TANKER", dryCell, "T02"))), 30).cells[dryCell];
    expect(dryBase.deficitLiters - tanked.deficitLiters).toBe(12000);

    const alone = engine.simulateBundle(flood, bundle(iv("DEPLOY_PUMP", cell, "P02")), 30);
    const withCrew = engine.simulateBundle(flood, bundle(iv("DEPLOY_PUMP", cell, "P02"), iv("DISPATCH_CREW", cell, "C01")), 30);
    expect(withCrew.responseTimeMin).toBeLessThan(alone.responseTimeMin);
    expect(alone.costProxyLakh).toBeGreaterThan(0);
  });

  it("commit records proof, memory, an alert and stream entries", () => {
    const b = bundle(iv("CLEAR_DRAIN", "D104", "C01"));
    const next = engine.commitBundle(flood, "F-01", b);
    const r = next.interventionRecords[0];
    expect(r.provenance).toBe("SIMULATED");
    expect(r.before.exposure).toBeGreaterThan(r.expected.exposure);
    expect(Math.abs(r.observed.exposure - r.expected.exposure)).toBeLessThanOrEqual(r.expected.exposure * 0.05 + 1);
    expect(next.history).toHaveLength(flood.history.length + 1);
    expect(next.history[next.history.length - 1]).toMatchObject({ assetId: "D104", interventionKind: "CLEAR_DRAIN" });
    expect(next.alerts).toHaveLength(1);
    expect(next.resources.find((x) => x.id === "C01")!.available).toBe(false);
    expect(next.stream.length).toBeGreaterThan(flood.stream.length);
  });
});

describe("memory and allocation", () => {
  it("ranks D104 first and P031 second from seeded history", () => {
    const w = initialWorld();
    const d104 = w.history.filter((h) => h.assetId === "D104");
    expect(d104).toHaveLength(8);
    expect(new Set(d104.map((h) => h.year)).size).toBe(3);
    expect(d104.reduce((t, h) => t + h.severity, 0) / 8).toBeCloseTo(8.4, 1);
    const pr = engine.infraPriorities(w);
    expect(pr.slice(0, 2).map((p) => p.assetId)).toEqual(["D104", "P031"]);
    expect(pr[0].tier).toBe(1);
    expect(pr[1].score).toBeGreaterThan(pr[2].score + 10);
    expect(pr[0].score).toBeCloseTo(100 * pr[0].factors.reduce((t, f) => t + f.contribution, 0), 1);
  });

  it("allocates nothing on a calm day and the hospital first in a shortage", () => {
    expect(engine.allocateTankers(initialWorld())).toEqual([]);
    const plan = engine.allocateTankers(playScenario("scarcity", 3));
    expect(plan).toHaveLength(3);
    expect(plan[0].targetId).toBe("HOSP-2");
    expect(new Set(plan.map((p) => p.resourceId)).size).toBe(3);
    for (const p of plan) expect(p.reason.length).toBeGreaterThan(10);
  });
});

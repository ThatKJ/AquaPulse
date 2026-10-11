import { describe, expect, it } from "vitest";
import { initialWorld, playScenario, playStep, scenarios } from "@/lib/demo";
import { CONFIG, engine } from "@/lib/engine";
import type { Intervention } from "@/lib/schemas/simulation";

describe("demo determinism", () => {
  it("initialWorld is reproducible and well-formed", () => {
    const w = initialWorld();
    expect(initialWorld()).toEqual(w);
    const cells = Object.values(w.cells);
    expect(cells.length).toBeGreaterThanOrEqual(300);
    expect(cells.length).toBeLessThanOrEqual(500);
    const population = cells.reduce((t, c) => t + c.population, 0);
    expect(population).toBeGreaterThan(300_000);
    expect(population).toBeLessThan(500_000);
    expect(cells.every((c) => c.provenance === "SIMULATED")).toBe(true);
    expect(w.assets.map((a) => a.id)).toEqual(expect.arrayContaining(["D104", "P031"]));
    expect(w.resources.map((r) => r.id).sort()).toEqual(["C01", "C02", "C03", "P01", "P02", "T01", "T02", "T03"]);
  });

  it("every scenario replays to identical JSON", () => {
    for (const s of scenarios) expect(JSON.stringify(playScenario(s.id))).toBe(JSON.stringify(playScenario(s.id)));
  });

  it("every step adds stream entries", () => {
    for (const sc of scenarios) {
      let s = initialWorld();
      for (const step of sc.steps) {
        const next = playStep(s, step);
        expect(next.stream.length, `${sc.id}/${step.id}`).toBeGreaterThan(s.stream.length);
        s = next;
      }
    }
  });
});

describe("flood-cascade end to end", () => {
  const steps = scenarios.find((s) => s.id === "flood-cascade")!.steps;
  const at = (n: number) => playScenario("flood-cascade", n);
  const before = at(9); // just before the action step
  const cell = before.incidents[0].cellId;
  const drain: Intervention = { kind: "CLEAR_DRAIN", targetId: "D104", resourceIds: ["C01"], label: "Clear Drain D104" };
  const pump: Intervention = { kind: "DEPLOY_PUMP", targetId: cell, resourceIds: ["P02"], label: "Deploy Pump P02" };
  const sim = (...interventions: Intervention[]) => engine.simulateBundle(before, { id: "t", label: "t", interventions }, 30);

  it("has the 14 steps and the evidence score climbs to escalate", () => {
    expect(steps).toHaveLength(14);
    const score = (n: number) => at(n).incidents[0].evidenceScore!;
    expect(score(2).verdict).toBe("verify");
    expect(score(3).total).toBeGreaterThan(score(2).total);
    expect(at(5).incidents).toHaveLength(1);
    expect(at(5).incidents[0].evidenceIds).toHaveLength(3);
    expect(score(5).total).toBeLessThan(CONFIG.evidence.escalateAt);
    expect(score(6).total).toBeGreaterThanOrEqual(CONFIG.evidence.escalateAt);
    expect(at(6).incidents[0]).toMatchObject({ id: "F-01", status: "verified", type: "blocked_drain", suspectedAssetId: "D104" });
    expect(at(3).evidence[0].analysis?.source).toBe("fixture");
  });

  it("hits the flagship tuning targets at +30", () => {
    const baseline = engine.predict(before, 30).totals;
    expect(baseline.exposedPopulation).toBeGreaterThanOrEqual(3500);
    expect(baseline.exposedPopulation).toBeLessThanOrEqual(4500);
    expect(baseline.facilitiesAtRisk).toContain("HOSP-1");
    expect(engine.predict(before, 0).totals.facilitiesAtRisk).not.toContain("HOSP-1"); // it arrives, it is not there yet

    const d = sim(drain), p = sim(pump), both = sim(drain, pump);
    expect(d.exposureChangePct).toBeLessThanOrEqual(-45);
    expect(p.exposureChangePct).toBeLessThanOrEqual(-25);
    expect(p.exposureChangePct).toBeGreaterThanOrEqual(-45);
    expect(both.exposureChangePct).toBeLessThanOrEqual(-80);
    expect(both.exposure).toBeLessThan(Math.min(d.exposure, p.exposure));
    expect(both.facilitiesProtected).toContain("HOSP-1");
  });

  // The numbers the demo, the docs and the judges' script quote. A tuning change must change them here on purpose.
  it("pins the quoted flood numbers: 3,822 baseline, P02 2,568, D104 1,067, both 190", () => {
    expect(engine.predict(before, 30).totals.exposedPopulation).toBe(3822);
    expect(sim(pump).exposure).toBe(2568);
    expect(sim(drain).exposure).toBe(1067);
    expect(sim(drain, pump).exposure).toBe(190);
    const win = engine.runAuction(before, "F-01", 30).options[0];
    expect(win.bundle.label).toBe("Clear Drain D104 + Deploy Pump P02");
    expect(win.outcome.exposure).toBe(190);
    expect(engine.predict(at(14), 30).totals.exposedPopulation).toBe(190);
  });

  it("the auction picks the pair over every single action", () => {
    const a = engine.runAuction(before, "F-01", 30);
    expect(a.evaluated).toBeGreaterThan(5);
    expect(a.evaluated).toBeLessThanOrEqual(CONFIG.auction.maxCandidates);
    expect(a.options.map((o) => o.rank)).toEqual([1, 2, 3]);
    expect(a.options[0].score).toBeGreaterThanOrEqual(a.options[1].score);
    expect(a.options[1].score).toBeGreaterThanOrEqual(a.options[2].score);
    const win = a.options[0];
    expect(win.bundle.label).toBe("Clear Drain D104 + Deploy Pump P02");
    expect(win.score).toBeCloseTo(100 * win.breakdown.reduce((t, c) => t + c.contribution, 0), 1);
    expect(win.outcome.facilitiesProtected).toContain("HOSP-1");
    expect(a.winnerReasons.length).toBeGreaterThan(1);
    expect(a.winnerReasons.join(" ")).toContain("Agara General Hospital");
    expect(engine.counterfactual(before, "F-01", 30).avoidableExposure).toBe(a.baselineExposure - win.outcome.exposure);
  });

  it("acting contracts the risk, alerts, records proof and raises D104's priority", () => {
    const end = at(14);
    const after = engine.predict(end, 30).totals;
    expect(after.exposedPopulation).toBeLessThan(0.2 * engine.predict(before, 30).totals.exposedPopulation);
    expect(after.facilitiesAtRisk).not.toContain("HOSP-1");
    expect(end.alerts[0]).toMatchObject({ incidentId: "F-01", transport: "demo", status: "sent" });
    expect(end.interventionRecords[0].effectiveness).toBeGreaterThan(0.8);
    const score = (s = initialWorld()) => engine.infraPriorities(s).find((p) => p.assetId === "D104")!;
    expect(score(end).rank).toBe(1);
    expect(score(end).score).toBeGreaterThan(score().score);
    expect(steps[8].focus?.openPanel).toBe("simulate");
  });

  it("predicts all four horizons well under 20 ms", () => {
    const t = performance.now();
    for (let i = 0; i < 20; i++) for (const h of [0, 15, 30, 60] as const) engine.predict(before, h);
    expect((performance.now() - t) / 20).toBeLessThan(20);
  });
});

describe("scarcity end to end", () => {
  const end = playScenario("scarcity");
  it("opens S-01 on P031, predicts a growing deficit and puts the hospital first", () => {
    expect(end.incidents[0]).toMatchObject({ id: "S-01", kind: "scarcity", suspectedAssetId: "P031", status: "verified" });
    const now = engine.predict(end, 0).totals;
    const later = engine.predict(end, 60).totals;
    expect(now.deficitLiters).toBeGreaterThan(0);
    expect(later.deficitLiters).toBeGreaterThan(now.deficitLiters);
    expect(later.facilitiesShort).toContain("HOSP-2");
    expect(engine.allocateTankers(end)[0]).toMatchObject({ targetId: "HOSP-2" });
    const a = engine.runAuction(end, "S-01", 60);
    expect(a.options[0].outcome.deficitReductionLiters).toBeGreaterThan(0);
    expect(a.options[0].outcome.facilitiesProtected).toContain("HOSP-2");
    expect(scenarios[1].steps[scenarios[1].steps.length - 1].focus?.openPanel).toBe("tankers");
  });
});

describe("false-report end to end", () => {
  it("stays on hold, unverified, and barely moves the twin", () => {
    const end = playScenario("false-report");
    expect(end.incidents).toHaveLength(1);
    expect(end.incidents[0].status).toBe("unverified");
    expect(end.incidents[0].evidenceScore!.verdict).toBe("hold");
    expect(end.incidents[0].evidenceScore!.total).toBeLessThan(CONFIG.evidence.verifyAt);
    const calm = engine.predict(initialWorld(), 30);
    const now = engine.predict(end, 30);
    expect(now.totals.exposedPopulation).toBe(0);
    for (const id in calm.cells) expect(Math.abs(now.cells[id].floodRisk - calm.cells[id].floodRisk)).toBeLessThan(2);
  });
});

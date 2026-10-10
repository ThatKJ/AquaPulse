import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCap } from "@/lib/national/sachet";
import { matchDistricts, DISTRICTS } from "@/lib/national/match";
import { districtRisk, freshness, waterRelevance, alertStrength } from "@/lib/national/risk";

// Recorded real responses from NDMA SACHET (2026-10-10). No credentials or private fields are present in the feed.
const cwc = readFileSync("tests/fixtures/sachet-cwc-flood.xml", "utf8");
const imd = readFileSync("tests/fixtures/sachet-imd-rain.xml", "utf8");

describe("NDMA SACHET CAP parsing", () => {
  it("parses a real CWC flood alert, preferring the English block", () => {
    const a = parseCap(cwc);
    expect(a.id).toMatch(/^IN-\d+/);
    expect(a.event).toBe("Flood");
    expect(a.severity).toBe("Moderate");
    expect(a.headline).toMatch(/River SAI at Rae-Bareli/);
    expect(Date.parse(a.expiresAt!)).toBeGreaterThan(Date.parse(a.sentAt));
    expect(a.rawHash).toHaveLength(64);
  });
  it("rejects a document that is not a CAP alert", () => {
    expect(() => parseCap("<html>Error Code: 403</html>")).toThrow();
  });
  it("strips markup from text fields", () => {
    const a = parseCap(cwc.replace("<cap:headline>", "<cap:headline><![CDATA[<b>x</b>]]> "));
    expect(a.headline).not.toMatch(/[<>]/);
  });
});

describe("district matching", () => {
  it("places the CWC alert in Rae Bareli, Uttar Pradesh despite the hyphen", () => {
    const a = parseCap(cwc);
    const m = matchDistricts(a.areaDesc, `${a.sender} ${a.headline}`);
    expect(m.state).toBe("Uttar Pradesh");
    expect(m.districtIds.map((id) => DISTRICTS.find((d) => d.id === id)!.name)).toContain("Rae Bareli");
  });
  it("places a multi-district IMD alert within the named state only", () => {
    const a = parseCap(imd);
    const m = matchDistricts(a.areaDesc, a.headline);
    expect(m.districtIds.length).toBeGreaterThanOrEqual(2);
    for (const id of m.districtIds) expect(DISTRICTS.find((d) => d.id === id)!.state).toBe(m.state);
  });
  it("does not guess when no district is named", () => {
    expect(matchDistricts("9 districts of Uttarakhand", "").districtIds).toEqual([]);
    expect(matchDistricts("somewhere unnamed", "").state).toBeNull();
  });
});

describe("composite water risk", () => {
  const base = { id: "a", headline: "", sender: "CWC", sentAt: "2026-10-10T12:00:00Z" };
  it("ranks a severe observed flood above a possible light rain alert", () => {
    const flood = { ...base, event: "Flood", severity: "Severe", urgency: "Immediate", certainty: "Observed" };
    const rain = { ...base, event: "Light Rain", severity: "Moderate", urgency: "Expected", certainty: "Possible" };
    expect(alertStrength(flood)).toBeGreaterThan(alertStrength(rain));
    expect(districtRisk([flood]).risk).toBe(80);
  });
  it("treats missing inputs as unknown, not zero: coverage and confidence drop, risk does not", () => {
    const r = districtRisk([{ ...base, event: "Flood", severity: "Extreme", urgency: "Immediate", certainty: "Observed" }]);
    expect(r.risk).toBe(100);
    expect(r.coverage).toEqual({ have: 1, of: 4 });
    expect(r.confidence).toBeLessThan(0.5);
    expect(r.factors.filter((f) => f.state === "unknown")).toHaveLength(3);
  });
  it("gives a non-water alert no water risk", () => {
    expect(waterRelevance("Lightning").weight).toBe(0);
    expect(districtRisk([{ ...base, event: "Lightning", severity: "Severe", urgency: "Expected", certainty: "Likely" }]).risk).toBe(0);
  });
});

describe("freshness", () => {
  const now = Date.parse("2026-10-10T12:00:00Z");
  it("is judged against the source cadence", () => {
    expect(freshness("2026-10-10T11:50:00Z", 10, now)).toBe("CURRENT");
    expect(freshness("2026-10-10T11:20:00Z", 10, now)).toBe("DELAYED");
    expect(freshness("2026-10-10T09:00:00Z", 10, now)).toBe("STALE");
    expect(freshness(null, 10, now)).toBe("OFFLINE");
  });
});

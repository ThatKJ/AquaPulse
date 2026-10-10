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

import { parseNowcastRss, rainBand, districtIdFor } from "@/lib/national/nowcast";
import { corroborate, districtAt } from "@/lib/national/corroborate";
import type { NationalSnapshot } from "@/lib/national/store";

describe("IMD district nowcast", () => {
  // Recorded real response, 2026-10-10.
  const items = parseNowcastRss(readFileSync("tests/fixtures/imd-nowcast.xml", "latin1"));
  it("parses every item with offset timestamps", () => {
    expect(items.length).toBe(100);
    // The real feed contains the odd item whose expiry precedes its onset; those are simply never active.
    expect(items.filter((n) => Date.parse(n.expiresAt!) > Date.parse(n.onsetAt!)).length).toBeGreaterThanOrEqual(95);
  });
  it("reads the rain band from IMD's own wording", () => {
    expect(rainBand("Moderate rain: 5-15 mm/hr , Moderate Thunderstorms")).toBe("moderate");
    expect(rainBand("Heavy rain: >15 mm/hr")).toBe("heavy");
    expect(rainBand("Moderate Thunderstorms with maximum surface wind speed")).toBe("none");
    expect(items.find((n) => n.districtName === "ERNAKULAM")!.rainBand).toBe("moderate");
  });
  it("places districts only when the name is unique across India", () => {
    expect(districtIdFor("ERNAKULAM")).toBeTruthy();
    expect(districtIdFor("Not A District")).toBeNull();
    expect(items.filter((n) => n.districtId).length).toBeGreaterThan(50);
  });
});

describe("two-input risk", () => {
  const flood = { id: "a", headline: "", sender: "CWC", sentAt: "2026-10-10T12:00:00Z", event: "Flood", severity: "Moderate", urgency: "Future", certainty: "Observed" };
  const rain = { rainBand: "heavy", thunderstorm: false, description: "Heavy rain", sentAt: "2026-10-10T12:00:00Z" };
  it("never lowers risk when the nowcast input becomes known", () => {
    const alone = districtRisk([flood]);
    expect(districtRisk([flood], null).risk).toBe(alone.risk);
    expect(districtRisk([flood], rain).risk).toBeGreaterThan(alone.risk);
  });
  it("raises coverage and confidence with the second input, and exposes each contribution", () => {
    const r = districtRisk([flood], rain);
    expect(r.coverage).toEqual({ have: 2, of: 4 });
    expect(r.confidence).toBeCloseTo(0.65);
    const [a, n] = r.factors;
    expect(a.contribution + n.contribution).toBe(r.risk);
    expect(r.factors.filter((f) => f.state === "unknown")).toHaveLength(2);
  });
  it("scores a rain nowcast on its own", () => {
    expect(districtRisk([], rain).risk).toBe(48);
  });
});

describe("citizen report corroboration", () => {
  const muz = districtAt(85.39, 26.12)!; // Muzaffarpur, Bihar
  const snap = (over: Partial<NationalSnapshot>): NationalSnapshot => ({ generatedAt: "", source: {} as never, sources: [], summary: {} as never, districts: {}, alerts: [], hotspots: [], ...over });
  const alert = (event: string, domain: "flood" | "stress") => ({ id: "x", sender: "CWC", event, severity: "Moderate", urgency: "Future", certainty: "Observed", headline: "", sentAt: "", areaDesc: "", state: muz.state, districtIds: [muz.id], domain });
  it("finds the district that contains a point", () => {
    expect(muz.name).toBe("Muzaffarpur");
    expect(districtAt(0, 0)).toBeNull();
  });
  it("corroborates a flood report where an official flood alert is active", () => {
    const c = corroborate({ lng: 85.39, lat: 26.12, kind: "flood" }, snap({ alerts: [alert("Flood", "flood")] }));
    expect(c.corroborationStatus).toBe("CORROBORATED");
    expect(c.confidenceDelta).toBeGreaterThan(0);
  });
  it("partially corroborates on a rain nowcast alone", () => {
    const c = corroborate({ lng: 85.39, lat: 26.12, kind: "flood" }, snap({ districts: { [muz.id]: { nowcast: { rainBand: "moderate", thunderstorm: false, description: "", sentAt: "" } } as never } }));
    expect(c.corroborationStatus).toBe("PARTIALLY_CORROBORATED");
  });
  it("does not treat silence as contradiction", () => {
    const c = corroborate({ lng: 85.39, lat: 26.12, kind: "flood" }, snap({}));
    expect(c.corroborationStatus).toBe("NO_OFFICIAL_SIGNAL");
    expect(c.confidenceDelta).toBe(0);
  });
  it("flags a conflict without rejecting the report", () => {
    const c = corroborate({ lng: 85.39, lat: 26.12, kind: "flood" }, snap({ alerts: [alert("Heat Wave", "stress")] }));
    expect(c.corroborationStatus).toBe("CONFLICTING");
    expect(c.confidenceDelta).toBeLessThan(0);
  });
});

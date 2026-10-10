// Deterministic check of a citizen report against official conditions for the same district.
// No model judgement: only whether a compatible official signal is active where and when the report was made.
import shapes from "./district-shapes.json";
import type { NationalSnapshot } from "./store";

type Ring = number[][];
type Feature = { properties: { id: string; name: string; state: string }; geometry: { type: "Polygon"; coordinates: Ring[] } | { type: "MultiPolygon"; coordinates: Ring[][] } };
const FEATURES = (shapes as unknown as { features: Feature[] }).features;

const inRing = (x: number, y: number, ring: Ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const inPolygon = (x: number, y: number, poly: Ring[]) => poly.length > 0 && inRing(x, y, poly[0]) && !poly.slice(1).some((hole) => inRing(x, y, hole));

/** The district containing a point, or null (outside India or on a simplified edge). */
export function districtAt(lng: number, lat: number): { id: string; name: string; state: string } | null {
  for (const f of FEATURES) {
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    if (polys.some((p) => inPolygon(lng, lat, p))) return f.properties;
  }
  return null;
}

export type Corroboration = {
  corroborationStatus: "CORROBORATED" | "PARTIALLY_CORROBORATED" | "NO_OFFICIAL_SIGNAL" | "CONFLICTING";
  /** Source names that support (or conflict with) the report. */
  supportingSources: string[];
  /** Suggested change to confidence, in Evidence Score points. Advisory: the local engine's score is not altered by it. */
  confidenceDelta: number;
  reason: string;
  district: { id: string; name: string; state: string } | null;
};

/**
 * @param kind what the citizen reported: too much water or too little.
 * NO_OFFICIAL_SIGNAL means exactly that. It is never treated as evidence that the report is false.
 */
export function corroborate(report: { lng: number; lat: number; kind: "flood" | "scarcity" }, snapshot: NationalSnapshot): Corroboration {
  const district = districtAt(report.lng, report.lat);
  if (!district) return { corroborationStatus: "NO_OFFICIAL_SIGNAL", supportingSources: [], confidenceDelta: 0, reason: "The location is outside the district map, so it cannot be compared with official conditions.", district: null };
  const d = snapshot.districts[district.id];
  const alerts = snapshot.alerts.filter((a) => a.districtIds.includes(district.id));
  const flood = alerts.filter((a) => a.domain === "flood");
  const stress = alerts.filter((a) => a.domain === "stress");
  const strongFlood = flood.find((a) => /flood|river|heavy|cyclon|cloud/i.test(a.event));
  const rain = d?.nowcast && d.nowcast.rainBand !== "none" ? d.nowcast : null;
  const where = `${district.name}, ${district.state}`;

  if (report.kind === "flood") {
    if (strongFlood) return { corroborationStatus: "CORROBORATED", supportingSources: [strongFlood.sender, ...(rain ? ["IMD nowcast"] : [])], confidenceDelta: 10, reason: `An official ${strongFlood.severity.toLowerCase()} ${strongFlood.event.toLowerCase()} alert from ${strongFlood.sender} is active for ${where}${rain ? ", and the IMD nowcast shows rain" : ""}.`, district };
    if (flood.length || rain) return { corroborationStatus: "PARTIALLY_CORROBORATED", supportingSources: [...new Set([...flood.map((a) => a.sender), ...(rain ? ["IMD nowcast"] : [])])], confidenceDelta: 5, reason: `${rain ? `The IMD nowcast shows ${rain.rainBand.replace("_", " ")} rain` : `An official ${flood[0].event.toLowerCase()} alert is active`} for ${where}, which is consistent with water on the ground but is not a flood warning.`, district };
    if (stress.length) return { corroborationStatus: "CONFLICTING", supportingSources: stress.map((a) => a.sender), confidenceDelta: -5, reason: `The only official alert active for ${where} is a ${stress[0].event.toLowerCase()} alert, which points the other way. The report is kept; its certainty is reduced.`, district };
  } else {
    if (stress.length) return { corroborationStatus: "CORROBORATED", supportingSources: stress.map((a) => a.sender), confidenceDelta: 10, reason: `An official ${stress[0].event.toLowerCase()} alert from ${stress[0].sender} is active for ${where}.`, district };
    if (strongFlood) return { corroborationStatus: "CONFLICTING", supportingSources: [strongFlood.sender], confidenceDelta: -5, reason: `An official ${strongFlood.event.toLowerCase()} alert is active for ${where}, which points the other way. A supply failure during a flood is possible, so the report is kept with reduced certainty.`, district };
  }
  return { corroborationStatus: "NO_OFFICIAL_SIGNAL", supportingSources: [], confidenceDelta: 0, reason: `No official alert or nowcast that bears on this report is active for ${where}. That is not evidence against it.`, district };
}

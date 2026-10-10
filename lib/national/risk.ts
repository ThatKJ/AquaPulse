// AquaPulse Composite Water Risk for a district. This is AquaPulse's own derived score, not a rating issued by
// IMD, CWC or NDMA. It uses only inputs we actually hold. A source we do not have is UNKNOWN, never zero:
// it lowers coverage and confidence instead of lowering risk.

export type AlertLite = { id: string; event: string; severity: string; urgency: string; certainty: string; headline: string; sender: string; sentAt: string; expiresAt?: string };

/** Planned inputs. `available` flips to true only when a real feed is ingested. */
export const RISK_INPUTS = [
  { key: "official_alert", label: "Official alert", weight: 0.4, available: true },
  { key: "nowcast_rain", label: "Nowcast rainfall", weight: 0.25, available: false },
  { key: "river", label: "River condition", weight: 0.25, available: false },
  { key: "heat", label: "Heat / water stress", weight: 0.1, available: false },
] as const;

const SEVERITY: Record<string, number> = { Extreme: 1, Severe: 0.8, Moderate: 0.55, Minor: 0.3, Unknown: 0.3 };
const URGENCY: Record<string, number> = { Immediate: 1, Expected: 0.85, Future: 0.7, Past: 0.2, Unknown: 0.6 };
const CERTAINTY: Record<string, number> = { Observed: 1, Likely: 0.85, Possible: 0.65, Unlikely: 0.3, Unknown: 0.6 };

/** How much an alert type bears on water risk (flood or water stress). 0 = an official warning, but not a water one. */
export function waterRelevance(event: string): { weight: number; domain: "flood" | "stress" | "other" } {
  const e = event.toLowerCase();
  if (/flood|inundat|dam|reservoir|river/.test(e)) return { weight: 1, domain: "flood" };
  if (/cyclon|storm surge|cloud ?burst/.test(e)) return { weight: 1, domain: "flood" };
  if (/very heavy|extremely heavy|heavy rain/.test(e)) return { weight: 0.9, domain: "flood" };
  if (/rain|shower|thunderstorm|squall/.test(e)) return { weight: 0.6, domain: "flood" };
  if (/heat|drought|dry/.test(e)) return { weight: 0.7, domain: "stress" };
  return { weight: 0, domain: "other" };
}

export const alertStrength = (a: AlertLite) => (SEVERITY[a.severity] ?? 0.3) * (URGENCY[a.urgency] ?? 0.6) * (CERTAINTY[a.certainty] ?? 0.6) * waterRelevance(a.event).weight;

export type DistrictRisk = {
  /** 0..100, from the inputs we hold. */
  risk: number;
  /** 0..1: falls with missing inputs. */
  confidence: number;
  coverage: { have: number; of: number };
  factors: { key: string; label: string; state: "known" | "unknown"; display: string; contribution: number }[];
  /** Deterministic sentences built from the factors. */
  why: string[];
  top?: AlertLite;
};

export function districtRisk(alerts: AlertLite[]): DistrictRisk {
  const scored = alerts.map((a) => ({ a, s: alertStrength(a) })).sort((x, y) => y.s - x.s);
  const top = scored[0];
  // Strongest active alert, plus a small amount for further distinct water alerts (capped).
  const extra = Math.min(0.12, scored.slice(1).filter((x) => x.s > 0).length * 0.04);
  const alertValue = top ? Math.min(1, top.s + extra) : 0;
  const have = RISK_INPUTS.filter((i) => i.available).length;
  const knownWeight = RISK_INPUTS.filter((i) => i.available).reduce((n, i) => n + i.weight, 0);
  // Risk is normalised over the weight we can actually observe, so missing inputs do not pull it towards zero.
  const risk = Math.round(100 * alertValue);
  const factors = RISK_INPUTS.map((i) =>
    i.key === "official_alert"
      ? { key: i.key, label: i.label, state: "known" as const, display: top && top.s > 0 ? `${top.a.severity} · ${top.a.event}` : alerts.length ? "No water-related alert" : "None active", contribution: risk }
      : { key: i.key, label: i.label, state: "unknown" as const, display: "Unknown (no feed yet)", contribution: 0 },
  );
  const why: string[] = [];
  if (top && top.s > 0) {
    why.push(`${top.a.severity} official ${top.a.event.toLowerCase()} alert from ${top.a.sender} (${top.a.urgency.toLowerCase()}, ${top.a.certainty.toLowerCase()}).`);
    const more = scored.slice(1).filter((x) => x.s > 0).length;
    if (more) why.push(`${more} more water-related alert${more === 1 ? "" : "s"} active for this district.`);
  }
  if (have < RISK_INPUTS.length) why.push(`Rainfall, river and heat inputs are not connected, so this reflects official alerts only.`);
  return { risk, confidence: Math.round(100 * knownWeight * (top ? 1 : 0.9)) / 100, coverage: { have, of: RISK_INPUTS.length }, factors, why, top: top?.a };
}

export type Freshness = "CURRENT" | "DELAYED" | "STALE" | "OFFLINE";
/** Freshness is judged against the source's own cadence, not one global threshold. */
export function freshness(lastSuccessAt: string | null, cadenceMin: number, now = Date.now()): Freshness {
  if (!lastSuccessAt) return "OFFLINE";
  const ageMin = (now - Date.parse(lastSuccessAt)) / 60_000;
  return ageMin <= cadenceMin * 2 ? "CURRENT" : ageMin <= cadenceMin * 6 ? "DELAYED" : "STALE";
}

// The one risk visual grammar for AquaPulse. Map, legend, panels and timeline all read from here,
// so a band always has the same name, colour and glyph. Meaning never depends on colour alone:
// each band also has a glyph (fill level) and a label.

export type RiskBandKey = "safe" | "watch" | "elevated" | "high" | "critical";
export type RiskDomain = "flood" | "scarcity";
type RGB = [number, number, number];

export type RiskBand = {
  key: RiskBandKey;
  label: string;
  /** Inclusive lower bound on the 0..100 risk scale. */
  min: number;
  /** Fill-level glyph: readable without colour. */
  glyph: string;
  flood: RGB;
  scarcity: RGB;
};

// 60 is the engine's facility at-risk threshold (CONFIG), so HIGH starts exactly where a facility becomes "at risk".
export const RISK_BANDS: RiskBand[] = [
  { key: "safe", label: "Safe", min: 0, glyph: "○", flood: [45, 110, 125], scarcity: [52, 96, 140] },
  { key: "watch", label: "Watch", min: 25, glyph: "◔", flood: [34, 211, 238], scarcity: [96, 165, 250] },
  { key: "elevated", label: "Elevated", min: 45, glyph: "◑", flood: [245, 158, 11], scarcity: [245, 158, 11] },
  { key: "high", label: "High", min: 60, glyph: "◕", flood: [249, 115, 22], scarcity: [249, 115, 22] },
  { key: "critical", label: "Critical", min: 80, glyph: "●", flood: [239, 68, 68], scarcity: [239, 68, 68] },
];

export function riskBand(risk: number): RiskBand {
  let band = RISK_BANDS[0];
  for (const b of RISK_BANDS) if (risk >= b.min) band = b;
  return band;
}

export const bandColor = (risk: number, domain: RiskDomain): RGB => riskBand(risk)[domain];
export const bandCss = (risk: number, domain: RiskDomain) => `rgb(${bandColor(risk, domain).join(" ")})`;

/** Predicted (future-horizon) state: always an outline/dash treatment in this violet, never a fill. */
export const PREDICTED: RGB = [167, 139, 250];
/** Verified / protected. */
export const VERIFIED: RGB = [52, 211, 153];

/** Evidence verdict in operator language. Thresholds are the engine's; this only renames them. */
export const VERDICT_LABEL = { hold: "Unverified", verify: "Probable", escalate: "Confirmed" } as const;

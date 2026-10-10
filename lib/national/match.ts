// Places an official alert on the district map by NAME, because the feed's polygon service is not publicly
// readable (403) and only some alerts carry district codes. Conservative by design: an alert is attached to a
// district only when the district's name appears in the alert's area text and the state is unambiguous.
// Alerts that cannot be placed stay at state level or unlocated; they are counted, never guessed.
import districts from "./districts.json";

export type District = { id: string; name: string; state: string; lng: number; lat: number };
export const DISTRICTS = districts as District[];

export const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const squash = (s: string) => norm(s).replace(/ /g, "");

const STATES = [...new Set(DISTRICTS.map((d) => d.state))].filter((s) => s !== "Unknown");
const byState = new Map<string, District[]>(STATES.map((s) => [s, DISTRICTS.filter((d) => d.state === s)]));
// Spelling variants seen in the feed that differ from the boundary dataset's names.
const STATE_ALIASES: Record<string, string> = { odisha: "orissa", uttarakhand: "uttaranchal", puducherry: "pondicherry", "jammu kashmir": "jammu and kashmir" };

export function findState(text: string): string | null {
  const t = ` ${norm(text)} `;
  for (const s of STATES) {
    const n = norm(s);
    if (t.includes(` ${n} `)) return s;
  }
  for (const [alias, canonical] of Object.entries(STATE_ALIASES)) {
    if (t.includes(` ${alias} `)) return STATES.find((s) => norm(s) === canonical) ?? STATES.find((s) => norm(s) === alias) ?? null;
  }
  return null;
}

/** District ids named in the text. Names shorter than four letters are ignored: too easy to match by accident. */
export function matchDistricts(areaText: string, context: string): { state: string | null; districtIds: string[] } {
  const state = findState(areaText) ?? findState(context);
  const hay = ` ${norm(areaText)} `;
  const haySquashed = squash(areaText);
  const pool = state ? (byState.get(state) ?? []) : DISTRICTS;
  const hits = pool.filter((d) => {
    const n = norm(d.name);
    if (n.replace(/ /g, "").length < 4) return false;
    // whole-word match, or a hyphen/space variant ("Rae-Bareli" vs "Rae Bareli") as a squashed substring of 6+ letters
    return hay.includes(` ${n} `) || (n.replace(/ /g, "").length >= 6 && haySquashed.includes(n.replace(/ /g, "")));
  });
  if (state) return { state, districtIds: hits.map((d) => d.id) };
  // No state named: accept only district names that are unique across India, and only if they agree on one state.
  const unique = hits.filter((d) => DISTRICTS.filter((o) => norm(o.name) === norm(d.name)).length === 1);
  const states = new Set(unique.map((d) => d.state));
  return states.size === 1 ? { state: [...states][0], districtIds: unique.map((d) => d.id) } : { state: null, districtIds: [] };
}

// IMD district nowcast: a 3-hour outlook per district, published as RSS. Untrusted third-party input.
import { createHash } from "node:crypto";
import { z } from "zod";
import { DISTRICTS, norm } from "./match";

export const NOWCAST = {
  id: "imd-nowcast",
  name: "IMD district nowcast",
  organization: "India Meteorological Department",
  category: "weather",
  coverage: "India (districts with an active nowcast warning)",
  endpoint: "https://mausam.imd.gov.in/imd_latest/contents/dist_nowcast_rss.php",
  /** Nowcasts are issued about every three hours; polling every 30 minutes is ample. */
  cadenceMin: 30,
  authentication: "none",
  attribution: "Nowcasts: India Meteorological Department. AquaPulse is not affiliated with or endorsed by IMD.",
} as const;

export const RAIN_BANDS = ["none", "light", "moderate", "heavy", "very_heavy"] as const;
export type RainBand = (typeof RAIN_BANDS)[number];

export const NowcastSchema = z.object({
  id: z.string().length(40),
  districtName: z.string().min(2).max(80),
  districtId: z.string().nullable(),
  rainBand: z.enum(RAIN_BANDS),
  thunderstorm: z.boolean(),
  description: z.string().max(600),
  sentAt: z.string().datetime({ offset: true }),
  onsetAt: z.string().datetime({ offset: true }).optional(),
  expiresAt: z.string().datetime({ offset: true }).optional(),
});
export type Nowcast = z.infer<typeof NowcastSchema>;

const clean = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const field = (item: string, name: string) => {
  const m = item.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "i"));
  return m ? clean(m[1]) : undefined;
};
// The feed writes offsets as "+5:30"; ISO 8601 needs "+05:30".
const iso = (v?: string) => {
  if (!v) return undefined;
  const t = Date.parse(v.replace(/([+-])(\d):(\d\d)$/, "$10$2:$3"));
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
};

/** IMD's own wording decides the band; nothing is inferred beyond it. */
export function rainBand(description: string): RainBand {
  const d = description.toLowerCase();
  if (/extremely heavy|very heavy/.test(d)) return "very_heavy";
  if (/heavy rain|intense spell/.test(d)) return "heavy";
  if (/moderate rain/.test(d)) return "moderate";
  if (/light rain|drizzle/.test(d)) return "light";
  return "none";
}

/** District ids for names that are unique across India. The feed gives no state, so ambiguous names are not placed. */
const UNIQUE = (() => {
  const seen = new Map<string, string | null>();
  for (const d of DISTRICTS) {
    const k = norm(d.name).replace(/ /g, "");
    seen.set(k, seen.has(k) ? null : d.id);
  }
  return seen;
})();
export const districtIdFor = (name: string) => UNIQUE.get(norm(name).replace(/ /g, "")) ?? null;

export function parseNowcastRss(xml: string): Nowcast[] {
  const out: Nowcast[] = [];
  for (const m of xml.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/g)) {
    const item = m[1];
    const name = field(item, "title");
    const sentAt = iso(field(item, "sent")) ?? iso(field(item, "pubDate"));
    if (!name || !sentAt) continue;
    const description = (field(item, "description") ?? "").slice(0, 600);
    const parsed = NowcastSchema.safeParse({
      id: createHash("sha1").update(`${name}|${sentAt}`).digest("hex"),
      districtName: name, districtId: districtIdFor(name), rainBand: rainBand(description), thunderstorm: /thunder|lightning/i.test(description),
      description, sentAt, onsetAt: iso(field(item, "Onset")), expiresAt: iso(field(item, "Expires")),
    });
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

export async function fetchNowcasts(): Promise<Nowcast[]> {
  const res = await fetch(NOWCAST.endpoint, { headers: { "user-agent": "AquaPulse/0.1 (hackathon project; github.com/ThatKJ/AquaPulse)" }, signal: AbortSignal.timeout(20_000), cache: "no-store" });
  if (!res.ok) throw new Error(`mausam.imd.gov.in returned ${res.status}`);
  // The feed is declared ISO-8859-1.
  const xml = new TextDecoder("latin1").decode(await res.arrayBuffer());
  if (xml.length > 600_000) throw new Error("response too large");
  return parseNowcastRss(xml);
}

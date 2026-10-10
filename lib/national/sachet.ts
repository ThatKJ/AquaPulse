// NDMA SACHET: India's national Common Alerting Protocol feed. It carries alerts issued by IMD offices,
// the Central Water Commission and state disaster authorities. One RSS index, then one CAP 1.2 document per alert.
// Everything fetched here is untrusted third-party input: it is parsed defensively and validated before use.
import { createHash } from "node:crypto";
import { z } from "zod";

export const SACHET = {
  id: "ndma-sachet",
  name: "NDMA SACHET",
  organization: "National Disaster Management Authority (alerts issued by IMD, CWC and state authorities)",
  category: "warning",
  coverage: "India",
  endpoint: "https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml",
  /** How often we poll. The feed itself changes continuously. */
  cadenceMin: 10,
  authentication: "none",
  attribution: "Alerts: NDMA SACHET (Common Alerting Protocol). AquaPulse is not affiliated with or endorsed by NDMA, IMD or CWC.",
} as const;

const UA = "AquaPulse/0.1 (hackathon project; github.com/ThatKJ/AquaPulse)";
const ALERT_URL = "https://sachet.ndma.gov.in/cap_public_website/FetchXMLFile?identifier=";

export const OfficialAlertSchema = z.object({
  id: z.string().min(3).max(80),
  sender: z.string().max(120),
  event: z.string().min(1).max(120),
  severity: z.enum(["Extreme", "Severe", "Moderate", "Minor", "Unknown"]),
  urgency: z.enum(["Immediate", "Expected", "Future", "Past", "Unknown"]),
  certainty: z.enum(["Observed", "Likely", "Possible", "Unlikely", "Unknown"]),
  headline: z.string().max(1000),
  description: z.string().max(4000),
  areaDesc: z.string().max(1000),
  language: z.string().max(12).optional(),
  sentAt: z.string().datetime({ offset: true }),
  onsetAt: z.string().datetime({ offset: true }).optional(),
  expiresAt: z.string().datetime({ offset: true }).optional(),
  rawHash: z.string().length(64),
});
export type OfficialAlert = z.infer<typeof OfficialAlertSchema>;

const decode = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const tag = (xml: string, name: string) => {
  const m = xml.match(new RegExp(`<cap:${name}>([\\s\\S]*?)</cap:${name}>`));
  return m ? decode(m[1]) : undefined;
};
const oneOf = <T extends string>(v: string | undefined, allowed: readonly T[], fallback: T): T => (allowed as readonly string[]).includes(v ?? "") ? (v as T) : fallback;

async function get(url: string, timeoutMs = 15_000): Promise<string> {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/xml,text/xml,*/*" }, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  if (!res.ok) throw new Error(`${new URL(url).hostname} returned ${res.status}`);
  const text = await res.text();
  if (text.length > 400_000) throw new Error("response too large");
  return text;
}

/** Identifiers in the RSS index, newest first. */
export async function fetchIndex(): Promise<string[]> {
  const xml = await get(SACHET.endpoint);
  const ids = [...xml.matchAll(/FetchXMLFile\?identifier=(\d{6,30})/g)].map((m) => m[1]);
  return [...new Set(ids)];
}

/** Parse one CAP document. Prefers the English info block when the alert carries several languages. */
export function parseCap(xml: string): OfficialAlert {
  const infos = [...xml.matchAll(/<cap:info>([\s\S]*?)<\/cap:info>/g)].map((m) => m[1]);
  const info = infos.find((i) => /^en/i.test(tag(i, "language") ?? "")) ?? infos[0] ?? "";
  const iso = (v?: string) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : undefined);
  return OfficialAlertSchema.parse({
    id: tag(xml, "identifier"),
    sender: tag(xml, "senderName") ?? tag(xml, "sender") ?? "Unknown",
    event: tag(info, "event") ?? "Unknown",
    severity: oneOf(tag(info, "severity"), ["Extreme", "Severe", "Moderate", "Minor", "Unknown"] as const, "Unknown"),
    urgency: oneOf(tag(info, "urgency"), ["Immediate", "Expected", "Future", "Past", "Unknown"] as const, "Unknown"),
    certainty: oneOf(tag(info, "certainty"), ["Observed", "Likely", "Possible", "Unlikely", "Unknown"] as const, "Unknown"),
    headline: (tag(info, "headline") ?? "").slice(0, 1000),
    description: (tag(info, "description") ?? "").slice(0, 4000),
    areaDesc: [...info.matchAll(/<cap:areaDesc>([\s\S]*?)<\/cap:areaDesc>/g)].map((m) => decode(m[1])).join("; ").slice(0, 1000),
    language: tag(info, "language"),
    sentAt: iso(tag(xml, "sent")),
    onsetAt: iso(tag(info, "onset") ?? tag(info, "effective")),
    expiresAt: iso(tag(info, "expires")),
    rawHash: createHash("sha256").update(xml).digest("hex"),
  });
}

export async function fetchAlert(identifier: string): Promise<OfficialAlert> {
  return parseCap(await get(ALERT_URL + encodeURIComponent(identifier)));
}

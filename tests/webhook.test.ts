// The citizen-report trust boundary: Twilio signature, the single allowed forwarder URL, idempotency,
// location pairing and the media host allowlist. Runs against the in-memory repo; no network.
import { beforeAll, describe, expect, it } from "vitest";
import { twilioSignature } from "@/lib/alerts";

const TOKEN = "test-auth-token";
const DIRECT = "https://aquapulse.test/api/webhooks/twilio";
const FORWARDER = "https://n8n.test/webhook/aquapulse/citizen-report";

let POST: (req: Request) => Promise<Response>;
let mediaUrlAllowed: (u: URL, redirected?: boolean) => boolean;
let repo: typeof import("@/lib/db").repo;

beforeAll(async () => {
  for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "TWILIO_ACCOUNT_SID", "TWILIO_ACK_CONTENT_SID"]) delete process.env[k];
  process.env.TWILIO_AUTH_TOKEN = TOKEN;
  process.env.TWILIO_FORWARDER_URL = FORWARDER;
  process.env.WEBHOOK_SECRET = "test-webhook-secret";
  ({ POST } = await import("@/app/api/webhooks/twilio/route"));
  ({ mediaUrlAllowed } = await import("@/app/api/_lib"));
  ({ repo } = await import("@/lib/db"));
});

let n = 0;
const sid = () => `SMtest${++n}`;
/** A request as Twilio would send it to `signedUrl`; always delivered to the direct route. */
function send(params: Record<string, string>, signedUrl = DIRECT, signature?: string) {
  return POST(
    new Request(DIRECT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": signature ?? twilioSignature(TOKEN, signedUrl, params) },
      body: new URLSearchParams(params),
    }),
  );
}

describe("twilio webhook", () => {
  it("rejects a bad or missing signature", async () => {
    expect((await send({ MessageSid: sid(), From: "whatsapp:+910000000001", Body: "x" }, DIRECT, "AAAA")).status).toBe(403);
    const unsigned = await POST(new Request(DIRECT, { method: "POST", body: new URLSearchParams({ MessageSid: sid(), From: "whatsapp:+910000000001" }) }));
    expect(unsigned.status).toBe(403);
  });

  it("accepts a valid form-urlencoded message with only the required fields and answers in TwiML", async () => {
    const res = await send({ MessageSid: sid(), From: "whatsapp:+910000000002" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/xml");
    expect(await res.text()).toMatch(/<Response><Message>[^<]*Reference: AQ-[0-9A-F]{5}<\/Message><\/Response>/);
  });

  it("accepts a signature made for the configured forwarder URL and no other", async () => {
    const p = { MessageSid: sid(), From: "whatsapp:+910000000003", Body: "via n8n" };
    expect((await send(p, FORWARDER)).status).toBe(200);
    const q = { MessageSid: sid(), From: "whatsapp:+910000000003", Body: "via somewhere else" };
    expect((await send(q, "https://evil.test/webhook/aquapulse/citizen-report")).status).toBe(403);
    expect((await send(q, FORWARDER + "/")).status).toBe(403);
  });

  it("ignores x-twilio-original-url from a caller without the server secret", async () => {
    const p = { MessageSid: sid(), From: "whatsapp:+910000000004", Body: "x" };
    const other = "https://evil.test/hook";
    const res = await POST(
      new Request(DIRECT, {
        method: "POST",
        headers: { "x-twilio-signature": twilioSignature(TOKEN, other, p), "x-twilio-original-url": other },
        body: new URLSearchParams(p),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("stores one report for a repeated MessageSid, with a hashed sender", async () => {
    const before = (await repo().listRecentEvidence(100)).length;
    const p = { MessageSid: sid(), From: "whatsapp:+910000000005", Body: "TEST REPORT: water on the road" };
    const first = await (await send(p)).text();
    const second = await (await send(p)).text();
    expect(second).toContain("already has this report");
    expect(second.match(/AQ-[0-9A-F]{5}/)?.[0]).toBe(first.match(/AQ-[0-9A-F]{5}/)?.[0]);
    const rows = await repo().listRecentEvidence(100);
    expect(rows.length).toBe(before + 1);
    const row = rows.find((r) => r.messageId === p.MessageSid)!;
    expect(row.reporterId).toMatch(/^r_[0-9a-f]{16}$/);
    expect(JSON.stringify(row)).not.toContain("910000000005");
  });

  it("pairs a location pin with the sender's earlier report instead of storing a second one", async () => {
    const from = "whatsapp:+910000000006";
    const text = { MessageSid: sid(), From: from, Body: "TEST REPORT: drain overflowing" };
    expect(await (await send(text)).text()).toContain("share your location");
    const before = (await repo().listLiveReports(100)).length;
    expect(await (await send({ MessageSid: sid(), From: from, Body: "", Latitude: "12.92672", Longitude: "77.63805" })).text()).toContain("Location added");
    const reports = await repo().listLiveReports(100);
    expect(reports.length).toBe(before);
    const paired = reports.find((r) => r.text === text.Body)!;
    expect([paired.lat, paired.lng]).toEqual([12.92672, 77.63805]);
    // Another sender's pin is never borrowed.
    expect(await (await send({ MessageSid: sid(), From: "whatsapp:+910000000007", Body: "TEST REPORT: elsewhere" })).text()).toContain("share your location");
  });

  it("rejects out-of-range coordinates", async () => {
    expect((await send({ MessageSid: sid(), From: "whatsapp:+910000000008", Latitude: "999", Longitude: "77" })).status).toBe(400);
  });
});

describe("media host allowlist", () => {
  const ok = (u: string, redirected = false) => mediaUrlAllowed(new URL(u), redirected);
  it("allows Twilio hosts over https only", () => {
    expect(ok("https://api.twilio.com/2010-04-01/Accounts/AC1/Messages/MM1/Media/ME1")).toBe(true);
    expect(ok("http://api.twilio.com/x")).toBe(false);
    expect(ok("https://api.twilio.com:8443/x")).toBe(false);
    expect(ok("https://user:pass@api.twilio.com/x")).toBe(false);
  });
  it("refuses internal, link-local and look-alike hosts", () => {
    for (const u of [
      "https://localhost/x", "https://127.0.0.1/x", "https://10.0.0.5/x", "https://192.168.1.1/x", "https://172.16.0.1/x",
      "https://169.254.169.254/latest/meta-data/", "https://[::1]/x", "https://[fd00::1]/x", "https://[fe80::1]/x",
      "https://api.twilio.com.evil.test/x", "https://evil-twiliocdn.com/x", "https://example.com/x",
    ])
      expect(ok(u), u).toBe(false);
  });
  it("allows Twilio's storage bucket only as a redirect target", () => {
    const s3 = "https://s3-external-1.amazonaws.com/media.twiliocdn.com/AC1/abc";
    expect(ok(s3)).toBe(false);
    expect(ok(s3, true)).toBe(true);
    expect(ok("https://s3.amazonaws.com/some-other-bucket/abc", true)).toBe(false);
  });
});

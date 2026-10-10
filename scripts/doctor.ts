// npm run doctor — one line per integration with an explicit state. `--live` also spends ONE Bedrock inference call.
import { existsSync } from "node:fs";
import { serverEnv } from "../lib/schemas/env";
import { line, loadEnv, run, type Check } from "./_shared";
import { cliVersion, verifyAws } from "./verify-aws";
import { verifyBedrock, verifyRekognition } from "./verify-bedrock";
import { verifyDb } from "./verify-db";

const MAP_STYLE = "https://tiles.openfreemap.org/styles/dark";

async function mapProvider(): Promise<Check> {
  try {
    const res = await fetch(MAP_STYLE, { signal: AbortSignal.timeout(8000) });
    const style = (await res.json().catch(() => null)) as { sources?: unknown } | null;
    return res.ok && style?.sources ? { state: "PASS", detail: `${MAP_STYLE} served a style` } : { state: "FAIL", detail: `${MAP_STYLE} returned ${res.status}` };
  } catch {
    return { state: "FAIL", detail: `${MAP_STYLE} unreachable (the map needs network; the engine does not)` };
  }
}

run(async () => {
  loadEnv();
  const live = process.argv.includes("--live");
  const env = serverEnv();
  const checks: [string, Check][] = [];

  const nodeMajor = Number(process.versions.node.split(".")[0]);
  checks.push(["Node", { state: nodeMajor >= 20 ? "PASS" : "FAIL", detail: `${process.version}${nodeMajor >= 20 ? "" : " (Next 16 needs 20.9+)"}` }]);
  checks.push(["npm", cliVersion("npm")], ["Git", cliVersion("git")]);
  const cli = cliVersion("aws");
  checks.push(["AWS CLI", cli.state === "PASS" ? cli : { state: "NOT_CONFIGURED", detail: "not installed; needed for `aws login` and the Lambda deploy" }]);

  const aws = await verifyAws();
  checks.push(["AWS identity", aws]);
  checks.push(["AWS region", aws.state === "PASS" ? { state: "PASS", detail: env.AWS_REGION } : { state: "UNVERIFIED", detail: `${env.AWS_REGION} (no call succeeded in it yet)` }]);

  const noIdentity: Check = { state: "UNVERIFIED", detail: "skipped: no AWS identity" };
  if (aws.state !== "PASS") checks.push(["Bedrock", noIdentity], ["Rekognition", noIdentity]);
  else {
    // Bedrock inference is only spent on request. The Rekognition probe is one DetectLabels call on a generated PNG.
    const bedrock: Check = live
      ? await verifyBedrock()
      : env.BEDROCK_MODEL_ID
        ? { state: "UNVERIFIED", detail: `${env.BEDROCK_MODEL_ID} set; run \`npm run verify:bedrock\` (one inference call) or doctor --live` }
        : { state: "NOT_CONFIGURED", detail: "BEDROCK_MODEL_ID not set (Bedrock is account-blocked as of 2026-10-10, see docs/AWS_SETUP.md); `npm run verify:bedrock` re-tests with one call" };
    checks.push(["Bedrock", bedrock], ["Rekognition", await verifyRekognition()]);
  }

  const db = await verifyDb();
  checks.push(["Supabase", db.supabase], ["PostGIS", db.postgis]);
  checks.push(["Twilio config", env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_PHONE_NUMBER
    ? { state: "UNVERIFIED", detail: "credentials set; no message sent to verify them" }
    : { state: "NOT_CONFIGURED", detail: "alerts use the demo transport" }]);
  // Public path: the deployed site's own health endpoint reports what it can reach (Lambda via AI_ENDPOINT_URL, Supabase).
  const publicUrl = process.env.AQUAPULSE_PUBLIC_URL?.replace(/\/+$/, "");
  if (!publicUrl) {
    const nc: Check = { state: "NOT_CONFIGURED", detail: "set AQUAPULSE_PUBLIC_URL in .env.local to check the deployed site" };
    checks.push(["Public site", nc], ["AWS Lambda", nc]);
  } else {
    try {
      const res = await fetch(`${publicUrl}/api/health`, { signal: AbortSignal.timeout(20_000) });
      const h = (await res.json()) as { aws?: Check; ai?: Check & { observer?: string }; db?: Check & { adapter?: string } };
      checks.push(["Public site", res.ok ? { state: "PASS", detail: `${publicUrl} · db ${h.db?.adapter ?? "?"} ${h.db?.state ?? "?"}` } : { state: "FAIL", detail: `${publicUrl} returned ${res.status}` }]);
      // On the public host AWS identity is only reachable through the Lambda, so its state is the Lambda's state.
      checks.push(["AWS Lambda", { state: h.aws?.state ?? "FAIL", detail: `${h.aws?.detail ?? "no aws block"} · observer ${h.ai?.observer ?? "?"} (${h.ai?.state ?? "?"})` }]);
    } catch (err) {
      const f: Check = { state: "FAIL", detail: `${publicUrl} unreachable: ${err instanceof Error ? err.name : "error"}` };
      checks.push(["Public site", f], ["AWS Lambda", f]);
    }
  }
  // National layer: freshness of the last successful NDMA SACHET sync, read from the database.
  try {
    const { nationalSnapshot } = await import("../lib/national/store");
    const snap = await nationalSnapshot();
    checks.push(["NDMA SACHET", !snap
      ? { state: "NOT_CONFIGURED", detail: "needs Supabase" }
      : { state: snap.source.freshness === "CURRENT" ? "PASS" : "UNVERIFIED", detail: `${snap.source.freshness} · last sync ${snap.source.lastSuccessAt ?? "never"} · ${snap.summary.activeAlerts} active alerts${snap.source.freshness === "CURRENT" ? "" : " (run `npm run sync:national`)"}` }]);
  } catch (err) {
    checks.push(["NDMA SACHET", { state: "FAIL", detail: err instanceof Error ? err.message.slice(0, 120) : "error" }]);
  }
  checks.push(["IMD APIs", { state: "NOT_CONFIGURED", detail: "blocked: IMD requires IP whitelisting (docs/NATIONAL_DATA_SOURCES.md)" }]);
  checks.push(["n8n", process.env.N8N_BASE_URL
    ? { state: "UNVERIFIED", detail: `${process.env.N8N_BASE_URL} configured; import n8n/*.json and run a test webhook` }
    : { state: "NOT_CONFIGURED", detail: "no n8n instance; workflows are importable JSON in n8n/ (see docs/N8N.md)" }]);
  checks.push(["Map provider", await mapProvider()]);
  checks.push(["Build", existsSync(".next/BUILD_ID") ? { state: "PASS", detail: ".next/BUILD_ID present" } : { state: "UNVERIFIED", detail: "no production build found; run `npm run build`" }]);

  for (const [label, c] of checks) line(label, c);
  console.log(`${checks.filter(([, c]) => c.state === "PASS").length}/${checks.length} READY`);
  return 0;
});

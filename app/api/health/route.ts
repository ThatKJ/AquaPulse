import { connection } from "next/server";
import { awsAiHealth } from "@/lib/aws/clients";
import { repo } from "@/lib/db";
import type { HealthResponse } from "@/lib/schemas/api";
import { serverEnv } from "@/lib/schemas/env";
import { handle, json } from "../_lib";

let cached: { at: number; body: HealthResponse } | undefined;

const run = handle("health", async (_req, requestId) => {
  if (cached && Date.now() - cached.at < 30_000) return json(requestId, cached.body);
  const env = serverEnv();
  const [{ aws, ai }, db] = await Promise.all([awsAiHealth(), repo().health()]);
  const twilioReady = env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_PHONE_NUMBER;
  const body: HealthResponse = {
    aws,
    ai,
    db,
    twilio: twilioReady
      ? { state: "UNVERIFIED", detail: "Credentials are set; no message has been sent to verify them." }
      : { state: "NOT_CONFIGURED", detail: "Twilio env vars not set; alerts use the demo transport." },
    checkedAt: new Date().toISOString(),
  };
  cached = { at: Date.now(), body };
  return json(requestId, body);
});

export async function GET(req: Request) {
  await connection(); // always request time: this route makes live calls
  return run(req);
}

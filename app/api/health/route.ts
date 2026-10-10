import { connection } from "next/server";
import { awsAiHealth } from "@/lib/aws/clients";
import { repo } from "@/lib/db";
import type { HealthResponse } from "@/lib/schemas/api";
import { serverEnv } from "@/lib/schemas/env";
import { handle, json } from "../_lib";

const run = handle("health", async (_req, requestId) => {
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
  return json(requestId, body);
});

export async function GET(req: Request) {
  await connection(); // always request time: this route makes live calls
  return run(req);
}

import { z } from "zod";

// Server-only. Never import this from a client component.
// Empty strings are treated as "not set" so a blank .env line is NOT_CONFIGURED, not a bad value.
const opt = z.preprocess((v) => (v === "" ? undefined : v), z.string().optional());

const ServerEnvSchema = z.object({
  AWS_REGION: z.preprocess((v) => (v === "" ? undefined : v), z.string().default("ap-south-1")),
  /** Bedrock model or inference-profile id. Discovered by `npm run verify:bedrock`; never hard-coded. */
  BEDROCK_MODEL_ID: opt,
  /** When set, AI calls go to the deployed Lambda instead of the local AWS SDK. */
  AI_ENDPOINT_URL: opt,
  AI_ENDPOINT_SECRET: opt,
  NEXT_PUBLIC_SUPABASE_URL: opt,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: opt,
  SUPABASE_SERVICE_ROLE_KEY: opt,
  TWILIO_ACCOUNT_SID: opt,
  TWILIO_AUTH_TOKEN: opt,
  TWILIO_PHONE_NUMBER: opt,
  /** "live" sends real messages, and only to TWILIO_ALLOWED_TO. Anything else (default) records alerts without sending. */
  TWILIO_MODE: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["demo", "live"]).default("demo")),
  /** Comma-separated E.164 numbers that live mode may message. Empty = nobody. */
  TWILIO_ALLOWED_TO: opt,
  /** Twilio-provided template (HX…) for acknowledgements. Trial WhatsApp numbers accept only these, not free text. */
  TWILIO_ACK_CONTENT_SID: opt,
  /** Exact public URL of an orchestrator webhook (n8n) that Twilio calls and that forwards here unchanged. */
  TWILIO_FORWARDER_URL: opt,
  /** Set when an n8n instance has the AquaPulse workflows imported. Informational: shown in the trust strip. */
  N8N_BASE_URL: opt,
  /** Shared secret n8n sends as `x-aquapulse-secret` on webhook calls. */
  WEBHOOK_SECRET: opt,
});
export type ServerEnv = z.infer<typeof ServerEnvSchema>;

export function serverEnv(): ServerEnv {
  return ServerEnvSchema.parse(process.env);
}

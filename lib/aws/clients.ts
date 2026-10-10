// The one place AWS SDK clients are built. Server only.
// Also: structured logs, error classification, identity, the remote (Lambda) transport and AI health.
import { createHash, timingSafeEqual } from "node:crypto";
import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ConverseCommandInput,
  type ConverseCommandOutput,
} from "@aws-sdk/client-bedrock-runtime";
import { RekognitionClient } from "@aws-sdk/client-rekognition";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { z } from "zod";
import { ALLOWED_IMAGE_TYPES, HealthResponseSchema, type HealthResponse } from "../schemas/api";
import { serverEnv } from "../schemas/env";

export type Observer = "bedrock" | "rekognition";

/** Shared by every client: default credential chain, 3 attempts, ~20 s per request. */
export function clientConfig(maxAttempts = 3) {
  return {
    region: serverEnv().AWS_REGION,
    maxAttempts,
    requestHandler: { requestTimeout: 20_000, connectionTimeout: 5_000 },
  };
}

let _bedrock: BedrockRuntimeClient | undefined;
let _rekognition: RekognitionClient | undefined;
let _sts: STSClient | undefined;
export const bedrockRuntime = () => (_bedrock ??= new BedrockRuntimeClient(clientConfig()));
export const rekognition = () => (_rekognition ??= new RekognitionClient(clientConfig()));
const sts = () => (_sts ??= new STSClient(clientConfig()));

/** Mask anything that looks like an AWS account id (12 digits) down to its last 4. */
export const mask = (s: string) => s.replace(/\d{12}/g, (m) => `********${m.slice(-4)}`);

/** One JSON line per operation. Never pass secrets, image bytes or unmasked account ids. */
export function logOp(fields: {
  service: string;
  op: string;
  requestId?: string;
  durationMs: number;
  status: "ok" | "error";
  [k: string]: unknown;
}) {
  console.log(JSON.stringify({ t: new Date().toISOString(), ...fields }));
}

export function safeEqual(a: string, b: string): boolean {
  const h = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(h(a), h(b));
}

/** Image type from magic bytes, or null. The declared content type must match this. */
export function sniffImageType(b: Uint8Array): (typeof ALLOWED_IMAGE_TYPES)[number] | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (b.length >= 8 && b[0] === 0x89 && ascii(1, 4) === "PNG" && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

// ---------- errors ----------

export type AwsErrorCode =
  | "CREDENTIALS"
  | "ACCESS_DENIED"
  | "USE_CASE_FORM"
  | "ACCOUNT_RESTRICTED"
  | "MODEL_NOT_FOUND"
  | "REGION_OR_PROFILE"
  | "MARKETPLACE"
  | "THROTTLED"
  | "TIMEOUT"
  | "UNKNOWN";

export type Classified = { code: AwsErrorCode; fix: string; name: string };

/** Typed failure of an AI operation. `fix` is a one-line, secret-free instruction for a human. */
export class AiError extends Error {
  constructor(
    public code: AwsErrorCode | "NO_OBSERVER" | "BAD_MODEL_OUTPUT" | "UNSUPPORTED_IMAGE" | "AI_ENDPOINT",
    public fix: string,
  ) {
    super(`${code}: ${fix}`);
    this.name = "AiError";
  }
}

/** Map any AWS SDK error to a cause and a one-line fix. Order matters: specific messages first. */
export function classifyBedrockError(err: unknown): Classified {
  const e = (err ?? {}) as { name?: string; message?: string; code?: string; $metadata?: { httpStatusCode?: number } };
  const name = e.name ?? "Error";
  const msg = e.message ?? String(err);
  const status = e.$metadata?.httpStatusCode;
  const c = (code: AwsErrorCode, fix: string): Classified => ({ code, fix, name });

  if (
    /^(CredentialsProviderError|ExpiredTokenException|ExpiredToken|UnrecognizedClientException|InvalidClientTokenId|InvalidSignatureException|TokenProviderError)$/.test(name) ||
    /could not load credentials|token (is|has) expired|security token.*(invalid|expired)|session (is|has) expired|credential.*(missing|expired)/i.test(msg)
  )
    return c("CREDENTIALS", "AWS credentials are absent or expired. Run `aws login` and retry.");
  if (/^(ThrottlingException|TooManyRequestsException|ServiceQuotaExceededException)$/.test(name) || status === 429)
    return c("THROTTLED", "Throttled by AWS. Wait a minute and retry; check the Bedrock quotas for this model if it persists.");
  if (/operation not allowed/i.test(msg))
    return c("ACCOUNT_RESTRICTED", "Account-level Bedrock restriction (\"Operation not allowed\"). Only AWS Support can lift it; use Rekognition meanwhile (leave BEDROCK_MODEL_ID blank).");
  if (/use case details|use-case|first.time.use/i.test(msg))
    return c("USE_CASE_FORM", "Anthropic requires the one-time use-case form: Bedrock console > Model catalog > pick the Claude model > submit use case details. Or set BEDROCK_MODEL_ID to an Amazon Nova id.");
  if (/marketplace|subscription/i.test(msg))
    return c("MARKETPLACE", "The model needs an AWS Marketplace subscription: open the model in the Bedrock console once with a role that has aws-marketplace:Subscribe, or choose an Amazon Nova model.");
  if (/on-demand throughput|inference profile|(not|isn.t) (supported|available) in (this|the) region/i.test(msg))
    return c("REGION_OR_PROFILE", "This region does not serve the model on-demand. Use an inference profile id (for example an apac.* or global.* id) from `npm run verify:bedrock`.");
  if (name === "ResourceNotFoundException" || /model identifier is invalid|model.*not found|end of (its )?life|could not resolve the foundation model/i.test(msg))
    return c("MODEL_NOT_FOUND", "BEDROCK_MODEL_ID is wrong or retired. Unset it and run `npm run verify:bedrock` to list valid ids.");
  if (name === "AccessDeniedException" || status === 403 || /not authorized|don.t have access|access denied/i.test(msg))
    return c("ACCESS_DENIED", "IAM denies this call. Grant bedrock:InvokeModel (or rekognition:DetectLabels) to the caller, and check model access in the Bedrock console.");
  if (/^(TimeoutError|AbortError)$/.test(name) || /ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket hang up/i.test(`${msg} ${e.code ?? ""}`))
    return c("TIMEOUT", "Network timeout reaching AWS. Check connectivity and AWS_REGION, then retry.");
  return c("UNKNOWN", mask(`${name}: ${msg}`).slice(0, 240));
}

// ---------- identity ----------

export type Identity = { accountMasked: string; arnType: string; isRoot: boolean; region: string; requestId?: string };

/** Real STS GetCallerIdentity. The account id is masked to its last 4 digits before it leaves this function. */
export async function checkIdentity(): Promise<Identity> {
  const start = Date.now();
  try {
    const r = await sts().send(new GetCallerIdentityCommand({}));
    const resource = r.Arn?.split(":")[5] ?? "";
    const id: Identity = {
      accountMasked: mask(r.Account ?? ""),
      arnType: resource.split("/")[0] || "unknown",
      isRoot: resource === "root",
      region: serverEnv().AWS_REGION,
      requestId: r.$metadata.requestId,
    };
    logOp({ service: "sts", op: "GetCallerIdentity", requestId: id.requestId, durationMs: Date.now() - start, status: "ok", arnType: id.arnType });
    return id;
  } catch (err) {
    logOp({ service: "sts", op: "GetCallerIdentity", durationMs: Date.now() - start, status: "error", code: classifyBedrockError(err).code });
    throw err;
  }
}

// ---------- Bedrock Converse ----------

export const converseText = (r: ConverseCommandOutput) =>
  (r.output?.message?.content ?? []).map((b) => b.text ?? "").join("").trim();

/** One Converse call with a log line. `single` = no SDK retries (used by verify:bedrock). */
export async function converse(op: string, input: ConverseCommandInput, single = false): Promise<ConverseCommandOutput> {
  const client = single ? new BedrockRuntimeClient(clientConfig(1)) : bedrockRuntime();
  const start = Date.now();
  try {
    const r = await client.send(new ConverseCommand(input));
    logOp({
      service: "bedrock", op, requestId: r.$metadata.requestId, durationMs: Date.now() - start, status: "ok",
      observer: "bedrock", modelId: input.modelId, inputTokens: r.usage?.inputTokens, outputTokens: r.usage?.outputTokens,
    });
    return r;
  } catch (err) {
    const c = classifyBedrockError(err);
    logOp({
      service: "bedrock", op, requestId: (err as { $metadata?: { requestId?: string } }).$metadata?.requestId,
      durationMs: Date.now() - start, status: "error", observer: "bedrock", modelId: input.modelId, code: c.code, errorName: c.name,
    });
    throw err;
  }
}

// ---------- remote transport (AI_ENDPOINT_URL -> infra/ai-lambda) ----------

export const RemoteEvidenceRequestSchema = z.object({
  imageBase64: z.string().min(1),
  contentType: z.enum(ALLOWED_IMAGE_TYPES),
  text: z.string().max(1000).optional(),
});

/** POST to the deployed Lambda. Returns undefined when AI_ENDPOINT_URL is not set. */
export async function remote<T>(path: "/evidence" | "/ask" | "/health", body: unknown, schema: z.ZodType<T>): Promise<T | undefined> {
  const env = serverEnv();
  if (!env.AI_ENDPOINT_URL) return undefined;
  const start = Date.now();
  let status = 0;
  try {
    const res = await fetch(env.AI_ENDPOINT_URL.replace(/\/+$/, "") + path, {
      method: "POST",
      headers: { "content-type": "application/json", "x-aquapulse-secret": env.AI_ENDPOINT_SECRET ?? "" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(28_000),
    });
    status = res.status;
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const e = (json as { error?: { code?: string; message?: string } } | null)?.error;
      throw new AiError("AI_ENDPOINT", `AI endpoint returned ${res.status}${e?.code ? ` ${e.code}: ${e.message ?? ""}` : ""}`.slice(0, 240));
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw new AiError("AI_ENDPOINT", "AI endpoint returned a body that does not match the contract.");
    logOp({ service: "ai-endpoint", op: path, durationMs: Date.now() - start, status: "ok", httpStatus: status });
    return parsed.data;
  } catch (err) {
    logOp({ service: "ai-endpoint", op: path, durationMs: Date.now() - start, status: "error", httpStatus: status });
    if (err instanceof AiError) throw err;
    throw new AiError("AI_ENDPOINT", "AI endpoint unreachable or timed out. Check AI_ENDPOINT_URL and the Lambda logs.");
  }
}

// ---------- AI health ----------

/** Last observer that completed a REAL call in this process. Health reports PASS only from this. */
let lastOk: { observer: Observer; modelId?: string; at: string } | undefined;
let lastBedrockFailure: string | undefined;
export function markObserverOk(observer: Observer, modelId?: string) {
  lastOk = { observer, modelId, at: new Date().toISOString() };
  if (observer === "bedrock") lastBedrockFailure = undefined;
}
export function markBedrockFailed(code: string) {
  lastBedrockFailure = code;
}

const AwsAiHealthSchema = HealthResponseSchema.pick({ aws: true, ai: true });
export type AwsAiHealth = Pick<HealthResponse, "aws" | "ai">;

let awsCache: { at: number; value: HealthResponse["aws"] } | undefined;

/** `aws` = real STS call (cached 60 s). `ai` = which observer would run now; PASS only after a real success. */
export async function awsAiHealth(): Promise<AwsAiHealth> {
  const env = serverEnv();
  if (env.AI_ENDPOINT_URL) {
    try {
      return (await remote("/health", {}, AwsAiHealthSchema))!;
    } catch (err) {
      const detail = `via AI_ENDPOINT_URL: ${err instanceof AiError ? err.fix : "unreachable"}`;
      return { aws: { state: "FAIL", detail }, ai: { state: "FAIL", observer: "none", detail } };
    }
  }

  if (!awsCache || Date.now() - awsCache.at > 60_000) {
    let value: HealthResponse["aws"];
    try {
      const id = await checkIdentity();
      value = { state: "PASS", region: id.region, detail: `account ${id.accountMasked}, ${id.arnType}${id.isRoot ? " (root user: use an IAM role)" : ""}` };
    } catch (err) {
      value = { state: "FAIL", region: env.AWS_REGION, detail: classifyBedrockError(err).fix };
    }
    awsCache = { at: Date.now(), value };
  }
  const aws = awsCache.value;

  const configured: Observer | "none" = env.BEDROCK_MODEL_ID ? "bedrock" : aws.state === "PASS" ? "rekognition" : "none";
  let ai: HealthResponse["ai"];
  if (aws.state !== "PASS") {
    ai = { state: "FAIL", observer: configured, modelId: env.BEDROCK_MODEL_ID, detail: "No AWS identity, so no observer can run." };
  } else if (lastOk && (lastOk.observer === configured || lastBedrockFailure)) {
    // A real call succeeded. If Bedrock is configured but the last call fell back, say so and report what actually ran.
    ai = {
      state: "PASS", observer: lastOk.observer, modelId: lastOk.modelId,
      detail: `last real call ok at ${lastOk.at}` + (lastOk.observer !== configured ? `; Bedrock fell back (${lastBedrockFailure})` : ""),
    };
  } else {
    ai = { state: "UNVERIFIED", observer: configured, modelId: env.BEDROCK_MODEL_ID, detail: "No successful call in this process yet." };
  }
  return { aws, ai };
}

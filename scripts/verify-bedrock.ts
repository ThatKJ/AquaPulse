// npm run verify:bedrock — exactly ONE Bedrock inference attempt per run (no retries, no loop over models),
// then, only if that fails, ONE Rekognition DetectLabels call. Exit code is non-zero only if neither observer works.
import { crc32, deflateSync } from "node:zlib";
import { BedrockClient, ListFoundationModelsCommand, ListInferenceProfilesCommand } from "@aws-sdk/client-bedrock";
import { DetectLabelsCommand } from "@aws-sdk/client-rekognition";
import { classifyBedrockError, clientConfig, converse, converseText, rekognition } from "../lib/aws/clients";
import { serverEnv } from "../lib/schemas/env";
import { isMain, line, loadEnv, run, type Check } from "./_shared";
import { verifyAws } from "./verify-aws";

/** Lower sorts first: Anthropic Claude, then Amazon Nova, then anything else that takes images. */
function rank(id: string): number {
  if (/anthropic\.claude/.test(id)) return /sonnet/.test(id) ? 0 : /haiku/.test(id) ? 1 : 2;
  if (/amazon\.nova/.test(id)) return /lite/.test(id) ? 10 : /pro/.test(id) ? 11 : 12;
  return 20;
}

/** Control-plane listing only (no inference): ids in this region that accept image input and return text. */
export async function discoverModels(): Promise<string[]> {
  const bedrock = new BedrockClient(clientConfig());
  const fm = await bedrock.send(new ListFoundationModelsCommand({ byOutputModality: "TEXT" }));
  const models = (fm.modelSummaries ?? []).filter((m) => m.inputModalities?.includes("IMAGE") && m.modelLifecycle?.status !== "LEGACY");
  const imageIds = new Set(models.map((m) => m.modelId!));
  const ids = models.filter((m) => m.inferenceTypesSupported?.includes("ON_DEMAND")).map((m) => m.modelId!);

  let nextToken: string | undefined;
  do {
    const page = await bedrock.send(new ListInferenceProfilesCommand({ typeEquals: "SYSTEM_DEFINED", maxResults: 100, nextToken }));
    for (const p of page.inferenceProfileSummaries ?? [])
      if (p.status === "ACTIVE" && p.models?.some((m) => imageIds.has(m.modelArn?.split("/").pop() ?? ""))) ids.push(p.inferenceProfileId!);
    nextToken = page.nextToken;
  } while (nextToken);

  // ponytail: within a tier the id string sorts newest-first only roughly; pick by hand from the printed list if it matters.
  return [...new Set(ids)].sort((a, b) => rank(a) - rank(b) || b.localeCompare(a));
}

/** A valid 96x96 RGB gradient PNG built in memory (Rekognition needs at least 80x80). */
export function tinyPng(size = 96): Uint8Array {
  const raw = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) raw.set([x * 2, y * 2, 160], y * (1 + size * 3) + 1 + x * 3);
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const out = Buffer.alloc(8 + data.length + 4);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit, RGB
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
}

export async function verifyRekognition(): Promise<Check> {
  try {
    const r = await rekognition().send(new DetectLabelsCommand({ Image: { Bytes: tinyPng() }, MaxLabels: 5 }));
    return { state: "PASS", detail: `DetectLabels ok, ${r.Labels?.length ?? 0} labels, requestId ${r.$metadata.requestId}` };
  } catch (err) {
    const c = classifyBedrockError(err);
    return { state: "FAIL", detail: `${c.code}: ${c.fix}` };
  }
}

export type BedrockCheck = Check & { modelId?: string; requestId?: string; candidates?: string[] };

/** Resolve the model id (env, else discovery) and make the single Converse call. */
export async function verifyBedrock(): Promise<BedrockCheck> {
  let modelId = serverEnv().BEDROCK_MODEL_ID;
  let candidates: string[] | undefined;
  if (!modelId) {
    try {
      candidates = await discoverModels();
    } catch (err) {
      const c = classifyBedrockError(err);
      return { state: "FAIL", detail: `model discovery failed: ${c.code}: ${c.fix}` };
    }
    modelId = candidates[0];
    if (!modelId) return { state: "FAIL", candidates, detail: `No image-capable model or inference profile is listed in ${serverEnv().AWS_REGION}.` };
  }
  try {
    // Same inferenceConfig shape as the app, so a PASS here covers what the app sends.
    const r = await converse(
      "verify",
      { modelId, messages: [{ role: "user", content: [{ text: "Reply with the single word OK." }] }], inferenceConfig: { maxTokens: 10, temperature: 0 } },
      true,
    );
    if (!converseText(r)) return { state: "FAIL", modelId, candidates, detail: "Converse returned no text." };
    return { state: "PASS", modelId, candidates, requestId: r.$metadata.requestId, detail: `Converse ok on ${modelId}` };
  } catch (err) {
    const c = classifyBedrockError(err);
    return { state: "FAIL", modelId, candidates, detail: `${c.code}: ${c.fix}` };
  }
}

if (isMain("verify-bedrock.ts"))
  run(async () => {
    loadEnv();
    const region = serverEnv().AWS_REGION;
    const aws = await verifyAws();
    line("AWS identity", aws);
    if (aws.state !== "PASS") return 1; // neither observer can work without an identity
    console.log("AWS_IDENTITY_OK");

    const b = await verifyBedrock();
    if (b.candidates) {
      console.log(`BEDROCK_MODEL_ID is not set. Image-capable candidates in ${region} (best first):`);
      for (const id of b.candidates.slice(0, 15)) console.log(`  ${id}`);
    }
    line("Bedrock", b);
    if (b.state === "PASS") {
      console.log("BEDROCK_RUNTIME_OK");
      console.log(`MODEL=${b.modelId}`);
      console.log(`REGION=${region}`);
      console.log("RESPONSE_OK");
      console.log(`REQUEST_ID=${b.requestId}`);
      if (b.candidates) console.log(`Next: add BEDROCK_MODEL_ID=${b.modelId} to .env.local`);
      return 0;
    }
    if (b.modelId) console.log(`MODEL=${b.modelId} (the one attempt this run; to try another candidate set BEDROCK_MODEL_ID and run again)`);

    const r = await verifyRekognition();
    line("Rekognition", r);
    if (r.state === "PASS") {
      console.log("REKOGNITION_OK");
      console.log("The app will use Amazon Rekognition as the observer. Leave BEDROCK_MODEL_ID blank.");
      return 0;
    }
    return 1;
  });

// Amazon S3: Durable evidence storage for citizen-submitted and drone photos.
// Stores evidence with server-side encryption (AES256), content hashing, and metadata tags.
import { createHash } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { serverEnv } from "../schemas/env";
import { classifyBedrockError, logOp, s3Client, sniffImageType } from "./clients";

export type StoreEvidenceInput = {
  bytes: Uint8Array;
  contentType: string;
  incidentId?: string;
  reporterHash?: string;
};

export type StoreEvidenceResult = {
  bucket: string;
  key: string;
  s3Uri: string;
  sha256: string;
  sizeBytes: number;
};

/**
 * Uploads an image to the configured Amazon S3 evidence bucket (AWS_S3_EVIDENCE_BUCKET).
 * Returns undefined if AWS_S3_EVIDENCE_BUCKET is not configured.
 */
export async function storeEvidenceImage(input: StoreEvidenceInput): Promise<StoreEvidenceResult | undefined> {
  const env = serverEnv();
  const bucket = env.AWS_S3_EVIDENCE_BUCKET;
  if (!bucket) return undefined;

  const valid = sniffImageType(input.bytes);
  if (!valid || valid !== input.contentType) {
    throw new Error("Invalid image format or content-type mismatch for S3 upload.");
  }

  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const ext = input.contentType === "image/jpeg" ? "jpg" : input.contentType === "image/png" ? "png" : "webp";
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const prefix = input.incidentId ? `incidents/${input.incidentId}` : "unassigned";
  const key = `evidence/${prefix}/${timestamp}_${sha256.slice(0, 12)}.${ext}`;

  const start = Date.now();
  try {
    const cmd = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: input.bytes,
      ContentType: input.contentType,
      ServerSideEncryption: "AES256",
      Metadata: {
        "x-aquapulse-sha256": sha256,
        "x-aquapulse-incident": input.incidentId ?? "none",
        "x-aquapulse-reporter": input.reporterHash ?? "anonymous",
      },
    });

    const res = await s3Client().send(cmd);

    logOp({
      service: "s3",
      op: "PutObject",
      requestId: res.$metadata.requestId,
      durationMs: Date.now() - start,
      status: "ok",
      bucket,
      key,
      sizeBytes: input.bytes.length,
    });

    return {
      bucket,
      key,
      s3Uri: `s3://${bucket}/${key}`,
      sha256,
      sizeBytes: input.bytes.length,
    };
  } catch (err) {
    const classified = classifyBedrockError(err);
    logOp({
      service: "s3",
      op: "PutObject",
      requestId: (err as { $metadata?: { requestId?: string } })?.$metadata?.requestId,
      durationMs: Date.now() - start,
      status: "error",
      bucket,
      key,
      code: classified.code,
      errorName: classified.name,
    });
    throw err;
  }
}

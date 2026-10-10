import { analyzeEvidence } from "@/lib/aws/evidence";
import { EvidenceFieldsSchema, MAX_IMAGE_BYTES, type EvidenceResponse } from "@/lib/schemas/api";
import { assertImage, handle, HttpError, json, rateLimit } from "../_lib";

export const POST = handle("evidence", async (req, requestId) => {
  rateLimit(req);
  const start = Date.now();
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data"))
    throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Send multipart/form-data with an `image` file.");
  // Refuse obviously oversized bodies before buffering them (64 KB allowance for the other fields).
  if (Number(req.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES + 64 * 1024)
    throw new HttpError(413, "IMAGE_TOO_LARGE", `Upload exceeds the ${MAX_IMAGE_BYTES}-byte image limit.`);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError(400, "INVALID_FORM", "Body is not valid multipart/form-data.");
  }
  const str = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" && v !== "" ? v : undefined;
  };
  const fields = EvidenceFieldsSchema.safeParse({ text: str("text"), lat: str("lat"), lng: str("lng") });
  if (!fields.success)
    throw new HttpError(400, "INVALID_REQUEST", fields.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));

  const file = form.get("image");
  if (!(file instanceof File)) throw new HttpError(400, "IMAGE_REQUIRED", "The `image` file field is required.");
  if (file.size > MAX_IMAGE_BYTES) throw new HttpError(413, "IMAGE_TOO_LARGE", `Image is ${file.size} bytes; the limit is ${MAX_IMAGE_BYTES}.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = assertImage(bytes, file.type);

  const analysis = await analyzeEvidence({ bytes, contentType }, fields.data.text);
  const body: Omit<EvidenceResponse, "requestId"> = { durationMs: Date.now() - start, analysis };
  return json(requestId, body);
});

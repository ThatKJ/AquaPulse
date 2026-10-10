import { askGrounded } from "@/lib/aws/ask";
import { AskRequestSchema } from "@/lib/schemas/api";
import { handle, json, rateLimit, readJson } from "../_lib";

/** Serialized context cap. The whole body is capped slightly above it to leave room for the question. */
const MAX_CONTEXT_BYTES = 20 * 1024;

export const POST = handle("ask", async (req, requestId) => {
  rateLimit(req);
  const { question, context } = await readJson(req, AskRequestSchema, MAX_CONTEXT_BYTES + 2048);
  return json(requestId, await askGrounded(question, context));
});

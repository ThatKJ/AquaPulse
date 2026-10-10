import { repo } from "@/lib/db";
import { VerificationWebhookSchema } from "@/lib/schemas/api";
import { handle, json, readJson, requireWebhookSecret } from "../../_lib";

export const POST = handle("webhooks/verification", async (req, requestId) => {
  requireWebhookSecret(req);
  const v = await readJson(req, VerificationWebhookSchema);
  const saved = await repo().recordVerification(v);
  return json(requestId, {
    verificationId: saved.id,
    recorded: true,
    dispatched: 0,
    adapter: repo().adapter,
    // Reporter phone numbers are stored only as hashes, so this server cannot message them itself.
    detail: "Recorded only. No messages were sent: reporter numbers are stored hashed; n8n must do the outreach.",
  });
});

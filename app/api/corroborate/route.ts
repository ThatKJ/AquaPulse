import { connection } from "next/server";
import { z } from "zod";
import { corroborate } from "@/lib/national/corroborate";
import { nationalSnapshot } from "@/lib/national/store";
import { handle, HttpError, json, rateLimit } from "../_lib";

const Query = z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180), kind: z.enum(["flood", "scarcity"]) });

// Read-only: compares a reported location and type with the official conditions held in the database.
const run = handle("corroborate", async (req, requestId) => {
  rateLimit(req, 60);
  const q = Query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!q.success) throw new HttpError(400, "INVALID_REQUEST", "lat, lng and kind (flood or scarcity) are required.");
  const snapshot = await nationalSnapshot();
  if (!snapshot) throw new HttpError(503, "NOT_CONFIGURED", "The national layer is not configured on this server.");
  return json(requestId, { ...corroborate(q.data, snapshot), sources: snapshot.sources.map((s) => ({ name: s.name, freshness: s.freshness, lastSuccessAt: s.lastSuccessAt })) });
});

export async function GET(req: Request) {
  await connection();
  return run(req);
}

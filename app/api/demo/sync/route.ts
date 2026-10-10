import { z } from "zod";
import { playScenario } from "@/lib/demo";
import { repo } from "@/lib/db";
import { toStateSync } from "@/lib/db/mirror";
import { handle, json, rateLimit, readJson } from "../../_lib";

const Body = z.object({
  scenarioId: z.enum(["flood-cascade", "scarcity", "false-report"]),
  stepIndex: z.number().int().min(1).max(40),
});

// Public, but the caller supplies no state: only "which scenario, how many steps". The server replays the
// deterministic scenario itself and mirrors the result, so the only rows anyone can cause to be written are
// the fixed, known scenario states. Operator deviations from the script (a different bundle, a photo added
// as a report) are not mirrored.
export const POST = handle("demo/sync", async (req, requestId) => {
  rateLimit(req, 40);
  const { scenarioId, stepIndex } = await readJson(req, Body, 512);
  const written = await repo().syncState(toStateSync(playScenario(scenarioId, stepIndex)));
  return json(requestId, { adapter: repo().adapter, written });
});

// The engine: pure, deterministic, browser-safe. Everything the UI shows is computed here.
import type { Engine } from "@/lib/schemas/simulation";
import { fuse, scoreEvidence } from "@/lib/evidence";
import { allocateTankers, counterfactual, infraPriorities, runAuction } from "@/lib/optimization";
import { applyBundle, commitBundle, simulateBundle } from "@/lib/simulation/interventions";
import { predict } from "@/lib/simulation/predict";

export { CONFIG } from "@/lib/simulation/config";

export const engine: Engine = {
  predict, applyBundle, simulateBundle, runAuction, fuse, scoreEvidence, infraPriorities, counterfactual, allocateTankers, commitBundle,
};

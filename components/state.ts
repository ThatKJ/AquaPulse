import type { EvidenceEvent, WorldState } from "@/lib/schemas/domain";
import type { ActionBundle, Horizon, TankerAssignment } from "@/lib/schemas/simulation";
import { engine } from "@/lib/engine";
import { initialWorld, playStep, scenarios } from "@/lib/demo";

export type Mode = "combined" | "flood" | "scarcity" | "fix-first";
export type Panel = "incident" | "evidence" | "simulate" | "tankers" | "priorities" | null;

export type State = {
  world: WorldState;
  mode: Mode;
  horizon: Horizon;
  selectedIncidentId: string | null;
  selectedAssetId: string | null;
  /** Hovered or selected auction option; the map shows the world with it applied. */
  previewBundle: ActionBundle | null;
  /** World just before the last commit: the WITHOUT side once a bundle is applied. */
  committedBefore: WorldState | null;
  compare: "with" | "without";
  panel: Panel;
  tankerPlan: TankerAssignment[] | null;
  /** Inline error from an engine action. */
  notice: string | null;
  demo: {
    /** null = follow the ?demo=1 query param. */
    open: boolean | null;
    scenarioId: string | null;
    /** Number of steps already applied. */
    stepIndex: number;
    playing: boolean;
    speed: 1 | 4;
  };
};

export type Action =
  | { type: "SELECT_INCIDENT"; id: string | null }
  | { type: "SELECT_ASSET"; id: string | null }
  | { type: "SET_MODE"; mode: Mode }
  | { type: "SET_HORIZON"; horizon: Horizon }
  | { type: "SET_PANEL"; panel: Panel }
  | { type: "PREVIEW"; bundle: ActionBundle | null }
  | { type: "SET_COMPARE"; compare: "with" | "without" }
  | { type: "COMMIT"; bundle: ActionBundle }
  | { type: "OPTIMIZE_TANKERS" }
  | { type: "FUSE"; event: EvidenceEvent }
  | { type: "DEMO_OPEN"; open: boolean }
  | { type: "DEMO_SCENARIO"; id: string }
  | { type: "DEMO_PLAY"; playing: boolean }
  | { type: "DEMO_SPEED"; speed: 1 | 4 }
  | { type: "DEMO_NEXT" }
  | { type: "RESET" };

/**
 * Engine calls go through here so a missing or throwing engine function gives a
 * panel its empty state instead of taking the page down.
 */
export function safe<T>(fn: () => T): T | null {
  try {
    return fn() ?? null;
  } catch {
    return null;
  }
}

export function initialState(): State {
  return {
    world: initialWorld(),
    mode: "combined",
    horizon: 0,
    selectedIncidentId: null,
    selectedAssetId: null,
    previewBundle: null,
    committedBefore: null,
    compare: "with",
    panel: null,
    tankerPlan: null,
    notice: null,
    demo: { open: null, scenarioId: null, stepIndex: 0, playing: false, speed: 1 },
  };
}

const panelForMode = (mode: Mode, incidentId: string | null): Panel =>
  mode === "scarcity" ? "tankers" : mode === "fix-first" ? "priorities" : incidentId ? "incident" : null;

export const currentScenario = (s: State) => scenarios.find((x) => x.id === s.demo.scenarioId) ?? scenarios[0];

export function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "SELECT_INCIDENT":
      return {
        ...s,
        selectedIncidentId: a.id,
        previewBundle: null,
        panel: a.id ? "incident" : panelForMode(s.mode, null),
      };
    case "SELECT_ASSET":
      return { ...s, selectedAssetId: a.id };
    case "SET_MODE":
      return { ...s, mode: a.mode, previewBundle: null, panel: panelForMode(a.mode, s.selectedIncidentId) };
    case "SET_HORIZON":
      return { ...s, horizon: a.horizon };
    case "SET_PANEL":
      return {
        ...s,
        panel: a.panel,
        previewBundle: a.panel === "simulate" ? s.previewBundle : null,
        // An intervention cannot change NOW, so the simulation opens on a future horizon.
        horizon: a.panel === "simulate" && s.horizon === 0 ? 30 : s.horizon,
      };
    case "PREVIEW":
      return { ...s, previewBundle: a.bundle, compare: "with" };
    case "SET_COMPARE":
      return { ...s, compare: a.compare };
    case "COMMIT": {
      const id = s.selectedIncidentId;
      const next = id ? safe(() => engine.commitBundle(s.world, id, a.bundle)) : null;
      if (!next) return { ...s, notice: `Engine: could not apply "${a.bundle.label}".` };
      return {
        ...s,
        world: next,
        committedBefore: s.world,
        previewBundle: null,
        compare: "with",
        tankerPlan: null,
        notice: null,
        panel: "incident",
      };
    }
    case "OPTIMIZE_TANKERS": {
      const plan = safe(() => engine.allocateTankers(s.world));
      return { ...s, tankerPlan: plan, notice: plan ? null : "Engine: tanker allocation is unavailable." };
    }
    case "FUSE": {
      const next = safe(() => engine.fuse(s.world, a.event));
      return next ? { ...s, world: next, notice: null } : { ...s, notice: "Engine: could not add the report." };
    }
    case "DEMO_OPEN":
      return { ...s, demo: { ...s.demo, open: a.open, playing: a.open && s.demo.playing } };
    case "DEMO_SCENARIO":
      return { ...initialState(), demo: { ...s.demo, scenarioId: a.id, stepIndex: 0, playing: false } };
    case "DEMO_PLAY":
      return { ...s, demo: { ...s.demo, playing: a.playing } };
    case "DEMO_SPEED":
      return { ...s, demo: { ...s.demo, speed: a.speed } };
    case "DEMO_NEXT": {
      const step = currentScenario(s)?.steps[s.demo.stepIndex];
      if (!step) return { ...s, demo: { ...s.demo, playing: false } };
      const world = safe(() => playStep(s.world, step));
      if (!world) {
        return { ...s, notice: `Demo: step "${step.label}" failed to apply.`, demo: { ...s.demo, playing: false } };
      }
      const f = step.focus ?? {};
      const mode = f.mode ?? s.mode;
      const selectedIncidentId = f.incidentId ?? s.selectedIncidentId;
      const panel: Panel =
        f.openPanel ?? (f.incidentId ? "incident" : f.mode ? panelForMode(mode, selectedIncidentId) : s.panel);
      const horizon: Horizon = panel === "simulate" && !f.horizon && !s.horizon ? 30 : (f.horizon ?? s.horizon);
      const committed = world.interventionRecords.length > s.world.interventionRecords.length;
      // Hands-free playback: a step that opens the auction previews its winner, one that opens tankers draws the plan.
      const winner =
        f.openPanel === "simulate" && selectedIncidentId && !committed
          ? safe(() => engine.runAuction(world, selectedIncidentId, horizon).options[0]?.bundle)
          : null;
      return {
        ...s,
        world,
        mode,
        selectedIncidentId,
        panel,
        horizon,
        previewBundle: winner,
        tankerPlan: f.openPanel === "tankers" ? safe(() => engine.allocateTankers(world)) : null,
        notice: null,
        // A step that commits an intervention keeps the pre-commit world for WITHOUT / WITH.
        committedBefore: committed ? s.world : null,
        compare: "with",
        demo: { ...s.demo, stepIndex: s.demo.stepIndex + 1 },
      };
    }
    case "RESET":
      return { ...initialState(), demo: { ...s.demo, stepIndex: 0, playing: false } };
  }
}

"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useReducer, useState, useSyncExternalStore } from "react";
import { engine } from "@/lib/engine";
import { HORIZONS } from "@/lib/schemas/simulation";
import { BottomStrip, DEMO_H, STRIP_COLLAPSED_H, STRIP_H, type Domain } from "./BottomStrip";
import { CityPulse } from "./CityPulse";
import { Header } from "./Header";
import { IncidentDrawer } from "./IncidentDrawer";
import { FixFirstPanel, ScarcityPanel } from "./ModePanels";
import { currentScenario, initialState, reducer, safe } from "./state";
import { LiveReports } from "./LiveReports";

// MapLibre and deck.gl need WebGL and window: client only. The dark surface shows until they load.
const MapView = dynamic(() => import("./map/MapView"), { ssr: false });

const noSubscribe = () => () => {};
const demoQuery = () => new URLSearchParams(window.location.search).get("demo") === "1";
// ?scenario=flood|scarcity|false-report preselects a demo scenario.
const SCENARIO_PARAM: Record<string, string> = { flood: "flood-cascade", scarcity: "scarcity", "false-report": "false-report" };
const scenarioQuery = () => SCENARIO_PARAM[new URLSearchParams(window.location.search).get("scenario") ?? ""] ?? null;

export function Shell() {
  const [s, dispatch] = useReducer(reducer, undefined, initialState);
  const demoParam = useSyncExternalStore(noSubscribe, demoQuery, () => false);
  const scenarioParam = useSyncExternalStore(noSubscribe, scenarioQuery, () => null);
  const demoOpen = s.demo.open ?? (demoParam || scenarioParam != null);
  useEffect(() => {
    if (scenarioParam) dispatch({ type: "DEMO_SCENARIO", id: scenarioParam });
  }, [scenarioParam]);
  const { world, horizon } = s;
  const hi = HORIZONS.indexOf(horizon);

  // Mirror the demo's progress to the server (Supabase when configured). The browser sends only the scenario id
  // and step count; the server replays the deterministic scenario and writes the rows itself.
  // Debounced and best-effort: the console never depends on it.
  const mirrorScenario = currentScenario(s)?.id;
  const mirrorStep = s.demo.stepIndex;
  useEffect(() => {
    if (!mirrorScenario || mirrorStep < 1) return;
    const t = setTimeout(() => {
      fetch("/api/demo/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenarioId: mirrorScenario, stepIndex: mirrorStep }) }).catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [mirrorScenario, mirrorStep]);

  // Demo shortcuts: Space = play/pause, ArrowRight = next event, R = reset. Ignored while a control has focus.
  const playing = s.demo.playing;
  useEffect(() => {
    if (!demoOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || (el && el !== document.body && el.closest("input, textarea, select, button, [role=radio], [contenteditable]"))) return;
      if (e.code === "Space") dispatch({ type: "DEMO_PLAY", playing: !playing });
      else if (e.key === "ArrowRight") dispatch({ type: "DEMO_NEXT" });
      else if (e.key === "r" || e.key === "R") dispatch({ type: "RESET" });
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [demoOpen, playing]);

  // WITHOUT side: the world before the previewed or applied bundle. WITH side: the world with it.
  const comparable = s.previewBundle != null || s.committedBefore != null;
  const baseWorld = s.previewBundle ? world : (s.committedBefore ?? world);
  const withWorld = useMemo(
    () => (s.previewBundle ? (safe(() => engine.applyBundle(world, s.previewBundle!)) ?? world) : world),
    [world, s.previewBundle],
  );
  const comparing = comparable && s.compare === "with";
  const shownWorld = comparing ? withWorld : baseWorld;
  const basePreds = useMemo(() => HORIZONS.map((h) => safe(() => engine.predict(baseWorld, h))), [baseWorld]);
  const shownPreds = useMemo(
    () => (shownWorld === baseWorld ? basePreds : HORIZONS.map((h) => safe(() => engine.predict(shownWorld, h)))),
    [shownWorld, baseWorld, basePreds],
  );

  const incident = world.incidents.find((i) => i.id === s.selectedIncidentId) ?? null;
  const incidentId = incident?.id;
  const auction = useMemo(
    () => (incidentId ? safe(() => engine.runAuction(world, incidentId, horizon || 30)) : null),
    [world, incidentId, horizon],
  );
  const counterfactual = useMemo(() => (incidentId ? safe(() => engine.counterfactual(world, incidentId, 30)) : null), [world, incidentId]);
  const fixFirst = s.mode === "fix-first";
  const priorities = useMemo(() => (fixFirst ? safe(() => engine.infraPriorities(world)) : null), [world, fixFirst]);
  // The people-figure follows the mode, or the selected incident's kind when the mode is combined.
  const domain: Domain = s.mode === "flood" || s.mode === "scarcity" ? s.mode : s.mode === "combined" && incident ? incident.kind : "combined";

  // ponytail: fixed 4 s per step at 1x; give DemoStep a duration if scenes need their own pacing.
  useEffect(() => {
    if (!s.demo.playing) return;
    const id = setInterval(() => dispatch({ type: "DEMO_NEXT" }), 4000 / s.demo.speed);
    return () => clearInterval(id);
  }, [s.demo.playing, s.demo.speed]);

  /** Compact snapshot of engine output: the only facts /api/ask may use. Keys match lib/aws/ask.ts. */
  const getContext = () => ({
    scenarioClockMin: world.tMin,
    mode: s.mode,
    horizonMin: horizon,
    incident: incident && { ...incident, evidenceIds: undefined },
    contributors: incident ? basePreds[0]?.cells[incident.cellId]?.contributors.slice(0, 5) : undefined,
    counterfactual,
    now: basePreds[0]?.totals,
    in30: basePreds[2]?.totals,
    totalsPerHorizon: HORIZONS.map((h, i) => ({ horizonMin: h, ...basePreds[i]?.totals })),
    auction,
    fixFirst: (safe(() => engine.infraPriorities(world)) ?? []).slice(0, 5).map((p) => ({ ...p, factors: undefined })),
    tankers: s.tankerPlan ?? safe(() => engine.allocateTankers(world)),
  });

  const drawer = s.panel === "tankers" || s.panel === "priorities" ? s.panel : s.panel && incident ? "incident" : null;
  const right = drawer ? 380 : 0;
  // Outside a demo, with no incident to scrub or read about, the strip is one line so the map keeps the space.
  const [stripOpen, setStripOpen] = useState<boolean | null>(null);
  const stripCollapsed = !(stripOpen ?? (demoOpen || world.incidents.length > 0));
  const bottom = (stripCollapsed ? STRIP_COLLAPSED_H : STRIP_H) + (demoOpen ? DEMO_H : 0);
  const padding = useMemo(() => ({ top: 48, left: 248, right, bottom }), [right, bottom]);
  const selectIncident = (id: string | null) => dispatch({ type: "SELECT_INCIDENT", id });

  return (
    <main className="relative h-full w-full overflow-hidden bg-surface">
      <MapView
        world={shownWorld}
        prediction={shownPreds[hi]}
        baseline={basePreds[hi]}
        mode={s.mode}
        horizon={horizon}
        selectedIncidentId={s.selectedIncidentId}
        selectedAssetId={s.selectedAssetId}
        priorities={priorities}
        tankerPlan={s.tankerPlan}
        padding={padding}
        onSelectIncident={selectIncident}
        onSelectAsset={(id) => dispatch({ type: "SELECT_ASSET", id })}
      />
      <LiveReports world={world} dispatch={dispatch} />
      <Header getContext={getContext} hasIncident={incident != null} demoOpen={demoOpen} onToggleDemo={() => dispatch({ type: "DEMO_OPEN", open: !demoOpen })} />
      <CityPulse
        bottom={bottom}
        world={world}
        shown={shownPreds[hi]}
        baseline={basePreds[hi]}
        comparing={comparing}
        horizon={horizon}
        mode={s.mode}
        domain={domain}
        topPriority={priorities?.[0] ?? null}
        selectedIncidentId={s.selectedIncidentId}
        onMode={(mode) => dispatch({ type: "SET_MODE", mode })}
        onSelectIncident={selectIncident}
      />
      <BottomStrip
        collapsed={stripCollapsed}
        onToggle={() => setStripOpen(stripCollapsed)}
        world={world}
        horizon={horizon}
        preds={shownPreds}
        basePreds={basePreds}
        comparing={comparing}
        domain={domain}
        fixFirst={fixFirst}
        comparison={comparable ? (s.previewBundle?.label ?? world.interventionRecords.at(-1)?.bundle.label ?? "Applied intervention") : null}
        compare={s.compare}
        notice={s.notice}
        demo={s.demo}
        demoOpen={demoOpen}
        scenario={currentScenario(s)}
        left={0}
        right={right}
        onHorizon={(h) => dispatch({ type: "SET_HORIZON", horizon: h })}
        onCompare={(compare) => dispatch({ type: "SET_COMPARE", compare })}
        onSelectIncident={selectIncident}
        demoActions={{
          onScenario: (id) => dispatch({ type: "DEMO_SCENARIO", id }),
          onPlay: (playing) => dispatch({ type: "DEMO_PLAY", playing }),
          onNext: () => dispatch({ type: "DEMO_NEXT" }),
          onReset: () => dispatch({ type: "RESET" }),
          onSpeed: (speed) => dispatch({ type: "DEMO_SPEED", speed }),
        }}
      />
      {drawer === "tankers" && (
        <ScarcityPanel world={world} prediction={shownPreds[hi]} horizon={horizon} plan={s.tankerPlan} onOptimize={() => dispatch({ type: "OPTIMIZE_TANKERS" })} />
      )}
      {drawer === "priorities" && (
        <FixFirstPanel world={world} priorities={priorities} selectedAssetId={s.selectedAssetId} onSelectAsset={(id) => dispatch({ type: "SELECT_ASSET", id })} />
      )}
      {drawer === "incident" && incident && (
        <IncidentDrawer
          key={incident.id}
          world={world}
          incident={incident}
          scoreHistory={s.scoreHistory[incident.id]}
          panel={s.panel}
          horizon={horizon}
          basePreds={basePreds}
          shownPreds={shownPreds}
          comparing={comparing}
          auction={auction}
          counterfactual={counterfactual}
          onPanel={(panel) => dispatch({ type: "SET_PANEL", panel })}
          onClose={() => selectIncident(null)}
          onPreview={(bundle) => dispatch({ type: "PREVIEW", bundle })}
          onCommit={(bundle) => dispatch({ type: "COMMIT", bundle })}
          onAddReport={(event) => dispatch({ type: "FUSE", event })}
        />
      )}
    </main>
  );
}

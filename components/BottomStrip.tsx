"use client";

import { AnimatePresence, motion } from "motion/react";
import { Pause, Play, RotateCcw, SkipForward, TriangleAlert } from "lucide-react";
import type { StreamEntry, WorldState } from "@/lib/schemas/domain";
import { HORIZONS, type DemoScenario, type Horizon, type Prediction } from "@/lib/schemas/simulation";
import { scenarios } from "@/lib/demo";
import type { State } from "./state";
import { Empty, Label, ProvTag, Segmented, Tag, clock, fmt, horizonLabel, iconBtn } from "./ui";

export const STRIP_H = 184;
export const DEMO_H = 68;

function DemoControls({
  demo,
  scenario,
  onScenario,
  onPlay,
  onNext,
  onReset,
  onSpeed,
}: {
  demo: State["demo"];
  scenario: DemoScenario | undefined;
  onScenario: (id: string) => void;
  onPlay: (playing: boolean) => void;
  onNext: () => void;
  onReset: () => void;
  onSpeed: (s: 1 | 4) => void;
}) {
  const total = scenario?.steps.length ?? 0;
  const done = demo.stepIndex >= total;
  const last = scenario?.steps[demo.stepIndex - 1];
  return (
    <div className="flex flex-col justify-center gap-1.5 border-b border-hairline px-4" style={{ height: DEMO_H }} role="group" aria-label="Demo controls">
     <div className="flex items-center gap-2">
      <Label>Demo</Label>
      {scenarios.length === 0 ? (
        <span className="text-[13px] text-faint">No scenarios are loaded yet. They appear here when the demo data is ready.</span>
      ) : (
        <>
          <select
            aria-label="Scenario"
            value={scenario?.id ?? ""}
            onChange={(e) => onScenario(e.target.value)}
            className="h-7 border border-hairline bg-panel px-2 text-[13px] text-ink"
          >
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button type="button" className={iconBtn} disabled={done} onClick={() => onPlay(!demo.playing)} aria-label={demo.playing ? "Pause" : "Play"}>
            {demo.playing ? <Pause size={13} aria-hidden /> : <Play size={13} aria-hidden />}
          </button>
          <button type="button" className={iconBtn} disabled={done} onClick={onNext} aria-label="Next event">
            <SkipForward size={13} aria-hidden />
          </button>
          <button type="button" className={iconBtn} onClick={onReset} aria-label="Reset scenario">
            <RotateCcw size={13} aria-hidden />
          </button>
          <Segmented
            label="Playback speed"
            value={demo.speed}
            onChange={onSpeed}
            className="h-7 w-[72px]"
            options={[
              { value: 1, label: "1x" },
              { value: 4, label: "4x" },
            ]}
          />
          <span className="tabular text-[11px] text-muted">
            {demo.stepIndex} / {total}
          </span>
          <span className="min-w-0 truncate text-[13px] font-medium text-ink">{last?.label}</span>
        </>
      )}
     </div>
      {scenarios.length > 0 && (
        <p className="truncate text-[13px] text-muted" aria-live="polite" title={last?.narration}>
          {last ? last.narration : `Press Play or Next event to start ${scenario?.name ?? "the scenario"}.`}
        </p>
      )}
    </div>
  );
}

function StreamRow({ e, onSelect }: { e: StreamEntry; onSelect: (id: string) => void }) {
  const body = (
    <>
      <span className="tabular w-12 shrink-0 text-[11px] text-faint">{clock(e.tMin)}</span>
      <span className="w-[88px] shrink-0 truncate text-[11px] uppercase tracking-[0.06em] text-muted">{e.kind === "recommendation" ? "recommend" : e.kind}</span>
      <span className="min-w-0 flex-1 truncate text-[13px] text-ink" title={e.detail ? `${e.title} — ${e.detail}` : e.title}>
        {e.title}
        {e.detail && <span className="text-muted"> — {e.detail}</span>}
      </span>
      <ProvTag p={e.provenance} />
    </>
  );
  const cls = "flex h-7 w-full items-center gap-3 px-4 text-left";
  return (
    <motion.li initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: "easeOut" }}>
      {e.incidentId ? (
        <button type="button" onClick={() => onSelect(e.incidentId!)} className={`${cls} transition-colors duration-150 hover:bg-panel-raised`}>
          {body}
        </button>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </motion.li>
  );
}

export function BottomStrip({
  world,
  horizon,
  preds,
  comparison,
  compare,
  notice,
  demo,
  demoOpen,
  scenario,
  left,
  right,
  onHorizon,
  onCompare,
  onSelectIncident,
  demoActions,
}: {
  world: WorldState;
  horizon: Horizon;
  /** Shown prediction per horizon, same order as HORIZONS. */
  preds: (Prediction | null)[];
  /** Label of the intervention being compared, or null when there is nothing to compare. */
  comparison: string | null;
  compare: "with" | "without";
  notice: string | null;
  demo: State["demo"];
  demoOpen: boolean;
  scenario: DemoScenario | undefined;
  left: number;
  right: number;
  onHorizon: (h: Horizon) => void;
  onCompare: (c: "with" | "without") => void;
  onSelectIncident: (id: string) => void;
  demoActions: Omit<Parameters<typeof DemoControls>[0], "demo" | "scenario">;
}) {
  // Newest first; entries with the same minute keep their insertion order reversed.
  const stream = world.stream.map((e, i) => ({ e, i })).sort((a, b) => b.e.tMin - a.e.tMin || b.i - a.i);
  return (
    <div className="absolute bottom-0 z-10 border-t border-hairline bg-panel" style={{ left, right }}>
      {demoOpen && <DemoControls demo={demo} scenario={scenario} {...demoActions} />}
      <div className="flex" style={{ height: STRIP_H }}>
        <section aria-label="Timeline" className="flex w-[336px] shrink-0 flex-col gap-2 border-r border-hairline px-4 py-3">
          <div className="flex items-center justify-between">
            <Label>Timeline</Label>
            <span className="tabular text-[11px] text-muted">Scenario clock {clock(world.tMin)}</span>
          </div>
          <Segmented
            label="Prediction horizon"
            value={horizon}
            onChange={onHorizon}
            options={HORIZONS.map((h, i) => ({
              value: h,
              label: h === 0 ? "NOW" : `${horizonLabel(h)}m`,
              sub: preds[i] ? `est. ${fmt(preds[i]!.totals.exposedPopulation)}` : "—",
            }))}
          />
          <p className="flex items-center gap-1.5 text-[11px] text-faint">
            <span aria-hidden className={`h-2.5 w-2.5 border ${horizon > 0 ? "border-dashed border-predicted" : "border-faint"}`} />
            {horizon > 0 ? "Violet outline = predicted. Figures: est. exposed." : "Current state. Figures: est. people exposed."}
          </p>
          {comparison && (
            <div>
              <Segmented
                label="Intervention comparison"
                value={compare}
                onChange={onCompare}
                options={[
                  { value: "without", label: "Without" },
                  { value: "with", label: "With intervention" },
                ]}
              />
              <p className="mt-1 truncate text-[11px] text-muted">{comparison}</p>
            </div>
          )}
          {notice && (
            <p role="alert" className="flex items-center gap-1.5 text-[11px] text-ink">
              <TriangleAlert size={12} aria-hidden className="shrink-0 text-flood-mid" />
              {notice}
            </p>
          )}
        </section>

        <section aria-label="Live intelligence stream" className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between px-4 pb-1 pt-3">
            <Label>Live intelligence stream</Label>
            <Tag>{world.stream.length} events</Tag>
          </div>
          <ul aria-live="polite" aria-relevant="additions" className="min-h-0 flex-1 overflow-y-auto pb-1">
            {stream.length === 0 && (
              <li className="px-4">
                <Empty>Reports, AI analyses, predictions and actions appear here as they happen. Start a demo scenario to see the loop run.</Empty>
              </li>
            )}
            <AnimatePresence initial={false}>
              {stream.map(({ e }) => (
                <StreamRow key={e.id} e={e} onSelect={onSelectIncident} />
              ))}
            </AnimatePresence>
          </ul>
        </section>
      </div>
    </div>
  );
}

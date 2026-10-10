"use client";

import { AnimatePresence, motion } from "motion/react";
import { Pause, Play, RotateCcw, SkipForward, TriangleAlert } from "lucide-react";
import type { StreamEntry, WorldState } from "@/lib/schemas/domain";
import { HORIZONS, type DemoScenario, type Horizon, type Prediction, type PredictionTotals } from "@/lib/schemas/simulation";
import { scenarios } from "@/lib/demo";
import type { State } from "./state";
import { PREDICTED, bandCss, riskBand, type RiskDomain } from "./risk";
import { Empty, Label, ProvTag, Segmented, Tag, clock, fmt, horizonLabel, iconBtn } from "./ui";

export const STRIP_H = 184;
export const DEMO_H = 37;

/** Which people-figure the app is talking about: follows the mode, or the selected incident's kind. */
export type Domain = RiskDomain | "combined";
export const figureOf = (t: PredictionTotals, d: Domain) =>
  d === "flood" ? t.exposedPopulation : d === "scarcity" ? t.populationShort : t.exposedPopulation + t.populationShort;
export const FIGURE_LABEL: Record<Domain, string> = { flood: "est. exposed", scarcity: "est. short of water", combined: "est. people affected" };
/** Peak risk in the domain; combined takes the worse of the two. */
export const peakOf = (t: PredictionTotals, d: Domain): { risk: number; domain: RiskDomain } =>
  d === "flood" || (d === "combined" && t.maxFloodRisk >= t.maxScarcityRisk)
    ? { risk: t.maxFloodRisk, domain: "flood" }
    : { risk: t.maxScarcityRisk, domain: "scarcity" };

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
  const btn = `${iconBtn} !h-6 !w-6`;
  return (
    <div className="flex items-center gap-2 border-b border-hairline px-4 text-[11px]" style={{ height: DEMO_H }} role="group" aria-label="Demo controls">
      <Label>Demo</Label>
      {scenarios.length === 0 ? (
        <span className="text-faint">No scenarios are loaded yet.</span>
      ) : (
        <>
          <select
            aria-label="Scenario"
            title="Scenario"
            value={scenario?.id ?? ""}
            onChange={(e) => onScenario(e.target.value)}
            className="h-6 max-w-[240px] border border-hairline bg-panel px-1.5 text-[11px] text-ink"
          >
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button type="button" className={btn} onClick={onReset} aria-label="Reset scenario" title="Reset scenario">
            <RotateCcw size={12} aria-hidden />
          </button>
          <button type="button" className={btn} disabled={done} onClick={() => onPlay(!demo.playing)} aria-label={demo.playing ? "Pause" : "Play"} title={demo.playing ? "Pause" : "Play"}>
            {demo.playing ? <Pause size={12} aria-hidden /> : <Play size={12} aria-hidden />}
          </button>
          <button type="button" className={btn} disabled={done} onClick={onNext} aria-label="Next event" title="Next event">
            <SkipForward size={12} aria-hidden />
          </button>
          <Segmented
            label="Playback speed"
            value={demo.speed}
            onChange={onSpeed}
            className="h-6 w-[64px]"
            options={[
              { value: 1, label: "1x" },
              { value: 4, label: "4x" },
            ]}
          />
          <span className="tabular shrink-0 text-muted">
            {demo.stepIndex} / {total}
          </span>
          <p className="min-w-0 flex-1 truncate text-[13px] text-muted" aria-live="polite" title={last?.narration}>
            {last ? (
              <>
                <span className="font-medium text-ink">{last.label}</span> · {last.narration}
              </>
            ) : (
              `Press Play or Next event to start ${scenario?.name ?? "the scenario"}.`
            )}
          </p>
        </>
      )}
    </div>
  );
}

/** A real time axis: four engine-computed stops, no in-between frames. */
function Timeline({
  horizon,
  preds,
  basePreds,
  comparing,
  domain,
  onHorizon,
}: {
  horizon: Horizon;
  preds: (Prediction | null)[];
  basePreds: (Prediction | null)[];
  comparing: boolean;
  domain: Domain;
  onHorizon: (h: Horizon) => void;
}) {
  const fig = preds.map((p) => (p ? figureOf(p.totals, domain) : null));
  const ghost = comparing ? basePreds.map((p) => (p ? figureOf(p.totals, domain) : null)) : null;
  const max = Math.max(1, ...[...fig, ...(ghost ?? [])].map((v) => v ?? 0));
  const h100 = (v: number | null) => `${Math.max(4, ((v ?? 0) / max) * 100)}%`;
  const move = (e: React.KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = (i + d + HORIZONS.length) % HORIZONS.length;
    onHorizon(HORIZONS[next]);
    (e.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
  };
  return (
    <div role="radiogroup" aria-label="Prediction horizon" className="grid grid-cols-4">
      {HORIZONS.map((h, i) => {
        const on = h === horizon;
        const p = preds[i];
        const peak = p ? peakOf(p.totals, domain) : null;
        const label = h === 0 ? "NOW" : `${horizonLabel(h)}m`;
        return (
          <button
            key={h}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={`${label}${h ? " predicted" : ""}: ${FIGURE_LABEL[domain]} ${fig[i] == null ? "unavailable" : fmt(fig[i]!)}${peak ? `, peak risk ${riskBand(peak.risk).label}` : ""}`}
            tabIndex={on ? 0 : -1}
            onClick={() => onHorizon(h)}
            onKeyDown={(e) => move(e, i)}
            className={`flex flex-col items-center pb-1 pt-1.5 transition-colors duration-150 focus-visible:z-10 ${on ? "bg-panel-raised" : "hover:bg-panel-raised/50"}`}
          >
            <span className="relative flex h-11 w-full items-end justify-center" aria-hidden>
              {ghost && <span className="absolute bottom-0 w-[18px] border border-b-0 border-muted" style={{ height: h100(ghost[i]) }} />}
              <span
                className="relative w-2.5 transition-[height] duration-300 ease-out"
                style={{
                  height: h100(fig[i]),
                  background: peak ? bandCss(peak.risk, peak.domain) : "var(--color-faint)",
                  outline: h > 0 ? `1px dashed rgb(${PREDICTED.join(" ")})` : undefined,
                  outlineOffset: 1,
                }}
              />
            </span>
            <span className={`relative h-2 w-full border-t ${on ? "border-ink" : "border-hairline"}`} aria-hidden>
              <span className={`absolute left-1/2 top-0 w-px ${on ? "h-2 bg-ink" : "h-1.5 bg-faint"}`} />
            </span>
            <span className={`tabular text-[11px] uppercase tracking-[0.06em] ${on ? "font-medium text-ink" : h > 0 ? "text-predicted" : "text-muted"}`}>{label}</span>
            <span className={`tabular text-[11px] ${on ? "text-ink" : "text-muted"}`}>{fig[i] == null ? "—" : fmt(fig[i]!)}</span>
          </button>
        );
      })}
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
  basePreds,
  comparing,
  domain,
  fixFirst,
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
  /** Without-intervention prediction per horizon. */
  basePreds: (Prediction | null)[];
  /** True while the WITH side of a comparison is on screen. */
  comparing: boolean;
  domain: Domain;
  fixFirst: boolean;
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
        <section aria-label="Timeline" className="flex w-[336px] shrink-0 flex-col gap-1.5 border-r border-hairline px-4 py-3">
          <div className="flex items-center justify-between">
            <Label>{fixFirst ? "Prevention" : "Timeline"}</Label>
            <span className="tabular text-[11px] text-muted">Scenario clock {clock(world.tMin)}</span>
          </div>
          {fixFirst ? (
            <p className="text-[13px] leading-snug text-muted">
              Emergency response fixes today. <span className="text-ink">AquaPulse learns what Bengaluru should fix permanently.</span>
            </p>
          ) : (
            <>
              <Timeline horizon={horizon} preds={preds} basePreds={basePreds} comparing={comparing} domain={domain} onHorizon={onHorizon} />
              {!comparison && <p className="truncate text-[11px] text-faint">{FIGURE_LABEL[domain]} · bar colour = peak risk band</p>}
              {comparison && (
                <div title={comparison}>
                  <Segmented
                    label={`Intervention comparison: ${comparison}`}
                    value={compare}
                    onChange={onCompare}
                    options={[
                      { value: "without", label: "Without" },
                      { value: "with", label: "With intervention" },
                    ]}
                  />
                </div>
              )}
            </>
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

"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowDown, ArrowUp, CircleCheck, CircleDashed, CircleDot, CircleX, TriangleAlert } from "lucide-react";
import { EvidenceResponseSchema, MAX_IMAGE_BYTES } from "@/lib/schemas/api";
import type { EvidenceEvent, Incident, WorldState } from "@/lib/schemas/domain";
import type { EvidenceAnalysis, EvidenceScore, ScoreComponentKey } from "@/lib/schemas/evidence";
import { VERDICT_LABEL } from "../risk";
import type { ScorePoint } from "../state";
import { Empty, Label, ProvTag, Section, Tag, btnSecondary, clock, fmt, human, pct } from "../ui";
import { Meter, State } from "./bits";

const STATUS_ICON = { pass: CircleCheck, warn: TriangleAlert, fail: CircleX } as const;
const STATUS_TONE = { pass: "text-verified", warn: "text-flood-mid", fail: "text-flood-high" } as const;
const VERDICTS = ["hold", "verify", "escalate"] as const;
const VERDICT_ICON = { hold: CircleDashed, verify: CircleDot, escalate: CircleCheck } as const;
const VERDICT_TONE = { hold: "text-muted", verify: "text-flood-mid", escalate: "text-verified" } as const;

export function Verdict({ verdict }: { verdict: EvidenceScore["verdict"] }) {
  return (
    <State icon={VERDICT_ICON[verdict]} tone={VERDICT_TONE[verdict]}>
      {VERDICT_LABEL[verdict]}
    </State>
  );
}

// Plain-language reading of a component that did not pass. Wording only: the status is the engine's.
const WEAK: Record<ScoreComponentKey, string> = {
  independent_confirmations: "insufficient corroboration",
  ai_confidence: "low visual confidence",
  gps_consistency: "location does not match",
  time_consistency: "timing does not match",
  duplicate_check: "possible duplicate report",
  validator: "not confirmed by a validator",
  weather_consistency: "no supporting weather signal",
  infrastructure_correlation: "no supporting infrastructure signal",
};

/** Why an incident is held, from its failing components (or the warned ones when nothing outright fails). */
export function heldReason(score: EvidenceScore): string {
  const by = (status: "fail" | "warn") => score.components.filter((c) => c.status === status).sort((a, b) => b.weight - a.weight);
  const weak = (by("fail").length ? by("fail") : by("warn")).map((c) => c.key);
  const both = weak.includes("weather_consistency") && weak.includes("infrastructure_correlation");
  const parts = weak
    .filter((k) => !(both && k === "infrastructure_correlation"))
    .map((k) => (both && k === "weather_consistency" ? "no supporting weather or infrastructure signal" : WEAK[k]));
  // The three heaviest reasons: the component rows below list the rest.
  const line = parts.slice(0, 3).join(" · ");
  return line.charAt(0).toUpperCase() + line.slice(1);
}

function HistoryStrip({ points }: { points: ScorePoint[] }) {
  const reduce = useReducedMotion();
  // Steps that existed when the strip mounted never animate; only one that arrives later steps in, once.
  const [seen] = useState(points.length);
  const from = Math.max(0, points.length - 6);
  const cur = points[points.length - 1];
  const prev = points[points.length - 2];
  const Dir = prev && cur.total < prev.total ? ArrowDown : ArrowUp;
  return (
    <div className="mt-3 border-t border-hairline pt-3">
      <div className="flex items-start gap-3">
        <div className="space-y-1 text-[11px] leading-[18px] text-faint">
          <div>Score</div>
          <div>Reports</div>
        </div>
        <ol className="tabular flex min-w-0 flex-1 gap-2.5 text-[13px] leading-[18px]" aria-label="Evidence Score over time">
          {points.slice(from).map((p, i) => {
            const idx = from + i;
            const last = idx === points.length - 1;
            return (
              <motion.li
                key={idx}
                initial={last && idx >= seen && !reduce ? { opacity: 0, y: 6 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="flex flex-col items-end gap-1"
              >
                <span className={last ? "font-medium text-ink" : "text-muted"}>
                  {i > 0 && <span className="pr-2.5 text-faint">→</span>}
                  {Math.round(p.total)}
                </span>
                <span className="text-[11px] text-faint">{p.reports}</span>
              </motion.li>
            );
          })}
        </ol>
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-[13px] text-muted">
        {prev && (
          <span className="tabular inline-flex items-center gap-1 text-ink">
            {Math.round(prev.total)}
            <Dir size={12} aria-label={Dir === ArrowDown ? "down to" : "up to"} />
            {Math.round(cur.total)}
            <span className="text-muted">·</span>
          </span>
        )}
        {cur.reason}
        <span className="tabular text-[11px] text-faint">{clock(cur.tMin)}</span>
      </p>
    </div>
  );
}

/** The VERIFY step: score, status, how it got there, and every component that produced it. */
export function EvidenceScorePanel({ incident, world, history }: { incident: Incident; world: WorldState; history?: ScorePoint[] }) {
  const score = incident.evidenceScore;
  if (!score) {
    return (
      <Section title="Confidence · AquaPulse Evidence Score">
        <Empty>This incident has not been scored yet. A score appears once reports are fused.</Empty>
      </Section>
    );
  }
  const at = VERDICTS.indexOf(score.verdict);
  const contradictions = world.relationships.filter((r) => r.relation === "CONTRADICTS" && (r.to === incident.id || r.from === incident.id)).length;
  const components = [...score.components].sort((a, b) => b.weight - a.weight);
  const ContraIcon = contradictions ? TriangleAlert : CircleCheck;
  return (
    <Section title="Confidence · AquaPulse Evidence Score" aside={<Tag title="Computed by the AquaPulse engine">DERIVED</Tag>}>
      <div className="flex items-end justify-between gap-3">
        <p className="tabular text-[36px] font-medium leading-none text-ink">
          {Math.round(score.total)}
          <span className="text-[15px] font-normal text-muted"> / 100</span>
        </p>
        <div className="pb-0.5 text-right">
          <Verdict verdict={score.verdict} />
          <p className="tabular text-[11px] text-faint">
            {incident.evidenceIds.length} {incident.evidenceIds.length === 1 ? "report" : "reports"}
          </p>
        </div>
      </div>

      <ol className="mt-3 grid grid-cols-3 gap-1" aria-label="Verification status">
        {VERDICTS.map((v, i) => (
          <li key={v} aria-current={i === at ? "step" : undefined}>
            <div className={`h-1 transition-colors duration-200 ${i <= at ? "bg-ink" : "bg-hairline"}`} />
            <div className={`mt-1 text-[11px] uppercase tracking-[0.06em] ${i === at ? "font-medium text-ink" : "text-faint"}`}>
              {i === at && <span aria-hidden>▸ </span>}
              {VERDICT_LABEL[v]}
            </div>
          </li>
        ))}
      </ol>

      {score.verdict === "hold" && (
        <div className="mt-3 border-t border-hairline pt-3 text-[13px] leading-snug">
          <p className="text-ink">Held as low-confidence evidence. Not escalated.</p>
          <p className="mt-0.5 text-muted">{heldReason(score)}</p>
        </div>
      )}

      {history && history.length > 0 && <HistoryStrip points={history} />}

      <ul className="mt-3 space-y-1.5 border-t border-hairline pt-3">
        {components.map((c) => {
          const Icon = STATUS_ICON[c.status];
          return (
            <li key={c.key} className="grid grid-cols-[13px_minmax(0,1fr)_44px_128px] items-center gap-x-2 text-[13px]">
              <Icon size={13} aria-label={c.status} className={STATUS_TONE[c.status]} />
              <span className="truncate text-muted" title={`${c.label} · weight ${pct(c.weight)}`}>
                {c.label}
              </span>
              <Meter value={c.value / 100} />
              <span className="tabular truncate text-right text-ink">{c.display}</span>
            </li>
          );
        })}
        <li className="grid grid-cols-[13px_minmax(0,1fr)_84px] items-center gap-x-2 text-[13px]">
          <ContraIcon size={13} aria-label={contradictions ? "warn" : "pass"} className={contradictions ? "text-flood-mid" : "text-verified"} />
          <span className="truncate text-muted">Contradictions</span>
          <span className="tabular text-right text-ink">{contradictions}</span>
        </li>
      </ul>
      <p className="mt-2 text-[11px] text-faint">Ordered by weight. Bars show each component on 0–100.</p>
    </Section>
  );
}

/** Which observer produced an analysis. A recorded fixture never sits under a live badge. */
function SourceBadge({ a }: { a: EvidenceAnalysis }) {
  return a.source === "fixture" ? (
    <>
      <Tag>Recorded analysis</Tag>
      <Tag title="Recorded for the demo, not a live model call">SIM</Tag>
    </>
  ) : (
    <Tag title={a.modelId} className="text-ink">
      {a.source === "bedrock" ? "Bedrock" : "Rekognition"} · live
    </Tag>
  );
}

function AnalysisLine({ a }: { a: EvidenceAnalysis }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        <SourceBadge a={a} />
        <span className="tabular text-[11px] text-muted">
          {human(a.incidentType)} · severity {a.severity}/10 · confidence {pct(a.confidence)}
        </span>
      </div>
      <p className="mt-1 text-[13px] leading-snug text-muted">{a.summary}</p>
    </>
  );
}

export function EvidenceItem({ e }: { e: EvidenceEvent }) {
  const a = e.analysis;
  return (
    <li className="border-t border-hairline py-3 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.06em] text-muted">
        <span>{e.channel}</span>
        <span className="tabular">{clock(e.tMin)}</span>
        <span className="tabular text-faint">{e.id}</span>
        <span className="flex-1" />
        <ProvTag p={e.provenance} />
      </div>
      {e.text && <p className="mt-1 text-[13px] leading-snug text-ink">“{e.text}”</p>}
      <p className="tabular mt-1 text-[11px] text-faint">
        reporter trust {pct(e.reporterTrust)}
        {e.locationAccuracyM != null && ` · GPS ±${fmt(e.locationAccuracyM)} m`}
        {e.mediaUrl && " · photo attached"}
      </p>
      {a && (
        <div className="mt-2">
          <AnalysisLine a={a} />
          <p className="tabular mt-1 text-[11px] text-faint">
            blockage {pct(a.blockageProbability)} · structural damage {pct(a.structuralDamageProbability)} · spam {pct(a.spamProbability)}
            {a.estimatedWaterDepthCm && ` · depth est. ${a.estimatedWaterDepthCm.min}–${a.estimatedWaterDepthCm.max} cm`}
          </p>
          {(a.observations.length > 0 || a.materialsObserved.length > 0) && (
            <details className="mt-1 text-[13px] text-muted">
              <summary className="cursor-pointer text-[11px] text-muted transition-colors duration-150 hover:text-ink">
                {a.observations.length} {a.observations.length === 1 ? "observation" : "observations"}
              </summary>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 leading-snug">
                {a.observations.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
              {a.materialsObserved.length > 0 && <p className="mt-1 text-[11px] text-faint">Materials: {a.materialsObserved.join(", ")}</p>}
            </details>
          )}
        </div>
      )}
    </li>
  );
}

type Upload = { status: "idle" } | { status: "loading" } | { status: "error"; message: string } | { status: "done"; analysis: EvidenceAnalysis };

/** Sends one photo to /api/evidence and shows what came back. Nothing enters the world until the user adds it. */
export function AnalyzePhoto({ incident, onAdd }: { incident: Incident; onAdd: (a: EvidenceAnalysis, text: string) => void }) {
  const [up, setUp] = useState<Upload>({ status: "idle" });
  async function send(file: File | undefined) {
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type)) return setUp({ status: "error", message: "only JPEG and PNG are accepted" });
    if (file.size > MAX_IMAGE_BYTES) return setUp({ status: "error", message: "the photo is larger than 4 MB" });
    setUp({ status: "loading" });
    try {
      const body = new FormData();
      body.set("image", file);
      body.set("lat", String(incident.location.lat));
      body.set("lng", String(incident.location.lng));
      const r = await fetch("/api/evidence", { method: "POST", body });
      if (!r.ok) throw new Error(`/api/evidence returned ${r.status}`);
      const parsed = EvidenceResponseSchema.safeParse(await r.json());
      if (!parsed.success) throw new Error("/api/evidence returned an unexpected shape");
      setUp({ status: "done", analysis: parsed.data.analysis });
    } catch (e) {
      setUp({ status: "error", message: e instanceof Error ? e.message : "upload failed" });
    }
  }
  return (
    <Section title="Analyze a photo">
      <label className="block text-[11px] text-faint">
        JPEG or PNG, up to 4 MB.
        <input
          type="file"
          accept="image/jpeg,image/png"
          disabled={up.status === "loading"}
          onChange={(e) => void send(e.target.files?.[0])}
          className="mt-1.5 block w-full text-[13px] text-muted file:mr-3 file:h-8 file:border file:border-solid file:border-hairline file:bg-transparent file:px-3 file:text-[11px] file:uppercase file:tracking-[0.06em] file:text-ink"
        />
      </label>
      <div aria-live="polite">
        {up.status === "loading" && <p className="mt-2 text-[13px] text-muted">Analyzing photo…</p>}
        {up.status === "error" && (
          <p role="alert" className="mt-2 flex items-start gap-1.5 text-[13px] text-ink">
            <TriangleAlert size={13} aria-hidden className="mt-0.5 shrink-0 text-flood-mid" />
            Evidence analysis: {up.message}. Nothing was added.
          </p>
        )}
        {up.status === "done" && (
          <div className="mt-3 border-t border-hairline pt-3">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <Label>Result · not part of the incident yet</Label>
              {up.analysis.validHazard ? (
                <State icon={CircleCheck} tone="text-verified">
                  Valid hazard
                </State>
              ) : (
                <State icon={CircleX} tone="text-muted">
                  No hazard found
                </State>
              )}
            </div>
            <AnalysisLine a={up.analysis} />
            <button
              type="button"
              className={`${btnSecondary} mt-3`}
              onClick={() => {
                onAdd(up.analysis, "Photo uploaded by operator");
                setUp({ status: "idle" });
              }}
            >
              Add as report
            </button>
          </div>
        )}
      </div>
    </Section>
  );
}

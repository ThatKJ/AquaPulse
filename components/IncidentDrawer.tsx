"use client";

import { useState } from "react";
import { EvidenceResponseSchema, MAX_IMAGE_BYTES } from "@/lib/schemas/api";
import { ArrowDown, ArrowLeft, ArrowUp, Award, CircleCheck, CircleX, Minus, TriangleAlert, X } from "lucide-react";
import type { EvidenceEvent, Incident, WorldState } from "@/lib/schemas/domain";
import type { EvidenceAnalysis, ScoreComponent } from "@/lib/schemas/evidence";
import {
  HORIZONS,
  type ActionBundle,
  type AuctionOption,
  type AuctionResult,
  type Counterfactual,
  type Horizon,
  type Prediction,
} from "@/lib/schemas/simulation";
import type { Panel } from "./state";
import { AnimatedNumber, Empty, Label, ProvTag, Section, Sparkline, Tag, btnPrimary, btnSecondary, clock, fmt, horizonLabel, human, iconBtn, pct } from "./ui";

const STATUS_ICON = { pass: CircleCheck, warn: TriangleAlert, fail: CircleX } as const;
const STATUS_TONE = { pass: "text-verified", warn: "text-flood-mid", fail: "text-flood-high" } as const;
const SOURCE_LABEL = { bedrock: "Bedrock", rekognition: "Rekognition", fixture: "Recorded analysis" } as const;
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${fmt(Math.abs(n))}`;

function ScoreRow({ c }: { c: ScoreComponent }) {
  const Icon = STATUS_ICON[c.status];
  return (
    <li className="flex items-center gap-2 py-[3px] text-[13px]">
      <Icon size={13} aria-label={c.status} className={`shrink-0 ${STATUS_TONE[c.status]}`} />
      <span className="min-w-0 flex-1 truncate text-muted">{c.label}</span>
      <span className="tabular text-ink">{c.display}</span>
    </li>
  );
}

function EvidenceItem({ e, full }: { e: EvidenceEvent; full: boolean }) {
  const a = e.analysis;
  return (
    <li className="border-t border-hairline py-2.5 first:border-t-0 first:pt-0">
      <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-[0.06em] text-muted">
        <span className="tabular">{e.id}</span>
        <span>{e.channel}</span>
        <span className="tabular">{clock(e.tMin)}</span>
        <span className="flex-1" />
        <ProvTag p={e.provenance} />
      </div>
      {e.text && <p className="text-[13px] leading-snug text-ink">“{e.text}”</p>}
      <p className="tabular mt-1 text-[11px] text-faint">
        Reporter trust {pct(e.reporterTrust)}
        {e.locationAccuracyM != null && ` · GPS ±${fmt(e.locationAccuracyM)} m`}
      </p>
      {full && <p className="mt-0.5 text-[11px] text-faint">{e.mediaUrl ? "Photo attached" : "No photo attached"}</p>}
      {a ? (
        <div className="mt-2 border-l border-hairline pl-2.5">
          <div className="mb-1 flex items-center gap-2">
            <Tag title={a.modelId}>{SOURCE_LABEL[a.source]}</Tag>
            <span className="tabular text-[11px] text-muted">
              {human(a.incidentType)} · severity {a.severity}/10 · confidence {pct(a.confidence)}
            </span>
          </div>
          <p className="text-[13px] leading-snug text-muted">{a.summary}</p>
          {full && (
            <>
              {a.observations.length > 0 && (
                <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[13px] leading-snug text-muted">
                  {a.observations.map((o) => (
                    <li key={o}>{o}</li>
                  ))}
                </ul>
              )}
              <p className="tabular mt-1.5 text-[11px] text-faint">
                Blockage {pct(a.blockageProbability)} · structural damage {pct(a.structuralDamageProbability)} · spam {pct(a.spamProbability)}
                {a.estimatedWaterDepthCm && ` · depth est. ${a.estimatedWaterDepthCm.min}–${a.estimatedWaterDepthCm.max} cm`}
              </p>
              {a.materialsObserved.length > 0 && <p className="mt-0.5 text-[11px] text-faint">Materials: {a.materialsObserved.join(", ")}</p>}
            </>
          )}
        </div>
      ) : (
        <p className="mt-1 text-[11px] text-faint">No AI analysis attached to this report.</p>
      )}
    </li>
  );
}

type Upload = { status: "idle" } | { status: "loading" } | { status: "error"; message: string } | { status: "done"; analysis: EvidenceAnalysis };

/** Sends one photo to /api/evidence and shows what came back. Nothing enters the world until the user adds it. */
function AnalyzePhoto({ incident, onAdd }: { incident: Incident; onAdd: (a: EvidenceAnalysis, text: string) => void }) {
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
        JPEG or PNG, up to 4 MB. WebP is not accepted.
        <input
          type="file"
          accept="image/jpeg,image/png"
          disabled={up.status === "loading"}
          onChange={(e) => void send(e.target.files?.[0])}
          className="mt-1.5 block w-full text-[13px] text-muted file:mr-3 file:h-8 file:border file:border-solid file:border-hairline file:bg-transparent file:px-3 file:text-[11px] file:uppercase file:tracking-[0.06em] file:text-ink"
        />
      </label>
      <div aria-live="polite" className="mt-2">
        {up.status === "loading" && <p className="text-[13px] text-muted">Analyzing photo…</p>}
        {up.status === "error" && (
          <p role="alert" className="flex items-start gap-1.5 text-[13px] text-ink">
            <TriangleAlert size={13} aria-hidden className="mt-0.5 shrink-0 text-flood-mid" />
            Evidence analysis: {up.message}. Nothing was added.
          </p>
        )}
        {up.status === "done" && (
          <div className="border-l border-hairline pl-2.5">
            <div className="mb-1 flex items-center gap-2">
              <Tag title={up.analysis.modelId}>{SOURCE_LABEL[up.analysis.source]}</Tag>
              <span className="tabular text-[11px] text-muted">
                {human(up.analysis.incidentType)} · severity {up.analysis.severity}/10 · confidence {pct(up.analysis.confidence)}
              </span>
            </div>
            <p className="text-[13px] leading-snug text-muted">{up.analysis.summary}</p>
            <p className="mt-1 text-[11px] text-faint">Not part of the incident yet.</p>
            <button
              type="button"
              className={`${btnSecondary} mt-2`}
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

function Option({
  o,
  winner,
  selected,
  horizon,
  noun,
  facilityName,
  onPreview,
  onSelect,
}: {
  noun: string;
  o: AuctionOption;
  winner: boolean;
  selected: boolean;
  horizon: Horizon;
  facilityName: (id: string) => string;
  onPreview: (b: ActionBundle | null) => void;
  onSelect: () => void;
}) {
  const { outcome: out } = o;
  const down = out.exposureChangePct <= 0;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      onMouseEnter={() => onPreview(o.bundle)}
      onFocus={() => onPreview(o.bundle)}
      className={`block w-full border-l-2 px-4 py-3 text-left transition-colors duration-150 hover:bg-panel-raised ${
        selected ? "border-ink bg-panel-raised" : "border-transparent"
      }`}
    >
      <div className="flex items-start gap-2">
        <span className="tabular mt-px text-[13px] text-faint">{o.rank}</span>
        <span className="min-w-0 flex-1 text-[13px] font-medium leading-snug text-ink">{o.bundle.label}</span>
        {winner && (
          <Tag className="text-ink">
            <Award size={11} aria-hidden />
            Recommended
          </Tag>
        )}
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-3 pl-4">
        <span className="tabular text-[13px] text-muted">
          est. {fmt(out.baselineExposure)} → <span className="text-[15px] text-ink">est. {fmt(out.exposure)}</span> {noun}
        </span>
        <span className="tabular flex items-center gap-0.5 text-[15px] text-ink">
          {down ? <ArrowDown size={13} aria-label="down" /> : <ArrowUp size={13} aria-label="up" />}
          {Math.abs(Math.round(out.exposureChangePct))}%
        </span>
      </div>
      <dl className="tabular mt-2 grid grid-cols-3 gap-x-3 pl-4 text-[13px]">
        <div>
          <dt className="font-sans text-[11px] text-faint">Cost proxy</dt>
          <dd className="text-ink">₹{out.costProxyLakh.toFixed(1)} L</dd>
        </div>
        <div>
          <dt className="font-sans text-[11px] text-faint">Response</dt>
          <dd className="text-ink">{Math.round(out.responseTimeMin)} min</dd>
        </div>
        <div>
          <dt className="font-sans text-[11px] text-faint">Facilities protected</dt>
          <dd className="truncate text-ink" title={out.facilitiesProtected.map(facilityName).join(", ")}>
            {out.facilitiesProtected.length}
          </dd>
        </div>
      </dl>
      <dl className="tabular ml-4 mt-2 grid grid-cols-3 gap-x-3 border-t border-hairline pt-2 text-[13px]">
        <div>
          <dt className="font-sans text-[11px] text-faint">Equity score</dt>
          <dd className="text-ink">{Math.round(out.equityScore)}/100</dd>
        </div>
        <div className="col-span-2">
          <dt className="font-sans text-[11px] text-faint">Vulnerable-area exposure</dt>
          <dd className="text-ink">{signed(out.vulnerableExposureChange)}</dd>
        </div>
      </dl>
      {out.deficitReductionLiters > 0 && (
        <p className="tabular mt-1 pl-4 text-[11px] text-muted">Deficit removed est. {fmt(out.deficitReductionLiters)} L</p>
      )}
      <span className="sr-only">Predicted at +{horizon} minutes</span>
    </button>
  );
}

export function IncidentDrawer({
  world,
  incident,
  panel,
  horizon,
  basePreds,
  shownPreds,
  comparing,
  auction,
  counterfactual,
  onPanel,
  onClose,
  onPreview,
  onCommit,
  onAddReport,
}: {
  onAddReport: (e: EvidenceEvent) => void;
  world: WorldState;
  incident: Incident;
  panel: Panel;
  horizon: Horizon;
  /** Without-intervention prediction per horizon. */
  basePreds: (Prediction | null)[];
  /** Prediction per horizon as shown on the map. */
  shownPreds: (Prediction | null)[];
  comparing: boolean;
  auction: AuctionResult | null;
  counterfactual: Counterfactual | null;
  onPanel: (p: Panel) => void;
  onClose: () => void;
  onPreview: (b: ActionBundle | null) => void;
  onCommit: (b: ActionBundle) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const hi = HORIZONS.indexOf(horizon);
  const riskAt = (p: Prediction | null) => {
    const c = p?.cells[incident.cellId];
    return c ? (incident.kind === "flood" ? c.floodRisk : c.scarcityRisk) : null;
  };
  const cell = shownPreds[hi]?.cells[incident.cellId];
  const risk = riskAt(shownPreds[hi]);
  const score = incident.evidenceScore;
  const evidence = world.evidence.filter((e) => incident.evidenceIds.includes(e.id));
  const asset = world.assets.find((a) => a.id === incident.suspectedAssetId);
  const facilityName = (id: string) => world.facilities.find((f) => f.id === id)?.name ?? id;
  const flagged = shownPreds[hi]?.totals[incident.kind === "flood" ? "facilitiesAtRisk" : "facilitiesShort"] ?? [];
  const records = world.interventionRecords.filter((r) => r.incidentId === incident.id);
  const winner = auction?.options[0];
  // The engine counts flood-exposed plus water-short people in auction exposure.
  const noun = incident.kind === "flood" ? "exposed" : "people affected";
  const alerts = world.alerts.filter((a) => a.incidentId === incident.id);
  const chosen = auction?.options.find((o) => o.bundle.id === picked) ?? winner;

  // Strongest probability per cause across every analysed report.
  const causes = new Map<string, { probability: number; rationale: string }>();
  for (const e of evidence)
    for (const c of e.analysis?.likelyCauses ?? [])
      if ((causes.get(c.cause)?.probability ?? -1) < c.probability) causes.set(c.cause, c);
  const topCauses = [...causes.entries()].sort((a, b) => b[1].probability - a[1].probability).slice(0, 3);

  const baseSeries = basePreds.map(riskAt);
  const shownSeries = shownPreds.map(riskAt);
  const hasSeries = baseSeries.every((v) => v != null);
  const TrendIcon = cell?.trend === "rising" ? ArrowUp : cell?.trend === "falling" ? ArrowDown : Minus;

  return (
    <aside aria-label={`Incident ${incident.id}`} className="absolute bottom-0 right-0 top-12 z-10 flex w-[380px] flex-col border-l border-hairline bg-panel">
      <header className="flex items-center gap-2 px-4 py-3">
        {panel !== "incident" && (
          <button type="button" className={iconBtn} onClick={() => onPanel("incident")} aria-label="Back to incident">
            <ArrowLeft size={14} aria-hidden />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-medium text-ink">
            <span className="tabular">{incident.id}</span> · {panel === "simulate" ? "Intervention simulation" : panel === "evidence" ? "Evidence" : human(incident.type)}
          </h2>
          <p className="text-[11px] uppercase tracking-[0.06em] text-muted">
            {incident.kind} · {incident.status} · severity <span className="tabular">{incident.severity}/10</span>
          </p>
        </div>
        <ProvTag p={incident.provenance} />
        <button type="button" className={iconBtn} onClick={onClose} aria-label="Close incident drawer">
          <X size={14} aria-hidden />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {panel === "simulate" ? (
          <>
            <section className="border-t border-hairline px-4 py-3">
              <div className="flex items-center justify-between">
                <Label>Baseline · no action · {horizonLabel(horizon)}m</Label>
                <Tag title="Computed by the AquaPulse engine">DERIVED</Tag>
              </div>
              {auction?.options.length ? (
                <>
                  <p className="tabular mt-1 text-[32px] font-medium leading-none text-ink">
                    <span className="text-[15px] text-muted">est. </span>
                    <AnimatedNumber value={auction.baselineExposure} />
                    <span className="font-sans text-[13px] font-normal text-muted"> {noun}</span>
                  </p>
                  <p className="tabular mt-1.5 text-[11px] text-faint">
                    {auction.evaluated} feasible bundles simulated · top {auction.options.length} shown
                  </p>
                </>
              ) : (
                <Empty>The engine returned no intervention options for this incident yet.</Empty>
              )}
            </section>
            {auction && auction.options.length > 0 && (
              <div
                role="radiogroup"
                aria-label="Intervention options"
                className="divide-y divide-hairline border-t border-hairline"
                onMouseLeave={() => onPreview(auction.options.find((o) => o.bundle.id === picked)?.bundle ?? null)}
              >
                {auction.options.map((o) => (
                  <Option
                    key={o.bundle.id}
                    o={o}
                    winner={o === winner}
                    selected={o.bundle.id === picked}
                    horizon={horizon}
                    noun={noun}
                    facilityName={facilityName}
                    onPreview={onPreview}
                    onSelect={() => {
                      setPicked(o.bundle.id);
                      onPreview(o.bundle);
                    }}
                  />
                ))}
              </div>
            )}
            {auction && auction.winnerReasons.length > 0 && (
              <Section title={`Why ${winner?.bundle.label ?? "option 1"} ranks first`}>
                <ul className="list-disc space-y-1 pl-4 text-[13px] leading-snug text-muted">
                  {auction.winnerReasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </Section>
            )}
          </>
        ) : panel === "evidence" ? (
          <>
            <section className="border-t border-hairline px-4 py-3">
              {evidence.length ? (
                <ul>
                  {evidence.map((e) => (
                    <EvidenceItem key={e.id} e={e} full />
                  ))}
                </ul>
              ) : (
                <Empty>No reports are attached to this incident yet.</Empty>
              )}
            </section>
            <AnalyzePhoto
              incident={incident}
              onAdd={(analysis, text) =>
                onAddReport({
                  id: `E-LIVE-${world.evidence.length + 1}`,
                  tMin: world.tMin,
                  channel: "web",
                  reporterId: "operator",
                  reporterTrust: 0.5, // ponytail: neutral prior for an operator upload; take it from a reporter record once those exist
                  text,
                  location: incident.location,
                  analysis,
                  provenance: "LIVE",
                })
              }
            />
          </>
        ) : (
          <>
            <section className="flex items-end justify-between gap-4 border-t border-hairline px-4 py-3">
              <div>
                <Label>
                  {incident.kind} risk · {horizonLabel(horizon)}
                  {horizon ? "m predicted" : ""}
                  {comparing ? " · with intervention" : ""}
                </Label>
                {risk != null ? (
                  <p className="tabular mt-1 text-[40px] font-medium leading-none text-ink">
                    <AnimatedNumber value={risk} />
                    <span className="text-[15px] text-muted">%</span>
                  </p>
                ) : (
                  <Empty>No prediction for this cell yet.</Empty>
                )}
              </div>
              {cell && (
                <dl className="tabular space-y-0.5 pb-0.5 text-right text-[13px]">
                  <div className="flex items-center justify-end gap-1 text-muted">
                    <TrendIcon size={12} aria-hidden />
                    {cell.trend}
                  </div>
                  <div className="text-muted">
                    confidence <span className="text-ink">{pct(cell.confidence)}</span>
                  </div>
                </dl>
              )}
            </section>

            <Section
              title="Evidence score"
              aside={score && <Tag className={score.verdict === "escalate" ? "text-ink" : ""}>{score.verdict}</Tag>}
            >
              {score ? (
                <>
                  <p className="tabular mb-1.5 text-[15px] text-ink">
                    {Math.round(score.total)}
                    <span className="text-[11px] text-faint"> / 100</span>
                  </p>
                  <ul>
                    {score.components.map((c) => (
                      <ScoreRow key={c.key} c={c} />
                    ))}
                  </ul>
                </>
              ) : (
                <Empty>This incident has not been scored yet. A score appears once reports are fused.</Empty>
              )}
            </Section>

            <Section title="Likely cause">
              {asset ? (
                <p className="flex items-center justify-between gap-2 text-[13px] text-ink">
                  <span className="min-w-0 truncate">
                    <span className="tabular">{asset.id}</span> · {asset.name}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span className="tabular text-[11px] text-muted">condition {pct(asset.condition)}</span>
                    <ProvTag p={asset.provenance} />
                  </span>
                </p>
              ) : (
                <Empty>No infrastructure asset is suspected yet.</Empty>
              )}
              {topCauses.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {topCauses.map(([cause, c]) => (
                    <li key={cause} className="text-[13px] leading-snug">
                      <div className="flex justify-between gap-2">
                        <span className="text-ink">{human(cause)}</span>
                        <span className="tabular text-muted">{pct(c.probability)}</span>
                      </div>
                      <p className="text-muted">{c.rationale}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Who is affected">
              {cell ? (
                <p className="tabular text-[13px] text-ink">
                  est. {fmt(incident.kind === "flood" ? cell.exposedPopulation : cell.populationShort)}
                  <span className="font-sans text-muted"> {incident.kind === "flood" ? "people exposed" : "people short of water"} in this cell</span>
                </p>
              ) : (
                <Empty>No exposure estimate yet.</Empty>
              )}
              {flagged.length > 0 ? (
                <ul className="mt-1.5 space-y-0.5 text-[13px] text-muted">
                  {flagged.slice(0, 5).map((id) => (
                    <li key={id} className="flex items-center gap-1.5">
                      <TriangleAlert size={12} aria-hidden className="shrink-0 text-flood-mid" />
                      <span className="truncate">{facilityName(id)}</span>
                    </li>
                  ))}
                  {flagged.length > 5 && <li className="tabular text-[11px] text-faint">+{flagged.length - 5} more</li>}
                </ul>
              ) : (
                <p className="mt-1 text-[13px] text-faint">No critical facility {incident.kind === "flood" ? "at flood risk" : "short of water"} at this horizon.</p>
              )}
            </Section>

            <Section title="Risk trajectory" aside={comparing ? <span className="text-[11px] text-faint">dashed = without intervention</span> : undefined}>
              {hasSeries ? (
                <>
                  <Sparkline
                    title={`${incident.kind} risk from now to +60 minutes`}
                    labels={HORIZONS.map((h) => `${horizonLabel(h)} · ${Math.round(shownSeries[HORIZONS.indexOf(h)] ?? 0)}`)}
                    activeIndex={hi}
                    series={[
                      ...(comparing ? [{ values: baseSeries as number[], className: "text-faint", dashed: true }] : []),
                      { values: shownSeries as number[], className: "text-ink" },
                    ]}
                  />
                </>
              ) : (
                <Empty>The trajectory appears once the engine predicts all four horizons.</Empty>
              )}
            </Section>

            {counterfactual && (
              <Section title="If we had acted earlier" aside={<Tag title="Computed by the AquaPulse engine">DERIVED</Tag>}>
                <p className="tabular text-[13px] leading-relaxed text-muted">
                  est. <span className="text-ink">{fmt(counterfactual.currentExposure)}</span> exposed now · est.{" "}
                  <span className="text-ink">{fmt(counterfactual.counterfactualExposure)}</span> if {counterfactual.bundleLabel} {counterfactual.minutesEarlier} min earlier ·
                  est. <span className="text-ink">{fmt(counterfactual.avoidableExposure)}</span> avoidable
                </p>
              </Section>
            )}

            {records.length > 0 && (
              <Section title="Did it work">
                <ul className="space-y-2">
                  {records.map((r) => (
                    <li key={r.id} className="text-[13px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-ink">{r.bundle.label}</span>
                        <ProvTag p={r.provenance} />
                      </div>
                      <p className="tabular mt-0.5 text-muted">
                        est. {fmt(r.before.exposure)} before → expected {fmt(r.expected.exposure)} → observed{" "}
                        <span className="text-ink">{fmt(r.observed.exposure)}</span>
                      </p>
                      <p className="tabular flex items-center gap-1 text-[11px] text-muted">
                        <CircleCheck size={12} aria-hidden className="text-verified" />
                        effectiveness {pct(r.effectiveness)} · confidence {pct(r.confidence)} · applied {clock(r.appliedAtMin)}
                      </p>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {alerts.length > 0 && (
              <Section title="Alerts">
                <ul className="space-y-2">
                  {alerts.map((a) => (
                    <li key={a.id} className="text-[13px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-ink">{a.audience}</span>
                        <Tag>{a.status}</Tag>
                      </div>
                      <p className="leading-snug text-muted">{a.body}</p>
                      <p className="tabular text-[11px] text-faint">
                        {clock(a.tMin)} · {a.transport === "demo" ? "demo transport (simulated)" : "Twilio"}
                      </p>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            <Section title="Evidence" aside={<span className="tabular text-[11px] text-faint">{evidence.length} reports</span>}>
              {evidence.length ? (
                <ul>
                  {evidence.slice(0, 3).map((e) => (
                    <EvidenceItem key={e.id} e={e} full={false} />
                  ))}
                </ul>
              ) : (
                <Empty>No reports are attached to this incident yet.</Empty>
              )}
            </Section>
          </>
        )}
      </div>

      <footer className="grid grid-cols-2 gap-2 border-t border-hairline px-4 py-3">
        {panel === "simulate" ? (
          <button type="button" className={`${btnPrimary} col-span-2`} disabled={!chosen} onClick={() => chosen && onCommit(chosen.bundle)}>
            <span className="truncate">Apply {chosen ? chosen.bundle.label : "intervention"}</span>
          </button>
        ) : (
          <>
            <button type="button" className={`${btnPrimary} col-span-2`} onClick={() => onPanel("simulate")}>
              Simulate intervention
            </button>
            <button type="button" className={btnSecondary} onClick={() => onPanel(panel === "evidence" ? "incident" : "evidence")}>
              {panel === "evidence" ? "Summary" : "View evidence"}
            </button>
            <button
              type="button"
              className={btnSecondary}
              disabled={!winner}
              title={winner ? `Demo action: commit "${winner.bundle.label}"` : "No recommended intervention yet"}
              onClick={() => winner && onCommit(winner.bundle)}
            >
              Dispatch
            </button>
          </>
        )}
      </footer>
    </aside>
  );
}

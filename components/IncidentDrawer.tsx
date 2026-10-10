"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Minus, ShieldCheck, TriangleAlert, X } from "lucide-react";
import { CONFIG, engine } from "@/lib/engine";
import type { EvidenceEvent, Incident, WorldState } from "@/lib/schemas/domain";
import { HORIZONS, type ActionBundle, type AuctionResult, type Counterfactual, type Horizon, type Prediction } from "@/lib/schemas/simulation";
import { AnalyzePhoto, EvidenceItem, EvidenceScorePanel, Verdict, heldReason } from "./panels/Evidence";
import { ProofLoop, Simulator } from "./panels/Intervention";
import { Band, DRAWER, State } from "./panels/bits";
import { safe, type Panel, type ScorePoint } from "./state";
import { AnimatedNumber, Empty, Label, ProvTag, Section, Tag, btnPrimary, btnSecondary, clock, fmt, horizonLabel, human, iconBtn, pct } from "./ui";

/** Risk from NOW to +60 on a true time axis, y scaled to the data, with the engine's facility threshold drawn in. */
function Trajectory({ shown, base, threshold, active, title }: { shown: number[]; base: number[] | null; threshold: number; active: number; title: string }) {
  const W = 348;
  const H = 108;
  const pad = { l: 6, r: 6, t: 16, b: 18 };
  const all = [...shown, ...(base ?? []), threshold];
  const lo = Math.max(0, Math.floor(Math.min(...all) - 6));
  const hi = Math.min(100, Math.ceil(Math.max(...all) + 6));
  const x = (i: number) => pad.l + (HORIZONS[i] / HORIZONS[HORIZONS.length - 1]) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo || 1)) * (H - pad.t - pad.b);
  const line = (values: number[]) => values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const ty = y(threshold);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={title}>
      <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} className="stroke-hairline" />
      <line x1={x(active)} x2={x(active)} y1={pad.t} y2={H - pad.b} className="stroke-hairline" />
      <line x1={pad.l} x2={W - pad.r} y1={ty} y2={ty} className="stroke-faint" strokeDasharray="2 3" />
      <text x={W - pad.r} y={ty < pad.t + 12 ? ty + 12 : ty - 4} textAnchor="end" className="fill-muted text-[11px]">
        facility risk threshold <tspan className="tabular">{threshold}</tspan>
      </text>
      {base && <polyline fill="none" strokeWidth={1.5} strokeDasharray="4 3" points={line(base)} className="stroke-faint" />}
      <polyline fill="none" strokeWidth={1.5} points={line(shown)} className="stroke-ink" />
      {shown.map((v, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(v)} r={i === active ? 3.5 : 2} className="fill-ink" />
          <text x={x(i)} y={H - 4} textAnchor={i === 0 ? "start" : i === shown.length - 1 ? "end" : "middle"} className={`tabular text-[11px] ${i === active ? "fill-ink" : "fill-faint"}`}>
            {horizonLabel(HORIZONS[i])} · {Math.round(v)}
          </text>
        </g>
      ))}
    </svg>
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
  scoreHistory,
  committedBefore,
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
  /** `state.scoreHistory[incident.id]`. Without it the score panel shows the current score only. */
  scoreHistory?: ScorePoint[];
  /** `state.committedBefore`. Without it the proof loop shows the asset's current priority only. */
  committedBefore?: WorldState | null;
  onPanel: (p: Panel) => void;
  onClose: () => void;
  onPreview: (b: ActionBundle | null) => void;
  onCommit: (b: ActionBundle) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const flood = incident.kind === "flood";
  const hi = HORIZONS.indexOf(horizon);
  const riskAt = (p: Prediction | null) => {
    const c = p?.cells[incident.cellId];
    return c ? (flood ? c.floodRisk : c.scarcityRisk) : null;
  };
  const cell = shownPreds[hi]?.cells[incident.cellId];
  const risk = riskAt(shownPreds[hi]);
  const score = incident.evidenceScore;
  const evidence = world.evidence.filter((e) => incident.evidenceIds.includes(e.id));
  const asset = world.assets.find((a) => a.id === incident.suspectedAssetId);
  const facilityName = (id: string) => world.facilities.find((f) => f.id === id)?.name ?? id;
  const winner = auction?.options[0];
  const chosen = auction?.options.find((o) => o.bundle.id === picked) ?? winner;
  // The engine counts flood-exposed plus water-short people in auction exposure.
  const noun = flood ? "exposed" : "people affected";
  const alerts = world.alerts.filter((a) => a.incidentId === incident.id);

  // Facilities over the engine threshold now, and those the intervention took back under it.
  const flagKey = flood ? "facilitiesAtRisk" : "facilitiesShort";
  const flagged = shownPreds[hi]?.totals[flagKey] ?? [];
  const protectedIds = comparing ? (basePreds[hi]?.totals[flagKey] ?? []).filter((id) => !flagged.includes(id)) : [];

  // Proof loop: the latest applied bundle, and what it did to the affected asset's fix-first standing.
  const records = world.interventionRecords.filter((r) => r.incidentId === incident.id);
  const record = records[records.length - 1];
  const proofAssetId = record
    ? (record.bundle.interventions.find((iv) => iv.kind === "CLEAR_DRAIN" || iv.kind === "REPAIR_PIPE")?.targetId ?? incident.suspectedAssetId)
    : undefined;
  const priority = useMemo(() => {
    if (!proofAssetId) return null;
    const find = (w: WorldState) => safe(() => engine.infraPriorities(w))?.find((p) => p.assetId === proofAssetId);
    const now = find(world);
    if (!now) return null;
    // `committedBefore` is the world before the last commit of any incident: use it only when that commit is this record.
    const mine = committedBefore && world.interventionRecords[world.interventionRecords.length - 1] === record && committedBefore.interventionRecords.length === world.interventionRecords.length - 1;
    return { now, before: mine ? find(committedBefore) : undefined };
  }, [world, committedBefore, record, proofAssetId]);
  const proofAsset = world.assets.find((a) => a.id === proofAssetId);
  const proof = record && (
    <ProofLoop
      record={record}
      kind={incident.kind}
      noun={noun}
      earlier={records.length - 1}
      priority={priority}
      assetLabel={proofAsset ? `${human(proofAsset.kind)} ${proofAsset.id}` : null}
    />
  );

  // Strongest probability per cause across every analysed report.
  const causes = new Map<string, { probability: number; rationale: string }>();
  for (const e of evidence)
    for (const c of e.analysis?.likelyCauses ?? [])
      if ((causes.get(c.cause)?.probability ?? -1) < c.probability) causes.set(c.cause, c);
  const topCauses = [...causes.entries()].sort((a, b) => b[1].probability - a[1].probability).slice(0, 3);

  const baseSeries = basePreds.map(riskAt);
  const shownSeries = shownPreds.map(riskAt);
  const hasSeries = baseSeries.every((v) => v != null) && shownSeries.every((v) => v != null);
  const TrendIcon = cell?.trend === "rising" ? ArrowUp : cell?.trend === "falling" ? ArrowDown : Minus;
  const threshold = flood ? CONFIG.flood.facilityRiskThreshold : CONFIG.scarcity.facilityShortThreshold;

  return (
    <aside aria-label={`Incident ${incident.id}`} className={DRAWER}>
      <header className="flex items-center gap-2 px-4 py-3">
        {panel !== "incident" && (
          <button type="button" className={iconBtn} onClick={() => onPanel("incident")} aria-label="Back to incident">
            <ArrowLeft size={14} aria-hidden />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-medium text-ink">
            <span className="tabular">{incident.id}</span> · {panel === "simulate" ? "Intervention simulator" : panel === "evidence" ? "Evidence" : human(incident.type)}
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
            {proof}
            <Simulator
              auction={auction}
              chosen={chosen}
              horizon={horizon}
              noun={noun}
              kind={incident.kind}
              applied={!!record}
              facilityName={facilityName}
              onPick={setPicked}
              onPreview={onPreview}
            />
          </>
        ) : panel === "evidence" ? (
          <>
            <EvidenceScorePanel incident={incident} world={world} history={scoreHistory} />
            <Section title="Reports" aside={<span className="tabular text-[11px] text-faint">{evidence.length}</span>}>
              {evidence.length ? (
                <ul>
                  {evidence.map((e) => (
                    <EvidenceItem key={e.id} e={e} />
                  ))}
                </ul>
              ) : (
                <Empty>No reports are attached to this incident yet.</Empty>
              )}
            </Section>
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
            <section className="border-t border-hairline px-4 py-3">
              <Label>
                {incident.kind} risk · <span className="tabular">{horizonLabel(horizon)}</span>
                {horizon ? "m predicted" : ""}
                {comparing ? " · with intervention" : ""}
              </Label>
              {risk != null && cell ? (
                <div className="mt-1 flex items-end justify-between gap-4">
                  <p className="tabular text-[40px] font-medium leading-none text-ink">
                    <AnimatedNumber value={risk} />
                    <span className="text-[15px] font-normal text-muted">%</span>
                  </p>
                  <div className="space-y-1 pb-0.5 text-right">
                    <div>
                      <Band risk={risk} domain={incident.kind} />
                    </div>
                    <p className="tabular flex items-center justify-end gap-1 text-[13px] text-muted">
                      confidence <span className="text-ink">{pct(cell.confidence)}</span> ·
                      <TrendIcon size={12} aria-hidden />
                      <span className="font-sans">{cell.trend}</span>
                    </p>
                  </div>
                </div>
              ) : (
                <Empty>No prediction for this cell yet.</Empty>
              )}
              <div className="mt-3 flex items-center justify-between gap-3 border-t border-hairline pt-2 text-[13px]">
                <span className="text-muted">Evidence Score</span>
                {score ? (
                  <span className="flex items-center gap-2">
                    <span className="tabular text-ink">
                      {Math.round(score.total)}
                      <span className="text-muted"> / 100</span>
                    </span>
                    <Verdict verdict={score.verdict} />
                  </span>
                ) : (
                  <span className="text-faint">not scored yet</span>
                )}
              </div>
              {score?.verdict === "hold" && (
                <p className="mt-1 text-[13px] leading-snug text-muted">
                  <span className="text-ink">Held as low-confidence evidence. Not escalated.</span> {heldReason(score)}
                </p>
              )}
            </section>

            {proof}

            <Section title="Who is affected">
              {cell ? (
                <p className="tabular text-[13px] text-ink">
                  est. {fmt(flood ? cell.exposedPopulation : cell.populationShort)}
                  <span className="font-sans text-muted"> {flood ? "people exposed" : "people short of water"} in this cell</span>
                </p>
              ) : (
                <Empty>No exposure estimate yet.</Empty>
              )}
              {flagged.length + protectedIds.length > 0 ? (
                <ul className="mt-2 divide-y divide-hairline border-t border-hairline">
                  {flagged.slice(0, 5).map((id) => (
                    <li key={id} className="flex items-center justify-between gap-3 py-1.5 text-[13px]">
                      <span className="min-w-0 truncate text-ink">{facilityName(id)}</span>
                      <State icon={TriangleAlert} tone="text-flood-mid">
                        {flood ? "At risk" : "Short"}
                      </State>
                    </li>
                  ))}
                  {protectedIds.map((id) => (
                    <li key={id} className="flex items-center justify-between gap-3 py-1.5 text-[13px]">
                      <span className="min-w-0 truncate text-ink">{facilityName(id)}</span>
                      <State icon={ShieldCheck} tone="text-verified">
                        Protected
                      </State>
                    </li>
                  ))}
                  {flagged.length > 5 && <li className="tabular py-1.5 text-[11px] text-faint">+{flagged.length - 5} more over the threshold</li>}
                </ul>
              ) : (
                <p className="mt-1 text-[13px] text-faint">No critical facility {flood ? "at flood risk" : "short of water"} at this horizon.</p>
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
                <ul className="mt-2 space-y-2">
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

            <Section title="Risk trajectory" aside={comparing ? <span className="text-[11px] text-faint">dashed = without intervention</span> : undefined}>
              {hasSeries ? (
                <Trajectory
                  title={`${incident.kind} risk from now to +60 minutes, facility risk threshold ${threshold}`}
                  shown={shownSeries as number[]}
                  base={comparing ? (baseSeries as number[]) : null}
                  threshold={threshold}
                  active={hi}
                />
              ) : (
                <Empty>The trajectory appears once the engine predicts all four horizons.</Empty>
              )}
            </Section>

            {counterfactual && (
              <Section title={`If we had acted ${counterfactual.minutesEarlier} min earlier`} aside={<Tag title="Computed by the AquaPulse engine">DERIVED</Tag>}>
                <dl className="grid grid-cols-3 gap-x-3">
                  {[
                    ["As it stands", counterfactual.currentExposure],
                    ["Acting earlier", counterfactual.counterfactualExposure],
                    ["Avoidable", counterfactual.avoidableExposure],
                  ].map(([label, v], i) => (
                    <div key={label}>
                      <dt className="text-[11px] text-muted">{label}</dt>
                      <dd className={`tabular mt-0.5 text-[15px] ${i === 2 ? "font-medium text-ink" : "text-muted"}`}>
                        <span className="text-[11px]">est. </span>
                        {fmt(v as number)}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-1.5 text-[11px] leading-snug text-faint">
                  Est. {noun}, with {counterfactual.bundleLabel} applied earlier.
                </p>
              </Section>
            )}

            {alerts.length > 0 && (
              <Section title="Alerts">
                <ul className="space-y-3">
                  {alerts.map((a) => (
                    <li key={a.id} className="text-[13px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-ink">{a.audience}</span>
                        <Tag>{a.status}</Tag>
                      </div>
                      <p className="mt-0.5 leading-snug text-muted">{a.body}</p>
                      <p className="tabular mt-0.5 flex items-center gap-1.5 text-[11px] text-faint">
                        {clock(a.tMin)} · {a.transport === "demo" ? "demo transport" : "Twilio"}
                        {a.transport === "demo" && <Tag title="Simulated transport: no message left this machine">SIM</Tag>}
                      </p>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
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
              {panel === "evidence" ? "Summary" : `View evidence · ${evidence.length}`}
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

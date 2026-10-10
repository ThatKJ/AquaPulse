"use client";

import { ArrowRight, Check, Minus, Repeat, TriangleAlert } from "lucide-react";
import type { WorldState } from "@/lib/schemas/domain";
import type { Horizon, InfraHistoryRecord, InfraPriority, Prediction, TankerAssignment } from "@/lib/schemas/simulation";
import { Band, DRAWER, Meter, ROWS, Row, State, signed } from "./panels/bits";
import { RISK_BANDS } from "./risk";
import { Empty, Label, Section, Tag, btnPrimary, fmt, horizonLabel, human, pct } from "./ui";

const ZONE_MIN = RISK_BANDS.find((b) => b.key === "elevated")!.min;

export function ScarcityPanel({
  world,
  prediction,
  horizon,
  plan,
  onOptimize,
}: {
  world: WorldState;
  prediction: Prediction | null;
  horizon: Horizon;
  plan: TankerAssignment[] | null;
  onOptimize: () => void;
}) {
  const t = prediction?.totals;
  const cells = Object.values(world.cells);
  // Affected zone: cells the engine predicts at Elevated or above. The district is the fallback when none qualify.
  const zone = prediction ? cells.filter((c) => (prediction.cells[c.id]?.scarcityRisk ?? 0) >= ZONE_MIN) : [];
  const scope = zone.length ? zone : cells;
  const people = scope.reduce((s, c) => s + c.population, 0);
  // The engine reports deficit, not supply/demand volumes: these are population-weighted means of its per-cell 0..1 indices.
  const mean = (f: (c: (typeof cells)[number]) => number) => (people ? scope.reduce((s, c) => s + f(c) * c.population, 0) / people : null);
  const supply = mean((c) => c.scarcity.supplyAvailability);
  const demand = mean((c) => c.scarcity.demandPressure);
  const tankers = world.resources.filter((r) => r.kind === "tanker");
  // A facility's shortfall is its share of its cell's deficit: the same rule the engine's tanker allocator uses.
  const short = world.facilities
    .filter((f) => t?.facilitiesShort.includes(f.id))
    .map((f) => ({ f, liters: Math.round(f.dailyDemandLiters * Math.min(1, (prediction?.cells[f.cellId]?.populationShort ?? 0) / Math.max(1, world.cells[f.cellId]?.population ?? 0))) }))
    .sort((a, b) => Number(b.f.kind === "hospital") - Number(a.f.kind === "hospital") || b.liters - a.liters);
  const none = !!t && t.deficitLiters <= 0 && t.populationShort <= 0 && short.length === 0;

  return (
    <aside aria-label="Water scarcity" className={DRAWER}>
      <header className="px-4 py-3">
        <h2 className="text-[15px] font-medium text-ink">Water scarcity</h2>
        <p className="text-[11px] uppercase tracking-[0.06em] text-muted">
          Supply against demand · <span className="tabular">{horizonLabel(horizon)}</span>
          {horizon ? "m predicted" : ""}
        </p>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {none ? (
          <section className="border-t border-hairline px-4 py-3">
            <Empty>No water shortage is predicted at this horizon. Move the timeline forward or play the scarcity scenario to see stress build.</Empty>
          </section>
        ) : (
          <>
            <section className="border-t border-hairline px-4 py-3">
              <div className="flex items-center justify-between">
                <Label>Water deficit (est.)</Label>
                <Tag title="Computed by the AquaPulse engine">DERIVED</Tag>
              </div>
              {t ? (
                <>
                  <p className="tabular mt-1 text-[40px] font-medium leading-none text-ink">
                    {(t.deficitLiters / 1e6).toFixed(1)}
                    <span className="text-[15px] font-normal text-muted"> ML/day</span>
                  </p>
                  <dl className={`${ROWS} mt-3 border-t border-hairline`}>
                    <Row label="People short of water">est. {fmt(t.populationShort)}</Row>
                    <Row label="Peak stress">
                      <span className="inline-flex items-center gap-2">
                        <Band risk={t.maxScarcityRisk} domain="scarcity" />
                        <span>{Math.round(t.maxScarcityRisk)} / 100</span>
                      </span>
                    </Row>
                    <Row label="Forecast confidence">{pct(t.meanConfidence)}</Row>
                  </dl>
                </>
              ) : (
                <Empty>The engine has not returned scarcity totals yet.</Empty>
              )}
            </section>

            <Section title="Supply and demand" aside={<Tag title="Population-weighted mean of the engine's per-cell indices">DERIVED</Tag>}>
              {supply != null && demand != null ? (
                <>
                  <dl className="space-y-2.5">
                    {(
                      [
                        ["Supply availability", supply],
                        ["Demand pressure", demand],
                      ] as const
                    ).map(([label, v]) => (
                      <div key={label}>
                        <div className="flex items-baseline justify-between text-[13px]">
                          <dt className="text-muted">{label}</dt>
                          <dd className="tabular text-ink">{pct(v)}</dd>
                        </div>
                        <Meter value={v} tone={label === "Supply availability" ? "bg-scarcity-low" : "bg-scarcity-high"} className="mt-1" />
                      </div>
                    ))}
                  </dl>
                  <p className="mt-2 text-[11px] text-faint">
                    {zone.length ? (
                      <>
                        Affected zone · <span className="tabular">{zone.length}</span> {zone.length === 1 ? "cell" : "cells"} at Elevated or above
                      </>
                    ) : (
                      "District · no cell is at Elevated or above"
                    )}
                    . Index, 0–100%.
                  </p>
                </>
              ) : (
                <Empty>No cells loaded yet.</Empty>
              )}
            </Section>

            <Section title="Critical facilities short of water" aside={<span className="tabular text-[11px] text-faint">{short.length}</span>}>
              {short.length ? (
                <ul className="divide-y divide-hairline">
                  {short.map(({ f, liters }) => (
                    <li key={f.id} className="flex items-center gap-2 py-1.5 text-[13px] first:pt-0 last:pb-0">
                      <TriangleAlert size={12} aria-hidden className="shrink-0 text-flood-mid" />
                      <span className="min-w-0 flex-1 truncate text-ink">
                        {f.name} <span className="text-[11px] text-muted">{human(f.kind)}</span>
                      </span>
                      <span className="tabular shrink-0 text-ink">
                        est. {fmt(liters)} <span className="font-sans text-[11px] text-muted">L/day short</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>No critical facility is short of water at this horizon.</Empty>
              )}
            </Section>
          </>
        )}

        <Section title="Available resources" aside={<Tag title="Simulated for the demo, not municipal data">SIM</Tag>}>
          {tankers.length ? (
            <ul className="divide-y divide-hairline">
              {tankers.map((r) => (
                <li key={r.id} className="flex items-center gap-2 py-1.5 text-[13px] first:pt-0 last:pb-0">
                  <span className="min-w-0 flex-1 truncate text-ink">
                    Tanker <span className="tabular">{r.id}</span>
                  </span>
                  <span className="tabular text-muted">{fmt(r.capacity)} L</span>
                  <span className="flex w-[88px] justify-end">
                    {r.available ? (
                      <State icon={Check} tone="text-verified">
                        Available
                      </State>
                    ) : (
                      <State icon={Minus} tone="text-muted">
                        Committed
                      </State>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No tankers are registered in this world.</Empty>
          )}
        </Section>

        <Section title="Response plan" aside={plan?.length ? <Tag title="Computed by the AquaPulse engine">DERIVED</Tag> : undefined}>
          {plan == null ? (
            <Empty>Optimize response to allocate available tankers by need and equity. Routes draw on the map.</Empty>
          ) : plan.length === 0 ? (
            <Empty>The optimizer assigned no tankers: none are available or no target is short.</Empty>
          ) : (
            <ol className="divide-y divide-hairline">
              {plan.map((a) => {
                const facility = world.facilities.find((f) => f.id === a.targetId);
                const tanker = tankers.find((r) => r.id === a.resourceId);
                // ponytail: distance and deficit exist only inside the engine's reason sentence; read them from it until TankerAssignment carries them as fields.
                const km = a.reason.match(/([\d.]+) km away/)?.[1];
                const deficit = a.reason.match(/(?:short by|Deficit) ([\d,]+) L\/day/)?.[1];
                const why: [string, string][] = [["Criticality", facility ? (facility.kind === "hospital" ? "Hospital, served first" : human(facility.kind)) : "Residential cell"]];
                if (km) why.push(["Distance", `${km} km`]);
                if (deficit) why.push(["Deficit", `${deficit} L/day`]);
                why.push(["Equity score", `${Math.round(a.equityScore)} / 100`]);
                if (tanker) why.push(["Capacity", `${fmt(tanker.capacity)} L`]);
                return (
                  <li key={`${a.resourceId}-${a.targetId}`} className="py-2.5 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-1.5 text-[13px] text-ink">
                      <span className="tabular font-medium">{a.resourceId}</span>
                      <ArrowRight size={12} aria-label="to" className="shrink-0 text-muted" />
                      <span className="min-w-0 flex-1 truncate" title={a.targetLabel}>
                        {a.targetLabel}
                      </span>
                      <span className="tabular shrink-0">{fmt(a.liters)} L</span>
                    </div>
                    <div className="mt-1 flex gap-3 text-[11px]" title={a.reason}>
                      <span className="uppercase tracking-[0.06em] text-faint">Why</span>
                      <dl className="flex min-w-0 flex-wrap gap-x-3 gap-y-0.5">
                        {why.map(([k, v]) => (
                          <div key={k} className="flex gap-1">
                            <dt className="text-muted">{k}</dt>
                            <dd className="tabular text-ink">{v}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Section>
      </div>
      <footer className="border-t border-hairline px-4 py-3">
        <button type="button" className={`${btnPrimary} w-full`} onClick={onOptimize} disabled={tankers.length === 0}>
          Optimize response
        </button>
      </footer>
    </aside>
  );
}

/** Failures of one asset over time: x = date, bar height = severity (1..10), a diamond marks a failure that got an intervention. */
function HistoryTimeline({ rows }: { rows: InfraHistoryRecord[] }) {
  const W = 316;
  const H = 88;
  const base = H - 16;
  const top = 12;
  const at = (r: InfraHistoryRecord) => r.year + (r.month - 1) / 12;
  const first = Math.floor(Math.min(...rows.map(at)));
  const last = Math.max(first + 1, Math.ceil(Math.max(...rows.map(at)) + 0.01));
  const x = (v: number) => 6 + ((v - first) / (last - first)) * (W - 12);
  const years = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const step = Math.ceil(years.length / 6);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={`${rows.length} recorded failures from ${first} to ${last}; bar height is severity, a diamond marks an intervention`}>
      <line x1={6} x2={W - 6} y1={top} y2={top} className="stroke-hairline" strokeDasharray="2 3" />
      <text x={W - 6} y={top - 3} textAnchor="end" className="tabular fill-faint text-[11px]">
        severity 10
      </text>
      <line x1={6} x2={W - 6} y1={base} y2={base} className="stroke-faint" />
      {years.map((y, i) => (
        <g key={y}>
          <line x1={x(y)} x2={x(y)} y1={base} y2={base + 3} className="stroke-faint" />
          {i % step === 0 && (
            <text x={x(y)} y={H - 2} textAnchor={i === 0 ? "start" : y === last ? "end" : "middle"} className="tabular fill-muted text-[11px]">
              {y}
            </text>
          )}
        </g>
      ))}
      {rows.map((r, i) => {
        const h = (r.severity / 10) * (base - top);
        const cx = x(at(r));
        const my = base - h - 6;
        return (
          <g key={i}>
            <rect x={cx - 2.5} y={base - h} width={5} height={h} className={r.interventionKind ? "fill-ink" : "fill-muted"}>
              <title>{`${r.year}-${String(r.month).padStart(2, "0")} · severity ${r.severity}/10 · est. ${fmt(r.exposedPopulation)} exposed · ${r.note}`}</title>
            </rect>
            {r.interventionKind && <path d={`M${cx} ${my - 3.5}l3.5 3.5l-3.5 3.5l-3.5 -3.5z`} className="fill-panel-raised stroke-ink" />}
          </g>
        );
      })}
    </svg>
  );
}

// Tier marker: a different shape per tier, so the tier never depends on colour.
const TIER_MARK = { 1: "▲", 2: "◆", 3: "○" } as const;
function Tier({ tier }: { tier: 1 | 2 | 3 }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 text-[11px] font-medium uppercase tracking-[0.06em] ${tier === 1 ? "text-ink" : "text-muted"}`}>
      <span aria-hidden>{TIER_MARK[tier]}</span>
      Priority <span className="tabular">{tier}</span>
    </span>
  );
}

export function FixFirstPanel({
  world,
  priorities,
  selectedAssetId,
  onSelectAsset,
}: {
  world: WorldState;
  priorities: InfraPriority[] | null;
  selectedAssetId: string | null;
  onSelectAsset: (id: string | null) => void;
}) {
  return (
    <aside aria-label="Fix this first" className={DRAWER}>
      <header className="px-4 py-3">
        <div className="flex items-center justify-between">
          <Label>Fix this first</Label>
          <Tag title="Simulated for the demo, not municipal data">SIM</Tag>
        </div>
        <h2 className="mt-1 text-[15px] font-medium text-ink">Prevention</h2>
        <p className="mt-1 text-[13px] leading-snug text-muted">Emergency response fixes today. AquaPulse learns what Bengaluru should fix permanently.</p>
        <p className="mt-1 text-[11px] text-faint">Simulated history, not municipal records.</p>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto border-t border-hairline">
        {!priorities?.length ? (
          <div className="px-4 py-3">
            <Empty>The engine has not ranked any infrastructure yet. Priorities appear once assets have failure history.</Empty>
          </div>
        ) : (
          <ol className="divide-y divide-hairline">
            {priorities.map((p) => {
              const a = world.assets.find((x) => x.id === p.assetId);
              const open = p.assetId === selectedAssetId;
              const rows = world.history.filter((h) => h.assetId === p.assetId);
              const maxFactor = Math.max(...p.factors.map((f) => Math.abs(f.contribution)), 0) || 1;
              return (
                <li key={p.assetId}>
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => onSelectAsset(open ? null : p.assetId)}
                    className={`block w-full border-l-2 px-4 py-3 text-left transition-colors duration-200 hover:bg-panel-raised ${open ? "border-ink bg-panel-raised" : "border-transparent"}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                        <span className="tabular text-muted">#{p.rank}</span>{" "}
                        <span className="font-medium">
                          {a ? human(a.kind) : "Asset"} <span className="tabular">{p.assetId}</span>
                        </span>
                        {a && <span className="text-muted"> · {a.name}</span>}
                      </span>
                      <Tier tier={p.tier} />
                    </div>
                    <p className="tabular mt-1 text-[11px] text-muted">
                      {p.incidentCount} {p.incidentCount === 1 ? "incident" : "incidents"} in {p.yearsSpan} yr · avg severity {p.avgSeverity.toFixed(1)} · est. recurring exposure {fmt(p.recurringExposure)}
                    </p>
                    {p.incidentCount >= 3 && (
                      <div className="mt-1.5">
                        <State icon={Repeat} tone="text-flood-mid">
                          Repeat failure
                        </State>
                      </div>
                    )}
                  </button>
                  {open && (
                    <div className="space-y-4 bg-panel-raised px-4 pb-4 pt-1">
                      <div>
                        <Label>Priority score</Label>
                        <p className="tabular mt-1 text-[28px] font-medium leading-none text-ink">
                          {p.score.toFixed(1)}
                          <span className="text-[13px] font-normal text-muted"> / 100</span>
                        </p>
                        <ul className="mt-3 space-y-1.5">
                          {p.factors.map((f) => (
                            <li key={f.factor} className="grid grid-cols-[minmax(0,1fr)_72px_40px] items-center gap-x-2 text-[13px]">
                              <span className="truncate text-muted" title={`${f.label} · weight ${pct(f.weight)} × value ${pct(f.value)}`}>
                                {f.label}
                              </span>
                              <Meter value={Math.abs(f.contribution) / maxFactor} tone="bg-ink" />
                              <span className="tabular text-right text-ink">{signed(f.contribution * 100, 1)}</span>
                            </li>
                          ))}
                        </ul>
                        <p className="mt-1.5 text-[11px] text-faint">Points each factor adds to the score.</p>
                      </div>

                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <Label>
                            Failure history · <span className="tabular">{p.yearsSpan}</span> yr
                          </Label>
                          <Tag title="Simulated for the demo, not municipal data">SIM</Tag>
                        </div>
                        {rows.length ? (
                          <>
                            <HistoryTimeline rows={rows} />
                            <p className="mt-1 text-[11px] text-faint">Bar height = severity. ◇ = an intervention followed. Simulated history, not municipal records.</p>
                          </>
                        ) : (
                          <Empty>No failure history recorded for this asset.</Empty>
                        )}
                      </div>

                      <dl className={`${ROWS} border-y border-hairline`}>
                        <Row label="Fixes held">
                          {p.interventionCount ? (
                            <>
                              {pct(p.avgEffectiveness)} <span className="text-[11px] text-muted">across {p.interventionCount}</span>
                            </>
                          ) : (
                            "no fix attempted"
                          )}
                        </Row>
                        <Row label="Upgrade cost proxy">{a ? `₹${fmt(a.upgradeCostProxyLakh)} lakh` : "—"}</Row>
                        <Row label="Last incident">
                          {p.incidentCount ? `${p.lastIncident.year}-${String(p.lastIncident.month).padStart(2, "0")}` : "—"}
                        </Row>
                      </dl>

                      <div>
                        <Label className="mb-1">Recommendation</Label>
                        <p className="text-[13px] leading-snug text-ink">{p.recommendation}</p>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </aside>
  );
}

"use client";

import { ArrowRight, TriangleAlert } from "lucide-react";
import type { WorldState } from "@/lib/schemas/domain";
import type { Horizon, InfraHistoryRecord, InfraPriority, Prediction, TankerAssignment } from "@/lib/schemas/simulation";
import { AnimatedNumber, Empty, Label, ProvTag, Section, Tag, btnPrimary, fmt, horizonLabel, human, pct } from "./ui";

const DRAWER = "absolute bottom-0 right-0 top-12 z-10 flex w-[380px] flex-col border-l border-hairline bg-panel";

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
  // The engine reports deficit, not supply/demand volumes; these are means of its per-cell 0..1 indices.
  const mean = (f: (c: (typeof cells)[number]) => number) => (cells.length ? cells.reduce((s, c) => s + f(c), 0) / cells.length : null);
  const supply = mean((c) => c.scarcity.supplyAvailability);
  const demand = mean((c) => c.scarcity.demandPressure);
  const tankers = world.resources.filter((r) => r.kind === "tanker");
  const short = world.facilities.filter((f) => t?.facilitiesShort.includes(f.id));

  return (
    <aside aria-label="Water scarcity" className={DRAWER}>
      <header className="px-4 py-3">
        <h2 className="text-[15px] font-medium text-ink">Water scarcity</h2>
        <p className="text-[11px] uppercase tracking-[0.06em] text-muted">
          Supply vs demand · {horizonLabel(horizon)}
          {horizon ? "m predicted" : ""}
        </p>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <section className="border-t border-hairline px-4 py-3">
          <div className="flex items-center justify-between">
            <Label>Daily deficit (est.)</Label>
            <Tag title="Computed by the AquaPulse engine">DERIVED</Tag>
          </div>
          {t ? (
            <>
              <p className="tabular mt-1 text-[32px] font-medium leading-none text-ink">
                <AnimatedNumber value={t.deficitLiters} />
                <span className="text-[15px] text-muted"> L</span>
              </p>
              <p className="tabular mt-1.5 text-[11px] text-muted">est. {fmt(t.populationShort)} people short of water · peak stress {Math.round(t.maxScarcityRisk)} / 100</p>
            </>
          ) : (
            <Empty>The engine has not returned scarcity totals yet.</Empty>
          )}
        </section>

        <Section title="Supply and demand" aside={<Tag title="Mean of the engine's per-cell indices">DERIVED</Tag>}>
          {supply != null && demand != null ? (
            <dl className="space-y-2">
              {[
                ["Supply availability", supply, "bg-scarcity-low"],
                ["Demand pressure", demand, "bg-scarcity-high"],
              ].map(([label, v, tone]) => (
                <div key={label as string}>
                  <div className="flex justify-between text-[13px]">
                    <dt className="text-muted">{label} (mean index)</dt>
                    <dd className="tabular text-ink">{pct(v as number)}</dd>
                  </div>
                  <div className="mt-1 h-1 bg-panel-raised" aria-hidden>
                    <div className={`h-full transition-[width] duration-300 ease-out ${tone}`} style={{ width: pct(v as number) }} />
                  </div>
                </div>
              ))}
            </dl>
          ) : (
            <Empty>No cells loaded yet.</Empty>
          )}
        </Section>

        <Section title="Facilities short of water" aside={<span className="tabular text-[11px] text-faint">{short.length}</span>}>
          {short.length ? (
            <ul className="space-y-1">
              {short.map((f) => (
                <li key={f.id} className="flex items-center gap-1.5 text-[13px]">
                  <TriangleAlert size={12} aria-hidden className="shrink-0 text-flood-mid" />
                  <span className="min-w-0 flex-1 truncate text-ink">{f.name}</span>
                  <span className="tabular text-[11px] text-muted">{fmt(f.dailyDemandLiters)} L/day</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No critical facility is short of water at this horizon.</Empty>
          )}
        </Section>

        <Section title="Tanker plan" aside={<span className="tabular text-[11px] text-faint">{tankers.filter((x) => x.available).length} of {tankers.length} tankers available</span>}>
          {plan == null ? (
            <Empty>Optimize response to allocate available tankers by need and equity. Routes draw on the map.</Empty>
          ) : plan.length === 0 ? (
            <Empty>The optimizer assigned no tankers: none are available or no target is short.</Empty>
          ) : (
            <ol className="divide-y divide-hairline">
              {plan.map((a) => (
                <li key={`${a.resourceId}-${a.targetId}`} className="py-2 first:pt-0">
                  <div className="flex items-center gap-1.5 text-[13px] text-ink">
                    <span className="tabular">{a.resourceId}</span>
                    <ArrowRight size={12} aria-label="to" className="text-muted" />
                    <span className="min-w-0 flex-1 truncate">{a.targetLabel}</span>
                    <span className="tabular">{fmt(a.liters)} L</span>
                  </div>
                  <div className="mt-0.5 flex justify-between gap-3 text-[11px] text-muted">
                    <span className="min-w-0">{a.reason}</span>
                    <span className="tabular shrink-0">equity {Math.round(a.equityScore)}/100</span>
                  </div>
                </li>
              ))}
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

/** Failures of one asset over time: x = date, bar height = severity (1..10). */
function HistoryTimeline({ rows }: { rows: InfraHistoryRecord[] }) {
  const W = 316;
  const H = 72;
  const at = (r: InfraHistoryRecord) => r.year + (r.month - 1) / 12;
  const first = Math.floor(Math.min(...rows.map(at)));
  const last = Math.max(first + 1, Math.ceil(Math.max(...rows.map(at)) + 0.01));
  const x = (v: number) => 4 + ((v - first) / (last - first)) * (W - 8);
  const years = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const step = Math.ceil(years.length / 6);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={`${rows.length} recorded failures from ${first} to ${last}, bar height is severity`}>
      <line x1={4} x2={W - 4} y1={H - 16} y2={H - 16} className="stroke-hairline" />
      {years.map((y, i) => (
        <g key={y}>
          <line x1={x(y)} x2={x(y)} y1={H - 16} y2={H - 13} className="stroke-faint" />
          {i % step === 0 && (
            <text x={x(y)} y={H - 3} textAnchor={i === 0 ? "start" : y === last ? "end" : "middle"} className="tabular fill-faint text-[11px]">
              {y}
            </text>
          )}
        </g>
      ))}
      {rows.map((r, i) => {
        const h = (r.severity / 10) * (H - 22);
        return (
          <rect key={i} x={x(at(r)) - 2} y={H - 16 - h} width={4} height={h} className={r.interventionKind ? "fill-ink" : "fill-muted"}>
            <title>{`${r.year}-${String(r.month).padStart(2, "0")} · severity ${r.severity}/10 · est. ${fmt(r.exposedPopulation)} exposed · ${r.note}`}</title>
          </rect>
        );
      })}
    </svg>
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
          <h2 className="text-[15px] font-medium text-ink">Fix this first</h2>
          <Tag title="History is simulated for the demo, not municipal data">SIM history</Tag>
        </div>
        <p className="text-[13px] text-muted">Infrastructure ranked by recurring failure, exposure and how well past fixes held.</p>
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
              return (
                <li key={p.assetId}>
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => onSelectAsset(open ? null : p.assetId)}
                    className={`block w-full border-l-2 px-4 py-2.5 text-left transition-colors duration-150 hover:bg-panel-raised ${
                      open ? "border-ink bg-panel-raised" : "border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="tabular w-7 shrink-0 text-[13px] text-ink">#{p.rank}</span>
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
                        {a ? human(a.kind) : "Asset"} <span className="tabular">{p.assetId}</span>
                        {a && <span className="font-normal text-muted"> · {a.name}</span>}
                      </span>
                      <Tag className={p.tier === 1 ? "text-ink" : ""}>Tier {p.tier}</Tag>
                    </div>
                    <p className="tabular mt-1 pl-9 text-[11px] text-muted">
                      {p.incidentCount} incidents · avg severity {p.avgSeverity.toFixed(1)} · est. recurring exposure {fmt(p.recurringExposure)}
                    </p>
                  </button>
                  {open && (
                    <div className="space-y-3 bg-panel-raised px-4 pb-3 pl-12">
                      {rows.length ? (
                        <div>
                          <div className="mb-1 flex items-center justify-between">
                            <Label>Failure history · {p.yearsSpan} yr</Label>
                            <ProvTag p={rows[0].provenance} />
                          </div>
                          <HistoryTimeline rows={rows} />
                          <p className="text-[11px] text-faint">Bar height = severity. Bright bars had an intervention.</p>
                        </div>
                      ) : (
                        <Empty>No failure history recorded for this asset.</Empty>
                      )}
                      <dl className="tabular grid grid-cols-3 gap-x-3 text-[13px]">
                        <div>
                          <dt className="font-sans text-[11px] text-faint">Priority score</dt>
                          <dd className="text-ink">{Math.round(p.score)}/100</dd>
                        </div>
                        <div>
                          <dt className="font-sans text-[11px] text-faint">Fixes held</dt>
                          <dd className="text-ink">
                            {pct(p.avgEffectiveness)} <span className="text-[11px] text-faint">of {p.interventionCount}</span>
                          </dd>
                        </div>
                        <div>
                          <dt className="font-sans text-[11px] text-faint">Upgrade cost proxy</dt>
                          <dd className="text-ink">{a ? `₹${fmt(a.upgradeCostProxyLakh)} L` : "—"}</dd>
                        </div>
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

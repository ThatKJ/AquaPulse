"use client";

import { ArrowRight, ShieldCheck, Trophy } from "lucide-react";
import type { ActionBundle, AuctionOption, AuctionResult, Horizon, InfraPriority, InterventionRecord } from "@/lib/schemas/simulation";
import type { RiskDomain } from "../risk";
import { AnimatedNumber, Empty, Label, Section, Tag, clock, fmt, horizonLabel, pct } from "../ui";
import { Band, Meter, ROWS, Row, State, signed } from "./bits";

const pctChange = (n: number) => `${signed(n)}%`;

/** One rung of the comparison ladder: bar length is exposure relative to the no-action baseline. */
function Rung({
  o,
  baseline,
  noun,
  winner,
  selected,
  onPreview,
  onSelect,
}: {
  o: AuctionOption;
  baseline: number;
  noun: string;
  winner: boolean;
  selected: boolean;
  onPreview: (b: ActionBundle | null) => void;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      onMouseEnter={() => onPreview(o.bundle)}
      onFocus={() => onPreview(o.bundle)}
      className={`block w-full border-l-2 px-4 py-2 text-left transition-colors duration-200 hover:bg-panel-raised ${selected ? "border-ink bg-panel-raised" : "border-transparent"}`}
    >
      <span className="flex items-center gap-2">
        <span className="tabular w-3 shrink-0 text-[13px] text-faint">{o.rank}</span>
        <span className={`min-w-0 flex-1 truncate text-[13px] ${selected ? "font-medium text-ink" : "text-muted"}`} title={o.bundle.label}>
          {o.bundle.label}
        </span>
        {winner && (
          <State icon={Trophy} tone="text-verified">
            Winner
          </State>
        )}
      </span>
      <span className="mt-1.5 flex items-center gap-3 pl-5">
        <Meter value={baseline > 0 ? o.outcome.exposure / baseline : 0} tone={selected ? "bg-ink" : "bg-muted"} className="min-w-0 flex-1" />
        <span className="tabular whitespace-nowrap text-[13px] text-ink">
          est. {fmt(o.outcome.exposure)} <span className="font-sans text-[11px] text-muted">{noun}</span>
        </span>
        <span className="tabular w-11 shrink-0 text-right text-[13px] text-ink">{pctChange(o.outcome.exposureChangePct)}</span>
      </span>
    </button>
  );
}

/** Each scoring term of the winner as a signed bar around a zero axis: gains solid to the right, penalties outlined to the left. */
function WhyBars({ o }: { o: AuctionOption }) {
  const pos = Math.max(0, ...o.breakdown.map((t) => t.contribution));
  const neg = Math.max(0, ...o.breakdown.map((t) => -t.contribution));
  const span = pos + neg || 1;
  return (
    <ul className="space-y-1.5">
      {o.breakdown.map((t) => {
        const penalty = t.contribution < 0;
        return (
          <li key={t.factor} className="grid grid-cols-[minmax(0,1fr)_112px_44px] items-center gap-x-2 text-[13px]">
            <span className="truncate text-muted">{t.label}</span>
            <span aria-hidden className="relative block h-2">
              <span className="absolute inset-y-0 w-px bg-faint" style={{ left: `${(neg / span) * 100}%` }} />
              <span
                className={`absolute inset-y-0 ${penalty ? "border border-muted" : "bg-ink"}`}
                style={{ left: `${((neg + Math.min(0, t.contribution)) / span) * 100}%`, width: `${(Math.abs(t.contribution) / span) * 100}%` }}
              />
            </span>
            <span className="tabular text-right text-ink">{signed(t.contribution * 100, 1)}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function Simulator({
  auction,
  chosen,
  horizon,
  noun,
  kind,
  applied,
  facilityName,
  onPick,
  onPreview,
}: {
  auction: AuctionResult | null;
  /** A bundle is already applied to this incident: the ladder now ranks what could be added on top. */
  applied: boolean;
  /** The picked option, or the winner while nothing is picked. */
  chosen: AuctionOption | undefined;
  horizon: Horizon;
  /** "exposed" for flood; "people affected" for scarcity (the engine counts both kinds of people). */
  noun: string;
  kind: RiskDomain;
  facilityName: (id: string) => string;
  onPick: (bundleId: string) => void;
  onPreview: (b: ActionBundle | null) => void;
}) {
  const winner = auction?.options[0];
  if (!auction || !winner || !chosen) {
    return (
      <section className="border-t border-hairline px-4 py-3">
        <Empty>The engine returned no intervention options for this incident yet.</Empty>
      </section>
    );
  }
  const out = chosen.outcome;
  const short = kind === "flood" ? "exposed" : "affected";
  return (
    <>
      <section className="border-t border-hairline px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <Label>
            {applied ? "Further action · outcome" : "Outcome"} · <span className="tabular">{horizonLabel(horizon)}m</span>
          </Label>
          <Tag title="Computed by the AquaPulse engine">DERIVED</Tag>
        </div>
        <p className="tabular mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 leading-none text-ink">
          <span className="text-[13px] text-muted">est.</span>
          <span className="text-[22px] text-muted">{fmt(auction.baselineExposure)}</span>
          <ArrowRight size={18} aria-label="to" className="self-center text-muted" />
          <AnimatedNumber value={out.exposure} className="text-[36px] font-medium" />
          <span className="font-sans text-[13px] text-muted">{noun}</span>
        </p>
        <p className="mt-2 text-[13px] leading-snug text-muted">
          <span className="tabular text-ink">{pctChange(out.exposureChangePct)}</span> with {chosen.bundle.label}
        </p>
      </section>

      <section className="border-t border-hairline py-2">
        <div className="border-l-2 border-transparent px-4 py-2">
          <span className="flex items-center gap-2">
            <span className="w-3 shrink-0" />
            <Label>Baseline · {applied ? "no further action" : "no action"}</Label>
          </span>
          <span className="mt-1.5 flex items-center gap-3 pl-5">
            <Meter value={1} tone="bg-faint" className="min-w-0 flex-1" />
            <span className="tabular whitespace-nowrap text-[13px] text-muted">
              est. {fmt(auction.baselineExposure)} <span className="font-sans text-[11px]">{short}</span>
            </span>
            <span aria-hidden className="tabular w-11 shrink-0 text-right text-[13px] text-faint">
              —
            </span>
          </span>
        </div>
        <div
          role="radiogroup"
          aria-label="Intervention options, best first"
          // Hover previews another option; leaving settles the map back on the selected one.
          onMouseLeave={() => onPreview(chosen.bundle)}
        >
          {auction.options.map((o) => (
            <Rung
              key={o.bundle.id}
              o={o}
              baseline={auction.baselineExposure}
              noun={short}
              winner={o === winner}
              selected={o === chosen}
              onPreview={onPreview}
              onSelect={() => {
                onPick(o.bundle.id);
                onPreview(o.bundle);
              }}
            />
          ))}
        </div>
        <p className="tabular px-4 pt-2 text-[11px] text-faint">
          {auction.evaluated} feasible bundles simulated · top {auction.options.length} shown
        </p>
      </section>

      <Section
        title={chosen === winner ? "Best response" : "Selected response"}
        aside={
          <span className="tabular text-[11px] text-muted">
            rank {chosen.rank} · score {chosen.score.toFixed(1)}
          </span>
        }
      >
        <p className="mb-1 text-[13px] font-medium leading-snug text-ink">{chosen.bundle.label}</p>
        <dl className={ROWS}>
          <Row label="Cost proxy">₹{out.costProxyLakh.toFixed(1)} lakh</Row>
          <Row label="Response time">{Math.round(out.responseTimeMin)} min</Row>
          <Row label="Equity score">{Math.round(out.equityScore)} / 100</Row>
          <Row label="Vulnerable-area exposure change">{signed(out.vulnerableExposureChange)}</Row>
          {out.deficitReductionLiters > 0 && <Row label="Deficit removed">est. {fmt(out.deficitReductionLiters)} L/day</Row>}
          <Row label="Confidence">{pct(out.confidence)}</Row>
          {out.facilitiesProtected.length === 0 && <Row label="Facilities protected">None at this horizon</Row>}
          {out.facilitiesProtected.map((id) => (
            <div key={id} className="flex items-center justify-between gap-3 py-1.5 text-[13px]">
              <dt className="min-w-0 truncate text-ink">{facilityName(id)}</dt>
              <dd>
                <State icon={ShieldCheck} tone="text-verified">
                  Protected
                </State>
              </dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="Why this response" aside={<span className="tabular text-[11px] text-muted">score {winner.score.toFixed(1)} · points per term</span>}>
        {chosen !== winner && <p className="mb-2 text-[13px] text-muted">{winner.bundle.label}</p>}
        <WhyBars o={winner} />
        <p className="mt-2 text-[11px] text-faint">Solid bars add to the score. Outlined bars are penalties.</p>
        {auction.winnerReasons.length > 0 && (
          <ul className="mt-3 list-disc space-y-1 border-t border-hairline pl-4 pt-3 text-[13px] leading-snug text-muted">
            {auction.winnerReasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

/** INTERVENTION → PROOF → LEARNING for the incident's latest applied bundle. */
export function ProofLoop({
  record,
  kind,
  noun,
  earlier,
  priority,
  assetLabel,
}: {
  record: InterventionRecord;
  kind: RiskDomain;
  noun: string;
  /** Applied bundles before this one on the same incident. */
  earlier: number;
  /** The affected asset's fix-first standing now, and just before this bundle when the pre-commit world is known. */
  priority: { now: InfraPriority; before?: InfraPriority } | null;
  assetLabel: string | null;
}) {
  const steps = [
    ["Before", record.before],
    ["Expected", record.expected],
    ["Observed", record.observed],
  ] as const;
  return (
    <Section title="Did it work" aside={<span className="text-[11px] uppercase tracking-[0.06em] text-faint">Intervention → proof → learning</span>}>
      <p className="text-[13px] leading-snug text-ink">
        {record.bundle.label}
        <span className="tabular text-muted"> · applied {clock(record.appliedAtMin)}</span>
      </p>

      <ol className="mt-3 grid grid-cols-3 divide-x divide-hairline border-y border-hairline">
        {steps.map(([name, v], i) => (
          <li key={name} className={`py-2 ${i ? "pl-3" : ""}`}>
            <div className="flex h-[18px] items-center gap-1.5">
              <Label>{name}</Label>
              {name === "Observed" && <Tag title="Simulated for the demo, not a field measurement">SIM</Tag>}
            </div>
            <p className="tabular mt-1.5 text-[15px] leading-none text-ink">
              {Math.round(v.risk)}
              <span className="font-sans text-[11px] text-muted"> peak risk</span>
            </p>
            <div className="mt-1">
              <Band risk={v.risk} domain={kind} />
            </div>
            <p className="tabular mt-1.5 text-[13px] text-ink">est. {fmt(v.exposure)}</p>
          </li>
        ))}
      </ol>
      <p className="mt-1.5 text-[11px] text-faint">Peak risk and est. {noun}. Observed is a simulated observation.</p>

      <div className="mt-3 flex items-end justify-between gap-4">
        <div>
          <Label>Effectiveness</Label>
          <p className="tabular mt-1 text-[36px] font-medium leading-none text-ink">
            <AnimatedNumber value={record.effectiveness * 100} />
            <span className="text-[15px] text-muted">%</span>
          </p>
        </div>
        <p className="pb-0.5 text-right text-[11px] leading-snug text-muted">
          Share of estimated exposure removed,
          <br />
          before against observed · confidence <span className="tabular text-ink">{pct(record.confidence)}</span>
        </p>
      </div>

      {priority && (
        <div className="mt-3 border-t border-hairline pt-3">
          <p className="text-[13px] text-ink">Infrastructure priority updated</p>
          <p className="tabular mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[13px] text-muted">
            <span className="font-sans">{assetLabel ?? priority.now.assetId} · priority score</span>
            {priority.before && (
              <>
                <span>{priority.before.score.toFixed(1)}</span>
                <ArrowRight size={12} aria-label="to" />
              </>
            )}
            <span className="text-ink">{priority.now.score.toFixed(1)}</span>
            <span>
              · rank {priority.before && priority.before.rank !== priority.now.rank ? `#${priority.before.rank} → ` : ""}#{priority.now.rank}
            </span>
          </p>
          <p className="mt-0.5 text-[11px] text-faint">This failure and its fix are now part of the asset’s simulated history.</p>
        </div>
      )}
      {earlier > 0 && (
        <p className="tabular mt-2 text-[11px] text-faint">
          {earlier} earlier {earlier === 1 ? "intervention" : "interventions"} on this incident
        </p>
      )}
    </Section>
  );
}

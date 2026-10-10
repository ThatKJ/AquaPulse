"use client";

import { ArrowDown, ArrowUp, DropletOff, Waves } from "lucide-react";
import type { WorldState } from "@/lib/schemas/domain";
import type { Horizon, InfraPriority, Prediction } from "@/lib/schemas/simulation";
import { DISTRICT } from "@/lib/demo";
import { figureOf, type Domain } from "./BottomStrip";
import { bandCss, riskBand, type RiskDomain } from "./risk";
import type { Mode } from "./state";
import { AnimatedNumber, Empty, Label, Segmented, Skeleton, Tag, fmt, horizonLabel, human } from "./ui";

const MODES: { value: Mode; label: string }[] = [
  { value: "combined", label: "Combined" },
  { value: "flood", label: "Flood" },
  { value: "scarcity", label: "Scarcity" },
  { value: "fix-first", label: "Priority repairs" },
];

function Row({ label, value, unit }: { label: string; value: React.ReactNode; unit?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="tabular text-[15px] text-ink">
        {value}
        {unit && <span className="ml-1 text-[11px] text-faint">{unit}</span>}
      </dd>
    </div>
  );
}

/** Peak risk as number plus its band: glyph and label carry the meaning, colour repeats it. */
function Band({ risk, domain }: { risk: number; domain: RiskDomain }) {
  const b = riskBand(risk);
  return (
    <>
      <span className="mr-1.5 font-sans text-[11px] uppercase tracking-[0.06em]" style={{ color: bandCss(risk, domain) }}>
        <span aria-hidden>{b.glyph}</span> {b.label}
      </span>
      {Math.round(risk)}
    </>
  );
}

const HERO: Record<Domain, [title: string, sub: string]> = {
  flood: ["People at risk (est.)", "exposed to flooding"],
  scarcity: ["People short of water (est.)", "short of water"],
  combined: ["People affected (est.)", "exposed to flooding or short of water"],
};

export function CityPulse({
  world,
  shown,
  baseline,
  comparing,
  horizon,
  mode,
  domain,
  topPriority,
  selectedIncidentId,
  onMode,
  onSelectIncident,
  bottom,
}: {
  /** Height of the bottom strip, so the rail never overlaps it. */
  bottom: number;
  domain: Domain;
  /** Rank 1 infrastructure priority; only needed in Fix This First mode. */
  topPriority: InfraPriority | null;
  world: WorldState;
  /** Prediction the map is showing. */
  shown: Prediction | null;
  /** Without-intervention prediction at the same horizon. */
  baseline: Prediction | null;
  comparing: boolean;
  horizon: Horizon;
  mode: Mode;
  selectedIncidentId: string | null;
  onMode: (m: Mode) => void;
  onSelectIncident: (id: string) => void;
}) {
  const t = shown?.totals;
  const active = world.incidents.filter((i) => i.status !== "dismissed" && i.status !== "resolved");
  const delta = comparing && t && baseline ? figureOf(t, domain) - figureOf(baseline.totals, domain) : 0;
  const fixFirst = mode === "fix-first";
  const topAsset = world.assets.find((a) => a.id === topPriority?.assetId);
  const hasWorld = Object.keys(world.cells).length > 0;

  return (
    <aside aria-label="City pulse" className="absolute left-0 top-12 z-10 flex w-[248px] flex-col border-b border-r border-hairline bg-panel" style={{ maxHeight: `calc(100% - 48px - ${bottom}px)` }}>
      <div className="px-4 pb-3 pt-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-medium text-ink">{fixFirst ? "Prevention" : "City pulse"}</h2>
          <Tag className={horizon > 0 && !fixFirst ? "text-predicted" : ""}>{fixFirst ? "Long term" : horizon === 0 ? "NOW" : `Predicted ${horizonLabel(horizon)}m`}</Tag>
        </div>
        <p className="mt-0.5 truncate text-[11px] text-faint">{DISTRICT.name}</p>
      </div>

      <div className="border-t border-hairline px-4 py-3">
        <div className="flex items-center justify-between">
          <Label>{fixFirst ? "Fix first" : HERO[domain][0]}</Label>
          <Tag title="Computed by the AquaPulse engine">DERIVED</Tag>
        </div>
        {fixFirst ? (
          topPriority ? (
            <>
              <p className="mono mt-1 text-[32px] font-medium leading-none text-ink">
                {topPriority.assetId}
                <span className="ml-2 text-[15px] text-muted">{Math.round(topPriority.score)}/100</span>
              </p>
              <p className="mt-1.5 truncate text-[11px] text-muted">
Priority score · tier {topPriority.tier} · {topAsset?.name ?? "asset"}
              </p>
            </>
          ) : (
            <Empty>The engine has not ranked any infrastructure yet.</Empty>
          )
        ) : t ? (
          <>
            <AnimatedNumber value={figureOf(t, domain)} className="tabular mt-1 block text-[32px] font-medium leading-none tracking-tight text-ink" />
            <p className="tabular mt-1.5 flex h-4 items-center gap-1 text-[11px] text-muted">
              {delta !== 0 && baseline ? (
                <>
                  {delta < 0 ? <ArrowDown size={12} aria-hidden /> : <ArrowUp size={12} aria-hidden />}
                  est. {fmt(Math.abs(delta))} {delta < 0 ? "fewer" : "more"} vs no intervention
                </>
              ) : (
                <span className="truncate font-sans">
                  {HERO[domain][1]}
                  {horizon ? ` in ${horizon} min` : " right now"}
                </span>
              )}
            </p>
          </>
        ) : hasWorld ? (
          <Empty>Prediction engine has not returned totals yet.</Empty>
        ) : (
          <Skeleton lines={2} />
        )}
      </div>

      {t && !fixFirst && (
        <p className="border-t border-hairline px-4 py-2.5 text-[13px] leading-snug text-ink">
          {(() => {
            const when = horizon ? `within ${horizon} minutes` : "now";
            const names = t.facilitiesAtRisk.map((id) => world.facilities.find((f) => f.id === id)?.name.replace(/ \(sim\)$/, "")).filter(Boolean);
            if (names.length) return `Flooding ${horizon ? "may reach" : "has reached"} ${names[0]}${names.length > 1 ? ` and ${names.length - 1} more` : ""} ${when}.`;
            if (t.facilitiesShort.length) return `${t.facilitiesShort.length} critical ${t.facilitiesShort.length === 1 ? "facility is" : "facilities are"} short of water ${when}.`;
            if (t.exposedPopulation > 0) return `An estimated ${fmt(t.exposedPopulation)} people are exposed to flooding ${when}; no critical facility is at risk.`;
            if (t.populationShort > 0) return `An estimated ${fmt(t.populationShort)} people are short of water ${when}.`;
            return "No flooding or water shortage in the district right now.";
          })()}
        </p>
      )}

      {t && (
        <details className="border-t border-hairline px-4 py-2">
          <summary className="cursor-pointer py-0.5 text-[11px] uppercase tracking-[0.08em] text-muted hover:text-ink">Figures</summary>
        <dl>
          <Row label="Flood risk" value={<Band risk={t.maxFloodRisk} domain="flood" />} unit="peak" />
          <Row label="Water stress" value={<Band risk={t.maxScarcityRisk} domain="scarcity" />} unit="peak" />
          <Row label="Exposed to flooding" value={`est. ${fmt(t.exposedPopulation)}`} />
          <Row label="Short of water" value={`est. ${fmt(t.populationShort)}`} />
          <Row label="Active incidents" value={active.length} />
          <Row label="Facilities at risk / short" value={`${t.facilitiesAtRisk.length} / ${t.facilitiesShort.length}`} unit={`of ${world.facilities.length}`} />
        </dl>
        </details>
      )}

      <div className="border-t border-hairline px-4 py-3">
        <Label className="mb-2">Map mode</Label>
        <Segmented vertical label="Map mode" value={mode} onChange={onMode} options={MODES} />
      </div>

      {world.incidents.length > 0 && (
      <div className="flex min-h-0 flex-1 flex-col border-t border-hairline">
        <div className="flex items-center justify-between px-4 pb-1 pt-3">
          <Label>Incidents</Label>
          <span className="tabular text-[11px] text-faint">{world.incidents.length}</span>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto pb-2">
          {world.incidents.map((i) => {
            const on = i.id === selectedIncidentId;
            const p = shown?.cells[i.cellId];
            const risk = p ? (i.kind === "flood" ? p.floodRisk : p.scarcityRisk) : null;
            const Icon = i.kind === "flood" ? Waves : DropletOff;
            const off = i.status === "dismissed" || i.status === "resolved";
            return (
              <li key={i.id}>
                <button
                  type="button"
                  onClick={() => onSelectIncident(i.id)}
                  aria-pressed={on}
                  className={`flex w-full items-center gap-2.5 border-l-2 px-4 py-2 text-left transition-colors duration-150 hover:bg-panel-raised ${
                    on ? "border-ink bg-panel-raised" : "border-transparent"
                  }`}
                >
                  <Icon size={14} aria-hidden className={off ? "text-faint" : ""} style={off || risk == null ? undefined : { color: bandCss(risk, i.kind) }} />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-[13px] ${off ? "text-faint" : "text-ink"}`}>
                      <span className="mono">{i.id}</span> · {human(i.type)}
                    </span>
                    <span className="block text-[11px] uppercase tracking-[0.06em] text-faint">{i.status}</span>
                  </span>
                  {risk != null && (
                    <span className="tabular text-right text-[13px] text-ink">
                      {Math.round(risk)}
                      <span className="text-[11px] text-faint">%</span>
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      )}

      <p className="border-t border-hairline px-4 py-2 text-[10.5px] leading-snug text-faint">
        Infrastructure, demographics and history are simulated. Basemap © OpenFreeMap, OpenMapTiles, OpenStreetMap contributors.
      </p>
    </aside>
  );
}

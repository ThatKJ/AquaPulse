"use client";

import { ArrowDown, ArrowUp, DropletOff, Waves } from "lucide-react";
import type { WorldState } from "@/lib/schemas/domain";
import type { Horizon, Prediction } from "@/lib/schemas/simulation";
import { DISTRICT } from "@/lib/demo";
import type { Mode } from "./state";
import { AnimatedNumber, Empty, Label, Segmented, Skeleton, Tag, fmt, horizonLabel, human } from "./ui";

const MODES: { value: Mode; label: string }[] = [
  { value: "combined", label: "Combined" },
  { value: "flood", label: "Flood" },
  { value: "scarcity", label: "Scarcity" },
  { value: "fix-first", label: "Fix this first" },
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

export function CityPulse({
  world,
  shown,
  baseline,
  comparing,
  horizon,
  mode,
  selectedIncidentId,
  onMode,
  onSelectIncident,
}: {
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
  const delta = comparing && t && baseline ? t.exposedPopulation - baseline.totals.exposedPopulation : 0;
  const hasWorld = Object.keys(world.cells).length > 0;

  return (
    <aside aria-label="City pulse" className="absolute bottom-0 left-0 top-12 z-10 flex w-[280px] flex-col border-r border-hairline bg-panel">
      <div className="px-4 pb-3 pt-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-medium text-ink">City pulse</h2>
          <Tag>{horizon === 0 ? "NOW" : `Predicted ${horizonLabel(horizon)}m`}</Tag>
        </div>
        <p className="mt-0.5 truncate text-[11px] text-faint">{DISTRICT.name}</p>
      </div>

      <div className="border-t border-hairline px-4 py-3">
        <div className="flex items-center justify-between">
          <Label>People at risk (est.)</Label>
          <Tag title="Computed by the AquaPulse engine">DERIVED</Tag>
        </div>
        {t ? (
          <>
            <AnimatedNumber value={t.exposedPopulation} className="tabular mt-1 block text-[40px] font-medium leading-none text-ink" />
            <p className="tabular mt-1.5 flex h-4 items-center gap-1 text-[11px] text-muted">
              {delta !== 0 && baseline ? (
                <>
                  {delta < 0 ? <ArrowDown size={12} aria-hidden /> : <ArrowUp size={12} aria-hidden />}
                  est. {fmt(Math.abs(delta))} {delta < 0 ? "fewer" : "more"} vs no intervention
                </>
              ) : (
                <span className="font-sans">exposed to flooding{horizon ? ` in ${horizon} min` : " right now"}</span>
              )}
            </p>
          </>
        ) : hasWorld ? (
          <Empty>Prediction engine has not returned totals yet.</Empty>
        ) : (
          <Skeleton lines={2} />
        )}
      </div>

      {t && (
        <dl className="border-t border-hairline px-4 py-2">
          <Row label="Flood risk" value={Math.round(t.maxFloodRisk)} unit="/ 100 peak" />
          <Row label="Water stress" value={Math.round(t.maxScarcityRisk)} unit="/ 100 peak" />
          <Row label="People short of water" value={`est. ${fmt(t.populationShort)}`} />
          <Row label="Active incidents" value={active.length} />
          <Row label="Critical facilities at risk" value={t.facilitiesAtRisk.length} unit={`of ${world.facilities.length}`} />
        </dl>
      )}

      <div className="border-t border-hairline px-4 py-3">
        <Label className="mb-2">Map mode</Label>
        <Segmented vertical label="Map mode" value={mode} onChange={onMode} options={MODES} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col border-t border-hairline">
        <div className="flex items-center justify-between px-4 pb-1 pt-3">
          <Label>Incidents</Label>
          <span className="tabular text-[11px] text-faint">{world.incidents.length}</span>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto pb-2">
          {world.incidents.length === 0 && (
            <li className="px-4">
              <Empty>No incidents yet. Reports that pass verification open one here; start a demo scenario to see it happen.</Empty>
            </li>
          )}
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
                  <Icon size={14} aria-hidden className={off ? "text-faint" : i.kind === "flood" ? "text-flood-high" : "text-scarcity-high"} />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-[13px] ${off ? "text-faint" : "text-ink"}`}>
                      <span className="tabular">{i.id}</span> · {human(i.type)}
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

      <p className="border-t border-hairline px-4 py-2 text-[11px] leading-snug text-faint">
        Infrastructure, demographics and history are simulated. Basemap © OpenFreeMap, OpenMapTiles, OpenStreetMap contributors.
      </p>
    </aside>
  );
}

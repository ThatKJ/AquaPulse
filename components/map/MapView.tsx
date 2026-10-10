"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Map as MlMap, Marker, setWorkerUrl, type StyleSpecification } from "maplibre-gl";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { H3HexagonLayer } from "@deck.gl/geo-layers";
import { ArcLayer } from "@deck.gl/layers";
import { animate } from "motion";
import { useReducedMotion } from "motion/react";
import {
  Cylinder,
  DropletOff,
  Fan,
  GraduationCap,
  HardHat,
  Hospital,
  Tent,
  TriangleAlert,
  Truck,
  Waves,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { FacilityKind, LngLat, ResourceKind, WorldState } from "@/lib/schemas/domain";
import type { CellPrediction, Horizon, InfraPriority, Prediction, TankerAssignment } from "@/lib/schemas/simulation";
import { DISTRICT } from "@/lib/demo";
import type { Mode } from "../state";
import { fmt, human, pct } from "../ui";

// ponytail: Turbopack does not resolve MapLibre 6's worker URL, so public/ carries a copy of
// node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs. Re-copy it whenever maplibre-gl is upgraded.
setWorkerUrl("/maplibre-gl-worker.mjs");

const STYLE_URL = "https://tiles.openfreemap.org/styles/dark";
const SURFACE = "#0a0d10";
/** Shown until the basemap arrives, and for good if it never does: cells still render over it. */
const BLANK_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "background", type: "background", paint: { "background-color": SURFACE } }],
};

/**
 * The stock dark style is near-black on near-black. Re-tint it to the AquaPulse surface palette so
 * water and the road grid read quietly under the data, and labels stay legible but recessive.
 */
function tint(style: StyleSpecification): StyleSpecification {
  const paint = (l: StyleSpecification["layers"][number]): Record<string, unknown> | null => {
    const src = "source-layer" in l ? l["source-layer"] : undefined;
    if (l.type === "background") return { "background-color": SURFACE };
    if (l.type === "symbol") return { "text-color": "#6b7885", "text-halo-color": SURFACE, "text-halo-width": 1.2 };
    if (l.type === "fill" && src === "water") return { "fill-color": "#0f2530" };
    if (l.type === "line" && src === "waterway") return { "line-color": "#17394a" };
    if (l.type === "fill" && (src === "landcover" || src === "landuse")) return { "fill-color": "#0d1317" };
    if (l.type === "fill" && src === "building") return { "fill-color": "#11171c", "fill-outline-color": "#161d23" };
    if (src === "aeroway") return l.type === "fill" ? { "fill-color": "#0d1317" } : { "line-color": "#1a232b" };
    if (l.type === "line" && src === "transportation") {
      if (l.id.includes("rail") || l.id.includes("pier")) return null;
      if (l.id.includes("casing")) return { "line-color": "#2c3944" };
      return { "line-color": l.id.includes("minor") || l.id.includes("path") ? "#1a232b" : "#232e38" };
    }
    return null;
  };
  return { ...style, layers: style.layers.map((l) => ({ ...l, paint: { ...l.paint, ...paint(l) } }) as typeof l) };
}

type RGB = [number, number, number];
type RGBA = [number, number, number, number];
const FLOOD: RGB[] = [[34, 211, 238], [245, 158, 11], [239, 68, 68]];
const SCARCITY: RGB[] = [[103, 232, 249], [245, 158, 11]];
const PREDICTED: RGB = [167, 139, 250];
const TIER: Record<1 | 2 | 3, RGB> = { 1: FLOOD[2], 2: FLOOD[1], 3: FLOOD[0] };

function ramp(stops: RGB[], risk: number): RGB {
  const t = (Math.min(100, Math.max(0, risk)) / 100) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(t));
  const f = t - i;
  return [0, 1, 2].map((k) => Math.round(stops[i][k] + (stops[i + 1][k] - stops[i][k]) * f)) as RGB;
}

function cellLook(p: CellPrediction | undefined, mode: Mode): { risk: number; rgb: RGB } {
  if (!p) return { risk: 0, rgb: [91, 103, 115] };
  const flood = mode === "flood" || (mode !== "scarcity" && p.floodRisk >= p.scarcityRisk);
  return flood ? { risk: p.floodRisk, rgb: ramp(FLOOD, p.floodRisk) } : { risk: p.scarcityRisk, rgb: ramp(SCARCITY, p.scarcityRisk) };
}

type CellDatum = { id: string; fill: RGBA; line: RGBA; elevation: number };
type Link = { from: LngLat; to: LngLat };

const FACILITY_ICON: Record<FacilityKind, LucideIcon> = {
  hospital: Hospital,
  school: GraduationCap,
  shelter: Tent,
  pump_station: Cylinder,
  substation: Zap,
};
const RESOURCE_ICON: Record<ResourceKind, LucideIcon> = { pump: Fan, crew: HardHat, tanker: Truck };

/** An HTML marker whose content is rendered by React. */
function Pin({ map, at, z = 1, children }: { map: MlMap; at: LngLat; z?: number; children: ReactNode }) {
  const [el] = useState(() => document.createElement("div"));
  const { lng, lat } = at;
  useEffect(() => {
    const m = new Marker({ element: el, anchor: "center" }).setLngLat([lng, lat]).addTo(map);
    m.getElement().style.zIndex = String(z);
    return () => {
      m.remove();
    };
  }, [map, el, lng, lat, z]);
  return createPortal(children, el);
}

/** 0 -> 1 once each time `key` changes, so a new route or risk link draws itself in. */
function useDrawIn(key: string): number {
  const reduce = useReducedMotion();
  const [st, setSt] = useState({ key: "", t: 1 });
  useEffect(() => {
    if (reduce || !key) return;
    const c = animate(0, 1, { duration: 0.9, ease: "easeOut", onUpdate: (t) => setSt({ key, t }) });
    return () => c.stop();
  }, [key, reduce]);
  if (reduce || !key) return 1;
  return st.key === key ? st.t : 0;
}

const lerp = (a: LngLat, b: LngLat, t: number): [number, number] => [a.lng + (b.lng - a.lng) * t, a.lat + (b.lat - a.lat) * t];
const dist2 = (a: LngLat, b: LngLat) => (a.lng - b.lng) ** 2 + (a.lat - b.lat) ** 2;
const LABEL = "tabular whitespace-nowrap border border-hairline bg-panel px-1.5 py-0.5 text-[11px] uppercase tracking-[0.06em] text-ink";

export type MapViewProps = {
  world: WorldState;
  prediction: Prediction | null;
  mode: Mode;
  horizon: Horizon;
  selectedIncidentId: string | null;
  selectedAssetId: string | null;
  priorities: InfraPriority[] | null;
  tankerPlan: TankerAssignment[] | null;
  padding: { top: number; left: number; right: number; bottom: number };
  onSelectIncident: (id: string) => void;
  onSelectAsset: (id: string) => void;
};

export default function MapView(props: MapViewProps) {
  const { world, prediction, mode, horizon, selectedIncidentId, selectedAssetId, priorities, tankerPlan, padding } = props;
  const container = useRef<HTMLDivElement>(null);
  const overlay = useRef<MapboxOverlay | null>(null);
  const [map, setMap] = useState<MlMap | null>(null);
  const [basemap, setBasemap] = useState<"loading" | "ok" | "offline">("loading");
  const [hover, setHover] = useState<{ x: number; y: number; id: string; width: number } | null>(null);
  const reduce = useReducedMotion();

  // Map + deck overlay, created once.
  useEffect(() => {
    if (!container.current) return;
    const m = new MlMap({
      container: container.current,
      style: BLANK_STYLE,
      center: [DISTRICT.center.lng, DISTRICT.center.lat],
      zoom: DISTRICT.zoom,
      pitch: 50,
      bearing: -14,
      maxPitch: 70,
      attributionControl: false, // credited in the left rail; the default corner sits under the docked panels
    });
    const o = new MapboxOverlay({ interleaved: false, layers: [] });
    m.addControl(o);
    overlay.current = o;
    // Tile and glyph failures must not take the data layers down or spam the console.
    m.on("error", () => setBasemap((b) => (b === "ok" ? b : "offline")));
    m.on("style.load", () => {
      if (!m.getSource("openmaptiles") || m.getLayer("buildings-3d")) return;
      const firstLabel = m.getStyle().layers.find((l) => l.type === "symbol")?.id;
      m.addLayer(
        {
          id: "buildings-3d",
          type: "fill-extrusion",
          source: "openmaptiles",
          "source-layer": "building",
          minzoom: 12.5,
          paint: {
            "fill-extrusion-color": "#202a33",
            "fill-extrusion-height": ["coalesce", ["get", "render_height"], 6],
            "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
            "fill-extrusion-opacity": 0.45,
          },
        },
        firstLabel,
      );
    });
    const abort = new AbortController();
    fetch(STYLE_URL, { signal: abort.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((style: StyleSpecification) => {
        m.setStyle(tint(style));
        setBasemap("ok");
      })
      .catch(() => {
        if (!abort.signal.aborted) setBasemap("offline");
      });
    setMap(m);
    return () => {
      abort.abort();
      overlay.current = null;
      setMap(null);
      m.remove();
    };
  }, []);

  // Keep the camera's centre in the part of the map the docked panels leave visible.
  useEffect(() => {
    map?.easeTo({ padding, duration: reduce ? 0 : 300 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, padding.top, padding.left, padding.right, padding.bottom, reduce]);

  const selected = world.incidents.find((i) => i.id === selectedIncidentId) ?? null;
  const selLng = selected?.location.lng;
  const selLat = selected?.location.lat;
  useEffect(() => {
    if (!map || selLng == null || selLat == null) return;
    map.flyTo({ center: [selLng, selLat], zoom: Math.max(map.getZoom(), 14), duration: reduce ? 0 : 1000 });
  }, [map, selLng, selLat, reduce]);

  const tierByAsset = useMemo(() => new Map((priorities ?? []).map((p) => [p.assetId, p])), [priorities]);

  const cells = useMemo<CellDatum[]>(() => {
    const ids = Object.keys(world.cells).sort(); // stable order so deck interpolates each cell to itself
    if (mode === "fix-first") {
      const byCell = new Map<string, InfraPriority>();
      for (const a of world.assets) {
        const p = tierByAsset.get(a.id);
        if (!p) continue;
        for (const c of a.cellIds) if (!byCell.has(c) || byCell.get(c)!.rank > p.rank) byCell.set(c, p);
      }
      return ids.map((id) => {
        const p = byCell.get(id);
        if (!p) return { id, fill: [91, 103, 115, 14], line: [0, 0, 0, 0], elevation: 0 };
        return { id, fill: [...TIER[p.tier], [0, 130, 95, 22][p.tier]] as RGBA, line: [0, 0, 0, 0], elevation: p.tier === 3 ? 0 : p.score * 0.6 };
      });
    }
    return ids.map((id) => {
      const { risk, rgb } = cellLook(prediction?.cells[id], mode);
      const a = prediction ? 8 + 190 * (risk / 100) ** 1.6 : 22;
      return {
        id,
        fill: [...rgb, Math.round(a)] as RGBA,
        line: [...PREDICTED, horizon > 0 && risk >= 40 ? 230 : 0] as RGBA,
        elevation: risk,
      };
    });
  }, [world.cells, world.assets, prediction, mode, horizon, tierByAsset]);

  const activeFloods = useMemo(
    () => world.incidents.filter((i) => i.kind === "flood" && i.status !== "dismissed" && i.status !== "resolved"),
    [world.incidents],
  );
  const atRisk = useMemo(() => new Set(prediction?.totals.facilitiesAtRisk ?? []), [prediction]);
  const short = useMemo(() => new Set(prediction?.totals.facilitiesShort ?? []), [prediction]);

  // ponytail: a facility at risk links to the nearest active flood incident; use AFFECTS relationships if the engine starts emitting them.
  const riskLinks = useMemo<Link[]>(() => {
    if (mode === "scarcity" || mode === "fix-first" || !activeFloods.length) return [];
    return world.facilities
      .filter((f) => atRisk.has(f.id))
      .map((f) => ({
        from: f.location,
        to: activeFloods.reduce((best, i) => (dist2(i.location, f.location) < dist2(best.location, f.location) ? i : best)).location,
      }));
  }, [mode, activeFloods, world.facilities, atRisk]);

  const routes = useMemo<Link[]>(() => {
    if (mode !== "scarcity" || !tankerPlan) return [];
    return tankerPlan.flatMap((t) => {
      const from = world.resources.find((r) => r.id === t.resourceId)?.location;
      const to = world.facilities.find((f) => f.id === t.targetId)?.location ?? world.cells[t.targetId]?.center;
      return from && to ? [{ from, to }] : [];
    });
  }, [mode, tankerPlan, world.resources, world.facilities, world.cells]);

  const linkT = useDrawIn(riskLinks.map((l) => `${l.from.lng},${l.from.lat}>${l.to.lng},${l.to.lat}`).join("|"));
  const routeT = useDrawIn(routes.map((l) => `${l.from.lng},${l.from.lat}>${l.to.lng},${l.to.lat}`).join("|"));

  useEffect(() => {
    const ms = reduce ? 0 : 800;
    overlay.current?.setProps({
      layers: [
        new H3HexagonLayer<CellDatum>({
          id: "cells",
          data: cells,
          getHexagon: (d) => d.id,
          highPrecision: false,
          coverage: 0.94,
          extruded: true,
          elevationScale: 2.2,
          getElevation: (d) => d.elevation,
          getFillColor: (d) => d.fill,
          wireframe: true,
          getLineColor: (d) => d.line,
          material: { ambient: 0.85, diffuse: 0.25, shininess: 0, specularColor: [0, 0, 0] },
          pickable: true,
          autoHighlight: true,
          highlightColor: [230, 237, 243, 36],
          transitions: { getFillColor: ms, getElevation: ms, getLineColor: ms },
          onHover: (info) => setHover(info.object ? { x: info.x, y: info.y, id: info.object.id, width: info.viewport?.width ?? 0 } : null),
        }),
        new ArcLayer<Link>({
          id: "risk-links",
          parameters: { depthCompare: "always" }, // routes stay readable over the extruded cells
          data: riskLinks,
          getSourcePosition: (d) => [d.to.lng, d.to.lat],
          getTargetPosition: (d) => lerp(d.to, d.from, linkT),
          getSourceColor: [230, 237, 243, 90],
          getTargetColor: [230, 237, 243, 235],
          getWidth: 2,
          getHeight: 0.35,
          updateTriggers: { getTargetPosition: linkT },
        }),
        new ArcLayer<Link>({
          id: "tanker-routes",
          parameters: { depthCompare: "always" }, // routes stay readable over the extruded cells
          data: routes,
          getSourcePosition: (d) => [d.from.lng, d.from.lat],
          getTargetPosition: (d) => lerp(d.from, d.to, routeT),
          getSourceColor: [103, 232, 249, 110],
          getTargetColor: [103, 232, 249, 240],
          getWidth: 2.5,
          getHeight: 0.5,
          updateTriggers: { getTargetPosition: routeT },
        }),
      ],
    });
  }, [map, cells, riskLinks, routes, linkT, routeT, reduce]);

  const hp = hover ? prediction?.cells[hover.id] : undefined;
  const hc = hover ? world.cells[hover.id] : undefined;
  const flip = hover != null && hover.x > hover.width - padding.right - 280;
  const routed = new Set((mode === "scarcity" ? tankerPlan ?? [] : []).map((t) => t.resourceId));
  const riskOf = (cellId: string, kind: "flood" | "scarcity") => {
    const p = prediction?.cells[cellId];
    return p ? (kind === "flood" ? p.floodRisk : p.scarcityRisk) : null;
  };

  return (
    <div className="absolute inset-0 bg-surface">
      <div ref={container} className="h-full w-full" />

      {map && (
        <>
          {world.facilities.map((f) => {
            const Icon = FACILITY_ICON[f.kind];
            const flagged = mode === "scarcity" ? short.has(f.id) : mode !== "fix-first" && atRisk.has(f.id);
            const state = flagged ? (mode === "scarcity" ? "short of water" : "at flood risk") : null;
            return (
              <Pin key={f.id} map={map} at={f.location} z={flagged ? 3 : 2}>
                <div
                  role="img"
                  aria-label={`${f.name}, ${human(f.kind)}${state ? `, ${state}` : ""}`}
                  title={`${f.name} · ${human(f.kind)}${state ? ` · ${state}` : ""}`}
                  className={`relative flex h-[22px] w-[22px] items-center justify-center border bg-panel ${
                    flagged ? "border-flood-mid text-ink" : "border-hairline text-muted"
                  }`}
                >
                  <Icon size={13} aria-hidden />
                  {flagged && (
                    <TriangleAlert size={11} aria-hidden className="absolute -right-1.5 -top-1.5 fill-surface text-flood-mid" />
                  )}
                </div>
              </Pin>
            );
          })}

          {world.resources.map((r) => {
            const Icon = RESOURCE_ICON[r.kind];
            const on = routed.has(r.id);
            return (
              <Pin key={r.id} map={map} at={r.location} z={on ? 3 : 1}>
                <div className="flex items-center gap-1">
                  <div
                    role="img"
                    aria-label={`${r.name}, ${r.kind}, ${r.available ? "available" : "committed"}`}
                    title={`${r.id} · ${r.name} · ${r.available ? "available" : "committed"}`}
                    className={`flex h-[18px] w-[18px] items-center justify-center rounded-full border bg-surface ${
                      on ? "border-scarcity-low text-scarcity-low" : "border-hairline text-muted"
                    } ${r.available || on ? "" : "opacity-50"}`}
                  >
                    <Icon size={11} aria-hidden />
                  </div>
                  {on && <span className={LABEL}>{r.id}</span>}
                </div>
              </Pin>
            );
          })}

          {world.assets.map((a) => {
            const pr = tierByAsset.get(a.id);
            const suspected = mode !== "fix-first" && selected?.suspectedAssetId === a.id;
            const fix = mode === "fix-first" && pr != null;
            const picked = fix && selectedAssetId === a.id;
            const labelled = suspected || (fix && (pr.tier < 3 || picked));
            const dot = (
              <span
                aria-hidden
                className={`block rotate-45 border ${
                  suspected || picked
                    ? "h-3 w-3 border-ink bg-flood-high"
                    : fix
                      ? "h-2.5 w-2.5 border-ink bg-panel"
                      : "h-2 w-2 border-faint bg-surface"
                }`}
              />
            );
            const text = suspected ? `${a.id} · Suspected cause` : fix ? `#${pr.rank} ${a.id} · Tier ${pr.tier}` : a.id;
            return (
              <Pin key={a.id} map={map} at={a.location} z={labelled ? 4 : 1}>
                {fix ? (
                  <button
                    type="button"
                    onClick={() => props.onSelectAsset(a.id)}
                    aria-label={`${a.name}, priority ${pr.rank}, tier ${pr.tier}`}
                    aria-pressed={picked}
                    className="flex items-center gap-1.5 p-1"
                  >
                    {dot}
                    {labelled && <span className={`${LABEL} ${picked ? "border-ink" : ""}`}>{text}</span>}
                  </button>
                ) : (
                  <div role="img" aria-label={`${a.name}${suspected ? ", suspected cause" : ""}`} title={`${a.id} · ${a.name}`} className="flex items-center gap-1.5">
                    {dot}
                    {suspected && <span className={LABEL}>{text}</span>}
                  </div>
                )}
              </Pin>
            );
          })}

          {mode !== "fix-first" &&
            world.incidents
              .filter((i) => mode === "combined" || i.kind === mode)
              .map((i) => {
                const on = i.id === selectedIncidentId;
                const off = i.status === "dismissed" || i.status === "resolved";
                const Icon = i.kind === "flood" ? Waves : DropletOff;
                const risk = riskOf(i.cellId, i.kind);
                return (
                  <Pin key={i.id} map={map} at={i.location} z={on ? 6 : 5}>
                    <button
                      type="button"
                      onClick={() => props.onSelectIncident(i.id)}
                      aria-label={`Incident ${i.id}, ${human(i.type)}, ${i.status}`}
                      aria-pressed={on}
                      className="flex items-center gap-1.5"
                    >
                      <span
                        className={`flex h-7 w-7 items-center justify-center rounded-full border bg-surface ${
                          off
                            ? "border-hairline text-faint"
                            : i.kind === "flood"
                              ? "border-flood-high text-flood-high"
                              : "border-scarcity-high text-scarcity-high"
                        } ${on ? "outline outline-1 outline-offset-2 outline-ink" : ""}`}
                      >
                        <Icon size={15} aria-hidden />
                      </span>
                      {on ? (
                        <span className={LABEL}>
                          {i.id} · {human(i.type)}
                          {risk != null && ` · ${Math.round(risk)}% risk`}
                          {i.evidenceScore && ` · ${Math.round(i.evidenceScore.total)}% evidence`}
                        </span>
                      ) : (
                        <span className={`${LABEL} ${off ? "text-faint line-through" : ""}`}>{i.id}</span>
                      )}
                    </button>
                  </Pin>
                );
              })}
        </>
      )}

      {basemap === "offline" && (
        <div role="status" className={`${LABEL} absolute normal-case tracking-normal text-muted`} style={{ left: padding.left + 12, top: padding.top + 12 }}>
          Basemap: OFFLINE — showing data layers only
        </div>
      )}

      {hover && hc && (
        <div
          className="pointer-events-none absolute z-20 w-[248px] border border-hairline bg-panel p-2.5 text-[13px]"
          style={{ left: flip ? hover.x - 260 : hover.x + 14, top: Math.max(padding.top + 4, hover.y - 20) }}
        >
          <div className="mb-1.5 flex items-center justify-between text-[11px] uppercase tracking-[0.06em] text-muted">
            <span>HydroTwin cell</span>
            <span className="tabular">{horizon === 0 ? "NOW" : `predicted +${horizon}m`}</span>
          </div>
          {hp ? (
            <>
              <dl className="tabular grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5">
                <dt className="font-sans text-muted">Flood risk</dt>
                <dd className="text-right">{Math.round(hp.floodRisk)} / 100</dd>
                <dt className="font-sans text-muted">Scarcity risk</dt>
                <dd className="text-right">{Math.round(hp.scarcityRisk)} / 100</dd>
                <dt className="font-sans text-muted">Confidence</dt>
                <dd className="text-right">{pct(hp.confidence)}</dd>
                <dt className="font-sans text-muted">Exposed population</dt>
                <dd className="text-right">est. {fmt(hp.exposedPopulation)}</dd>
                <dt className="font-sans text-muted">Trend</dt>
                <dd className="text-right">{hp.trend}</dd>
              </dl>
              {hp.contributors.length > 0 && (
                <div className="mt-2 border-t border-hairline pt-1.5">
                  <div className="mb-0.5 text-[11px] uppercase tracking-[0.06em] text-muted">Top contributors</div>
                  {hp.contributors.slice(0, 3).map((c) => (
                    <div key={c.factor} className="flex justify-between gap-3">
                      <span className="truncate">{c.label}</span>
                      <span className="tabular text-muted">
                        {c.contribution >= 0 ? "+" : "−"}
                        {Math.abs(c.contribution * 100).toFixed(0)} pts
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-faint">No prediction for this cell yet.</p>
          )}
        </div>
      )}
    </div>
  );
}

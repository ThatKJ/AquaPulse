"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { LngLatBounds, Map as MlMap, Marker, setWorkerUrl, type StyleSpecification } from "maplibre-gl";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { H3HexagonLayer } from "@deck.gl/geo-layers";
import { ArcLayer, LineLayer } from "@deck.gl/layers";
import { animate } from "motion";
import { motion, useReducedMotion } from "motion/react";
import {
  CircleCheck,
  Cylinder,
  DropletOff,
  Fan,
  GraduationCap,
  HardHat,
  Hospital,
  MessageSquare,
  ShieldCheck,
  Tent,
  TriangleAlert,
  Truck,
  Waves,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { FacilityKind, Incident, LngLat, ResourceKind, WorldState } from "@/lib/schemas/domain";
import type { CellPrediction, Horizon, InfraPriority, Prediction, TankerAssignment } from "@/lib/schemas/simulation";
import { DISTRICT } from "@/lib/demo";
import type { Mode } from "../state";
import { PREDICTED, RISK_BANDS, VERDICT_LABEL, VERIFIED, bandCss, riskBand, type RiskBandKey, type RiskDomain } from "../risk";
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
const INK: RGB = [230, 237, 243];
const css = (c: RGB) => `rgb(${c.join(" ")})`;
// Every cell is perceptible at rest; alpha and outline strength rise with the band so critical dominates.
const FILL_A: Record<RiskBandKey, number> = { safe: 52, watch: 72, elevated: 128, high: 166, critical: 212 };
// Calm bands keep a visible but quiet outline, so the grid never reads as neon.
const LINE_A: Record<RiskBandKey, number> = { safe: 78, watch: 108, elevated: 200, high: 225, critical: 255 };
const bandIndex = (risk: number) => RISK_BANDS.indexOf(riskBand(risk));
// Priority tiers differ by outline strength and height as well as colour.
const TIER: Record<1 | 2 | 3, { rgb: RGB; fill: number; line: RGBA; lift: number }> = {
  1: { rgb: RISK_BANDS[4].flood, fill: 150, line: [...INK, 255], lift: 1.2 },
  2: { rgb: RISK_BANDS[2].flood, fill: 105, line: [...INK, 120], lift: 0.5 },
  3: { rgb: RISK_BANDS[1].flood, fill: 46, line: [...RISK_BANDS[1].flood, 90], lift: 0 },
};

/** Which domain a cell is drawn in, and its risk there. Combined shows the worse of the two. */
function cellLook(p: CellPrediction | undefined, mode: Mode): { risk: number; domain: RiskDomain } {
  if (!p) return { risk: 0, domain: "flood" };
  const flood = mode === "flood" || (mode !== "scarcity" && p.floodRisk >= p.scarcityRisk);
  return flood ? { risk: p.floodRisk, domain: "flood" } : { risk: p.scarcityRisk, domain: "scarcity" };
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
  /** Prediction on screen (with the intervention when one is previewed or applied). */
  prediction: Prediction | null;
  /** Without-intervention prediction at the same horizon; equals `prediction` when nothing is compared. */
  baseline: Prediction | null;
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

function Swatch({ color, dashed = false }: { color: string; dashed?: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-2.5 w-2.5 border ${dashed ? "border-dashed" : ""}`}
      style={dashed ? { borderColor: color } : { borderColor: color, background: color, opacity: 0.85 }}
    />
  );
}

/** One flat strip: the band grammar for the active domain, with the marker key on demand. */
function Legend({ mode, style }: { mode: Mode; style: React.CSSProperties }) {
  const [open, setOpen] = useState(false);
  const domain: RiskDomain = mode === "scarcity" ? "scarcity" : "flood";
  const item = "flex items-center gap-1.5 whitespace-nowrap";
  const key: [LucideIcon, string][] = [
    [Waves, "Flood incident"],
    [DropletOff, "Scarcity incident"],
    [MessageSquare, "Citizen report"],
    [Hospital, "Hospital"],
    [GraduationCap, "School"],
    [Tent, "Shelter"],
    [Fan, "Pump"],
    [HardHat, "Crew"],
    [Truck, "Tanker"],
  ];
  return (
    <div className="absolute z-10 bg-surface/80 text-[11px] text-muted" style={style}>
      {open && (
        <ul id="marker-key" className="grid grid-cols-3 gap-x-4 gap-y-1 border-b border-hairline px-2.5 py-2">
          {key.map(([Icon, label]) => (
            <li key={label} className={item}>
              <Icon size={12} aria-hidden className="text-ink" />
              {label}
            </li>
          ))}
          <li className={item}>
            <span aria-hidden className="block h-2 w-2 rotate-45 border border-ink" />
            Drain / pipe asset
          </li>
          <li className={`${item} col-span-2`}>
            <span aria-hidden className="block h-3 w-3 rounded-full border border-dashed border-muted" />
            Dashed marker = unverified
          </li>
        </ul>
      )}
      <div className="flex min-h-7 flex-wrap items-center gap-x-3 gap-y-0.5 px-2.5 py-1">
        <span className="uppercase tracking-[0.06em] text-ink">
          {mode === "fix-first" ? "Upgrade priority" : mode === "scarcity" ? "Water stress" : mode === "flood" ? "Flood risk" : "Risk · worse of flood, scarcity"}
        </span>
        {mode === "fix-first"
          ? ([1, 2, 3] as const).map((t) => (
              <span key={t} className={item}>
                <Swatch color={css(TIER[t].rgb)} />
                Priority {t}
              </span>
            ))
          : RISK_BANDS.map((b) => (
              <span key={b.key} className={item} title={`${b.label}: risk ${b.min} and above`}>
                <Swatch color={css(b[domain])} />
                <span aria-hidden>{b.glyph}</span>
                {b.label}
              </span>
            ))}
        {mode !== "fix-first" && (
          <>
            <span className={item}>
              <Swatch color={css(PREDICTED)} dashed />
              Predicted
            </span>
            <span className={item}>
              <Swatch color={css(VERIFIED)} dashed />
              Protected
            </span>
          </>
        )}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="marker-key"
          className="border-l border-hairline pl-3 uppercase tracking-[0.06em] text-muted hover:text-ink"
        >
          Marker key
        </button>
      </div>
    </div>
  );
}

export default function MapView(props: MapViewProps) {
  const { world, prediction, baseline, mode, horizon, selectedIncidentId, selectedAssetId, priorities, tankerPlan, padding } = props;
  const container = useRef<HTMLDivElement>(null);
  const overlay = useRef<MapboxOverlay | null>(null);
  const [map, setMap] = useState<MlMap | null>(null);
  const [basemap, setBasemap] = useState<"loading" | "ok" | "offline">("loading");
  const [near, setNear] = useState(false);
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
    m.on("zoom", () => setNear(m.getZoom() >= 13.5));
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
  const selHeld = selected?.evidenceScore?.verdict === "hold";
  useEffect(() => {
    if (!map || selLng == null || selLat == null) return;
    // Close enough to read the incident, far enough that its neighbouring cells stay in view.
    // An unverified report gets no close-up: the twin around it is the point.
    const zoom = selHeld ? Math.min(map.getZoom(), DISTRICT.zoom + 0.2) : Math.min(Math.max(map.getZoom(), 13.6), 14);
    map.flyTo({ center: [selLng, selLat], zoom, duration: reduce ? 0 : 1000 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, selLng, selLat, reduce]);

  // Prevention is a district-wide view.
  useEffect(() => {
    if (map && mode === "fix-first") map.flyTo({ center: [DISTRICT.center.lng, DISTRICT.center.lat], zoom: DISTRICT.zoom, duration: reduce ? 0 : 1000 });
  }, [map, mode, reduce]);

  const tierByAsset = useMemo(() => new Map((priorities ?? []).map((p) => [p.assetId, p])), [priorities]);
  const comparing = baseline != null && baseline !== prediction;

  const cells = useMemo<CellDatum[]>(() => {
    const ids = Object.keys(world.cells).sort(); // stable order so deck interpolates each cell to itself
    if (mode === "fix-first") {
      // Emergency risk is dimmed out entirely here: only upgrade priority is drawn.
      const byCell = new Map<string, InfraPriority>();
      for (const a of world.assets) {
        const p = tierByAsset.get(a.id);
        if (!p) continue;
        for (const c of a.cellIds) if (!byCell.has(c) || byCell.get(c)!.rank > p.rank) byCell.set(c, p);
      }
      return ids.map((id) => {
        const p = byCell.get(id);
        if (!p) return { id, fill: [91, 103, 115, 12], line: [91, 103, 115, 34], elevation: 1 };
        const t = TIER[p.tier];
        return { id, fill: [...t.rgb, t.fill] as RGBA, line: t.line, elevation: 1 + p.score * t.lift };
      });
    }
    return ids.map((id) => {
      const { risk, domain } = cellLook(prediction?.cells[id], mode);
      const band = riskBand(risk);
      const rgb = prediction ? band[domain] : ([91, 103, 115] as RGB);
      // A cell that falls a band under the intervention is outlined green; a forecast cell at elevated or above, violet.
      const dropped = comparing && bandIndex(cellLook(baseline?.cells[id], mode).risk) > bandIndex(risk);
      const line: RGBA = dropped
        ? [...VERIFIED, 235]
        : horizon > 0 && band.min >= 45
          ? [...PREDICTED, 235]
          : [...rgb, LINE_A[band.key]];
      const elevation = band.min >= 80 ? risk * 1.7 : band.min >= 45 ? risk : band.min >= 25 ? risk * 0.35 : 1;
      return { id, fill: [...rgb, FILL_A[band.key]] as RGBA, line, elevation };
    });
  }, [world.cells, world.assets, prediction, baseline, comparing, mode, horizon, tierByAsset]);

  const activeFloods = useMemo(
    () => world.incidents.filter((i) => i.kind === "flood" && i.status !== "dismissed" && i.status !== "resolved"),
    [world.incidents],
  );
  const flaggedKey = mode === "scarcity" ? "facilitiesShort" : "facilitiesAtRisk";
  const flagged = useMemo(() => new Set(mode === "fix-first" ? [] : (prediction?.totals[flaggedKey] ?? [])), [prediction, flaggedKey, mode]);
  // Flagged without the intervention, clear with it.
  const protectedIds = useMemo(
    () => new Set(comparing && mode !== "fix-first" ? (baseline?.totals[flaggedKey] ?? []).filter((id) => !flagged.has(id)) : []),
    [comparing, mode, baseline, flaggedKey, flagged],
  );

  // ponytail: a facility at risk links to the nearest active flood incident; use AFFECTS relationships if the engine starts emitting them.
  const riskLinks = useMemo<Link[]>(() => {
    if (mode === "scarcity" || mode === "fix-first" || !activeFloods.length) return [];
    return world.facilities
      .filter((f) => flagged.has(f.id))
      .map((f) => ({
        from: f.location,
        to: activeFloods.reduce((best, i) => (dist2(i.location, f.location) < dist2(best.location, f.location) ? i : best)).location,
      }));
  }, [mode, activeFloods, world.facilities, flagged]);

  const routes = useMemo<Link[]>(() => {
    if (mode !== "scarcity" || !tankerPlan) return [];
    return tankerPlan.flatMap((t) => {
      const from = world.resources.find((r) => r.id === t.resourceId)?.location;
      const to = world.facilities.find((f) => f.id === t.targetId)?.location ?? world.cells[t.targetId]?.center;
      return from && to ? [{ from, to }] : [];
    });
  }, [mode, tankerPlan, world.resources, world.facilities, world.cells]);

  // Evidence fusion: the reports of the selected (or only) incident converge on it.
  const focus: Incident | null = mode === "fix-first" ? null : (selected ?? (world.incidents.length === 1 ? world.incidents[0] : null));
  const reports = useMemo(() => (focus ? world.evidence.filter((e) => focus.evidenceIds.includes(e.id)) : []), [focus, world.evidence]);
  const fusion = useMemo<Link[]>(() => (focus ? reports.map((e) => ({ from: e.location, to: focus.location })) : []), [focus, reports]);

  const keyOf = (ls: Link[]) => ls.map((l) => `${l.from.lng},${l.from.lat}>${l.to.lng},${l.to.lat}`).join("|");
  const linkT = useDrawIn(keyOf(riskLinks));
  const routeKey = keyOf(routes);
  const routeT = useDrawIn(routeKey);

  // Tanker plan: fit every origin and target into the visible part of the map.
  useEffect(() => {
    if (!map || !routes.length) return;
    const b = new LngLatBounds();
    for (const r of routes) b.extend([r.from.lng, r.from.lat]).extend([r.to.lng, r.to.lat]);
    map.fitBounds(b, { padding: 90, maxZoom: 14, bearing: map.getBearing(), duration: reduce ? 0 : 1000 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, routeKey, reduce]);

  useEffect(() => {
    const t = { duration: reduce ? 0 : 900, easing: (x: number) => 1 - (1 - x) ** 3 };
    overlay.current?.setProps({
      layers: [
        new H3HexagonLayer<CellDatum>({
          id: "cells",
          data: cells,
          getHexagon: (d) => d.id,
          highPrecision: false,
          coverage: 0.93,
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
          transitions: { getFillColor: t, getElevation: t, getLineColor: t },
          onHover: (info) => setHover(info.object ? { x: info.x, y: info.y, id: info.object.id, width: info.viewport?.width ?? 0 } : null),
        }),
        new LineLayer<Link>({
          id: "fusion-links",
          parameters: { depthCompare: "always" },
          data: fusion,
          getSourcePosition: (d) => [d.from.lng, d.from.lat],
          getTargetPosition: (d) => [d.to.lng, d.to.lat],
          getColor: [...INK, 150],
          getWidth: 1,
        }),
        new ArcLayer<Link>({
          id: "risk-links",
          parameters: { depthCompare: "always" }, // routes stay readable over the extruded cells
          data: riskLinks,
          getSourcePosition: (d) => [d.to.lng, d.to.lat],
          getTargetPosition: (d) => lerp(d.to, d.from, linkT),
          getSourceColor: [...INK, 90],
          getTargetColor: [...INK, 235],
          getWidth: 2,
          getHeight: 0.35,
          updateTriggers: { getTargetPosition: linkT },
        }),
        new ArcLayer<Link>({
          id: "tanker-routes",
          parameters: { depthCompare: "always" },
          data: routes,
          getSourcePosition: (d) => [d.from.lng, d.from.lat],
          getTargetPosition: (d) => lerp(d.from, d.to, routeT),
          getSourceColor: [...INK, 110],
          getTargetColor: [...INK, 245],
          getWidth: 2.5,
          getHeight: 0.5,
          updateTriggers: { getTargetPosition: routeT },
        }),
      ],
    });
  }, [map, cells, fusion, riskLinks, routes, linkT, routeT, reduce]);

  const hp = hover ? prediction?.cells[hover.id] : undefined;
  const hc = hover ? world.cells[hover.id] : undefined;
  const flip = hover != null && hover.x > hover.width - padding.right - 280;
  const routed = new Set((mode === "scarcity" ? tankerPlan ?? [] : []).map((t) => t.resourceId));
  const riskOf = (cellId: string, kind: RiskDomain) => {
    const p = prediction?.cells[cellId];
    return p ? (kind === "flood" ? p.floodRisk : p.scarcityRisk) : null;
  };
  // With an incident selected, markers that are not part of its story step back.
  const quiet = selected ? "opacity-45" : "";

  return (
    <div className="absolute inset-0 bg-surface">
      <div ref={container} className="h-full w-full" />

      {map && (
        <>
          {world.facilities.map((f) => {
            const Icon = FACILITY_ICON[f.kind];
            const safeNow = protectedIds.has(f.id);
            const bad = flagged.has(f.id);
            const hospital = f.kind === "hospital";
            const state = safeNow ? "Protected" : bad ? (mode === "scarcity" ? "Short of water" : "At risk") : null;
            const tone = safeNow ? css(VERIFIED) : bad ? bandCss(riskOf(f.cellId, mode === "scarcity" ? "scarcity" : "flood") ?? 60, mode === "scarcity" ? "scarcity" : "flood") : undefined;
            const StateIcon = safeNow ? ShieldCheck : TriangleAlert;
            return (
              <Pin key={f.id} map={map} at={f.location} z={state ? 4 : hospital ? 3 : 2}>
                <div className={`flex items-center gap-1 ${state ? "" : quiet}`} role="img" aria-label={`${f.name}, ${human(f.kind)}${state ? `, ${state}` : ""}`} title={`${f.name} · ${human(f.kind)}`}>
                  <span
                    className={`flex items-center justify-center border bg-panel ${hospital ? "h-[26px] w-[26px] border-muted text-ink" : "h-[22px] w-[22px] border-hairline text-muted"} ${
                      state ? "border-2 text-ink" : ""
                    }`}
                    style={tone ? { borderColor: tone } : undefined}
                  >
                    <Icon size={hospital ? 15 : 13} aria-hidden />
                  </span>
                  {state ? (
                    <span className={`${LABEL} flex items-center gap-1`} style={{ borderColor: tone }}>
                      <StateIcon size={11} aria-hidden style={{ color: tone }} />
                      {state}
                    </span>
                  ) : (
                    hospital && near && <span className={`${LABEL} normal-case tracking-normal text-muted`}>{f.name}</span>
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
                <div className={`flex items-center gap-1 ${on ? "" : quiet}`}>
                  <div
                    role="img"
                    aria-label={`${r.name}, ${r.kind}, ${r.available ? "available" : "committed"}`}
                    title={`${r.id} · ${r.name} · ${r.available ? "available" : "committed"}`}
                    className={`flex h-[18px] w-[18px] items-center justify-center rounded-full border bg-surface ${
                      on ? "border-ink text-ink" : "border-hairline text-muted"
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
            const dot = (
              <span
                aria-hidden
                className={`block rotate-45 border ${
                  suspected || picked ? "h-3 w-3 border-ink bg-ink" : fix ? "h-2.5 w-2.5 border-ink bg-panel" : "h-2 w-2 border-faint bg-surface"
                }`}
              />
            );
            return (
              <Pin key={a.id} map={map} at={a.location} z={suspected || picked ? 5 : fix ? 4 - pr.tier : 1}>
                {fix ? (
                  <button
                    type="button"
                    onClick={() => props.onSelectAsset(a.id)}
                    aria-label={`${a.name}, priority ${pr.tier}, rank ${pr.rank}`}
                    aria-pressed={picked}
                    className="flex items-center gap-1.5 p-1"
                  >
                    {dot}
                    <span className={`${LABEL} ${picked ? "border-ink" : ""} ${pr.tier === 3 && !picked ? "text-muted" : ""}`}>
                      Priority {pr.tier} · {a.id}
                    </span>
                  </button>
                ) : (
                  <div
                    role="img"
                    aria-label={`${a.name}${suspected ? ", suspected cause" : ""}`}
                    title={`${a.id} · ${a.name}`}
                    className={`relative flex items-center ${suspected ? "" : quiet}`}
                  >
                    {dot}
                    {/* Sits below the dot so the incident's own label, usually a few metres away, does not cover it. */}
                    {suspected && <span className={`${LABEL} absolute left-3 top-6 border-ink`}>{a.id} · Suspected cause</span>}
                  </div>
                )}
              </Pin>
            );
          })}

          {focus &&
            reports.map((e) => {
              const weak = focus.evidenceScore?.verdict === "hold" || e.analysis?.validHazard === false;
              return (
                <Pin key={e.id} map={map} at={e.location} z={5}>
                  <motion.div
                    initial={reduce ? false : { opacity: 0, scale: 0.4 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.35, ease: "easeOut" }}
                    role="img"
                    aria-label={`Report ${e.id} via ${e.channel}${weak ? ", low confidence" : ""}`}
                    title={`${e.id} · ${e.channel} · reporter trust ${pct(e.reporterTrust)}`}
                    className={`flex h-4 w-4 items-center justify-center rounded-full border bg-surface ${
                      weak ? "border-dashed border-muted text-muted" : "border-ink text-ink"
                    }`}
                  >
                    <MessageSquare size={9} aria-hidden />
                  </motion.div>
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
                const verdict = i.evidenceScore?.verdict ?? "hold";
                const tone = off ? undefined : bandCss(risk ?? 0, i.kind);
                const n = i.evidenceIds.length;
                // Hollow dashed = unverified, outlined = probable, solid with a green check = confirmed.
                const ring =
                  off || verdict === "hold"
                    ? { className: "border-dashed border-muted bg-surface/40 text-muted", style: undefined }
                    : verdict === "verify"
                      ? { className: "border-2 bg-surface", style: { borderColor: tone, color: tone } }
                      : { className: "border-2 text-surface", style: { borderColor: tone, background: tone } };
                const scoreText = i.evidenceScore ? `${VERDICT_LABEL[verdict]} · ${Math.round(i.evidenceScore.total)}/100` : "Unscored";
                return (
                  <Pin key={i.id} map={map} at={i.location} z={on ? 7 : 6}>
                    <button
                      type="button"
                      onClick={() => props.onSelectIncident(i.id)}
                      aria-label={`Incident ${i.id}, ${human(i.type)}, ${scoreText}, ${n} ${n === 1 ? "report" : "reports fused"}`}
                      aria-pressed={on}
                      className={`flex items-center gap-1.5 ${on || !selected ? "" : quiet}`}
                    >
                      <span
                        className={`relative flex h-7 w-7 items-center justify-center rounded-full border ${ring.className} ${
                          on ? "outline outline-1 outline-offset-2 outline-ink" : ""
                        }`}
                        style={ring.style}
                      >
                        <Icon size={15} aria-hidden />
                        {!off && verdict === "escalate" && (
                          <CircleCheck size={12} aria-hidden className="absolute -right-1.5 -top-1.5 rounded-full bg-surface text-verified" />
                        )}
                      </span>
                      <span className={`${LABEL} text-left leading-[1.45] ${off ? "text-faint line-through" : ""}`}>
                        {i.id}
                        {on && ` · ${human(i.type)}`}
                        {on && risk != null && ` · ${Math.round(risk)}% risk`}
                        <span className={`block ${verdict === "escalate" && !off ? "text-ink" : "text-muted"}`}>
                          {scoreText}
                          {(on || n > 1) && ` · ${n} ${n === 1 ? "report" : "reports fused"}`}
                        </span>
                      </span>
                    </button>
                  </Pin>
                );
              })}
        </>
      )}

      <Legend mode={mode} style={{ left: padding.left + 12, bottom: padding.bottom + 12, maxWidth: `calc(100vw - ${padding.left + padding.right + 24}px)` }} />

      {basemap === "offline" && (
        <div role="status" className={`${LABEL} absolute normal-case tracking-normal text-muted`} style={{ left: padding.left + 12, top: padding.top + 12 }}>
          Basemap unavailable · showing risk layers only
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
                <dd className="text-right">
                  {riskBand(hp.floodRisk).glyph} {riskBand(hp.floodRisk).label} · {Math.round(hp.floodRisk)}
                </dd>
                <dt className="font-sans text-muted">Scarcity risk</dt>
                <dd className="text-right">
                  {riskBand(hp.scarcityRisk).glyph} {riskBand(hp.scarcityRisk).label} · {Math.round(hp.scarcityRisk)}
                </dd>
                <dt className="font-sans text-muted">Confidence</dt>
                <dd className="text-right">{pct(hp.confidence)}</dd>
                <dt className="font-sans text-muted">Exposed population</dt>
                <dd className="text-right">est. {fmt(hp.exposedPopulation)}</dd>
                <dt className="font-sans text-muted">Short of water</dt>
                <dd className="text-right">est. {fmt(hp.populationShort)}</dd>
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

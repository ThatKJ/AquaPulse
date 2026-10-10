"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { LngLatBounds, Map as MlMap, setWorkerUrl, type ExpressionSpecification, type MapGeoJSONFeature } from "maplibre-gl";
import { ArrowRight, Search, X } from "lucide-react";
import districtIndex from "@/lib/national/districts.json";
import type { NationalSnapshot } from "@/lib/national/store";
import { RISK_BANDS, bandCss, riskBand } from "../risk";
import { Label, btnPrimary, fmt, iconBtn } from "../ui";

setWorkerUrl("/maplibre-gl-worker.mjs");

type District = { id: string; name: string; state: string; lng: number; lat: number };
const DISTRICTS = districtIndex as District[];
const BY_ID = new Map(DISTRICTS.map((d) => [d.id, d]));
/** Districts where AquaPulse has a local HydroTwin. Everywhere else is national data only. */
const LOCAL_TWINS: Record<string, string> = { "76128533B76927648517269": "Bengaluru" };

const SURFACE = "#0a0d10";
// Extent of the Survey of India depiction, including the islands.
const INDIA = new LngLatBounds([67.5, 6.2], [97.8, 37.4]);
const FIT = { top: 60, bottom: 56, left: 268, right: 24 };
/** Below this zoom a click selects a state; at or above it, a district. District names appear at the same point. */
const STATE_ZOOM = 5.6;
const ist = (iso: string | null | undefined, withDate = false) =>
  iso ? new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false, ...(withDate ? { day: "2-digit", month: "short" } : {}) }).format(new Date(iso)) + " IST" : "never";
const ago = (iso: string | null | undefined, now: number) => {
  if (!iso) return "never";
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ${m % 60} min ago`;
};

/**
 * Centre and zoom that fit a lng/lat box into the free part of the map. Done by hand because MapLibre's
 * fitBounds mis-frames when a tilt and asymmetric padding are combined (it zoomed out to the whole country
 * at laptop widths).
 */
function frame(m: MlMap, w: number, s: number, e: number, n: number, pad: { top: number; bottom: number; left: number; right: number }, maxZoom = 22) {
  const c = m.getContainer();
  const availW = Math.max(120, c.clientWidth - pad.left - pad.right);
  const availH = Math.max(120, c.clientHeight - pad.top - pad.bottom);
  const y = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const zx = Math.log2((availW * 360) / (Math.max(0.01, e - w) * 512));
  const zy = Math.log2((availH * 2 * Math.PI) / (Math.max(0.0001, y(n) - y(s)) * 512));
  const midLat = (Math.atan(Math.exp((y(n) + y(s)) / 2)) * 360) / Math.PI - 90;
  return { center: [(w + e) / 2, midLat] as [number, number], zoom: Math.min(zx, zy, maxZoom) - 0.1, padding: pad };
}

type Load = { status: "loading" } | { status: "error"; detail: string } | { status: "ok"; data: NationalSnapshot };

export function NationalView({ onOpenLocal }: { onOpenLocal: () => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const [ready, setReady] = useState(false);
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [now, setNow] = useState(() => Date.now());
  const [selected, setSelected] = useState<string | null>(null);
  /** State in focus: India → state → district. Set by clicking the map while zoomed out, the breadcrumb, or a district. */
  const [stateSel, setStateSel] = useState<string | null>(null);
  const [hover, setHover] = useState<{ id: string; x: number; y: number; w: number } | null>(null);
  const [query, setQuery] = useState("");
  const data = load.status === "ok" ? load.data : null;

  // The browser reads AquaPulse, never the official feed. Refresh once a minute.
  useEffect(() => {
    let stop = false;
    const pull = async () => {
      try {
        const res = await fetch("/api/national", { cache: "no-store" });
        const body = await res.json();
        if (stop) return;
        if (!res.ok) setLoad((l) => (l.status === "ok" ? l : { status: "error", detail: body?.error?.message ?? `HTTP ${res.status}` }));
        else setLoad({ status: "ok", data: body as NationalSnapshot });
      } catch {
        // Keep the last good snapshot on screen; freshness will show it ageing.
        if (!stop) setLoad((l) => (l.status === "ok" ? l : { status: "error", detail: "The national data service is unreachable." }));
      }
      if (!stop) setNow(Date.now());
    };
    pull();
    const t = setInterval(pull, 60_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    if (!el.current) return;
    const m = new MlMap({
      container: el.current,
      // No basemap tiles at national scale: the boundaries are the map, so it renders even when tile hosts are down.
      style: {
        version: 8,
        glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
        sources: {
          districts: { type: "geojson", data: "/geo/india-districts.geojson", promoteId: "id" },
          states: { type: "geojson", data: "/geo/india-states.geojson" },
          // National outline as depicted by the Survey of India (DataMeet, CC BY 4.0). The district dataset stops
          // short of it in the north, so the outline supplies the country's extent; no boundary is edited by hand.
          outline: { type: "geojson", data: "/geo/india-outline-soi.geojson" },
        },
        layers: [
          { id: "bg", type: "background", paint: { "background-color": SURFACE } },
          { id: "country-fill", type: "fill", source: "outline", paint: { "fill-color": "#121920" } },
          { id: "district-fill", type: "fill", source: "districts", paint: { "fill-color": "#121920", "fill-opacity": 1 } },
          // Districts that need attention rise slightly once the camera tilts (state and district level). Seen from
          // directly above, at India level, they read as a flat fill.
          { id: "district-lift", type: "fill-extrusion", source: "districts", filter: ["in", ["get", "id"], ["literal", []]], paint: { "fill-extrusion-color": "#121920", "fill-extrusion-height": 0, "fill-extrusion-opacity": 0.9 } },
          { id: "state-dim", type: "fill", source: "districts", filter: ["==", ["get", "state"], "__none__"], paint: { "fill-color": SURFACE, "fill-opacity": 0.55 } },
          { id: "district-line", type: "line", source: "districts", paint: { "line-color": "#1d262e", "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.3, 7, 0.8] } },
          { id: "state-line", type: "line", source: "states", paint: { "line-color": "#3b4853", "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.7, 7, 1.4] } },
          { id: "country-line", type: "line", source: "outline", paint: { "line-color": "#4a5863", "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.9, 7, 1.6] } },
          {
            id: "district-focus", type: "line", source: "districts",
            paint: {
              "line-color": "#e6edf3",
              "line-width": ["case", ["boolean", ["feature-state", "selected"], false], 2, ["boolean", ["feature-state", "hover"], false], 1.2, 0],
            },
          },
          {
            id: "state-label", type: "symbol", source: "states", maxzoom: STATE_ZOOM + 0.6,
            layout: { "text-field": ["get", "shapeName"], "text-font": ["Noto Sans Regular"], "text-size": 10.5, "text-transform": "uppercase", "text-letter-spacing": 0.12, "text-max-width": 7 },
            paint: { "text-color": "#6b7885", "text-halo-color": SURFACE, "text-halo-width": 1.2 },
          },
          {
            id: "district-label", type: "symbol", source: "districts", minzoom: STATE_ZOOM + 0.6,
            layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"], "text-size": 11, "text-max-width": 7 },
            paint: { "text-color": "#8b98a5", "text-halo-color": SURFACE, "text-halo-width": 1.2 },
          },
        ],
      },
      bounds: INDIA,
      fitBoundsOptions: { padding: FIT },
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      maxPitch: 45,
      maxBounds: [[55, -2], [110, 44]],
    });
    map.current = m;
    m.on("load", () => {
      // Fit again once the container has its final size: the first fit can run before layout settles.
      m.resize();
      m.jumpTo({ ...frame(m, INDIA.getWest(), INDIA.getSouth(), INDIA.getEast(), INDIA.getNorth(), FIT), pitch: 0, bearing: 0 });
      setReady(true);
    });
    let hovered: string | null = null;
    const setHoverState = (id: string | null) => {
      if (hovered) m.setFeatureState({ source: "districts", id: hovered }, { hover: false });
      hovered = id;
      if (id) m.setFeatureState({ source: "districts", id }, { hover: true });
    };
    m.on("mousemove", "district-fill", (e) => {
      const f = e.features?.[0] as MapGeoJSONFeature | undefined;
      const id = f ? String(f.properties.id) : null;
      setHoverState(id);
      m.getCanvas().style.cursor = id ? "pointer" : "";
      setHover(id ? { id, x: e.point.x, y: e.point.y, w: m.getCanvas().clientWidth } : null);
    });
    m.on("mouseleave", "district-fill", () => {
      setHoverState(null);
      m.getCanvas().style.cursor = "";
      setHover(null);
    });
    m.on("click", "district-fill", (e) => {
      const f = e.features?.[0];
      if (!f) return;
      // Zoomed out, a click picks the state and reveals its districts; zoomed in, it picks the district.
      setStateSel(String(f.properties.state));
      if (m.getZoom() >= STATE_ZOOM) setSelected(String(f.properties.id));
      else setSelected(null);
    });
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  // Colour only districts that hold a water-related official alert. Everything else stays neutral: no alert placed
  // there is not the same as "safe", so it is not given a risk colour.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const pairs = Object.entries(data?.districts ?? {}).filter(([, r]) => r.risk > 0).flatMap(([id, r]) => [id, bandCss(r.risk, "flood")]);
    const colour: ExpressionSpecification | string = pairs.length ? (["match", ["get", "id"], ...pairs, "#121920"] as unknown as ExpressionSpecification) : "#121920";
    m.setPaintProperty("district-fill", "fill-color", colour);
    const ids = pairs.filter((_, i) => i % 2 === 0);
    const heights = Object.entries(data?.districts ?? {}).filter(([, r]) => r.risk > 0).flatMap(([id, r]) => [id, 2500 + r.risk * 260]);
    m.setFilter("district-lift", ["in", ["get", "id"], ["literal", ids]]);
    if (ids.length) {
      m.setPaintProperty("district-lift", "fill-extrusion-color", ["match", ["get", "id"], ...pairs, "#121920"] as unknown as ExpressionSpecification);
      m.setPaintProperty("district-lift", "fill-extrusion-height", ["match", ["get", "id"], ...heights, 0] as unknown as ExpressionSpecification);
    }
    m.setPaintProperty("district-fill", "fill-opacity", ids.length ? (["match", ["get", "id"], ids, 0.78, 1] as unknown as ExpressionSpecification) : 1);
  }, [data, ready]);

  const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Re-frame the current level when the window changes size; MapLibre keeps the old camera otherwise.
  const [viewport, setViewport] = useState(0);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        map.current?.resize();
        setViewport((v) => v + 1);
      }, 200);
    };
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", onResize);
    };
  }, []);
  const prev = useRef<string | null>(null);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    if (prev.current) m.setFeatureState({ source: "districts", id: prev.current }, { selected: false });
    prev.current = selected;
    if (!selected) {
      const members = stateSel ? DISTRICTS.filter((d) => d.state === stateSel) : [];
      if (members.length) {
        // Frame the state from its districts' positions, with a margin since these are centre points.
        const b = members.reduce((acc, d) => acc.extend([d.lng, d.lat]), new LngLatBounds([members[0].lng, members[0].lat], [members[0].lng, members[0].lat]));
        const pad = 0.7;
        m.easeTo({ ...frame(m, b.getWest() - pad, b.getSouth() - pad, b.getEast() + pad, b.getNorth() + pad, { ...FIT, right: 384 }, 7.5), pitch: 24, bearing: 0, duration: reduced ? 0 : 900 });
      } else m.easeTo({ ...frame(m, INDIA.getWest(), INDIA.getSouth(), INDIA.getEast(), INDIA.getNorth(), FIT), pitch: 0, bearing: 0, duration: reduced ? 0 : 800 });
      m.setFilter("state-dim", stateSel ? ["!=", ["get", "state"], stateSel] : ["==", ["get", "state"], "__none__"]);
      return;
    }
    m.setFeatureState({ source: "districts", id: selected }, { selected: true });
    const d = BY_ID.get(selected);
    m.setFilter("state-dim", d ? ["!=", ["get", "state"], d.state] : ["==", ["get", "state"], "__none__"]);
    if (d) m.easeTo({ center: [d.lng, d.lat], zoom: Math.max(m.getZoom(), 7.4), pitch: 38, bearing: 0, duration: reduced ? 0 : 800, padding: { top: 60, bottom: 50, left: 260, right: 380 } });
  }, [selected, stateSel, ready, reduced, viewport]);

  const sel = selected ? BY_ID.get(selected) : null;
  const selRisk = selected ? data?.districts[selected] : undefined;
  const selAlerts = useMemo(() => (selRisk && data ? data.alerts.filter((a) => selRisk.alertIds.includes(a.id)) : []), [selRisk, data]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q.length < 2 ? [] : DISTRICTS.filter((d) => `${d.name} ${d.state}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(q)).slice(0, 7);
  }, [query]);
  const stateRows = useMemo(() => {
    if (!stateSel || !data) return [];
    return DISTRICTS.filter((d) => d.state === stateSel && (data.districts[d.id]?.risk ?? 0) > 0)
      .map((d) => ({ d, r: data.districts[d.id] }))
      .sort((a, b) => b.r.risk - a.r.risk);
  }, [stateSel, data]);
  const stateUnplaced = useMemo(() => (stateSel && data ? data.alerts.filter((a) => a.state === stateSel && a.districtIds.length === 0).length : 0), [stateSel, data]);
  const hov = hover ? BY_ID.get(hover.id) : null;
  const hovRisk = hover ? data?.districts[hover.id] : undefined;
  const src = data?.source;
  // The headline status is the least fresh connected source: one stale feed makes the whole picture not CURRENT.
  const ORDER = ["CURRENT", "DELAYED", "STALE", "OFFLINE"] as const;
  const overall = data ? ORDER[Math.max(...data.sources.map((x) => ORDER.indexOf(x.freshness)))] : null;
  const tone = overall === "CURRENT" ? "text-verified" : overall === "DELAYED" ? "text-flood-mid" : "text-flood-high";

  return (
    <main className="relative h-full w-full overflow-hidden bg-surface">
      {/* MapLibre makes its container position: relative, so the sizing lives on a wrapper. */}
      <div className="absolute inset-0">
        <div ref={el} className="h-full w-full" aria-label="Map of India by district" />
      </div>

      <header className="absolute inset-x-0 top-0 z-20 flex h-10 items-center gap-4 border-b border-hairline bg-panel px-4 text-[11px]">
        <h1 className="text-[15px] font-semibold tracking-tight text-ink">AquaPulse</h1>
        <span className="text-[13px] text-muted">India Water Intelligence</span>
        <span className="flex-1" />
        {src ? (
          <>
            <span className={`font-medium uppercase tracking-[0.08em] ${tone}`}>{overall}</span>
            <span className="text-muted">
              Updated <span className="mono text-ink">{ist(src.lastSuccessAt)}</span>
            </span>
            <span className="border-l border-hairline pl-4 text-muted">
              <span className="uppercase tracking-[0.08em] text-faint">Sources</span>{" "}
              {data?.sources.map((x, i) => (
                <span key={x.id} title={`${x.organization} · ${x.freshness} · last sync ${ist(x.lastSuccessAt, true)}`}>
                  {i > 0 && " · "}
                  {x.id === "ndma-sachet" ? "NDMA" : "IMD"} {ago(x.lastSuccessAt, now)}
                </span>
              ))}
            </span>
          </>
        ) : (
          <span className="text-muted">{load.status === "loading" ? "Loading current conditions…" : "National data unavailable"}</span>
        )}
        <button type="button" onClick={() => window.location.assign("/?demo=1")} className="border-l border-hairline pl-4 uppercase tracking-[0.08em] text-muted hover:text-ink">
          Local demo
        </button>
      </header>

      <aside aria-label="National summary" className="absolute left-0 top-10 z-10 flex max-h-[calc(100%-40px-36px)] w-[248px] flex-col overflow-y-auto border-b border-r border-hairline bg-panel">
        <div className="px-4 py-3">
          <label className="flex items-center gap-2 border-b border-hairline pb-2 text-muted focus-within:text-ink">
            <Search size={13} aria-hidden />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a district or state" aria-label="Find a district or state" className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-faint" />
          </label>
          {matches.length > 0 && (
            <ul className="mt-1">
              {matches.map((d) => (
                <li key={d.id}>
                  <button type="button" className="flex w-full items-baseline justify-between gap-2 py-1 text-left text-[13px] text-muted hover:text-ink" onClick={() => { setStateSel(d.state); setSelected(d.id); setQuery(""); }}>
                    <span className="truncate text-ink">{d.name}</span>
                    <span className="shrink-0 text-[11px] text-faint">{d.state}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-hairline px-4 py-3">
          <Label>Current water status</Label>
          {data ? (
            <>
              <p className="mt-2 flex items-baseline gap-2">
                <span className="tabular text-[32px] font-medium leading-none tracking-tight text-ink">{data.summary.districtsUnderWaterAlert}</span>
                <span className="text-[13px] leading-snug text-muted">districts need attention</span>
              </p>
              <p className="mt-2 text-[11px] leading-snug text-faint">Districts with an active official flood, river, rain or heat alert, or a rain nowcast.</p>
              <details className="mt-2 text-[13px]">
                <summary className="cursor-pointer text-[11px] uppercase tracking-[0.08em] text-muted hover:text-ink">Details</summary>
                <dl className="mt-2 space-y-1.5">
                  <Stat n={data.summary.floodAlerts} label="flood and river alerts" />
                  <Stat n={data.summary.rainAlerts} label="rain and storm alerts" />
                  <Stat n={data.summary.heatAlerts} label="heat alerts" />
                  <Stat n={data.summary.districtsWithRainNowcast} label="districts with a rain nowcast" />
                  <Stat n={data.summary.statesWithAlerts} label="states and UTs with active alerts" />
                  {data.summary.unlocatedAlerts > 0 && <p className="pt-1 text-[11px] leading-snug text-faint">{data.summary.unlocatedAlerts} active alerts name no district we could match and are not on the map.</p>}
                </dl>
              </details>
            </>
          ) : (
            <p className="mt-2 text-[13px] text-faint">{load.status === "error" ? load.detail : "Loading…"}</p>
          )}
        </div>

        {data && data.hotspots.length > 0 && (
          <div className="border-t border-hairline py-3">
            <Label className="px-4">Where to look first</Label>
            <ol className="mt-1">
              {data.hotspots.map((h) => (
                <li key={h.districtId}>
                  <button type="button" onClick={() => { setStateSel(h.state); setSelected(h.districtId); }} className={`flex w-full items-baseline gap-2 border-l-2 px-4 py-1.5 text-left hover:bg-panel-raised ${selected === h.districtId ? "border-ink bg-panel-raised" : "border-transparent"}`}>
                    <span className="tabular w-6 shrink-0 text-[13px] font-medium" style={{ color: bandCss(h.risk, "flood") }}>{h.risk}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-ink">{h.name}</span>
                      <span className="block truncate text-[11px] text-faint">{h.state} · {h.reason}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        )}

        <div className="border-t border-hairline px-4 py-3 text-[11px] leading-snug">
          <Label>Data</Label>
          <ul className="mt-2 space-y-1.5">
            {data?.sources.map((x) => (
              <li key={x.id} className="text-muted">
                <span className="text-ink">{x.name}</span> · {x.freshness.toLowerCase()} · {ago(x.lastSuccessAt, now)}
                <span className="block text-faint">{x.id === "ndma-sachet" ? "Official alerts from IMD, CWC and state authorities" : "Three-hour district outlooks"} · {x.active} active</span>
                {x.lastFailure && <span className="block text-flood-mid">Last sync problem: {x.lastFailure}</span>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-faint">Measured rainfall, river gauges and heat are not connected: they count as unknown, not as zero.</p>
          
        </div>
      </aside>

      {sel && (
        <aside aria-label={`${sel.name} district`} className="panel-in absolute bottom-9 right-0 top-10 z-10 flex w-[360px] flex-col overflow-y-auto border-l border-hairline bg-panel">
          <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
            <div>
              <h2 className="text-[20px] font-medium leading-tight text-ink">{sel.name}</h2>
              <p className="mt-0.5 text-[11px] uppercase tracking-[0.08em] text-muted">{sel.state}</p>
            </div>
            <button type="button" className={iconBtn} onClick={() => setSelected(null)} aria-label="Back to state">
              <X size={14} aria-hidden />
            </button>
          </div>

          <div className="border-t border-hairline px-5 py-4">
            <Label>Water risk</Label>
            {selRisk && selRisk.risk > 0 ? (
              <>
                <p className="mt-1 flex items-baseline gap-2">
                  <span className="tabular text-[40px] font-medium leading-none tracking-tight text-ink">{selRisk.risk}</span>
                  <span className="text-[11px] uppercase tracking-[0.08em]" style={{ color: bandCss(selRisk.risk, "flood") }}>
                    {riskBand(selRisk.risk).glyph} {riskBand(selRisk.risk).label}
                  </span>
                </p>

              </>
            ) : (
              <p className="mt-2 text-[13px] leading-snug text-muted">No water-related official alert or rain nowcast is placed on this district right now. Conditions beyond those two feeds are unknown to AquaPulse.</p>
            )}
            <p className="mt-2 text-[11px] leading-snug text-faint">AquaPulse’s own derived score from official alerts and nowcasts. Not a rating by IMD, CWC or NDMA.</p>
          </div>

          {selRisk && (
            <details className="border-t border-hairline px-5 py-4">
              <summary className="cursor-pointer text-[11px] uppercase tracking-[0.08em] text-muted hover:text-ink">Technical details</summary>
              <p className="mt-3 text-[11px] text-muted">
                Confidence {Math.round(selRisk.confidence * 100)}% · {selRisk.coverage.have} of {selRisk.coverage.of} inputs connected
              </p>
              <dl className="mt-2 text-[13px]">
                {selRisk.factors.map((f) => (
                  <div key={f.key} className="flex items-baseline justify-between gap-3 border-b border-hairline py-1.5 last:border-b-0">
                    <dt className="text-muted">{f.label}</dt>
                    <dd className={`flex items-baseline gap-3 ${f.state === "unknown" ? "text-faint" : "text-ink"}`}>
                      <span>{f.display}</span>
                      {f.state === "known" && <span className="tabular w-8 text-right text-muted">+{f.contribution}</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            </details>
          )}

          {selRisk && selRisk.why.length > 0 && (
            <div className="border-t border-hairline px-5 py-4">
              <Label>Why now</Label>
              <ul className="mt-2 space-y-1.5 text-[13px] leading-snug text-ink">
                {selRisk.why.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {selAlerts.length > 0 && (
            <div className="border-t border-hairline px-5 py-4">
              <Label>Official alerts · {selAlerts.length}</Label>
              <ul className="mt-2 space-y-3">
                {selAlerts.map((a) => (
                  <li key={a.id} className="text-[13px] leading-snug">
                    <p className="text-ink">{a.headline || a.event}</p>
                    <p className="mt-1 text-[11px] text-muted">
                      {a.sender} · {a.severity} · issued <span className="mono">{ist(a.sentAt, true)}</span>
                      {a.expiresAt ? <> · until <span className="mono">{ist(a.expiresAt, true)}</span></> : null}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-auto border-t border-hairline px-5 py-4">
            {LOCAL_TWINS[sel.id] ? (
              <>
                <p className="mb-2 text-[11px] leading-snug text-muted">AquaPulse has a local HydroTwin for {LOCAL_TWINS[sel.id]}: cell-level prediction, incidents and intervention simulation. Its city data is a labelled simulation.</p>
                <button type="button" className={`${btnPrimary} w-full`} onClick={onOpenLocal}>
                  Open local HydroTwin <ArrowRight size={13} aria-hidden />
                </button>
              </>
            ) : (
              <p className="text-[11px] leading-snug text-faint">National data only. AquaPulse has no local HydroTwin for this district yet.</p>
            )}
          </div>
        </aside>
      )}

      {stateSel && !sel && (
        <aside aria-label={`${stateSel} state`} className="panel-in absolute bottom-9 right-0 top-10 z-10 flex w-[360px] flex-col overflow-y-auto border-l border-hairline bg-panel">
          <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
            <div>
              <h2 className="text-[20px] font-medium leading-tight text-ink">{stateSel}</h2>
              <p className="mt-0.5 text-[11px] uppercase tracking-[0.08em] text-muted">State · {DISTRICTS.filter((d) => d.state === stateSel).length} districts</p>
            </div>
            <button type="button" className={iconBtn} onClick={() => setStateSel(null)} aria-label="Back to India">
              <X size={14} aria-hidden />
            </button>
          </div>
          <div className="border-t border-hairline px-5 py-4">
            <p className="flex items-baseline gap-2">
              <span className="tabular text-[32px] font-medium leading-none tracking-tight text-ink">{stateRows.length}</span>
              <span className="text-[13px] text-muted">{stateRows.length === 1 ? "district needs attention" : "districts need attention"}</span>
            </p>
            {stateRows.length === 0 && <p className="mt-2 text-[13px] leading-snug text-muted">No water-related official alert or rain nowcast is placed on a district of this state right now. Conditions beyond those two feeds are unknown to AquaPulse.</p>}
            {stateUnplaced > 0 && <p className="mt-2 text-[11px] leading-snug text-faint">{stateUnplaced} more active alert{stateUnplaced === 1 ? "" : "s"} for this state name no district we could match.</p>}
          </div>
          {stateRows.length > 0 && (
            <ol className="border-t border-hairline py-2">
              {stateRows.map(({ d, r }) => (
                <li key={d.id}>
                  <button type="button" onClick={() => setSelected(d.id)} className="flex w-full items-baseline gap-3 px-5 py-2 text-left hover:bg-panel-raised">
                    <span className="tabular w-7 shrink-0 text-[15px] font-medium" style={{ color: bandCss(r.risk, "flood") }}>{r.risk}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-ink">{d.name}</span>
                      <span className="block truncate text-[11px] text-faint">{r.why[0]}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-auto border-t border-hairline px-5 py-4 text-[11px] leading-snug text-faint">Click a district on the map for its alerts and the reasons behind its score.</p>
        </aside>
      )}

      {hov && hover && (
        <div className="pointer-events-none absolute z-20 w-[230px] border border-hairline bg-panel px-3 py-2 text-[11px]" style={{ left: Math.min(hover.x + 14, hover.w - 250), top: hover.y + 14 }}>
          <p className="text-[13px] text-ink">{hov.name}</p>
          <p className="text-faint">{hov.state}</p>
          {hovRisk && hovRisk.risk > 0 ? (
            <>
              <p className="mt-1.5 text-[11px] font-medium uppercase tracking-[0.08em]" style={{ color: bandCss(hovRisk.risk, "flood") }}>
                {riskBand(hovRisk.risk).glyph} {riskBand(hovRisk.risk).label} water risk
              </p>
              <p className="mt-1 leading-snug text-muted">{hovRisk.top && hovRisk.factors[0].contribution > 0 ? `Official ${hovRisk.top.event.toLowerCase()} alert, issued ${ist(hovRisk.top.sentAt)}` : "Rain in the current nowcast"}</p>
              <p className="mt-1 text-faint">Click for details</p>
            </>
          ) : (
            <p className="mt-1.5 text-faint">No water-related alert or rain nowcast placed here.</p>
          )}
        </div>
      )}

      <footer className="absolute inset-x-0 bottom-0 z-10 flex h-9 items-center gap-4 border-t border-hairline bg-panel px-4 text-[11px] text-muted">
        <nav aria-label="Location" className="flex items-center gap-1.5">
          <button type="button" className={stateSel || sel ? "hover:text-ink" : "text-ink"} onClick={() => { setSelected(null); setStateSel(null); }}>India</button>
          {(stateSel || sel) && (
            <>
              <span className="text-faint">/</span>
              <button type="button" className={sel ? "hover:text-ink" : "text-ink"} onClick={() => setSelected(null)}>{sel?.state ?? stateSel}</button>
            </>
          )}
          {sel && (
            <>
              <span className="text-faint">/</span>
              <span className="text-ink">{sel.name}</span>
            </>
          )}
        </nav>
        <span className="flex items-center gap-3 border-l border-hairline pl-4">
          <span className="text-faint">AquaPulse water risk · official alerts and nowcast</span>
          {RISK_BANDS.slice(1).map((b) => (
            <span key={b.key} className="flex items-center gap-1">
              <span aria-hidden className="block h-2 w-2" style={{ background: `rgb(${b.flood.join(" ")})` }} />
              {b.label}
            </span>
          ))}
          <span className="flex items-center gap-1 text-faint">
            <span aria-hidden className="block h-2 w-2 border border-hairline bg-[#121920]" />
            No alert placed
          </span>
        </span>
        <span className="flex-1" />
        {data && <span className="text-faint">{fmt(data.summary.activeAlerts)} active alerts · newest issued {ist(data.source.newestAlertAt)}</span>}
        <span className="text-faint" title="Alerts: NDMA SACHET (CAP). Nowcasts: IMD. Districts and states: geoBoundaries (ODbL / CC BY 2.5 IN). National outline: Survey of India depiction via DataMeet (CC BY 4.0). AquaPulse is not affiliated with or endorsed by NDMA, IMD or CWC.">
          Sources and credits
        </span>
      </footer>
    </main>
  );
}

function Stat({ n, label, strong = false }: { n: number; label: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className={`tabular w-8 shrink-0 text-right ${strong ? "text-[20px] font-medium text-ink" : "text-ink"}`}>{fmt(n)}</dt>
      <dd className="text-muted">{label}</dd>
    </div>
  );
}

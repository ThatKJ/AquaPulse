// Seeded synthetic district. Everything here is SIMULATED: no real municipal asset, census or incident data.
import { cellToLatLng, gridDisk, latLngToCell } from "h3-js";
import type { Facility, FacilityKind, HydroCell, InfraAsset, InfraKind, LngLat, Relationship, Resource, WorldState } from "@/lib/schemas/domain";
import type { InfraHistoryRecord, InterventionKind } from "@/lib/schemas/simulation";
import { H3_RES, cellAt, haversineM } from "@/lib/geo";
import { CONFIG } from "@/lib/simulation/config";
import { clamp } from "@/lib/simulation/state";

/** Map framing for the demo district. */
export const DISTRICT: { name: string; center: LngLat; zoom: number } = {
  name: "South-East Bengaluru (demo district, simulated)",
  center: { lng: 77.64, lat: 12.925 },
  zoom: 13,
};

const SEED = 20261010;
const I = CONFIG.interventions;
const GRID_RADIUS = 11; // 397 cells
const KM_LAT = 110.574;
const KM_LNG = 111.32 * Math.cos((DISTRICT.center.lat * Math.PI) / 180);
const R2 = Math.SQRT1_2;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Valley frame: s = km along the valley (positive = downstream, towards the south-east), d = km across it.
const frame = (p: LngLat) => {
  const x = (p.lng - DISTRICT.center.lng) * KM_LNG;
  const y = (p.lat - DISTRICT.center.lat) * KM_LAT;
  return { x, y, s: (x - y) * R2, d: (x + y) * R2 };
};
const at = (s: number, d: number): LngLat => ({
  lng: DISTRICT.center.lng + ((s + d) * R2) / KM_LNG,
  lat: DISTRICT.center.lat + ((d - s) * R2) / KM_LAT,
});
/** The valley floor meanders gently around d = 0. */
const axis = (s: number) => 0.35 * Math.sin(0.9 * s);
const valley = (s: number, off = 0) => at(s, axis(s) + off);
const bump = (p: LngLat, c: LngLat, sigmaKm: number) => Math.exp(-((haversineM(p, c) / 1000 / sigmaKm) ** 2));

type AssetSeed = [id: string, name: string, kind: InfraKind, loc: LngLat, condition: number, costLakh: number, radiusKm: number];
const ASSETS: AssetSeed[] = [
  ["D101", "Koramangala North Drain (sim)", "drain", at(-1.2, 1.9), 0.72, 9, 0.75],
  ["D102", "Upper Valley Storm Drain (sim)", "drain", valley(-2.1), 0.62, 14, 0.75],
  ["D103", "Madiwala Side Drain (sim)", "drain", at(0.2, -1.9), 0.74, 8, 0.75],
  ["D104", "Agara Valley Trunk Drain (sim)", "drain", valley(-0.3), 0.35, 42, 0.75],
  ["D105", "Lower Valley Outfall Drain (sim)", "drain", valley(2.3), 0.58, 18, 0.75],
  ["D106", "HSR East Drain (sim)", "drain", at(1.9, 1.9), 0.76, 7, 0.75],
  ["P028", "Koramangala Feeder Main (sim)", "pipe", at(-1.8, 1.0), 0.72, 11, 0.95],
  ["P029", "BTM Distribution Main (sim)", "pipe", at(-0.6, -1.8), 0.68, 10, 0.95],
  ["P030", "Agara Link Main (sim)", "pipe", valley(1.4, -0.3), 0.66, 12, 0.95],
  ["P031", "HSR Trunk Main (sim)", "pipe", at(0.8, 1.7), 0.38, 36, 0.95],
  ["P032", "Bellandur Road Main (sim)", "pipe", at(2.4, -1.0), 0.7, 9, 0.95],
  ["PS01", "Agara Lift Station (sim)", "pump_station", valley(1.9, 0.3), 0.6, 22, 0.35],
  ["PS02", "Madiwala Booster Station (sim)", "pump_station", at(-1.4, -1.4), 0.7, 16, 0.35],
];

type FacilitySeed = [id: string, name: string, kind: FacilityKind, loc: LngLat, demandLiters: number];
const FACILITIES: FacilitySeed[] = [
  ["HOSP-1", "Agara General Hospital (sim)", "hospital", valley(0.8), 30000],
  ["HOSP-2", "HSR East Hospital (sim)", "hospital", at(1.1, 1.45), 26000],
  ["HOSP-3", "Koramangala Ridge Hospital (sim)", "hospital", at(-1.7, -1.3), 34000],
  ["SCH-1", "Valley View Public School (sim)", "school", valley(-0.5, 0.45), 6000],
  ["SCH-2", "HSR Layout High School (sim)", "school", at(0.5, 2.0), 7000],
  ["SCH-3", "BTM Government School (sim)", "school", at(-0.4, -2.2), 5000],
  ["SCH-4", "Koramangala Girls School (sim)", "school", at(-2.2, 1.4), 6500],
  ["SHEL-1", "Ward 174 Community Shelter (sim)", "shelter", valley(0.6, 0.9), 9000],
  ["SHEL-2", "HSR Community Hall (sim)", "shelter", at(1.3, 2.1), 8000],
  ["SUB-1", "Sarjapur Road Substation (sim)", "substation", valley(1.9, -0.5), 1500],
];

const RESOURCES: Resource[] = [
  { id: "P01", name: "Mobile Pump P01 (sim)", kind: "pump", location: at(-2.4, 1.6), available: true, capacity: 1800, costProxyLakh: 1.1 },
  { id: "P02", name: "Mobile Pump P02 (sim)", kind: "pump", location: valley(-0.9, 0.5), available: true, capacity: 3000, costProxyLakh: 1.6 },
  { id: "C01", name: "Drain Crew C01 (sim)", kind: "crew", location: valley(-0.7, -0.6), available: true, capacity: 1, costProxyLakh: 0.4 },
  { id: "C02", name: "Pipeline Crew C02 (sim)", kind: "crew", location: at(1.6, 1.0), available: true, capacity: 1, costProxyLakh: 0.4 },
  { id: "C03", name: "Ward Crew C03 (sim)", kind: "crew", location: at(-2.0, -1.5), available: true, capacity: 1, costProxyLakh: 0.4 },
  { id: "T01", name: "Tanker T01 (sim)", kind: "tanker", location: at(0.2, 2.5), available: true, capacity: 20000, costProxyLakh: 0.5 },
  { id: "T02", name: "Tanker T02 (sim)", kind: "tanker", location: at(2.2, 0.6), available: true, capacity: 12000, costProxyLakh: 0.35 },
  { id: "T03", name: "Tanker T03 (sim)", kind: "tanker", location: at(-1.5, -2.0), available: true, capacity: 12000, costProxyLakh: 0.35 },
];

/** Higher-vulnerability clusters: low ground below D104, the P031 supply area, and one ridge settlement. */
const VULNERABLE: [LngLat, number][] = [[valley(0.6, 0.1), 0.75], [at(1.0, 1.7), 0.7], [at(-1.9, -0.6), 0.55]];

// [year, month, severity, exposed, fix effectiveness?]. Chronic assets: fixes are applied but do not hold.
const CHRONIC: Record<string, [number, number, number, number, number?][]> = {
  D104: [
    [2023, 6, 8, 2900, 0.42], [2023, 9, 9, 3600, 0.35], [2024, 5, 8, 2700], [2024, 7, 9, 3900, 0.38],
    [2024, 10, 8, 3100, 0.45], [2025, 5, 8, 3000, 0.4], [2025, 8, 9, 4200, 0.33], [2025, 10, 8, 3300],
  ],
  P031: [[2023, 4, 7, 2100, 0.55], [2024, 3, 7, 2400, 0.5], [2024, 5, 8, 2800, 0.48], [2025, 3, 6, 1900], [2025, 4, 7, 2300, 0.52]],
};

function buildHistory(rand: () => number): InfraHistoryRecord[] {
  const out: InfraHistoryRecord[] = [];
  for (const [id, , kind] of ASSETS) {
    const fix: InterventionKind = kind === "pipe" ? "REPAIR_PIPE" : kind === "drain" ? "CLEAR_DRAIN" : "DISPATCH_CREW";
    const what = kind === "pipe" ? "Supply failure" : kind === "drain" ? "Overflow during monsoon rain" : "Station outage";
    const rows = CHRONIC[id] ?? Array.from({ length: 1 + Math.floor(rand() * 2) }, (): [number, number, number, number, number] => [
      2023 + Math.floor(rand() * 3), 4 + Math.floor(rand() * 7), 3 + Math.floor(rand() * 3), 300 + Math.round(rand() * 700), 0.75 + rand() * 0.15,
    ]);
    for (const [year, month, severity, exposedPopulation, eff] of rows) {
      out.push({
        assetId: id, year, month, severity, exposedPopulation,
        note: `${what} (simulated record)`,
        ...(eff === undefined ? {} : { interventionKind: fix, effectiveness: Math.round(eff * 100) / 100 }),
        provenance: "SIMULATED",
      });
    }
  }
  return out.sort((a, b) => a.year - b.year || a.month - b.month || a.assetId.localeCompare(b.assetId));
}

/** Deterministic seeded starting state. Calling it twice returns deep-equal states. */
export function initialWorld(): WorldState {
  const rand = mulberry32(SEED);
  const ids = gridDisk(latLngToCell(DISTRICT.center.lat, DISTRICT.center.lng, H3_RES), GRID_RADIUS).sort();

  const raw = ids.map((id) => {
    const [lat, lng] = cellToLatLng(id);
    const center = { lng, lat };
    const f = frame(center);
    const floor = Math.exp(-(((f.d - axis(f.s)) / 0.9) ** 2)); // 1 on the valley floor, 0 on the ridges
    // Smooth valley: falls downstream, rises steeply to both sides, with a faint undulation.
    const elev = 0.5 - 0.1 * f.s + 0.5 * (1 - floor) + 0.012 * Math.sin(1.7 * f.x) * Math.cos(1.3 * f.y);
    return { id, center, f, floor, elev };
  });
  const lo = Math.min(...raw.map((r) => r.elev));
  const hi = Math.max(...raw.map((r) => r.elev));

  const nearest = (kind: InfraKind, p: LngLat) =>
    ASSETS.filter((a) => a[2] === kind)
      .map((a) => ({ id: a[0], condition: a[4], dist: haversineM(a[3], p) / 1000, radius: a[6] }))
      .filter((a) => a.dist <= a.radius)
      .sort((a, b) => a.dist - b.dist)[0];

  const cells: Record<string, HydroCell> = {};
  for (const r of raw) {
    const elevation = (r.elev - lo) / (hi - lo);
    const density = 0.5 + 0.5 * Math.sin(1.1 * r.f.x + 0.5) * Math.cos(0.9 * r.f.y);
    const population = Math.round(600 + 650 * density + 350 * rand());
    const vulnerability = clamp(0.14 + 0.1 * rand() + VULNERABLE.reduce((v, [c, peak]) => v + peak * 0.8 * bump(r.center, c, 0.55), 0), 0, 0.92);
    const drain = nearest("drain", r.center);
    const pipe = nearest("pipe", r.center);
    cells[r.id] = {
      id: r.id,
      center: r.center,
      elevation,
      population,
      vulnerability,
      roadExposure: clamp(0.15 + 0.1 * rand() + 0.25 * Math.exp(-(((r.f.y - 0.2) / 0.35) ** 2))),
      flood: {
        rainfallPressure: 0.08 + 0.06 * rand(),
        upstreamPressure: 0.04 + 0.06 * r.floor,
        drainageFailure: drain ? I.clearDrainBase + I.clearDrainByCondition * (1 - drain.condition) : 0.12,
        elevationSusceptibility: 1 - elevation,
        historicSusceptibility: clamp(0.08 + 0.5 * r.floor + 0.06 * rand()),
        incidentPressure: 0,
        evidenceConfidence: 0,
      },
      scarcity: {
        supplyAvailability: 0.86 + 0.08 * rand(),
        demandPressure: 0.28 + 0.16 * density,
        heatStress: 0.24 + 0.06 * rand(),
        pipelineFailure: pipe ? 0.02 + 0.15 * (1 - pipe.condition) : 0.05,
        outageReports: 0,
        storageAvailability: 0.72 + 0.12 * rand(),
        populationPressure: clamp((population - 600) / 1000),
        criticalFacilityDemand: 0,
      },
      ...(drain ? { drainAssetId: drain.id } : {}),
      ...(pipe ? { pipeAssetId: pipe.id } : {}),
      provenance: "SIMULATED",
    };
  }

  const facilities: Facility[] = FACILITIES.map(([id, name, kind, location, dailyDemandLiters]) => {
    const cellId = cellAt(cells, location);
    const c = cells[cellId];
    c.scarcity.criticalFacilityDemand = Math.max(c.scarcity.criticalFacilityDemand, kind === "hospital" ? 1 : 0.5);
    return { id, name, kind, location, cellId, dailyDemandLiters, provenance: "SIMULATED" };
  });

  const assets: InfraAsset[] = ASSETS.map(([id, name, kind, location, condition, upgradeCostProxyLakh, radius]) => ({
    id, name, kind, location, condition, upgradeCostProxyLakh,
    cellIds: kind === "pump_station"
      ? ids.filter((c) => haversineM(cells[c].center, location) / 1000 <= radius)
      : ids.filter((c) => (kind === "drain" ? cells[c].drainAssetId : cells[c].pipeAssetId) === id),
    provenance: "SIMULATED",
  }));

  const relationships: Relationship[] = [];
  const chain = (ups: string, down: string) =>
    relationships.push({ from: ups, to: down, relation: "UPSTREAM_OF" }, { from: down, to: ups, relation: "DOWNSTREAM_OF" });
  chain("D102", "D104");
  chain("D104", "D105");
  chain("P031", "P030");
  relationships.push({ from: "D105", to: "PS01", relation: "CONNECTED_TO" });
  for (const a of assets) for (const f of facilities) if (a.cellIds.includes(f.cellId)) relationships.push({ from: a.id, to: f.id, relation: "AFFECTS" });
  // D104's overflow runs down the valley floor to the hospital, which sits outside its service area.
  relationships.push({ from: "D104", to: "HOSP-1", relation: "AFFECTS" });

  const population = ids.reduce((sum, id) => sum + cells[id].population, 0);
  return {
    tMin: 0,
    cells, facilities, assets,
    resources: RESOURCES.map((r) => ({ ...r })),
    relationships,
    evidence: [], incidents: [], activeInterventions: [], interventionRecords: [],
    history: buildHistory(rand),
    alerts: [],
    stream: [{
      id: "ST-001", tMin: 0, kind: "system", provenance: "SIMULATED",
      title: "Digital twin initialised",
      detail: `${ids.length} cells, ${population} residents, ${assets.length} assets, ${facilities.length} facilities. Infrastructure, demographics and history are simulated.`,
    }],
  };
}

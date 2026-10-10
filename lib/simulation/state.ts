import type { HydroCell, LngLat, StreamEntry, WorldState } from "@/lib/schemas/domain";

export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const round1 = (v: number) => Math.round(v * 10) / 10;

/** Locale-free thousands separator (toLocaleString differs between server and browser). */
export const fmt = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

export const cloneCell = (c: HydroCell): HydroCell => ({ ...c, flood: { ...c.flood }, scarcity: { ...c.scarcity } });

/** Returns a new state with one more stream entry (id derived from position, so replays are identical). */
export function withStream(state: WorldState, e: Omit<StreamEntry, "id" | "tMin" | "provenance"> & { provenance?: StreamEntry["provenance"] }): WorldState {
  const entry: StreamEntry = { id: `ST-${String(state.stream.length + 1).padStart(3, "0")}`, tMin: state.tMin, provenance: "DERIVED", ...e };
  return { ...state, stream: [...state.stream, entry] };
}

/** Where an intervention target (asset, facility or cell id) is on the map. */
export function locate(state: WorldState, id: string): LngLat | undefined {
  return state.assets.find((a) => a.id === id)?.location ?? state.facilities.find((f) => f.id === id)?.location ?? state.cells[id]?.center;
}

/** Deterministic 0..1 from a string (FNV-1a). Used for the simulated "observed" perturbation. */
export function unitHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

import { gridDisk, latLngToCell } from "h3-js";
import type { HydroCell, LngLat } from "@/lib/schemas/domain";

export const H3_RES = 9;

/** Great-circle distance in metres. */
export function haversineM(a: LngLat, b: LngLat): number {
  const R = 6371008.8;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Memo of a pure function (H3 topology never changes), so determinism holds.
const disks = new Map<string, string[]>();
/** Cell ids within k grid steps, including the cell itself. */
export function disk(id: string, k = 1): string[] {
  const key = k === 1 ? id : `${id}:${k}`;
  let d = disks.get(key);
  if (!d) disks.set(key, (d = gridDisk(id, k)));
  return d;
}

/** The world cell containing p, or the nearest one when p falls outside the district. */
export function cellAt(cells: Record<string, HydroCell>, p: LngLat): string {
  const id = latLngToCell(p.lat, p.lng, H3_RES);
  if (cells[id]) return id;
  let best = "";
  let bestD = Infinity;
  for (const c of Object.values(cells)) {
    const d = haversineM(c.center, p);
    if (d < bestD) [best, bestD] = [c.id, d];
  }
  return best;
}

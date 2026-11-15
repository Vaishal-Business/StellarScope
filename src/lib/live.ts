"use client";

import { useCallback, useEffect, useState } from "react";

export interface StatsResponse {
  totals: { users: number; posts: number; submissions: number; verified: number; pendingReviews: number; scoutRuns: number; scoutTiles: number; candidates: number; reviewedTiles: number };
  missions: Record<string, { participants: number; submissions: number; verified: number; tiles: number; claims: number }>;
  leaderboard: { name: string; xp: number; verified: number; reviews: number; submissions: number; rank: string }[];
  activity: { type: string; t: number; who: string; what: string; o: number | null; i: number | null }[];
}

export function useLive<T>(url: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!url);
  const reload = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    try {
      const r = await fetch(url, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setData(j);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps]);
  useEffect(() => {
    reload();
  }, [reload]);
  return { data, error, loading, reload };
}

export const useStats = () => useLive<StatsResponse>("/api/stats");

export interface TileStatus {
  screened: { o: number; i: number }[];
  candidates: { o: number; i: number }[];
  reviewed: { o: number; i: number }[];
  submitted: { o: number; i: number }[];
  claimed: { o: number; i: number }[];
}

/** Map layers backed by real database rows. A tile is marked if it contains (or lies inside) a listed tile. */
export const MAP_LAYERS = [
  { id: "coverage", label: "Survey coverage", desc: "DR1 MOC sky fraction 1.0 — every cell observed", color: [0.55, 0.95, 0.7, 0.07] as [number, number, number, number] },
  { id: "screened", label: "Spectral Scout screened", desc: "Regions where the model has been run", color: [0.55, 0.72, 1, 0.16] as [number, number, number, number] },
  { id: "candidates", label: "Model candidates", desc: "Runs with anomaly or motion flags", color: [1, 0.75, 0.35, 0.3] as [number, number, number, number] },
  { id: "reviewed", label: "Community reviewed", desc: "Submissions with peer reviews", color: [0.78, 0.96, 0.84, 0.2] as [number, number, number, number] },
  { id: "claimed", label: "Claimed tiles", desc: "Tiles reserved by contributors", color: [0.85, 0.6, 1, 0.22] as [number, number, number, number] },
] as const;

export function buildStatusProvider(status: TileStatus | null) {
  const sets: Record<string, Map<number, Set<number>>> = {};
  if (status) {
    for (const key of ["screened", "candidates", "reviewed", "claimed"] as const) {
      const byOrder = new Map<number, Set<number>>();
      for (const { o, i } of status[key]) {
        // register the tile and all its ancestors so coarse grids light up too
        let ipix = i;
        for (let ord = o; ord >= 0; ord--) {
          if (!byOrder.has(ord)) byOrder.set(ord, new Set());
          byOrder.get(ord)!.add(ipix);
          ipix = Math.floor(ipix / 4);
        }
        // also mark descendants down to order 5
        let lo = i;
        let hi = i;
        for (let ord = o + 1; ord <= 5; ord++) {
          lo *= 4;
          hi = hi * 4 + 3;
          if (!byOrder.has(ord)) byOrder.set(ord, new Set());
          for (let k = lo; k <= hi; k++) byOrder.get(ord)!.add(k);
        }
      }
      sets[key] = byOrder;
    }
  }
  return (layer: string, order: number, ipix: number): [number, number, number, number] | null => {
    const def = MAP_LAYERS.find((l) => l.id === layer);
    if (!def) return null;
    if (layer === "coverage") return def.color;
    return sets[layer]?.get(order)?.has(ipix) ? def.color : null;
  };
}

export function timeAgo(t: number) {
  const s = Math.max(1, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return new Date(t).toLocaleDateString();
}

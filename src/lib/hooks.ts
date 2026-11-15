"use client";

import { useEffect, useState } from "react";

const cache = new Map<string, Promise<unknown>>();

export function cachedJson<T>(url: string): Promise<T> {
  let p = cache.get(url) as Promise<T> | undefined;
  if (!p) {
    p = fetch(url).then(async (r) => {
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      return j as T;
    });
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return p;
}

export function useJson<T>(url: string | null) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean; elapsed: number }>({ data: null, error: null, loading: !!url, elapsed: 0 });
  useEffect(() => {
    if (!url) {
      setState({ data: null, error: null, loading: false, elapsed: 0 });
      return;
    }
    let alive = true;
    const t0 = performance.now();
    setState({ data: null, error: null, loading: true, elapsed: 0 });
    const tick = setInterval(() => alive && setState((s) => (s.loading ? { ...s, elapsed: (performance.now() - t0) / 1000 } : s)), 250);
    cachedJson<T>(url)
      .then((d) => alive && setState({ data: d, error: null, loading: false, elapsed: (performance.now() - t0) / 1000 }))
      .catch((e: Error) => alive && setState({ data: null, error: e.message, loading: false, elapsed: 0 }))
      .finally(() => clearInterval(tick));
    return () => {
      alive = false;
      clearInterval(tick);
    };
  }, [url]);
  return state;
}

export interface ObservationsResponse {
  collection: string;
  count: number;
  elapsedMs: number;
  query: string;
  visits: { id: string; tMin: number; detectors: string[]; emMinUm: number; emMaxUm: number }[];
  epochs: { index: number; tStart: number; tEnd: number; visits: number }[];
  exposures: { obsId: string; detector: string; tMin: number; emMinUm: number; emMaxUm: number; accessUrl: string; sizeKb: number; exptime: number; release: string }[];
}

export interface ScienceIndex {
  ipix: number;
  url: string;
  size: number;
  hdus: { index: number; name: string; xtension: string; bitpix: number; naxis: number[]; dataOffset: number; dataBytes: number; cards: { key: string; value: unknown; comment?: string }[] }[];
  spectral: { columns: { name: string; unit?: string; form: string }[]; rows: Record<string, number>[] } | null;
}

export interface SpectrumResponse {
  ipix: number;
  x: number;
  y: number;
  bunit: string;
  flux: (number | null)[];
  nhits: number[] | null;
  flags: number[] | null;
}

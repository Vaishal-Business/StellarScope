"use client";

import { useMemo, useState } from "react";
import { WAVELENGTHS_UM, isBlankFrame } from "@/sky/spherex";
import { cn } from "@/lib/utils";

export interface SpectrumData {
  flux: (number | null)[];
  nhits?: number[] | null;
  flags?: number[] | null;
  bunit?: string;
}

/** Flux vs wavelength with NHITS bars and flagged-channel markers. Values are calibrated cube values. */
export function SpectrumChart({ data, className, height = 220, highlight, onPick }: { data: SpectrumData; className?: string; height?: number; highlight?: number | null; onPick?: (f: number) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = height;
  const pad = { l: 44, r: 12, t: 14, b: 26 };
  const [robust, setRobust] = useState(true);
  const { pts, yMin, yMax, maxHits, clipped } = useMemo(() => {
    const vals = data.flux.filter((v, i): v is number => v !== null && Number.isFinite(v) && !isBlankFrame(i));
    const sorted = [...vals].sort((a, b) => a - b);
    const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))];
    let lo = robust && sorted.length > 8 ? q(0.03) : Math.min(...vals);
    let hi = robust && sorted.length > 8 ? q(0.97) : Math.max(...vals);
    const clipped = vals.filter((v) => v > hi || v < lo).length;
    if (!vals.length) {
      lo = 0;
      hi = 1;
    }
    const span = hi - lo || 1;
    lo -= span * 0.08;
    hi += span * 0.12;
    const x = (wl: number) => pad.l + ((wl - 0.7) / (5.05 - 0.7)) * (W - pad.l - pad.r);
    const y = (v: number) => pad.t + (1 - (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * (H - pad.t - pad.b);
    const pts = data.flux.map((v, i) => (v === null || !Number.isFinite(v) || isBlankFrame(i) ? null : { x: x(WAVELENGTHS_UM[i]), y: y(v), v, i, out: v > hi || v < lo }));
    return { pts, yMin: lo, yMax: hi, maxHits: Math.max(1, ...(data.nhits ?? [1])), clipped };
  }, [data, H, pad.l, pad.r, pad.t, pad.b, robust]);

  const path = pts.reduce((acc, p, i) => {
    if (!p) return acc;
    const prev = pts[i - 1];
    return acc + `${prev ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  }, "");
  const area = (() => {
    const segs: string[] = [];
    let cur: { x: number; y: number }[] = [];
    pts.forEach((p) => {
      if (p) cur.push(p);
      else if (cur.length) {
        segs.push(cur.map((q, k) => `${k ? "L" : "M"}${q.x},${q.y}`).join("") + `L${cur[cur.length - 1].x},${H - pad.b}L${cur[0].x},${H - pad.b}Z`);
        cur = [];
      }
    });
    if (cur.length) segs.push(cur.map((q, k) => `${k ? "L" : "M"}${q.x},${q.y}`).join("") + `L${cur[cur.length - 1].x},${H - pad.b}L${cur[0].x},${H - pad.b}Z`);
    return segs.join(" ");
  })();
  const ticks = [1, 2, 3, 4, 5];
  const yTicks = Array.from({ length: 4 }, (_, i) => yMin + ((i + 0.5) / 4) * (yMax - yMin));
  const hp = hover !== null ? pts[hover] : null;
  const xOf = (wl: number) => pad.l + ((wl - 0.7) / (5.05 - 0.7)) * (W - pad.l - pad.r);

  return (
    <div className={cn("relative", className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - r.left) / r.width) * W;
          let best = -1;
          let bd = 1e9;
          pts.forEach((p, i) => {
            if (p && Math.abs(p.x - x) < bd) {
              bd = Math.abs(p.x - x);
              best = i;
            }
          });
          setHover(best >= 0 ? best : null);
        }}
        onMouseLeave={() => setHover(null)}
        onClick={() => hover !== null && onPick?.(hover)}
      >
        <defs>
          <linearGradient id="specFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="oklch(0.89 0.11 155)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="oklch(0.89 0.11 155)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="specLine" x1="0" x2="1">
            <stop offset="0%" stopColor="#8fb6ff" />
            <stop offset="55%" stopColor="oklch(0.89 0.11 155)" />
            <stop offset="100%" stopColor="#ffb27a" />
          </linearGradient>
        </defs>
        {yTicks.map((v, i) => {
          const y = pad.t + (1 - (v - yMin) / (yMax - yMin)) * (H - pad.t - pad.b);
          return (
            <g key={i}>
              <line x1={pad.l} x2={W - pad.r} y1={y} y2={y} stroke="white" strokeOpacity="0.06" />
              <text x={pad.l - 6} y={y + 3} textAnchor="end" className="fill-white/40 font-mono text-[9px]">
                {Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2)}
              </text>
            </g>
          );
        })}
        {ticks.map((t) => (
          <text key={t} x={xOf(t)} y={H - 8} textAnchor="middle" className="fill-white/40 font-mono text-[9px]">
            {t} µm
          </text>
        ))}
        {/* NHITS bars */}
        {data.nhits?.map((n, i) =>
          isBlankFrame(i) ? null : (
            <rect key={i} x={xOf(WAVELENGTHS_UM[i]) - 1.2} width={2.4} y={H - pad.b - (n / maxHits) * 22} height={(n / maxHits) * 22} fill="white" fillOpacity="0.1" />
          ),
        )}
        {/* blank frames band */}
        <rect x={xOf(WAVELENGTHS_UM[50]) - 2} width={xOf(WAVELENGTHS_UM[51]) - xOf(WAVELENGTHS_UM[50]) + 4} y={pad.t} height={H - pad.t - pad.b} fill="url(#hatch)" opacity="0.5" />
        <pattern id="hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="4" stroke="white" strokeOpacity="0.25" />
        </pattern>
        <path d={area} fill="url(#specFill)" />
        <path d={path} fill="none" stroke="url(#specLine)" strokeWidth="1.6" strokeLinejoin="round" />
        {pts.map((p) =>
          p ? (
            p.out ? (
              <path key={p.i} d={p.y < H / 2 ? `M${p.x - 3},${p.y + 4}L${p.x + 3},${p.y + 4}L${p.x},${p.y - 1}Z` : `M${p.x - 3},${p.y - 4}L${p.x + 3},${p.y - 4}L${p.x},${p.y + 1}Z`} fill="#ffb27a" />
            ) : (
              <circle key={p.i} cx={p.x} cy={p.y} r={highlight === p.i ? 3.5 : 1.4} fill={data.flags && data.flags[p.i] ? "#ffb27a" : "white"} fillOpacity={highlight === p.i ? 1 : 0.7} />
            )
          ) : null,
        )}
        {hp && (
          <g>
            <line x1={hp.x} x2={hp.x} y1={pad.t} y2={H - pad.b} stroke="white" strokeOpacity="0.25" strokeDasharray="2 3" />
            <circle cx={hp.x} cy={hp.y} r="4" fill="none" stroke="oklch(0.89 0.11 155)" />
          </g>
        )}
      </svg>
      <button onClick={() => setRobust((r) => !r)} className="absolute left-12 top-0 rounded-md border border-white/10 bg-black/50 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-white/55 hover:text-white">
        {robust ? `robust scale${clipped ? ` · ${clipped} clipped ▲` : ""}` : "full range"}
      </button>
      {hp && (
        <div className="pointer-events-none absolute right-2 top-1 rounded-md border border-white/10 bg-black/70 px-2 py-1 font-mono text-[10px] text-white/85">
          {WAVELENGTHS_UM[hp.i].toFixed(3)} µm · {hp.v.toFixed(3)} {data.bunit ?? ""}
          {data.nhits ? ` · NHITS ${data.nhits[hp.i]}` : ""}
          {data.flags ? ` · FLAGS 0x${(data.flags[hp.i] >>> 0).toString(16)}` : ""}
        </div>
      )}
    </div>
  );
}

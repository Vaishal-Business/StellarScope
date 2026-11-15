"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Search } from "lucide-react";
import { useJson, type ScienceIndex, type SpectrumResponse } from "@/lib/hooks";
import { hpxPixToSky, wcsFromCards } from "@/sky/hpx-wcs";
import { formatDec, formatRA } from "@/sky/coords";
import { WAVELENGTHS_UM, isBlankFrame, scienceUrl } from "@/sky/spherex";
import { ChannelStrip } from "@/components/explore/spectral-dock";
import { SpectrumChart } from "@/components/sky/spectrum-chart";
import { Chip, KV, LiveTag, Panel } from "@/components/ui/kit";
import { cn } from "@/lib/utils";

type Ext = "IMAGE" | "NHITS" | "FLAGS";
interface Plane {
  w: number;
  h: number;
  data: Float64Array;
  bitpix: number;
  bunit: string;
  stats: { min: number; max: number; p1: number; p99: number; median: number; nan: number };
}

const planeCache = new Map<string, Promise<Plane>>();
function fetchPlane(ipix: number, ext: Ext, plane: number): Promise<Plane> {
  const key = `${ipix}/${ext}/${plane}`;
  let p = planeCache.get(key);
  if (!p) {
    p = fetch(`/api/science/${ipix}/plane?hdu=${ext}&plane=${plane}`).then(async (r) => {
      if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
      const bitpix = Number(r.headers.get("X-Bitpix"));
      const w = Number(r.headers.get("X-Width"));
      const h = Number(r.headers.get("X-Height"));
      const bzero = Number(r.headers.get("X-Bzero") ?? 0);
      const bscale = Number(r.headers.get("X-Bscale") ?? 1);
      const buf = await r.arrayBuffer();
      const dv = new DataView(buf);
      const n = w * h;
      const data = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        // FITS is big-endian
        const v = bitpix === -32 ? dv.getFloat32(i * 4, false) : bitpix === -64 ? dv.getFloat64(i * 8, false) : bitpix === 32 ? dv.getInt32(i * 4, false) : bitpix === 16 ? dv.getInt16(i * 2, false) : dv.getUint8(i);
        data[i] = bitpix > 0 ? v * bscale + bzero : v;
      }
      const finite: number[] = [];
      let nan = 0;
      for (let i = 0; i < n; i += 7) Number.isFinite(data[i]) ? finite.push(data[i]) : nan++;
      finite.sort((a, b) => a - b);
      const q = (t: number) => finite[Math.min(finite.length - 1, Math.max(0, Math.floor(t * (finite.length - 1))))] ?? 0;
      let mn = Infinity;
      let mx = -Infinity;
      for (let i = 0; i < n; i++) if (Number.isFinite(data[i])) { if (data[i] < mn) mn = data[i]; if (data[i] > mx) mx = data[i]; }
      return { w, h, data, bitpix, bunit: r.headers.get("X-Bunit") ?? "", stats: { min: mn, max: mx, p1: q(0.01), p99: q(0.995), median: q(0.5), nan: Math.round(nan * 7) } };
    });
    p.catch(() => planeCache.delete(key));
    planeCache.set(key, p);
  }
  return p;
}

function inferno(t: number): [number, number, number] {
  const c = [
    [0, 0, 4], [40, 11, 84], [101, 21, 110], [159, 42, 99], [212, 72, 66], [245, 125, 21], [250, 193, 39], [252, 255, 164],
  ];
  const x = Math.max(0, Math.min(0.9999, t)) * (c.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  return [0, 1, 2].map((k) => c[i][k] + (c[i + 1][k] - c[i][k]) * f) as [number, number, number];
}

export function ScienceInspector({ ipix }: { ipix: number }) {
  const idx = useJson<ScienceIndex>(`/api/science/${ipix}`);
  const [ext, setExt] = useState<Ext>("IMAGE");
  const [frame, setFrame] = useState(40);
  const [plane, setPlane] = useState<Plane | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [stretch, setStretch] = useState<"asinh" | "linear" | "log">("asinh");
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [pick, setPick] = useState<{ x: number; y: number }>({ x: 256, y: 256 });
  const [cardFilter, setCardFilter] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);
    fetchPlane(ipix, ext, frame)
      .then((p) => alive && setPlane(p))
      .catch((e: Error) => alive && setErr(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [ipix, ext, frame]);

  // render
  useEffect(() => {
    if (!plane || !canvas.current) return;
    const c = canvas.current;
    c.width = plane.w;
    c.height = plane.h;
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(plane.w, plane.h);
    const { p1, p99 } = plane.stats;
    const lo = ext === "IMAGE" ? p1 : 0;
    const hi = ext === "IMAGE" ? p99 : Math.max(1, plane.stats.max);
    for (let y = 0; y < plane.h; y++) {
      for (let x = 0; x < plane.w; x++) {
        // FITS row 0 is the bottom row: flip vertically for display
        const v = plane.data[(plane.h - 1 - y) * plane.w + x];
        const o = (y * plane.w + x) * 4;
        if (!Number.isFinite(v)) {
          const chk = ((x >> 3) + (y >> 3)) & 1;
          img.data[o] = img.data[o + 1] = img.data[o + 2] = chk ? 38 : 26;
          img.data[o + 3] = 255;
          continue;
        }
        let t: number;
        if (ext === "FLAGS") {
          t = v === 0 ? 0 : 0.35 + 0.65 * (Math.log2((v >>> 0) + 1) / 32);
        } else {
          t = (v - lo) / (hi - lo || 1);
          if (stretch === "asinh") t = Math.asinh(t * 10) / Math.asinh(10);
          else if (stretch === "log") t = Math.log10(1 + 99 * Math.max(0, t)) / 2;
        }
        const [r, g, b] = ext === "FLAGS" ? (v === 0 ? [10, 12, 16] : [255, 160 - 80 * t, 60]) : ext === "NHITS" ? [80 * t, 160 * t + 20, 255 * t + 30] : inferno(t);
        img.data[o] = r;
        img.data[o + 1] = g;
        img.data[o + 2] = b;
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [plane, stretch, ext]);

  const imageHdu = idx.data?.hdus.find((h) => h.name === "IMAGE");
  const wcs = useMemo(() => (imageHdu ? wcsFromCards(imageHdu.cards) : null), [imageHdu]);
  const hoverVal = hover && plane ? plane.data[hover.y * plane.w + hover.x] : null;
  const hoverSky = hover && wcs ? hpxPixToSky(wcs, hover.x + 1, hover.y + 1) : null;
  const pickSky = wcs ? hpxPixToSky(wcs, pick.x + 1, pick.y + 1) : null;
  const spec = useJson<SpectrumResponse>(`/api/science/${ipix}/spectrum?x=${pick.x}&y=${pick.y}`);

  const flagBits = useMemo(() => {
    if (!plane || ext !== "FLAGS") return null;
    const counts = new Array(32).fill(0);
    let any = 0;
    for (let i = 0; i < plane.data.length; i++) {
      const v = plane.data[i] >>> 0;
      if (v) any++;
      for (let b = 0; b < 32; b++) if (v & (1 << b)) counts[b]++;
    }
    return { counts, any };
  }, [plane, ext]);

  const hduOf = (n: string) => idx.data?.hdus.find((h) => h.name === n);
  const cards = (hduOf(ext)?.cards ?? []).filter((c) => !cardFilter || `${c.key} ${c.value} ${c.comment ?? ""}`.toLowerCase().includes(cardFilter.toLowerCase()));

  const toPix = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const cx = Math.floor(((e.clientX - r.left) / r.width) * 512);
    const cy = Math.floor(((e.clientY - r.top) / r.height) * 512);
    return { x: Math.max(0, Math.min(511, cx)), y: Math.max(0, Math.min(511, 511 - cy)) };
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <Panel className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-0.5">
            {(["IMAGE", "NHITS", "FLAGS"] as Ext[]).map((x) => (
              <button key={x} onClick={() => setExt(x)} className={cn("rounded-full px-3 py-1 font-mono text-[11px] transition", ext === x ? "bg-white text-black" : "text-white/60 hover:text-white")}>
                {x}
              </button>
            ))}
          </div>
          {ext === "IMAGE" && (
            <div className="flex items-center gap-1">
              {(["asinh", "linear", "log"] as const).map((s) => (
                <button key={s} onClick={() => setStretch(s)} className={cn("rounded-md px-2 py-0.5 font-mono text-[10px]", stretch === s ? "bg-white/15 text-white" : "text-white/45 hover:text-white")}>
                  {s}
                </button>
              ))}
            </div>
          )}
          <LiveTag>Npix{ipix}_cube.fits</LiveTag>
        </div>

        <div className="relative mt-3 aspect-square w-full overflow-hidden rounded-xl border border-white/[0.07] bg-black">
          <canvas
            ref={canvas}
            className={cn("h-full w-full cursor-crosshair transition-opacity duration-500 [image-rendering:pixelated]", loading ? "opacity-50" : "opacity-100")}
            onMouseMove={(e) => setHover(toPix(e))}
            onMouseLeave={() => setHover(null)}
            onClick={(e) => setPick(toPix(e))}
          />
          {/* pick marker */}
          <span className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-signal shadow-[0_0_10px_oklch(0.89_0.11_155)]" style={{ left: `${((pick.x + 0.5) / 512) * 100}%`, top: `${((511 - pick.y + 0.5) / 512) * 100}%` }} />
          {/* compass: in native HPX orientation north points to the lower-right, east to the lower-left */}
          <svg className="pointer-events-none absolute right-3 top-3 size-14" viewBox="-30 -30 60 60">
            <g stroke="white" strokeOpacity="0.7" strokeWidth="1.2">
              <line x1="0" y1="0" x2="15" y2="15" />
              <line x1="0" y1="0" x2="-15" y2="15" />
            </g>
            <text x="17" y="24" className="fill-white font-mono text-[9px]">N</text>
            <text x="-25" y="24" className="fill-white font-mono text-[9px]">E</text>
          </svg>
          {err && <div className="absolute inset-0 flex items-center justify-center text-[12px] text-destructive">{err}</div>}
          {loading && !plane && <div className="absolute inset-0 flex items-center justify-center font-mono text-[11px] text-white/50">Reading 1 MB plane via byte-range…</div>}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-x-6 font-mono text-[11px] md:grid-cols-4">
          <div>
            <div className="text-white/35">pixel</div>
            <div className="text-white">{hover ? `${hover.x}, ${hover.y}` : "—"}</div>
          </div>
          <div>
            <div className="text-white/35">value</div>
            <div className="text-white">{hoverVal === null ? "—" : Number.isFinite(hoverVal) ? (ext === "FLAGS" ? `0x${(hoverVal >>> 0).toString(16)}` : hoverVal.toFixed(ext === "IMAGE" ? 3 : 0)) : "NaN"} {ext === "IMAGE" ? plane?.bunit : ""}</div>
          </div>
          <div className="col-span-2">
            <div className="text-white/35">RA / Dec (HPX WCS)</div>
            <div className="text-white">{hoverSky ? `${formatRA(hoverSky.ra, true)}  ${formatDec(hoverSky.dec, true)}` : "—"}</div>
          </div>
        </div>

        {ext !== "NHITS" || true ? (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between font-mono text-[10.5px] text-white/50">
              <span>
                {ext} plane {frame} · {WAVELENGTHS_UM[frame].toFixed(3)} µm {isBlankFrame(frame) && <span className="text-warn">· blank dichroic channel</span>}
              </span>
              {plane && (
                <span>
                  min {plane.stats.min.toFixed(2)} · med {plane.stats.median.toFixed(2)} · max {plane.stats.max.toFixed(2)} · NaN≈{plane.stats.nan}
                </span>
              )}
            </div>
            <ChannelStrip value={frame} onChange={setFrame} height={26} />
          </div>
        ) : null}
      </Panel>

      <div className="space-y-4">
        <Panel className="p-4">
          <div className="flex items-center justify-between">
            <span className="eyebrow text-white/70">Spectrum at picked pixel</span>
            <Chip tone="signal">click image to pick</Chip>
          </div>
          <p className="mt-1 font-mono text-[10.5px] text-white/40">
            ({pick.x}, {pick.y}) {pickSky ? `· ${formatRA(pickSky.ra, true)} ${formatDec(pickSky.dec, true)}` : ""}
          </p>
          {spec.loading && <div className="py-10 text-center text-[12px] text-white/50">Reading 306 values across IMAGE/NHITS/FLAGS… {spec.elapsed.toFixed(1)}s</div>}
          {spec.error && <div className="py-6 text-[12px] text-destructive">{spec.error}</div>}
          {spec.data && <SpectrumChart data={spec.data} height={210} highlight={frame} onPick={setFrame} />}
        </Panel>

        {ext === "FLAGS" && flagBits && (
          <Panel className="p-4">
            <div className="eyebrow text-white/70">Flag bits set in this plane</div>
            <p className="mt-1 text-[11px] text-white/45">
              {flagBits.any.toLocaleString()} of 262,144 pixels have any bit set. Bit meanings follow the SPHEREx Explanatory Supplement; header comments are shown below where provided.
            </p>
            <div className="mt-3 grid grid-cols-8 gap-1">
              {flagBits.counts.map((n, b) => (
                <div key={b} className={cn("rounded-md border px-1 py-1 text-center font-mono text-[9.5px]", n ? "border-warn/30 bg-warn/10 text-warn" : "border-white/[0.05] text-white/25")} title={`bit ${b}: ${n} px`}>
                  b{b}
                  <div className="text-[8.5px] opacity-80">{n ? (n > 999 ? `${(n / 1000).toFixed(1)}k` : n) : "·"}</div>
                </div>
              ))}
            </div>
          </Panel>
        )}

        <Panel className="p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="eyebrow text-white/70">{ext} header · {cards.length} cards</span>
            <label className="flex items-center gap-2 rounded-full border border-white/10 px-2.5 py-1">
              <Search className="size-3 text-white/40" />
              <input value={cardFilter} onChange={(e) => setCardFilter(e.target.value)} placeholder="filter" className="w-24 bg-transparent font-mono text-[10.5px] text-white outline-none" />
            </label>
          </div>
          <div className="scroll-thin mt-3 max-h-60 overflow-y-auto rounded-lg border border-white/[0.05]">
            {idx.loading && <div className="p-4 text-[11px] text-white/45">Indexing HDUs…</div>}
            {cards.map((c, i) => (
              <div key={i} className="grid grid-cols-[86px_1fr] gap-2 border-b border-white/[0.04] px-2.5 py-1 font-mono text-[10.5px] last:border-0">
                <span className="text-signal/80">{c.key}</span>
                <span className="truncate text-white/80" title={c.comment}>
                  {String(c.value ?? "")} {c.comment && <span className="text-white/30">/ {c.comment}</span>}
                </span>
              </div>
            ))}
          </div>
          {idx.data && (
            <div className="mt-3">
              <KV k="File" v={`${(idx.data.size / 1048576).toFixed(1)} MB · ${idx.data.hdus.length} HDUs`} />
              <KV
                k="Download"
                v={
                  <a className="inline-flex items-center gap-1 text-signal hover:underline" href={scienceUrl(ipix)} target="_blank" rel="noreferrer">
                    original FITS <Download className="size-3" />
                  </a>
                }
              />
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

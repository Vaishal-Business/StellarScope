"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_RGB, tileUrl } from "@/sky/spherex";
import { cn } from "@/lib/utils";

const imgCache = new Map<string, Promise<HTMLImageElement>>();
let active = 0;
const waiting: (() => void)[] = [];
const MAX_PARALLEL = 6;

function attempt(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.decoding = "async";
    i.onload = () => res(i);
    i.onerror = () => rej(new Error(`failed ${url}`));
    i.src = url;
  });
}

async function throttled(url: string): Promise<HTMLImageElement> {
  if (active >= MAX_PARALLEL) await new Promise<void>((r) => waiting.push(r));
  active++;
  try {
    for (let k = 0; ; k++) {
      try {
        return await attempt(k === 0 ? url : `${url}?retry=${k}`);
      } catch (e) {
        if (k >= 2) throw e;
        await new Promise((r) => setTimeout(r, 500 * 2 ** k));
      }
    }
  } finally {
    active--;
    waiting.shift()?.();
  }
}

function loadImg(url: string) {
  let p = imgCache.get(url);
  if (!p) {
    p = throttled(url);
    p.catch(() => imgCache.delete(url));
    imgCache.set(url, p);
    if (imgCache.size > 400) imgCache.delete(imgCache.keys().next().value!);
  }
  return p;
}

export type TileView = { kind: "rgb"; r: number; g: number; b: number } | { kind: "mono"; frame: number };

/**
 * Real SPHEREx HiPS tile (native HEALPix orientation) composited in a 2D canvas.
 * RGB mode stacks three real channels as a false-colour infrared composite.
 */
export function TileImage({
  order,
  ipix,
  view = { kind: "rgb", ...DEFAULT_RGB },
  className,
  gain = 1.05,
  gamma = 1.1,
  rotate = true,
  onPixel,
}: {
  order: number;
  ipix: number;
  view?: TileView;
  className?: string;
  gain?: number;
  gamma?: number;
  rotate?: boolean;
  onPixel?: (p: { x: number; y: number } | null) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const key = view.kind === "rgb" ? `${view.r},${view.g},${view.b}` : `${view.frame}`;

  useEffect(() => {
    let alive = true;
    setState((s) => (s === "ready" ? s : "loading"));
    const frames = view.kind === "rgb" ? [view.r, view.g, view.b] : [view.frame];
    Promise.all(frames.map((f) => loadImg(tileUrl(order, ipix, f))))
      .then((imgs) => {
        if (!alive || !ref.current) return;
        const c = ref.current;
        const w = imgs[0].naturalWidth;
        const h = imgs[0].naturalHeight;
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d", { willReadFrequently: true })!;
        const planes = imgs.map((im) => {
          ctx.clearRect(0, 0, w, h);
          ctx.drawImage(im, 0, 0);
          return ctx.getImageData(0, 0, w, h).data;
        });
        const out = ctx.createImageData(w, h);
        const lut = new Uint8ClampedArray(256);
        for (let i = 0; i < 256; i++) lut[i] = Math.round(255 * Math.pow(Math.min(1, Math.max(0, (i / 255) * gain - 0.03)), gamma));
        for (let p = 0; p < w * h * 4; p += 4) {
          const r = lut[planes[0][p]];
          out.data[p] = r;
          out.data[p + 1] = planes.length === 3 ? lut[planes[1][p]] : r;
          out.data[p + 2] = planes.length === 3 ? lut[planes[2][p]] : r;
          out.data[p + 3] = 255;
        }
        ctx.putImageData(out, 0, 0);
        setState("ready");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, ipix, key, gain, gamma]);

  return (
    <div className={cn("relative overflow-hidden bg-black", className)}>
      <canvas
        ref={ref}
        className={cn(
          "absolute transition-opacity duration-700",
          rotate ? "left-1/2 top-1/2 aspect-square w-full min-h-full" : "inset-0 h-full w-full",
          state === "ready" ? "opacity-100" : "opacity-0",
        )}
        /* HiPS tile rasters have S at top-left and N at bottom-right, mirrored w.r.t. the sky.
           matrix(1,-1,-1,-1) maps N→up, E→left (sky orientation) and scales √2 so the diamond fills the frame. */
        style={rotate ? { transform: "translate(-50%,-50%) matrix(1,-1,-1,-1,0,0)" } : undefined}
        onMouseMove={
          onPixel
            ? (e) => {
                const r = e.currentTarget.getBoundingClientRect();
                onPixel({ x: Math.floor(((e.clientX - r.left) / r.width) * 512), y: Math.floor(((e.clientY - r.top) / r.height) * 512) });
              }
            : undefined
        }
        onMouseLeave={onPixel ? () => onPixel(null) : undefined}
      />
      {state === "loading" && (
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/[0.05] to-transparent animate-shimmer" />
        </div>
      )}
      {state === "error" && <div className="absolute inset-0 flex items-center justify-center font-mono text-[10px] uppercase tracking-widest text-white/30">No tile data</div>}
    </div>
  );
}

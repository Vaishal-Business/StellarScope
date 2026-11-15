"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { WAVELENGTHS_UM, isBlankFrame, frameBand, DEFAULT_RGB } from "@/sky/spherex";
import type { ColorMode } from "@/sky/engine";
import type { Colormap } from "@/sky/material";
import { cn } from "@/lib/utils";

const BAND_EDGES = [0, 17, 34, 51, 68, 85, 102];

export function nextValidFrame(f: number, dir: 1 | -1) {
  let n = f;
  do n = (n + dir + 102) % 102;
  while (isBlankFrame(n));
  return n;
}

/** 102-tick wavelength strip. Blank dichroic frames 50/51 are hatched and unselectable. */
export function ChannelStrip({
  value,
  markers,
  onChange,
  className,
  height = 34,
}: {
  value?: number | null;
  markers?: { frame: number; color: string; label: string }[];
  onChange?: (f: number) => void;
  className?: string;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const frameAt = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    return Math.max(0, Math.min(101, Math.floor(((clientX - r.left) / r.width) * 102)));
  };
  return (
    <div className={cn("relative select-none", className)}>
      <div
        ref={ref}
        className="relative flex cursor-crosshair items-end gap-px overflow-hidden rounded-lg"
        style={{ height }}
        onMouseMove={(e) => setHover(frameAt(e.clientX))}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => {
          const f = frameAt(e.clientX);
          if (!isBlankFrame(f)) onChange?.(f);
        }}
      >
        {WAVELENGTHS_UM.map((wl, f) => {
          const blank = isBlankFrame(f);
          const hue = 255 - (f / 101) * 235;
          const active = value === f;
          const marker = markers?.find((m) => m.frame === f);
          return (
            <div
              key={f}
              className={cn("relative flex-1 rounded-[1px] transition-all duration-200", blank && "bg-[repeating-linear-gradient(45deg,rgba(255,255,255,.18)_0_2px,transparent_2px_4px)]")}
              style={{
                height: active || marker ? "100%" : hover === f ? "78%" : `${38 + ((f % 17) / 17) * 22}%`,
                background: blank ? undefined : marker ? marker.color : `oklch(${active ? 0.92 : 0.62} ${active ? 0.14 : 0.09} ${hue} / ${active ? 1 : hover === f ? 0.9 : 0.55})`,
                boxShadow: active ? `0 0 12px oklch(0.85 0.15 ${hue})` : undefined,
              }}
              title={`${f} · ${wl.toFixed(3)} µm`}
            />
          );
        })}
        {BAND_EDGES.slice(1, -1).map((b) => (
          <div key={b} className="pointer-events-none absolute inset-y-0 w-px bg-black/70" style={{ left: `${(b / 102) * 100}%` }} />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[9.5px] text-white/35">
        {BAND_EDGES.slice(0, -1).map((b, i) => (
          <span key={b}>B{i + 1} {WAVELENGTHS_UM[b].toFixed(2)}</span>
        ))}
        <span>{WAVELENGTHS_UM[101].toFixed(2)} µm</span>
      </div>
      {hover !== null && (
        <div className="pointer-events-none absolute -top-8 -translate-x-1/2 whitespace-nowrap rounded-md border border-white/10 bg-black/80 px-2 py-0.5 font-mono text-[10px] text-white" style={{ left: `${((hover + 0.5) / 102) * 100}%` }}>
          {isBlankFrame(hover) ? `frame ${hover} · blank (dichroic)` : `${WAVELENGTHS_UM[hover].toFixed(3)} µm · f${hover} · B${frameBand(hover).band}C${frameBand(hover).channel}`}
        </div>
      )}
    </div>
  );
}

const CMAPS: Colormap[] = ["gray", "inferno", "ice", "viridis"];

export function SpectralDock({ color, onColor }: { color: ColorMode; onColor: (c: ColorMode) => void }) {
  const [playing, setPlaying] = useState(false);
  const [slot, setSlot] = useState<"r" | "g" | "b">("r");
  const colorRef = useRef(color);
  colorRef.current = color;

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      const c = colorRef.current;
      if (c.kind === "mono") onColor({ ...c, frame: nextValidFrame(c.frame, 1) });
    }, 1100);
    return () => clearInterval(id);
  }, [playing, onColor]);

  const mono = color.kind === "mono";
  const rgb = color.kind === "rgb" ? color : { kind: "rgb" as const, ...DEFAULT_RGB };
  const frame = color.kind === "mono" ? color.frame : rgb[slot];

  return (
    <div className="glass-strong w-[min(760px,calc(100vw-2rem))] rounded-[22px] px-5 pb-4 pt-3.5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-0.5">
          {(["Composite", "Single channel"] as const).map((m) => {
            const active = (m === "Single channel") === mono;
            return (
              <button
                key={m}
                onClick={() => {
                  setPlaying(false);
                  if (m === "Composite") onColor({ kind: "rgb", ...DEFAULT_RGB });
                  else onColor({ kind: "mono", frame: color.kind === "rgb" ? color.g : 42, cmap: "inferno" });
                }}
                className={cn("rounded-full px-3 py-1 text-[11px] transition", active ? "bg-white text-black" : "text-white/60 hover:text-white")}
              >
                {m}
              </button>
            );
          })}
        </div>

        {mono ? (
          <div className="flex items-center gap-2">
            <button onClick={() => onColor({ ...color, frame: nextValidFrame(color.frame, -1) } as ColorMode)} className="flex size-7 items-center justify-center rounded-full border border-white/10 text-white/70 hover:text-white">
              <ChevronLeft className="size-3.5" />
            </button>
            <div className="min-w-[132px] text-center">
              <div className="font-mono text-[15px] tabular-nums text-white">{WAVELENGTHS_UM[color.frame].toFixed(3)} µm</div>
              <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-white/40">
                frame {color.frame} · band {frameBand(color.frame).band} ch {frameBand(color.frame).channel}
              </div>
            </div>
            <button onClick={() => onColor({ ...color, frame: nextValidFrame(color.frame, 1) } as ColorMode)} className="flex size-7 items-center justify-center rounded-full border border-white/10 text-white/70 hover:text-white">
              <ChevronRight className="size-3.5" />
            </button>
            <button onClick={() => setPlaying((p) => !p)} className={cn("ml-1 flex size-7 items-center justify-center rounded-full border", playing ? "border-signal/40 bg-signal/15 text-signal" : "border-white/10 text-white/70 hover:text-white")} aria-label="Play through wavelengths">
              {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
            </button>
            <select
              value={color.cmap}
              onChange={(e) => onColor({ ...color, cmap: e.target.value as Colormap })}
              className="ml-1 h-7 rounded-full border border-white/10 bg-black/40 px-2 text-[11px] text-white/80 outline-none"
            >
              {CMAPS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            {(["r", "g", "b"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setSlot(k)}
                className={cn("flex items-center gap-2 rounded-full border px-2.5 py-1 font-mono text-[10.5px] transition", slot === k ? "border-white/30 bg-white/[0.08] text-white" : "border-white/10 text-white/55 hover:text-white")}
              >
                <span className={cn("size-2 rounded-full", k === "r" ? "bg-red-400" : k === "g" ? "bg-green-400" : "bg-blue-400")} />
                {WAVELENGTHS_UM[rgb[k]].toFixed(3)}µm
              </button>
            ))}
          </div>
        )}
        <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-white/35">{mono ? "Calibrated cube frame · asinh display stretch" : "False-colour infrared composite · not visible light"}</span>
      </div>
      <ChannelStrip
        value={mono ? frame : null}
        markers={
          mono
            ? undefined
            : [
                { frame: rgb.r, color: "oklch(0.72 0.19 25)", label: "R" },
                { frame: rgb.g, color: "oklch(0.8 0.18 145)", label: "G" },
                { frame: rgb.b, color: "oklch(0.7 0.16 255)", label: "B" },
              ]
        }
        onChange={(f) => {
          if (mono) onColor({ ...(color as Extract<ColorMode, { kind: "mono" }>), frame: f });
          else onColor({ ...rgb, [slot]: f });
        }}
      />
    </div>
  );
}

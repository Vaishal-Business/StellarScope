"use client";

import { useEffect, useRef } from "react";
import { HW, type Candidate } from "@/lib/blink";
import { cn } from "@/lib/utils";

export interface Marker {
  x: number;
  y: number;
  color: string;
  label?: string;
  r?: number;
  arrow?: { dx: number; dy: number };
}

/**
 * Renders a 64×64 frame north-up / east-left (y = 0 is south, so rows are flipped) with a
 * robust asinh stretch. `diverging` uses a red–white–blue map for difference images in S/N units.
 */
export function BlinkCanvas({
  data,
  diverging = false,
  markers = [],
  candidates = [],
  selected,
  onPick,
  className,
  stretch,
}: {
  data: Float32Array | null;
  diverging?: boolean;
  markers?: Marker[];
  candidates?: Candidate[];
  selected?: number | null;
  onPick?: (p: { x: number; y: number }) => void;
  className?: string;
  stretch?: { lo: number; hi: number };
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const SCALE = 8;
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    cv.width = cv.height = HW * SCALE;
    const ctx = cv.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    const off = document.createElement("canvas");
    off.width = off.height = HW;
    const octx = off.getContext("2d")!;
    const id = octx.createImageData(HW, HW);
    if (data) {
      let lo = stretch?.lo ?? 0;
      let hi = stretch?.hi ?? 1;
      if (!stretch) {
        const v = Array.from(data).filter(Number.isFinite).sort((a, b) => a - b);
        lo = v[Math.floor(v.length * 0.05)] ?? 0;
        hi = v[Math.floor(v.length * 0.995)] ?? 1;
      }
      for (let y = 0; y < HW; y++)
        for (let x = 0; x < HW; x++) {
          const val = data[y * HW + x];
          const q = ((HW - 1 - y) * HW + x) * 4;
          if (!Number.isFinite(val)) {
            const c = ((x >> 2) + (y >> 2)) & 1 ? 28 : 18;
            id.data[q] = id.data[q + 1] = id.data[q + 2] = c;
          } else if (diverging) {
            const t = Math.max(-1, Math.min(1, val / 8));
            const w = 1 - Math.abs(t);
            id.data[q] = t > 0 ? 255 : Math.round(255 * w);
            id.data[q + 1] = Math.round(255 * w * 0.95 + 10);
            id.data[q + 2] = t < 0 ? 255 : Math.round(255 * w);
          } else {
            const t = Math.max(0, (val - lo) / (hi - lo || 1));
            const g = Math.round((255 * Math.asinh(t * 8)) / Math.asinh(8));
            id.data[q] = id.data[q + 1] = id.data[q + 2] = Math.min(255, g);
          }
          id.data[q + 3] = 255;
        }
    }
    octx.putImageData(id, 0, 0);
    ctx.drawImage(off, 0, 0, HW * SCALE, HW * SCALE);
    const px = (x: number) => (x + 0.5) * SCALE;
    const py = (y: number) => (HW - 1 - y + 0.5) * SCALE;
    for (const m of markers) {
      ctx.strokeStyle = m.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px(m.x), py(m.y), (m.r ?? 1.6) * SCALE, 0, Math.PI * 2);
      ctx.stroke();
      if (m.arrow) {
        ctx.beginPath();
        ctx.moveTo(px(m.x), py(m.y));
        ctx.lineTo(px(m.x + m.arrow.dx), py(m.y + m.arrow.dy));
        ctx.stroke();
      }
      if (m.label) {
        ctx.fillStyle = m.color;
        ctx.font = "600 11px ui-monospace, monospace";
        ctx.fillText(m.label, px(m.x) + 2.2 * SCALE, py(m.y) - 1.4 * SCALE);
      }
    }
    candidates.forEach((c, i) => {
      const col = c.kind === "mover" ? "#ff5a4f" : c.kind === "brightened" ? "#ffd166" : "#7cc4ff";
      ctx.strokeStyle = col;
      ctx.lineWidth = selected === i ? 3 : 1.6;
      ctx.strokeRect(px(c.x) - 2.4 * SCALE, py(c.y) - 2.4 * SCALE, 4.8 * SCALE, 4.8 * SCALE);
      if (c.kind === "mover" && c.x2 !== undefined && c.y2 !== undefined) {
        ctx.beginPath();
        ctx.setLineDash([4, 3]);
        ctx.moveTo(px(c.x), py(c.y));
        ctx.lineTo(px(c.x2), py(c.y2));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(px(c.x2), py(c.y2), 2.2 * SCALE, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = col;
      ctx.font = "700 12px ui-monospace, monospace";
      ctx.fillText(String(i + 1), px(c.x) + 2.8 * SCALE, py(c.y) + 1 * SCALE);
    });
    // compass
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "600 11px ui-monospace, monospace";
    ctx.fillText("N↑  E←", 8, 16);
  }, [data, diverging, markers, candidates, selected, stretch]);

  return (
    <canvas
      ref={ref}
      className={cn("aspect-square w-full cursor-crosshair rounded-xl border border-white/[0.08] bg-black [image-rendering:pixelated]", className)}
      onClick={(e) => {
        if (!onPick) return;
        const r = e.currentTarget.getBoundingClientRect();
        const x = Math.floor(((e.clientX - r.left) / r.width) * HW);
        const yTop = Math.floor(((e.clientY - r.top) / r.height) * HW);
        onPick({ x, y: HW - 1 - yTop });
      }}
    />
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Brain, CheckCircle2, Eye, Loader2, Play, RotateCcw } from "lucide-react";
import { runScout, E, HW, PIX_ARCSEC, type ScoutResult } from "@/lib/scout-client";
import { WAVELENGTHS_UM } from "@/sky/spherex";
import { mjdToDate } from "@/sky/coords";
import { Btn, Chip, LiveTag } from "@/components/ui/kit";
import { cn } from "@/lib/utils";

const cache = new Map<string, ScoutResult>();

/** Draws a 64×64 channel-weighted composite (S/N units), north up, with the mover circled when flagged. */
function EpochCanvas({ img, mover, className }: { img: Float32Array; mover: [number, number] | null; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    cv.width = cv.height = HW;
    const ctx = cv.getContext("2d")!;
    const id = ctx.createImageData(HW, HW);
    // per-image robust asinh stretch (real fields can reach S/N in the hundreds)
    const sorted = Array.from(img).filter(Number.isFinite).sort((a, b) => a - b);
    const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))] ?? 0;
    const lo = q(0.05);
    const hi = Math.max(lo + 1e-6, q(0.995));
    for (let y = 0; y < HW; y++)
      for (let x = 0; x < HW; x++) {
        const t = Math.max(0, (img[y * HW + x] - lo) / (hi - lo));
        const g = Math.max(0, Math.min(255, (255 * Math.asinh(t * 8)) / Math.asinh(8)));
        const q = ((HW - 1 - y) * HW + x) * 4;
        id.data[q] = g;
        id.data[q + 1] = g;
        id.data[q + 2] = g;
        id.data[q + 3] = 255;
      }
    ctx.putImageData(id, 0, 0);
    if (mover) {
      ctx.strokeStyle = "#ff3b30";
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.arc(mover[0], HW - 1 - mover[1], 3, 0, 2 * Math.PI);
      ctx.stroke();
    }
  }, [img, mover]);
  return <canvas ref={ref} className={cn("aspect-square w-full rounded-lg border border-white/[0.07] [image-rendering:pixelated]", className)} />;
}

export function ScoutPanel({
  ra,
  dec,
  order,
  ipix,
  onApplyFrame,
  autoRun = false,
  compact = false,
  onResult,
}: {
  ra: number;
  dec: number;
  order: number;
  ipix: number;
  onApplyFrame?: (frame: number) => void;
  autoRun?: boolean;
  compact?: boolean;
  onResult?: (r: ScoutResult) => void;
}) {
  const key = `${ra.toFixed(4)}:${dec.toFixed(4)}`;
  const [state, setState] = useState<"idle" | "running" | "done" | "error">(cache.has(key) ? "done" : "idle");
  const [result, setResult] = useState<ScoutResult | null>(cache.get(key) ?? null);
  const [progress, setProgress] = useState<{ msg: string; frac: number }>({ msg: "", frac: 0 });
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const started = useRef(false);

  const start = async () => {
    abort.current?.abort();
    abort.current = new AbortController();
    setState("running");
    setError(null);
    try {
      const r = await runScout(ra, dec, { order, ipix }, (msg, frac) => setProgress({ msg, frac }), abort.current.signal);
      cache.set(key, r);
      setResult(r);
      setState("done");
      onResult?.(r);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError((e as Error).message);
      setState("error");
    }
  };

  useEffect(() => {
    if (autoRun && !started.current && state === "idle") {
      started.current = true;
      start();
    }
    return () => abort.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun]);

  if (state === "idle")
    return (
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
        <div className="flex items-start gap-3">
          <Brain className="mt-0.5 size-5 shrink-0 text-signal" />
          <div className="min-w-0">
            <div className="text-[13px] text-white">Spectral Scout v2</div>
            <p className="mt-1 text-[11.5px] leading-relaxed text-white/50">
              Builds a 4-epoch × 102-channel input from real SPHEREx L2 exposures here (64×64 at 6.15″/px), then runs the ONNX model in your browser to pick the best viewing channels and score anomalies and motion. The first run at a position takes 1–2 minutes.
            </p>
          </div>
        </div>
        <Btn variant="signal" size="sm" className="mt-3 w-full" onClick={start}>
          <Play className="size-3.5" /> Run on this region
        </Btn>
      </div>
    );

  if (state === "running")
    return (
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
        <div className="flex items-center gap-2 text-[12.5px] text-white">
          <Loader2 className="size-4 animate-spin text-signal" /> Spectral Scout running
        </div>
        <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-white/[0.07]">
          <div className="h-full rounded-full bg-gradient-to-r from-signal/50 to-signal transition-[width] duration-500" style={{ width: `${Math.max(3, progress.frac * 100)}%` }} />
        </div>
        <p className="mt-2 font-mono text-[10.5px] text-white/45">{progress.msg}</p>
        <button onClick={() => { abort.current?.abort(); setState("idle"); }} className="mt-2 text-[11px] text-white/40 hover:text-white">
          Cancel
        </button>
      </div>
    );

  if (state === "error" || !result)
    return (
      <div className="rounded-2xl border border-destructive/25 bg-destructive/[0.06] p-4">
        <div className="flex items-center gap-2 text-[12.5px] text-destructive">
          <AlertTriangle className="size-4" /> Spectral Scout couldn&apos;t run
        </div>
        <p className="mt-1 text-[11.5px] text-white/60">{error}</p>
        <Btn size="sm" variant="outline" className="mt-3" onClick={start}>
          <RotateCcw className="size-3.5" /> Retry
        </Btn>
      </div>
    );

  const o = result.outputs;
  const best = result.topChannels[0];
  const mover = (e: number): [number, number] | null => (result.trackFlag ? [o.positions[2 * e], o.positions[2 * e + 1]] : null);
  const T = result.card.thresholds;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <LiveTag>{result.input.planes.length} real planes</LiveTag>
        <Chip>{result.input.epochs.length} epochs</Chip>
        {result.incomplete ? <Chip tone="warn">incomplete — don&apos;t rank</Chip> : null}
        {result.anomalyFlag && !result.incomplete ? <Chip tone="warn">anomaly candidate</Chip> : null}
        {result.trackFlag && !result.incomplete ? <Chip tone="info">motion candidate</Chip> : null}
        {!result.anomalyFlag && !result.trackFlag && !result.incomplete ? <Chip tone="signal"><CheckCircle2 className="size-3" /> no flags</Chip> : null}
      </div>

      {best && (
        <div className="rounded-2xl border border-signal/20 bg-signal/[0.05] p-3.5">
          <div className="eyebrow text-signal/80">Best viewing channel</div>
          <div className="mt-1 flex items-end justify-between gap-3">
            <div>
              <div className="font-mono text-[20px] text-white">{best.wavelengthUm.toFixed(3)} µm</div>
              <div className="font-mono text-[10px] text-white/45">
                model ch {best.c} · weight {best.weight.toFixed(2)} → DR1 frame {best.frame} ({WAVELENGTHS_UM[best.frame].toFixed(3)} µm)
              </div>
            </div>
            {onApplyFrame && (
              <Btn size="sm" variant="primary" onClick={() => onApplyFrame(best.frame)}>
                <Eye className="size-3.5" /> View
              </Btn>
            )}
          </div>
          <div className="mt-3 space-y-1">
            {result.topChannels.map((t) => (
              <button key={t.c} onClick={() => onApplyFrame?.(t.frame)} className="group flex w-full items-center gap-2 font-mono text-[10.5px]">
                <span className="w-14 text-left text-white/70">{t.wavelengthUm.toFixed(2)} µm</span>
                <span className="h-1.5 flex-1 rounded-full bg-white/[0.07]">
                  <span className="block h-full rounded-full bg-signal transition group-hover:brightness-125" style={{ width: `${t.weight * 100}%` }} />
                </span>
                <span className="w-9 text-right text-white">{t.weight.toFixed(2)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          ["Anomaly", o.anomaly_global[0].toFixed(2), `flag ≥ ${T.anomaly_global.toFixed(2)}`],
          ["Track prob", o.track_prob[0].toFixed(2), `cand. ≥ ${T.track_prob.toFixed(2)}`],
          ["Move/static S/N", `${o.stack_snr[0].toFixed(1)}/${o.static_snr[0].toFixed(1)}`, result.trackFlag ? `${(o.rate[0] * PIX_ARCSEC).toFixed(1)}″/epoch` : "evidence"],
        ].map(([k, v, s]) => (
          <div key={k} className="rounded-xl border border-white/[0.06] px-2 py-2">
            <div className="eyebrow">{k}</div>
            <div className="mt-0.5 font-mono text-[14px] text-white">{v}</div>
            <div className="font-mono text-[9px] text-white/35">{s}</div>
          </div>
        ))}
      </div>

      <div>
        <div className="eyebrow mb-1.5">Per-epoch channel-weighted composites</div>
        <div className="grid grid-cols-4 gap-1.5">
          {[...Array(E).keys()].map((e) => (
            <div key={e}>
              {result.composites[e] ? <EpochCanvas img={result.composites[e]!} mover={mover(e)} /> : <div className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-white/10 font-mono text-[9px] text-white/25">no data</div>}
              <div className="mt-0.5 text-center font-mono text-[9px] text-white/40">
                {result.input.epochs[e] ? mjdToDate(result.input.epochs[e].mjdStart).toISOString().slice(0, 7) : `e${e}`}
              </div>
            </div>
          ))}
        </div>
      </div>

      {!compact && (
        <div>
          <div className="eyebrow mb-1.5">Artefact probabilities</div>
          <div className="space-y-1">
            {result.card.artifact_classes
              .map((n, i) => ({ n, p: o.artifact_probs[i] }))
              .sort((a, b) => b.p - a.p)
              .map(({ n, p }) => (
                <div key={n} className="flex items-center gap-2 font-mono text-[10.5px]">
                  <span className="w-32 truncate text-white/70">{n}</span>
                  <span className="h-1.5 flex-1 rounded-full bg-white/[0.07]">
                    <span className="block h-full rounded-full bg-white/60" style={{ width: `${p * 100}%` }} />
                  </span>
                  <span className="w-9 text-right text-white">{p.toFixed(2)}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      <details className="rounded-xl border border-white/[0.06] bg-black/20 p-3" open={!compact}>
        <summary className="cursor-pointer text-[11.5px] text-white/70">Evidence narrative (every number from model output or the input)</summary>
        <pre className="mt-2 whitespace-pre-wrap font-mono text-[10.5px] leading-relaxed text-white/70">{result.narrative.join("\n")}</pre>
      </details>
      <p className="text-[10px] leading-relaxed text-white/35">
        {result.card.limitations[0]}. Input built {new Date(result.input.createdAt).toLocaleString()} from {result.input.considered} exposures ({result.input.attempted} cutouts read).
      </p>
      <button onClick={start} className="text-[11px] text-white/40 hover:text-white">
        Re-run
      </button>
    </div>
  );
}

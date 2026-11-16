"use client";

import { WAVELENGTHS_UM, isBlankFrame } from "@/sky/spherex";

/**
 * Spectral Scout v2 in the browser (onnxruntime-web, single-thread WASM).
 * Data layout and narration follow the model's reference page (index.html):
 *   flat index = ((e*C + c)*HW + y)*HW + x, y = 0 is the south edge.
 */
export const E = 4;
export const C = 102;
export const HW = 64;
export const PIX_ARCSEC = 6.15;
const N = E * C * HW * HW;
const idx = (e: number, c: number, y: number, x: number) => ((e * C + c) * HW + y) * HW + x;

export interface ModelCard {
  model_version: string;
  thresholds: { track_prob: number; anomaly_global: number; anomaly_channel: number; channel_weight: number; artifact: number };
  channel_wavelengths_um: number[];
  artifact_classes: string[];
  limitations: string[];
  evaluation_synthetic: Record<string, number>;
  parameters: number;
  training_data: { real_fields: Record<string, { role: string; epochs: number; epoch_channels: number }> };
}

export interface ScoutInputPayload {
  ra: number;
  dec: number;
  modelVersion: string;
  timestamps: number[];
  epochs: { index: number; mjdStart: number; mjdEnd: number; exposures: number; used: number }[];
  planes: { e: number; c: number; wavelengthUm: number; mjd: number; detector: number; obsId: string; collection: string; url: string; sc?: [number, number, number] | null; image: string; variance: string }[];
  considered: number;
  attempted: number;
  failed: number;
  elapsedMs: number;
  createdAt: string;
}

export interface Tensors {
  cube: Float32Array;
  variance: Float32Array;
  coverage: Float32Array;
  timestamps: Float32Array;
}

export type Outputs = Record<string, number[]> & { ms: number[] };

export interface Measure {
  peak: Float32Array;
  peakEpoch: Int32Array;
}

export interface ScoutResult {
  input: ScoutInputPayload;
  outputs: Outputs;
  measure: Measure;
  card: ModelCard;
  narrative: string[];
  bestChannel: number | null;
  bestFrame: number | null;
  topChannels: { c: number; weight: number; wavelengthUm: number; frame: number }[];
  composites: (Float32Array | null)[];
  trackFlag: boolean;
  anomalyFlag: boolean;
  incomplete: boolean;
}

let cardPromise: Promise<ModelCard> | null = null;
export const loadCard = () => (cardPromise ??= fetch("/models/model_card.json").then((r) => r.json()));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sessionPromise: Promise<{ ort: any; session: any }> | null = null;
function loadSession() {
  sessionPromise ??= (async () => {
    const ort = await import("onnxruntime-web/wasm");
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.wasmPaths = "/ort/";
    const session = await ort.InferenceSession.create("/models/spectral_scout_v2.onnx", { executionProviders: ["wasm"] });
    return { ort, session };
  })();
  sessionPromise.catch(() => (sessionPromise = null));
  return sessionPromise;
}

function decodeF32(b64: string) {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Float32Array(u8.buffer);
}

export function assemble(input: ScoutInputPayload): Tensors {
  const cube = new Float32Array(N).fill(NaN);
  const variance = new Float32Array(N).fill(NaN);
  const coverage = new Float32Array(N);
  for (const p of input.planes) {
    if (p.e >= E || p.c >= C) continue;
    const img = decodeF32(p.image);
    const vr = decodeF32(p.variance);
    const base = idx(p.e, p.c, 0, 0);
    for (let k = 0; k < HW * HW; k++) {
      const ok = Number.isFinite(img[k]) && Number.isFinite(vr[k]) && vr[k] > 0;
      cube[base + k] = ok ? img[k] : NaN;
      variance[base + k] = ok ? vr[k] : NaN;
      coverage[base + k] = ok ? 1 : 0;
    }
  }
  const ts = Float32Array.from({ length: E }, (_, i) => input.timestamps[i] ?? 0);
  return { cube, variance, coverage, timestamps: ts };
}

export async function runModel(t: Tensors): Promise<Outputs> {
  const { ort, session } = await loadSession();
  const dims = [1, E, C, HW, HW];
  const feeds = {
    cube: new ort.Tensor("float32", t.cube, dims),
    variance: new ort.Tensor("float32", t.variance, dims),
    coverage: new ort.Tensor("float32", t.coverage, dims),
    timestamps: new ort.Tensor("float32", t.timestamps, [1, E]),
  };
  const t0 = performance.now();
  const r = await session.run(feeds);
  const o: Record<string, number[]> = { ms: [Math.round(performance.now() - t0)] };
  for (const k of Object.keys(r)) o[k] = Array.from(r[k].data as Float32Array, Number);
  return o as Outputs;
}

/** Peak S/N per channel (and its epoch) measured straight from the input: the evidence the narrator cites. */
export function measure(t: Tensors): Measure {
  const peak = new Float32Array(C).fill(-Infinity);
  const peakEpoch = new Int32Array(C);
  for (let e = 0; e < E; e++)
    for (let c = 0; c < C; c++) {
      const base = idx(e, c, 0, 0);
      for (let p = 0; p < HW * HW; p++) {
        const i = base + p;
        const v = t.variance[i];
        if (t.coverage[i] < 0.5 || Number.isNaN(t.cube[i]) || !(v > 0)) continue;
        const s = t.cube[i] / Math.sqrt(v);
        if (s > peak[c]) {
          peak[c] = s;
          peakEpoch[c] = e;
        }
      }
    }
  return { peak, peakEpoch };
}

/** Channel-weighted composite per epoch (the "lens" view) in S/N units. */
export function composite(o: Outputs, t: Tensors, e: number) {
  const img = new Float32Array(HW * HW);
  let wsum = 0;
  for (let c = 0; c < C; c++) {
    const w = o.channel_weights[c] * o.channels_used[c];
    if (w < 0.05) continue;
    wsum += w * w;
    for (let p = 0; p < HW * HW; p++) {
      const i = idx(e, c, 0, 0) + p;
      const v = t.variance[i];
      if (t.coverage[i] > 0.5 && !Number.isNaN(t.cube[i]) && v > 0) img[p] += (w * t.cube[i]) / Math.sqrt(v);
    }
  }
  const s = wsum > 0 ? 1 / Math.sqrt(wsum) : 0;
  for (let p = 0; p < img.length; p++) img[p] *= s;
  return img;
}

export const frameForWavelength = (um: number) => {
  let best = 0;
  for (let f = 0; f < WAVELENGTHS_UM.length; f++) {
    if (isBlankFrame(f)) continue;
    if (Math.abs(WAVELENGTHS_UM[f] - um) < Math.abs(WAVELENGTHS_UM[best] - um)) best = f;
  }
  return best;
};

/** Template narrator: slot filling only. Every number comes from the model output or the measurement. */
export function narrate(o: Outputs, m: Measure, card: ModelCard) {
  const T = card.thresholds;
  const wl = card.channel_wavelengths_um;
  const ART = card.artifact_classes;
  const used = [...Array(C).keys()].filter((c) => o.channels_used[c] > 0.5);
  const ev = (c: number) => `(evidence: channel ${c} at ${wl[c].toFixed(2)} µm, epoch ${m.peakEpoch[c]}, S/N ${Number.isFinite(m.peak[c]) ? m.peak[c].toFixed(1) : "—"})`;
  const L = [`model ${card.model_version} · ${o.ms[0]} ms`, `channels used ${used.length}/${C}, epochs used ${o.epochs_used.filter((v) => v > 0.5).length}/${E}`];
  if (o.incomplete[0] > 0.5) L.push("incomplete_reasoning = true (fewer than 2 epochs or fewer than 20 channels): show data, do not rank.");
  if (!used.length) return L;
  const top = used.slice().sort((a, b) => o.channel_weights[b] - o.channel_weights[a]).slice(0, 3);
  for (const c of top) L.push(`[channel] ${c} (${wl[c].toFixed(2)} µm) weight ${o.channel_weights[c].toFixed(2)} ${ev(c)}`);
  const ca = used.reduce((a, b) => (o.anomaly_scores[b] > o.anomaly_scores[a] ? b : a));
  L.push(`[anomaly] global ${o.anomaly_global[0].toFixed(2)} (flag if ≥ ${T.anomaly_global.toFixed(2)}: ${o.anomaly_global[0] >= T.anomaly_global}); strongest channel ${ev(ca)}`);
  const tp = o.track_prob[0];
  const flag = tp >= T.track_prob;
  L.push(`[motion] track probability ${tp.toFixed(2)} (candidate if ≥ ${T.track_prob.toFixed(2)}: ${flag}); moving stack S/N ${o.stack_snr[0].toFixed(1)} vs static ${o.static_snr[0].toFixed(1)}`);
  if (flag) {
    const P = o.positions;
    const pos = [...Array(E).keys()].filter((e) => o.epochs_used[e] > 0.5).map((e) => `e${e}:(${P[2 * e].toFixed(1)}, ${P[2 * e + 1].toFixed(1)})`).join(" ");
    L.push(`   rate ${o.rate[0].toFixed(2)} px/epoch = ${(o.rate[0] * PIX_ARCSEC).toFixed(1)}″/epoch, angle ${o.position_angle[0].toFixed(0)}° (pixel frame), positions ${pos}`);
    L.push(`   alternative: static or blended source (static stack S/N ${o.static_snr[0].toFixed(1)})`);
  }
  const order = [...ART.keys()].sort((a, b) => o.artifact_probs[b] - o.artifact_probs[a]);
  L.push(`[artifact] ${ART[order[0]]} p=${o.artifact_probs[order[0]].toFixed(2)}; alternative ${ART[order[1]]} p=${o.artifact_probs[order[1]].toFixed(2)}`);
  L.push("All outputs are candidates for human review, not classifications.");
  return L;
}

/** Streams the real input from /api/scout/input with progress callbacks. */
export async function fetchInput(ra: number, dec: number, onProgress: (msg: string, frac: number) => void, signal?: AbortSignal): Promise<ScoutInputPayload> {
  const res = await fetch(`/api/scout/input?ra=${ra.toFixed(5)}&dec=${dec.toFixed(5)}`, { signal });
  if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({})))?.error ?? `HTTP ${res.status}`);
  const reader = res.body.getReader();
  const dec8 = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec8.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      if (msg.type === "progress") onProgress(msg.msg, msg.frac);
      else if (msg.type === "error") throw new Error(msg.error);
      else if (msg.type === "input") return msg.data as ScoutInputPayload;
    }
  }
  throw new Error("Input stream ended unexpectedly.");
}

export async function runScout(
  ra: number,
  dec: number,
  tile: { order: number; ipix: number },
  onProgress: (msg: string, frac: number) => void,
  signal?: AbortSignal,
): Promise<ScoutResult> {
  onProgress("Loading Spectral Scout v2 model…", 0);
  const [card] = (await Promise.all([loadCard(), loadSession()])) as [ModelCard, unknown];
  const input = await fetchInput(ra, dec, (m, f) => onProgress(m, f * 0.92), signal);
  onProgress(`Running inference on ${input.planes.length} real epoch-channel planes…`, 0.94);
  const t = assemble(input);
  const outputs = await runModel(t);
  const m = measure(t);
  const used = [...Array(C).keys()].filter((c) => outputs.channels_used[c] > 0.5);
  const top = used.slice().sort((a, b) => outputs.channel_weights[b] - outputs.channel_weights[a]).slice(0, 5);
  const topChannels = top.map((c) => ({ c, weight: outputs.channel_weights[c], wavelengthUm: card.channel_wavelengths_um[c], frame: frameForWavelength(card.channel_wavelengths_um[c]) }));
  const incomplete = outputs.incomplete[0] > 0.5;
  const trackFlag = outputs.track_prob[0] >= card.thresholds.track_prob;
  const anomalyFlag = outputs.anomaly_global[0] >= card.thresholds.anomaly_global;
  const composites = [...Array(E).keys()].map((e) => (outputs.epochs_used[e] > 0.5 ? composite(outputs, t, e) : null));
  const result: ScoutResult = {
    input, outputs, measure: m, card, narrative: narrate(outputs, m, card),
    bestChannel: top[0] ?? null, bestFrame: topChannels[0]?.frame ?? null, topChannels, composites, trackFlag, anomalyFlag, incomplete,
  };
  onProgress("Done.", 1);
  // record the run (summary + provenance only)
  fetch("/api/scout/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tile_order: tile.order, tile_ipix: tile.ipix, ra, dec,
      summary: {
        modelVersion: card.model_version, bestChannel: result.bestChannel, bestWavelengthUm: topChannels[0]?.wavelengthUm ?? null,
        topChannels: topChannels.map(({ c, weight, wavelengthUm }) => ({ c, weight: +weight.toFixed(3), wavelengthUm })),
        trackProb: +outputs.track_prob[0].toFixed(3), anomalyGlobal: +outputs.anomaly_global[0].toFixed(3), trackFlag, anomalyFlag, incomplete,
        stackSnr: +outputs.stack_snr[0].toFixed(2), staticSnr: +outputs.static_snr[0].toFixed(2),
        artifact: card.artifact_classes.map((n, i) => [n, +outputs.artifact_probs[i].toFixed(3)]),
        planes: input.planes.length, epochs: input.epochs.length, narrative: result.narrative,
        exposures: input.planes.map((p) => `${p.obsId}/D${p.detector}`),
      },
    }),
  }).catch(() => {});
  return result;
}


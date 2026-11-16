"use client";

import type { ScoutInputPayload } from "./scout-client";

/**
 * Blink comparator on real SPHEREx data.
 * Each frame is one survey epoch: an inverse-variance stack of every real L2 cutout (64×64,
 * north-up, 6.15″/px, MAD-normalised) whose wavelength falls in the chosen band. Differences
 * between epochs are in S/N units, so a ±5σ residual is significant against measured noise.
 */
export const HW = 64;
export const PIX_ARCSEC = 6.15;

export const BANDS = [
  { id: "all", label: "All channels", min: 0, max: 99 },
  { id: "d1", label: "0.75–1.1 µm", min: 0.7, max: 1.11 },
  { id: "d2", label: "1.1–1.6 µm", min: 1.11, max: 1.64 },
  { id: "d3", label: "1.6–2.4 µm", min: 1.64, max: 2.42 },
  { id: "d4", label: "2.4–3.8 µm", min: 2.42, max: 3.83 },
  { id: "d5", label: "3.8–4.4 µm", min: 3.83, max: 4.42 },
  { id: "d6", label: "4.4–5.0 µm", min: 4.42, max: 5.1 },
] as const;
export type BandId = (typeof BANDS)[number]["id"];

export interface Frame {
  epoch: number;
  mjd: number;
  planes: number;
  img: Float32Array; // stacked value (normalised units)
  snr: Float32Array; // per-pixel S/N of the stack
  sigma: Float32Array; // per-pixel 1σ of the stack
  sc: [number, number, number] | null; // mean spacecraft position (km)
}

export interface Candidate {
  kind: "mover" | "brightened" | "faded";
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  snr: number;
  shiftPx?: number;
  arcsecPerDay?: number;
  fromEpoch: number;
  toEpoch: number;
}

function decode(b64: string) {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Float32Array(u8.buffer);
}

export function buildFrames(input: ScoutInputPayload, band: BandId): Frame[] {
  const b = BANDS.find((x) => x.id === band)!;
  const frames: Frame[] = [];
  for (const ep of input.epochs) {
    const planes = input.planes.filter((p) => p.e === ep.index && p.wavelengthUm >= b.min && p.wavelengthUm < b.max);
    if (!planes.length) continue;
    const num = new Float64Array(HW * HW);
    const den = new Float64Array(HW * HW);
    const scs: [number, number, number][] = [];
    for (const p of planes) {
      const img = decode(p.image);
      const v = decode(p.variance);
      for (let k = 0; k < HW * HW; k++) {
        if (Number.isFinite(img[k]) && v[k] > 0) {
          num[k] += img[k] / v[k];
          den[k] += 1 / v[k];
        }
      }
      if (p.sc) scs.push(p.sc);
    }
    const img = new Float32Array(HW * HW);
    const snr = new Float32Array(HW * HW);
    const sigma = new Float32Array(HW * HW);
    for (let k = 0; k < HW * HW; k++) {
      if (den[k] > 0) {
        img[k] = num[k] / den[k];
        sigma[k] = 1 / Math.sqrt(den[k]);
        snr[k] = img[k] / sigma[k];
      } else {
        img[k] = NaN;
        sigma[k] = NaN;
        snr[k] = NaN;
      }
    }
    const mjd = planes.reduce((s, p) => s + p.mjd, 0) / planes.length;
    const sc = scs.length ? ([0, 1, 2].map((i) => scs.reduce((s, v) => s + v[i], 0) / scs.length) as [number, number, number]) : null;
    frames.push({ epoch: ep.index, mjd, planes: planes.length, img, snr, sigma, sc });
  }
  return frames;
}

/** Difference B − A in S/N units: (b − a) / sqrt(σa² + σb²). */
export function difference(a: Frame, b: Frame) {
  const d = new Float32Array(HW * HW);
  for (let k = 0; k < HW * HW; k++) {
    const s = Math.hypot(a.sigma[k], b.sigma[k]);
    d[k] = Number.isFinite(a.img[k]) && Number.isFinite(b.img[k]) && s > 0 ? (b.img[k] - a.img[k]) / s : NaN;
  }
  return d;
}

/** Local extrema above threshold, ignoring a border where resampling edges live. */
function peaks(d: Float32Array, thr: number, sign: 1 | -1) {
  const out: { x: number; y: number; v: number }[] = [];
  for (let y = 3; y < HW - 3; y++)
    for (let x = 3; x < HW - 3; x++) {
      const v = sign * d[y * HW + x];
      if (!(v >= thr)) continue;
      let isMax = true;
      for (let dy = -2; dy <= 2 && isMax; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          if (!dx && !dy) continue;
          const w = sign * d[(y + dy) * HW + x + dx];
          if (w > v) {
            isMax = false;
            break;
          }
        }
      if (isMax) out.push({ x, y, v });
    }
  return out.sort((a, b) => b.v - a.v).slice(0, 25);
}

/**
 * Auto motion detection between two epochs. A moving source leaves a negative residual where it
 * was and a positive one where it went: pairs within `maxShift` px become mover candidates.
 * Unpaired residuals are brightening / fading candidates (variables, transients — or artefacts).
 */
export function detect(a: Frame, b: Frame, thr = 5, maxShift = 8): Candidate[] {
  const d = difference(a, b);
  const pos = peaks(d, thr, 1);
  const neg = peaks(d, thr, -1);
  const used = new Set<number>();
  const out: Candidate[] = [];
  const days = Math.max(1e-3, b.mjd - a.mjd);
  for (const p of pos) {
    let best = -1;
    let bd = Infinity;
    neg.forEach((n, i) => {
      if (used.has(i)) return;
      const dist = Math.hypot(p.x - n.x, p.y - n.y);
      if (dist >= 1 && dist <= maxShift && dist < bd) {
        bd = dist;
        best = i;
      }
    });
    if (best >= 0) {
      used.add(best);
      const n = neg[best];
      out.push({ kind: "mover", x: n.x, y: n.y, x2: p.x, y2: p.y, snr: Math.min(p.v, n.v), shiftPx: bd, arcsecPerDay: (bd * PIX_ARCSEC) / days, fromEpoch: a.epoch, toEpoch: b.epoch });
    } else out.push({ kind: "brightened", x: p.x, y: p.y, snr: p.v, fromEpoch: a.epoch, toEpoch: b.epoch });
  }
  neg.forEach((n, i) => {
    if (!used.has(i)) out.push({ kind: "faded", x: n.x, y: n.y, snr: n.v, fromEpoch: a.epoch, toEpoch: b.epoch });
  });
  return out.sort((x, y) => (x.kind === "mover" ? -1 : 0) - (y.kind === "mover" ? -1 : 0) || y.snr - x.snr);
}

/** Pixel (0-based, y=0 south, x increases west) → sky, inverse gnomonic about the cutout centre. */
export function pixToSky(ra0: number, dec0: number, x: number, y: number) {
  const s = PIX_ARCSEC / 3600;
  const xi = (-(x - (HW - 1) / 2) * s * Math.PI) / 180;
  const eta = (((y - (HW - 1) / 2) * s) * Math.PI) / 180;
  const a0 = (ra0 * Math.PI) / 180;
  const d0 = (dec0 * Math.PI) / 180;
  const rho = Math.hypot(xi, eta);
  if (rho === 0) return { ra: ra0, dec: dec0 };
  const c = Math.atan(rho);
  const dec = Math.asin(Math.cos(c) * Math.sin(d0) + (eta * Math.sin(c) * Math.cos(d0)) / rho);
  const ra = a0 + Math.atan2(xi * Math.sin(c), rho * Math.cos(d0) * Math.cos(c) - eta * Math.sin(d0) * Math.sin(c));
  return { ra: ((((ra * 180) / Math.PI) % 360) + 360) % 360, dec: (dec * 180) / Math.PI };
}

/** Sky → cutout pixel (inverse of pixToSky). */
export function skyToPix(ra0: number, dec0: number, ra: number, dec: number) {
  const r = Math.PI / 180;
  const a = ra * r, d = dec * r, a0 = ra0 * r, d0 = dec0 * r;
  const cosc = Math.sin(d0) * Math.sin(d) + Math.cos(d0) * Math.cos(d) * Math.cos(a - a0);
  const xi = (Math.cos(d) * Math.sin(a - a0)) / cosc / r;
  const eta = (Math.cos(d0) * Math.sin(d) - Math.sin(d0) * Math.cos(d) * Math.cos(a - a0)) / cosc / r;
  const s = PIX_ARCSEC / 3600;
  return { x: -xi / s + (HW - 1) / 2, y: eta / s + (HW - 1) / 2 };
}

export const mjdToIso = (mjd: number) => new Date((mjd - 40587) * 86400000).toISOString().slice(0, 10);

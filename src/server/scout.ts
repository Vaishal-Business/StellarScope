import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { querySia, type Exposure } from "./sia";
import { cutoutL2, HW } from "./l2";

/**
 * Builds Spectral Scout input from real SPHEREx L2 exposures, following the model guide:
 *  - exactly 4 epochs (visits clustered by > 30-day gaps), extra epochs dropped, missing padded
 *  - up to `cutouts_per_band_per_epoch` exposures per detector per epoch (model config: 3)
 *  - each cutout: 64×64 north-up at 6.15″/px, mapped to the nearest of the model's 102 channels
 *    by the wavelength at the target pixel (WCS-WAVE)
 *  - normalised per image: (pixel − median) / (1.4826 × MAD); variance scaled by the same factor²
 */
const card = JSON.parse(readFileSync(path.join(process.cwd(), "public", "models", "model_card.json"), "utf8")) as {
  model_version: string;
  channel_wavelengths_um: number[];
  config: { max_epochs: number; cutouts_per_band_per_epoch: number };
};
const WL = card.channel_wavelengths_um;
const E = card.config.max_epochs ?? 4;
const PER_BAND = card.config.cutouts_per_band_per_epoch ?? 3;

export const nearestChannel = (um: number) => {
  let best = 0;
  for (let c = 1; c < WL.length; c++) if (Math.abs(WL[c] - um) < Math.abs(WL[best] - um)) best = c;
  return best;
};

export interface ScoutPlane {
  e: number;
  c: number;
  wavelengthUm: number;
  mjd: number;
  detector: number;
  obsId: string;
  collection: string;
  url: string;
  /** SPHEREx geocentric position (km) when this exposure was taken. */
  sc: [number, number, number] | null;
  image: string; // base64 float32 little-endian, 64×64, y = 0 south
  variance: string;
}

export interface ScoutInput {
  ra: number;
  dec: number;
  modelVersion: string;
  timestamps: number[];
  epochs: { index: number; mjdStart: number; mjdEnd: number; exposures: number; used: number }[];
  planes: ScoutPlane[];
  considered: number;
  attempted: number;
  failed: number;
  elapsedMs: number;
  createdAt: string;
}

function robust(values: Float32Array) {
  const v = Array.from(values).filter(Number.isFinite).sort((a, b) => a - b);
  if (v.length < 200) return null;
  const med = v[Math.floor(v.length / 2)];
  const dev = v.map((x) => Math.abs(x - med)).sort((a, b) => a - b);
  const mad = dev[Math.floor(dev.length / 2)];
  return mad > 0 ? { med, scale: 1.4826 * mad, finite: v.length } : null;
}

const b64 = (a: Float32Array) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString("base64");

export async function buildScoutInput(ra: number, dec: number, progress: (msg: string, frac: number) => void): Promise<ScoutInput> {
  const t0 = Date.now();
  progress("Querying IRSA for SPHEREx exposures (DR1 + QR3)…", 0.02);
  const [dr1, qr3] = await Promise.all([querySia(ra, dec, "spherex_dr1"), querySia(ra, dec, "spherex_qr3").catch(() => [] as Exposure[])]);
  const seen = new Set<string>();
  const all: Exposure[] = [];
  for (const e of [...dr1, ...qr3]) {
    const k = `${e.obsId}|${e.detector}`;
    if (seen.has(k)) continue;
    seen.add(k);
    all.push(e);
  }
  all.sort((a, b) => a.tMin - b.tMin);
  if (!all.length) throw new Error("No SPHEREx exposures cover this position yet.");

  // epochs: > 30 day gaps
  const groups: Exposure[][] = [];
  for (const e of all) {
    const g = groups[groups.length - 1];
    if (g && e.tMin - g[g.length - 1].tMin < 30) g.push(e);
    else groups.push([e]);
  }
  const epochs = groups.slice(0, E);
  progress(`Found ${all.length} exposures in ${groups.length} epoch(s); using ${epochs.length}.`, 0.12);

  // selection: up to PER_BAND per detector per epoch, spread in time
  const jobs: { e: number; x: Exposure }[] = [];
  epochs.forEach((g, e) => {
    const byDet = new Map<string, Exposure[]>();
    for (const x of g) byDet.set(x.detector, [...(byDet.get(x.detector) ?? []), x]);
    for (const list of byDet.values()) {
      const n = Math.min(PER_BAND, list.length);
      for (let k = 0; k < n; k++) jobs.push({ e, x: list[Math.floor(((k + 0.5) * list.length) / n)] });
    }
  });

  const planes = new Map<string, ScoutPlane & { noise: number }>();
  const epochMjd: number[][] = epochs.map(() => []);
  let done = 0;
  let failed = 0;
  const queue = [...jobs];
  const worker = async () => {
    while (queue.length) {
      const job = queue.shift()!;
      try {
        const cut = await cutoutL2(job.x.accessUrl, ra, dec, [job.x.emMinUm, job.x.emMaxUm]);
        if (cut && Number.isFinite(cut.wavelengthUm)) {
          const r = robust(cut.image);
          if (r && r.finite > HW * HW * 0.5) {
            const img = new Float32Array(HW * HW);
            const vari = new Float32Array(HW * HW);
            for (let k = 0; k < HW * HW; k++) {
              img[k] = Number.isFinite(cut.image[k]) ? (cut.image[k] - r.med) / r.scale : NaN;
              const v = cut.variance[k];
              vari[k] = Number.isFinite(v) && v > 0 && Number.isFinite(img[k]) ? v / (r.scale * r.scale) : NaN;
              if (!Number.isFinite(vari[k])) img[k] = NaN;
            }
            const c = nearestChannel(cut.wavelengthUm);
            const key = `${job.e}:${c}`;
            const prev = planes.get(key);
            if (!prev || r.scale < prev.noise) {
              planes.set(key, {
                e: job.e, c, wavelengthUm: cut.wavelengthUm, mjd: cut.mjd, detector: cut.detector, obsId: job.x.obsId,
                collection: job.x.collection, url: job.x.accessUrl, sc: cut.sc, image: b64(img), variance: b64(vari), noise: r.scale,
              });
            }
            epochMjd[job.e].push(cut.mjd);
          }
        }
      } catch {
        failed++;
      }
      done++;
      progress(`Reading L2 cutouts ${done}/${jobs.length} (byte-range, 64×64 @ 6.15″)…`, 0.12 + 0.83 * (done / jobs.length));
    }
  };
  await Promise.all(Array.from({ length: 14 }, worker));

  const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
  const ep = epochs.map((g, e) => (Number.isFinite(mean(epochMjd[e])) ? mean(epochMjd[e]) : mean(g.map((x) => (x.tMin + x.tMax) / 2))));
  const t = ep.map((m) => m - ep[0]);
  while (t.length < E) t.push((t[t.length - 1] ?? 0) + 182.6);
  const list = [...planes.values()].map(({ noise: _n, ...p }) => p).sort((a, b) => a.e - b.e || a.c - b.c);
  progress(`Prepared ${list.length} epoch-channel planes.`, 1);
  return {
    ra, dec, modelVersion: card.model_version, timestamps: t,
    epochs: epochs.map((g, e) => ({ index: e, mjdStart: g[0].tMin, mjdEnd: g[g.length - 1].tMin, exposures: g.length, used: list.filter((p) => p.e === e).length })),
    planes: list, considered: all.length, attempted: jobs.length, failed, elapsedMs: Date.now() - t0, createdAt: new Date().toISOString(),
  };
}

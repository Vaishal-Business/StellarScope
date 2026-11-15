import "server-only";
import { parseCard, type Card } from "./fits";

/**
 * Reads 64×64 north-up cutouts from SPHEREx Level-2 spectral images (2040×2040 MEF:
 * IMAGE float32, FLAGS rice-compressed, VARIANCE float32, ZODI, EPSF, WCS-WAVE) using only
 * HTTP byte ranges: a few header blocks plus one multipart request covering the ~90×90
 * detector pixels the cutout needs (~60 KB per exposure instead of 65 MB).
 *
 * Astrometry: RA---TAN-SIP with the file's inverse (AP/BP) polynomials.
 * Wavelength: WCS-WAVE 9×9 bilinear lookup table (VALUES[k + 2·(i + 9·j)], i↔X, j↔Y).
 */

const BLOCK = 2880;
const UA = { "User-Agent": "stellarscope/0.2 (+l2-cutout)" };

async function getRange(url: string, start: number, end: number, attempt = 0): Promise<{ buf: Buffer; total: number }> {
  try {
    const res = await fetch(url, { headers: { Range: `bytes=${start}-${end}`, ...UA }, cache: "no-store", signal: AbortSignal.timeout(40_000) });
    if (res.status === 206) {
      const total = Number((res.headers.get("content-range") ?? "/0").split("/")[1]);
      return { buf: Buffer.from(await res.arrayBuffer()), total };
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 3) throw new Error(`HTTP ${res.status}`);
    throw Object.assign(new Error(`Range request failed: HTTP ${res.status}`), { fatal: true });
  } catch (e) {
    if ((e as { fatal?: boolean }).fatal || attempt >= 3) throw e;
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    return getRange(url, start, end, attempt + 1);
  }
}

async function getSuffix(url: string, n: number): Promise<{ buf: Buffer; total: number }> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { Range: `bytes=-${n}`, ...UA }, cache: "no-store", signal: AbortSignal.timeout(40_000) });
      if (res.status !== 206) throw new Error(`HTTP ${res.status}`);
      const total = Number((res.headers.get("content-range") ?? "/0").split("/")[1]);
      return { buf: Buffer.from(await res.arrayBuffer()), total };
    } catch (e) {
      if (attempt >= 3) throw e;
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
}

/** Fetch many small ranges with multipart/byteranges, chunked to keep requests modest. */
async function getMulti(url: string, ranges: [number, number][]): Promise<Map<number, Buffer>> {
  const out = new Map<number, Buffer>();
  const CHUNK = 96;
  for (let s = 0; s < ranges.length; s += CHUNK) {
    const part = ranges.slice(s, s + CHUNK);
    let ok = false;
    for (let attempt = 0; attempt < 4 && !ok; attempt++) {
      try {
        const res = await fetch(url, { headers: { Range: "bytes=" + part.map(([a, b]) => `${a}-${b}`).join(","), ...UA }, cache: "no-store", signal: AbortSignal.timeout(45_000) });
        const len = Number(res.headers.get("content-length") ?? 0);
        if (res.status !== 206 || len > 4_000_000) {
          await res.body?.cancel();
          throw new Error(`multipart refused (HTTP ${res.status}, ${len} bytes)`);
        }
        const ct = res.headers.get("content-type") ?? "";
        const body = Buffer.from(await res.arrayBuffer());
        if (!ct.startsWith("multipart/byteranges")) {
          const cr = res.headers.get("content-range") ?? "";
          const m = /bytes (\d+)-(\d+)/.exec(cr);
          if (m) out.set(Number(m[1]), body);
        } else {
          const boundary = /boundary=([^;]+)/.exec(ct)?.[1]?.trim().replace(/^"|"$/g, "");
          if (!boundary) throw new Error("no multipart boundary");
          const sep = Buffer.from(`--${boundary}`);
          let pos = body.indexOf(sep);
          while (pos >= 0) {
            const headEnd = body.indexOf("\r\n\r\n", pos);
            if (headEnd < 0) break;
            const head = body.subarray(pos, headEnd).toString("latin1");
            const m = /Content-Range:\s*bytes (\d+)-(\d+)/i.exec(head);
            if (!m) break;
            const a = Number(m[1]);
            const b = Number(m[2]);
            const dataStart = headEnd + 4;
            out.set(a, body.subarray(dataStart, dataStart + (b - a + 1)));
            pos = body.indexOf(sep, dataStart + (b - a + 1));
          }
        }
        ok = true;
      } catch (e) {
        if (attempt >= 3) throw e;
        await new Promise((r) => setTimeout(r, 600 * 2 ** attempt));
      }
    }
  }
  return out;
}

function parseHeader(buf: Buffer): { cards: Card[]; headerBytes: number } | null {
  const text = buf.toString("latin1");
  for (let i = 0; i + 80 <= text.length; i += 80) {
    if (text.slice(i, i + 3) === "END" && text.slice(i, i + 80).trim() === "END") {
      const cards: Card[] = [];
      for (let k = 0; k < i; k += 80) {
        const c = parseCard(text.slice(k, k + 80));
        if (c) cards.push(c);
      }
      return { cards, headerBytes: Math.ceil((i + 80) / BLOCK) * BLOCK };
    }
  }
  return null;
}

async function readHeaderAt(url: string, offset: number) {
  for (let size = BLOCK * 12; size <= BLOCK * 48; size *= 2) {
    const { buf } = await getRange(url, offset, offset + size - 1);
    const h = parseHeader(buf);
    if (h) return h;
  }
  throw new Error("FITS header END not found");
}

const num = (cards: Card[], k: string, d = 0) => {
  const v = cards.find((c) => c.key === k)?.value;
  return typeof v === "number" ? v : d;
};

function dataBytes(cards: Card[]) {
  const nax = num(cards, "NAXIS");
  let n = nax ? 1 : 0;
  for (let i = 1; i <= nax; i++) n *= num(cards, `NAXIS${i}`);
  return (Math.abs(num(cards, "BITPIX", 8)) / 8) * (n + num(cards, "PCOUNT"));
}
const pad = (n: number) => Math.ceil(n / BLOCK) * BLOCK;

interface SipWcs {
  crpix: [number, number];
  crval: [number, number];
  cdInv: [number, number, number, number];
  ap: number[][];
  bp: number[][];
  apOrder: number;
  bpOrder: number;
}

function buildWcs(cards: Card[]): SipWcs {
  const pc11 = num(cards, "PC1_1", 1) * num(cards, "CDELT1", 1);
  const pc12 = num(cards, "PC1_2") * num(cards, "CDELT1", 1);
  const pc21 = num(cards, "PC2_1") * num(cards, "CDELT2", 1);
  const pc22 = num(cards, "PC2_2", 1) * num(cards, "CDELT2", 1);
  const det = pc11 * pc22 - pc12 * pc21;
  const coeffs = (prefix: string, order: number) => {
    const m: number[][] = Array.from({ length: order + 1 }, () => new Array(order + 1).fill(0));
    for (let p = 0; p <= order; p++) for (let q = 0; q <= order - p; q++) m[p][q] = num(cards, `${prefix}_${p}_${q}`);
    return m;
  };
  const apOrder = num(cards, "AP_ORDER");
  const bpOrder = num(cards, "BP_ORDER");
  return {
    crpix: [num(cards, "CRPIX1"), num(cards, "CRPIX2")],
    crval: [num(cards, "CRVAL1"), num(cards, "CRVAL2")],
    cdInv: [pc22 / det, -pc12 / det, -pc21 / det, pc11 / det],
    ap: coeffs("AP", apOrder),
    bp: coeffs("BP", bpOrder),
    apOrder,
    bpOrder,
  };
}

const D2R = Math.PI / 180;

/** Sky (deg) → 1-based FITS pixel using TAN + inverse SIP. */
function skyToPix(w: SipWcs, ra: number, dec: number): [number, number] | null {
  const a = ra * D2R;
  const d = dec * D2R;
  const a0 = w.crval[0] * D2R;
  const d0 = w.crval[1] * D2R;
  const cosc = Math.sin(d0) * Math.sin(d) + Math.cos(d0) * Math.cos(d) * Math.cos(a - a0);
  if (cosc <= 0.2) return null;
  const xi = (Math.cos(d) * Math.sin(a - a0)) / cosc / D2R;
  const eta = (Math.cos(d0) * Math.sin(d) - Math.sin(d0) * Math.cos(d) * Math.cos(a - a0)) / cosc / D2R;
  const U = w.cdInv[0] * xi + w.cdInv[1] * eta;
  const V = w.cdInv[2] * xi + w.cdInv[3] * eta;
  let du = 0;
  let dv = 0;
  for (let p = 0; p <= w.apOrder; p++) for (let q = 0; q <= w.apOrder - p; q++) du += w.ap[p][q] * U ** p * V ** q;
  for (let p = 0; p <= w.bpOrder; p++) for (let q = 0; q <= w.bpOrder - p; q++) dv += w.bp[p][q] * U ** p * V ** q;
  return [w.crpix[0] + U + du, w.crpix[1] + V + dv];
}

/** Inverse gnomonic from a tangent point (deg). xi east-positive, eta north-positive (deg). */
function tangentToSky(ra0: number, dec0: number, xi: number, eta: number): [number, number] {
  const x = xi * D2R;
  const y = eta * D2R;
  const a0 = ra0 * D2R;
  const d0 = dec0 * D2R;
  const rho = Math.hypot(x, y);
  if (rho === 0) return [ra0, dec0];
  const c = Math.atan(rho);
  const dec = Math.asin(Math.cos(c) * Math.sin(d0) + (y * Math.sin(c) * Math.cos(d0)) / rho);
  const ra = a0 + Math.atan2(x * Math.sin(c), rho * Math.cos(d0) * Math.cos(c) - y * Math.sin(d0) * Math.sin(c));
  return [(((ra / D2R) % 360) + 360) % 360, dec / D2R];
}

export interface L2Index {
  url: string;
  imageOffset: number;
  varianceOffset: number;
  nx: number;
  ny: number;
  wcs: SipWcs;
  wave: { X: number[]; Y: number[]; V: number[] };
  mjdAvg: number;
  detector: number;
  bunit: string;
}

const indexCache = new Map<string, Promise<L2Index>>();

export function indexL2(url: string): Promise<L2Index> {
  let p = indexCache.get(url);
  if (!p) {
    p = (async () => {
      // One request covers the primary header and (usually) the whole IMAGE header.
      const [head, tail] = await Promise.all([getRange(url, 0, BLOCK * 16 - 1), getSuffix(url, BLOCK * 14)]);
      const primary = parseHeader(head.buf);
      if (!primary) throw new Error("primary header not found");
      const imgHdrOffset = primary.headerBytes + pad(dataBytes(primary.cards));
      const img = parseHeader(head.buf.subarray(imgHdrOffset)) ?? (await readHeaderAt(url, imgHdrOffset));
      const imageOffset = imgHdrOffset + img.headerBytes;
      const flagsHdrOffset = imageOffset + pad(dataBytes(img.cards));
      const flags = await readHeaderAt(url, flagsHdrOffset);
      const varHdrOffset = flagsHdrOffset + flags.headerBytes + pad(dataBytes(flags.cards));
      const vh = await readHeaderAt(url, varHdrOffset);
      const extname = String(vh.cards.find((c) => c.key === "EXTNAME")?.value ?? "").trim();
      if (extname !== "VARIANCE") throw new Error(`expected VARIANCE, found ${extname}`);
      // WCS-WAVE is the last HDU: find its header inside the file tail.
      const t = tail.buf.toString("latin1");
      const at = t.lastIndexOf("EXTNAME = 'WCS-WAVE'");
      if (at < 0) throw new Error("WCS-WAVE not found in file tail");
      let hdrStart = -1;
      for (let k = Math.floor(at / BLOCK) * BLOCK; k >= 0; k -= BLOCK) {
        if (t.slice(k, k + 8) === "XTENSION") {
          hdrStart = k;
          break;
        }
      }
      if (hdrStart < 0) throw new Error("WCS-WAVE header start not found");
      const wh = parseHeader(tail.buf.subarray(hdrStart));
      if (!wh) throw new Error("WCS-WAVE header END not found");
      const d0 = hdrStart + wh.headerBytes;
      // Grid size varies by detector (e.g. 9×9 for D1, larger for MWIR): read it from TFORM/TTYPE.
      const nf = num(wh.cards, "TFIELDS");
      const cols: Record<string, { off: number; n: number; code: string }> = {};
      let off = 0;
      for (let k = 1; k <= nf; k++) {
        const form = String(wh.cards.find((c) => c.key === `TFORM${k}`)?.value ?? "").trim();
        const m = /^(\d*)([A-Z])/.exec(form);
        const n = m && m[1] ? Number(m[1]) : 1;
        const code = m ? m[2] : "E";
        const name = String(wh.cards.find((c) => c.key === `TTYPE${k}`)?.value ?? "").trim().toUpperCase();
        cols[name] = { off, n, code };
        off += n * (code === "D" || code === "K" ? 8 : code === "I" ? 2 : code === "B" || code === "A" ? 1 : 4);
      }
      const row = tail.buf.subarray(d0, d0 + num(wh.cards, "NAXIS1", off));
      const readCol = (name: string) => {
        const c = cols[name];
        if (!c) throw new Error(`WCS-WAVE column ${name} missing`);
        return Array.from({ length: c.n }, (_, i) => (c.code === "J" ? row.readInt32BE(c.off + i * 4) : c.code === "D" ? row.readDoubleBE(c.off + i * 8) : row.readFloatBE(c.off + i * 4)));
      };
      const X = readCol("X");
      const Y = readCol("Y");
      const V = readCol("VALUES");
      return {
        url,
        imageOffset,
        varianceOffset: varHdrOffset + vh.headerBytes,
        nx: num(img.cards, "NAXIS1"),
        ny: num(img.cards, "NAXIS2"),
        wcs: buildWcs(img.cards),
        wave: { X, Y, V },
        mjdAvg: num(img.cards, "MJD-AVG", num(img.cards, "MJD-OBS")),
        detector: num(img.cards, "DETECTOR"),
        bunit: String(img.cards.find((c) => c.key === "BUNIT")?.value ?? ""),
      };
    })();
    p.catch(() => indexCache.delete(url));
    indexCache.set(url, p);
    if (indexCache.size > 600) indexCache.delete(indexCache.keys().next().value!);
  }
  return p;
}

/** Bilinear WCS-WAVE lookup; control points may be ascending or descending (MWIR detectors are X-flipped). */
export function wavelengthAt(ix: L2Index, px: number, py: number, transpose = false) {
  const { X, Y, V } = ix.wave;
  const seg = (arr: number[], v: number) => {
    for (let i = 0; i < arr.length - 1; i++) {
      const a = arr[i];
      const b = arr[i + 1];
      if ((v >= Math.min(a, b) && v <= Math.max(a, b)) || i === arr.length - 2) {
        return [i, Math.max(0, Math.min(1, (v - a) / (b - a || 1)))] as const;
      }
    }
    return [0, 0] as const;
  };
  const [i, fx] = seg(X, px);
  const [j, fy] = seg(Y, py);
  const nx = X.length;
  const ny = Y.length;
  const val = (ii: number, jj: number) => (transpose ? V[2 * (jj + ny * ii)] : V[2 * (ii + nx * jj)]);
  return (1 - fx) * (1 - fy) * val(i, j) + fx * (1 - fy) * val(i + 1, j) + (1 - fx) * fy * val(i, j + 1) + fx * fy * val(i + 1, j + 1);
}

export const HW = 64;
export const PIX_ARCSEC = 6.15;

/**
 * One 64×64 north-up (east-left) cutout at 6.15″/px, bilinear-resampled from the detector.
 * Returns raw IMAGE/VARIANCE values (MJy/sr) plus the wavelength at the target.
 */
export async function cutoutL2(url: string, ra: number, dec: number, band?: [number, number]) {
  const ix = await indexL2(url);
  const centre = skyToPix(ix.wcs, ra, dec);
  if (!centre) return null;
  const [cx, cy] = centre;
  if (cx < 1 || cy < 1 || cx > ix.nx || cy > ix.ny) return null;
  const s = PIX_ARCSEC / 3600;
  const map = new Float64Array(HW * HW * 2);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let y = 0; y < HW; y++) {
    for (let x = 0; x < HW; x++) {
      const [r, d] = tangentToSky(ra, dec, -(x - (HW - 1) / 2) * s, (y - (HW - 1) / 2) * s);
      const p = skyToPix(ix.wcs, r, d);
      const k = (y * HW + x) * 2;
      map[k] = p ? p[0] : NaN;
      map[k + 1] = p ? p[1] : NaN;
      if (p) {
        x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]);
        y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
      }
    }
  }
  const c0 = Math.max(1, Math.floor(x0) - 1);
  const c1 = Math.min(ix.nx, Math.ceil(x1) + 1);
  const r0 = Math.max(1, Math.floor(y0) - 1);
  const r1 = Math.min(ix.ny, Math.ceil(y1) + 1);
  if (c1 <= c0 || r1 <= r0) return null;
  const w = c1 - c0 + 1;
  const ranges: [number, number][] = [];
  for (const base of [ix.imageOffset, ix.varianceOffset]) {
    for (let r = r0; r <= r1; r++) {
      const a = base + ((r - 1) * ix.nx + (c0 - 1)) * 4;
      ranges.push([a, a + w * 4 - 1]);
    }
  }
  const got = await getMulti(url, ranges);
  const win = (base: number) => {
    const arr = new Float32Array(w * (r1 - r0 + 1)).fill(NaN);
    for (let r = r0; r <= r1; r++) {
      const a = base + ((r - 1) * ix.nx + (c0 - 1)) * 4;
      const b = got.get(a);
      if (!b) continue;
      for (let c = 0; c < w && c * 4 + 3 < b.length; c++) arr[(r - r0) * w + c] = b.readFloatBE(c * 4);
    }
    return arr;
  };
  const img = win(ix.imageOffset);
  const vari = win(ix.varianceOffset);
  const sample = (arr: Float32Array, px: number, py: number) => {
    const fx = px - c0;
    const fy = py - r0;
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    if (i < 0 || j < 0 || i + 1 >= w || j + 1 > r1 - r0) return NaN;
    const tx = fx - i;
    const ty = fy - j;
    const v00 = arr[j * w + i], v10 = arr[j * w + i + 1], v01 = arr[(j + 1) * w + i], v11 = arr[(j + 1) * w + i + 1];
    return (1 - tx) * (1 - ty) * v00 + tx * (1 - ty) * v10 + (1 - tx) * ty * v01 + tx * ty * v11;
  };
  const image = new Float32Array(HW * HW);
  const variance = new Float32Array(HW * HW);
  for (let k = 0; k < HW * HW; k++) {
    const px = map[k * 2];
    const py = map[k * 2 + 1];
    image[k] = Number.isFinite(px) ? sample(img, px, py) : NaN;
    variance[k] = Number.isFinite(px) ? sample(vari, px, py) : NaN;
  }
  // Validate the lookup against the exposure's real bandpass; MWIR tables can be stored transposed/flipped.
  let wavelengthUm = wavelengthAt(ix, cx, cy);
  if (band && !(wavelengthUm >= band[0] * 0.97 && wavelengthUm <= band[1] * 1.03)) {
    const alt = wavelengthAt(ix, cx, cy, true);
    wavelengthUm = alt >= band[0] * 0.97 && alt <= band[1] * 1.03 ? alt : NaN;
  }
  return { image, variance, wavelengthUm, mjd: ix.mjdAvg, detector: ix.detector, pixel: [cx, cy] as [number, number], bunit: ix.bunit };
}

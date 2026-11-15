import "server-only";

/**
 * Minimal FITS reader over HTTP Range requests. The SPHEREx DR1 order-5 cubes are ~320 MB,
 * so we only ever read headers, single 512×512 planes, or single-pixel spectra.
 * IRSA IBE does not send CORS headers, which is why this runs server-side.
 */

const BLOCK = 2880;

export interface Card {
  key: string;
  value: string | number | boolean | null;
  comment?: string;
}

export interface HDU {
  index: number;
  name: string;
  xtension: string;
  bitpix: number;
  naxis: number[];
  pcount: number;
  gcount: number;
  headerOffset: number;
  dataOffset: number;
  dataBytes: number;
  cards: Card[];
}

export interface FitsIndex {
  url: string;
  size: number;
  hdus: HDU[];
  fetchedAt: string;
}

const UA = { "User-Agent": "stellarscope/0.1 (+range-reader)" };

export async function rangeFetch(url: string, start: number, end: number, attempt = 0): Promise<{ buf: Buffer; total: number }> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { Range: `bytes=${start}-${end}`, ...UA }, cache: "no-store", signal: AbortSignal.timeout(45_000) });
  } catch (e) {
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
      return rangeFetch(url, start, end, attempt + 1);
    }
    throw e;
  }
  if ((res.status === 429 || res.status >= 500) && attempt < 3) {
    await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
    return rangeFetch(url, start, end, attempt + 1);
  }
  if (res.status !== 206 && res.status !== 200) throw new Error(`Range request failed: HTTP ${res.status}`);
  const cr = res.headers.get("content-range");
  const total = cr ? Number(cr.split("/")[1]) : Number(res.headers.get("content-length") ?? 0);
  const buf = Buffer.from(await res.arrayBuffer());
  return { buf, total };
}

export function parseCard(raw: string): Card | null {
  const key = raw.slice(0, 8).trim();
  if (!key) return null;
  if (raw.slice(8, 10) !== "= ") return { key, value: null, comment: raw.slice(8).trim() };
  const rest = raw.slice(10);
  let value: Card["value"];
  let comment: string | undefined;
  const t = rest.trimStart();
  if (t.startsWith("'")) {
    let i = 1;
    let s = "";
    const body = t;
    while (i < body.length) {
      if (body[i] === "'" && body[i + 1] === "'") {
        s += "'";
        i += 2;
      } else if (body[i] === "'") {
        i++;
        break;
      } else s += body[i++];
    }
    value = s.trimEnd();
    const c = body.slice(i).indexOf("/");
    if (c >= 0) comment = body.slice(i + c + 1).trim();
  } else {
    const slash = t.indexOf("/");
    const v = (slash >= 0 ? t.slice(0, slash) : t).trim();
    comment = slash >= 0 ? t.slice(slash + 1).trim() : undefined;
    if (v === "T") value = true;
    else if (v === "F") value = false;
    else if (v === "") value = null;
    else if (!Number.isNaN(Number(v.replace("D", "E")))) value = Number(v.replace("D", "E"));
    else value = v;
  }
  return { key, value, comment };
}

const cache = new Map<string, FitsIndex>();

export async function indexFits(url: string, maxHdus = 8): Promise<FitsIndex> {
  const hit = cache.get(url);
  if (hit) return hit;
  const hdus: HDU[] = [];
  let offset = 0;
  let total = Infinity;
  for (let h = 0; h < maxHdus && offset < total; h++) {
    let headerText = "";
    let chunk = 0;
    let endIdx = -1;
    while (endIdx < 0 && chunk < 20) {
      const start = offset + chunk * BLOCK * 4;
      const r = await rangeFetch(url, start, start + BLOCK * 4 - 1);
      total = r.total || total;
      headerText += r.buf.toString("latin1");
      chunk++;
      for (let i = 0; i < headerText.length; i += 80) {
        if (headerText.slice(i, i + 8) === "END     " || headerText.slice(i, i + 80).trim() === "END") {
          endIdx = i / 80;
          break;
        }
      }
      if (r.buf.length < BLOCK * 4) break;
    }
    if (endIdx < 0) break;
    const cards: Card[] = [];
    for (let i = 0; i < endIdx; i++) {
      const c = parseCard(headerText.slice(i * 80, i * 80 + 80));
      if (c) cards.push(c);
    }
    const get = (k: string) => cards.find((c) => c.key === k)?.value;
    const naxisN = Number(get("NAXIS") ?? 0);
    const naxis = Array.from({ length: naxisN }, (_, i) => Number(get(`NAXIS${i + 1}`) ?? 0));
    const bitpix = Number(get("BITPIX") ?? 8);
    const pcount = Number(get("PCOUNT") ?? 0);
    const gcount = Number(get("GCOUNT") ?? 1);
    const headerBytes = Math.ceil(((endIdx + 1) * 80) / BLOCK) * BLOCK;
    const dataBytes = naxisN === 0 ? 0 : (Math.abs(bitpix) / 8) * gcount * (pcount + naxis.reduce((a, b) => a * b, 1));
    const xtension = h === 0 ? "PRIMARY" : String(get("XTENSION") ?? "").trim();
    hdus.push({
      index: h,
      name: String(get("EXTNAME") ?? (h === 0 ? "PRIMARY" : `HDU${h}`)).trim(),
      xtension,
      bitpix,
      naxis,
      pcount,
      gcount,
      headerOffset: offset,
      dataOffset: offset + headerBytes,
      dataBytes,
      cards,
    });
    offset += headerBytes + Math.ceil(dataBytes / BLOCK) * BLOCK;
  }
  const idx = { url, size: Number.isFinite(total) ? total : 0, hdus, fetchedAt: new Date().toISOString() };
  cache.set(url, idx);
  return idx;
}

/** Decode a small BINTABLE (scalar or repeated E/D/J/I/K/B/L/A columns). */
export async function readBinTable(url: string, hdu: HDU, maxBytes = 2_000_000) {
  if (hdu.xtension !== "BINTABLE" || hdu.dataBytes > maxBytes) return null;
  const rowLen = hdu.naxis[0];
  const nrows = hdu.naxis[1];
  const { buf } = await rangeFetch(url, hdu.dataOffset, hdu.dataOffset + rowLen * nrows - 1);
  const get = (k: string) => hdu.cards.find((c) => c.key === k)?.value;
  const nf = Number(get("TFIELDS") ?? 0);
  const cols: { name: string; unit?: string; form: string; repeat: number; code: string; offset: number }[] = [];
  let off = 0;
  const size: Record<string, number> = { L: 1, B: 1, I: 2, J: 4, K: 8, E: 4, D: 8, A: 1, X: 1 };
  for (let i = 1; i <= nf; i++) {
    const form = String(get(`TFORM${i}`) ?? "").trim();
    const m = /^(\d*)([A-Z])/.exec(form);
    const repeat = m && m[1] ? Number(m[1]) : 1;
    const code = m ? m[2] : "A";
    cols.push({ name: String(get(`TTYPE${i}`) ?? `COL${i}`).trim(), unit: get(`TUNIT${i}`) as string | undefined, form, repeat, code, offset: off });
    off += (code === "X" ? Math.ceil(repeat / 8) : repeat * (size[code] ?? 1));
  }
  const rows: Record<string, unknown>[] = [];
  for (let r = 0; r < nrows; r++) {
    const base = r * rowLen;
    const row: Record<string, unknown> = {};
    for (const c of cols) {
      const o = base + c.offset;
      const read = (k: number): number | string | boolean => {
        switch (c.code) {
          case "E": return buf.readFloatBE(o + k * 4);
          case "D": return buf.readDoubleBE(o + k * 8);
          case "J": return buf.readInt32BE(o + k * 4);
          case "I": return buf.readInt16BE(o + k * 2);
          case "K": return Number(buf.readBigInt64BE(o + k * 8));
          case "B": return buf.readUInt8(o + k);
          case "L": return buf.toString("latin1", o + k, o + k + 1) === "T";
          default: return "";
        }
      };
      if (c.code === "A") row[c.name] = buf.toString("latin1", o, o + c.repeat).replace(/\0+$/, "").trim();
      else if (c.repeat === 1) row[c.name] = read(0);
      else row[c.name] = Array.from({ length: Math.min(c.repeat, 512) }, (_, k) => read(k));
    }
    rows.push(row);
  }
  return { columns: cols.map(({ name, unit, form }) => ({ name, unit, form })), rows };
}

export function planeRange(hdu: HDU, plane: number) {
  const [w, h] = hdu.naxis;
  const bpp = Math.abs(hdu.bitpix) / 8;
  const bytes = w * h * bpp;
  const start = hdu.dataOffset + plane * bytes;
  return { start, end: start + bytes - 1, w, h, bpp };
}

export async function readPixelSpectrum(url: string, hdu: HDU, x: number, y: number) {
  const [w, h, depth = 1] = hdu.naxis;
  const bpp = Math.abs(hdu.bitpix) / 8;
  const out: number[] = new Array(depth).fill(NaN);
  const planes = Array.from({ length: depth }, (_, i) => i);
  const conc = 8;
  for (let i = 0; i < planes.length; i += conc) {
    await Promise.all(
      planes.slice(i, i + conc).map(async (p) => {
        const off = hdu.dataOffset + (p * w * h + y * w + x) * bpp;
        const { buf } = await rangeFetch(url, off, off + bpp - 1);
        out[p] =
          hdu.bitpix === -32 ? buf.readFloatBE(0)
          : hdu.bitpix === -64 ? buf.readDoubleBE(0)
          : hdu.bitpix === 32 ? buf.readInt32BE(0)
          : hdu.bitpix === 16 ? buf.readInt16BE(0)
          : buf.readUInt8(0);
      }),
    );
  }
  return out;
}

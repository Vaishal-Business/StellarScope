import "server-only";

export interface Exposure {
  obsId: string;
  detector: string; // "D1".."D6"
  collection: string;
  tMin: number;
  tMax: number;
  emMinUm: number;
  emMaxUm: number;
  accessUrl: string;
  sizeKb: number;
  exptime: number;
  release: string;
  ra: number;
  dec: number;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      row.push(cur);
      cur = "";
    } else if (ch === "\n") {
      row.push(cur.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cur = "";
    } else cur += ch;
  }
  if (cur || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1);
}

const memo = new Map<string, Promise<Exposure[]>>();

/** Real SPHEREx Level-2 exposures covering a position (IRSA SIAv2). Memoised; IRSA takes ~20 s. */
export function querySia(ra: number, dec: number, collection: "spherex_dr1" | "spherex_qr3" = "spherex_dr1"): Promise<Exposure[]> {
  const key = `${collection}:${ra.toFixed(3)}:${dec.toFixed(3)}`;
  let p = memo.get(key);
  if (!p) {
    p = (async () => {
      const url = `https://irsa.ipac.caltech.edu/SIA?COLLECTION=${collection}&POS=circle+${ra.toFixed(5)}+${dec.toFixed(5)}+0.002&RESPONSEFORMAT=CSV&MAXREC=3000`;
      let last: unknown;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(90_000), cache: "no-store", headers: { "User-Agent": "stellarscope/0.2 (+sia)" } });
          if (!res.ok) throw new Error(`IRSA SIA HTTP ${res.status}`);
          const rows = parseCsv(await res.text());
          if (!rows.length) return [];
          const head = rows[0];
          const c = (n: string) => head.indexOf(n);
          const ix = { obs_id: c("obs_id"), band: c("energy_bandpassname"), t_min: c("t_min"), t_max: c("t_max"), em_min: c("em_min"), em_max: c("em_max"), url: c("access_url"), size: c("access_estsize"), exp: c("t_exptime"), rel: c("obs_release_date"), ra: c("s_ra"), dec: c("s_dec") };
          return rows
            .slice(1)
            .map((r) => ({
              obsId: r[ix.obs_id],
              detector: (r[ix.band] ?? "").replace("SPHEREx-", ""),
              collection,
              tMin: Number(r[ix.t_min]),
              tMax: Number(r[ix.t_max]),
              emMinUm: Number(r[ix.em_min]) * 1e6,
              emMaxUm: Number(r[ix.em_max]) * 1e6,
              accessUrl: r[ix.url],
              sizeKb: Number(r[ix.size]),
              exptime: Number(r[ix.exp]),
              release: r[ix.rel],
              ra: Number(r[ix.ra]),
              dec: Number(r[ix.dec]),
            }))
            .filter((e) => e.accessUrl?.startsWith("https://irsa.ipac.caltech.edu/"))
            .sort((a, b) => a.tMin - b.tMin);
        } catch (e) {
          last = e;
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        }
      }
      throw last;
    })();
    p.catch(() => memo.delete(key));
    memo.set(key, p);
    if (memo.size > 300) memo.delete(memo.keys().next().value!);
  }
  return p;
}

export function groupVisits(exposures: Exposure[]) {
  const visitsMap = new Map<string, { id: string; tMin: number; detectors: string[]; emMinUm: number; emMaxUm: number }>();
  for (const e of exposures) {
    const v = visitsMap.get(e.obsId) ?? { id: e.obsId, tMin: e.tMin, detectors: [], emMinUm: e.emMinUm, emMaxUm: e.emMaxUm };
    if (!v.detectors.includes(e.detector)) v.detectors.push(e.detector);
    v.emMinUm = Math.min(v.emMinUm, e.emMinUm);
    v.emMaxUm = Math.max(v.emMaxUm, e.emMaxUm);
    visitsMap.set(e.obsId, v);
  }
  const visits = [...visitsMap.values()].sort((a, b) => a.tMin - b.tMin);
  const epochs: { index: number; tStart: number; tEnd: number; visits: number }[] = [];
  for (const v of visits) {
    const last = epochs[epochs.length - 1];
    if (last && v.tMin - last.tEnd < 30) {
      last.tEnd = v.tMin;
      last.visits++;
    } else epochs.push({ index: epochs.length + 1, tStart: v.tMin, tEnd: v.tMin, visits: 1 });
  }
  return { visits, epochs };
}

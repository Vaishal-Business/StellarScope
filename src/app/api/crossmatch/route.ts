import type { NextRequest } from "next/server";

/**
 * Cross-match a position against real catalogues:
 *  - ESA Gaia DR3 (positions, G magnitude, proper motions) — explains "movers" that are just high-proper-motion stars
 *  - NASA/JPL Small-Body Identification API — known asteroids/comets in the field on each epoch date
 */
const UA = { "User-Agent": "StellarScope/1.0 (NASA Space Apps citizen-science app)" };
const memo = new Map<string, unknown>();

function sexa(deg: number, hours: boolean) {
  let v = hours ? deg / 15 : Math.abs(deg);
  const sign = !hours && deg < 0 ? "M" : "";
  const a = Math.floor(v);
  v = (v - a) * 60;
  const b = Math.floor(v);
  const c = ((v - b) * 60).toFixed(0).padStart(2, "0");
  return `${sign}${String(a).padStart(2, "0")}-${String(b).padStart(2, "0")}-${c}`;
}

async function gaia(ra: number, dec: number, r: number) {
  const q = `SELECT TOP 60 source_id, ra, dec, phot_g_mean_mag, pmra, pmdec, parallax, DISTANCE(POINT('ICRS',ra,dec),POINT('ICRS',${ra},${dec}))*3600 AS sep FROM gaiadr3.gaia_source WHERE 1=CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS',${ra},${dec},${r})) ORDER BY phot_g_mean_mag ASC`;
  const body = new URLSearchParams({ REQUEST: "doQuery", LANG: "ADQL", FORMAT: "json", QUERY: q });
  const res = await fetch("https://gea.esac.esa.int/tap-server/tap/sync", { method: "POST", body, headers: UA, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`Gaia TAP HTTP ${res.status}`);
  const j = (await res.json()) as { metadata: { name: string }[]; data: unknown[][] };
  const names = j.metadata.map((m) => m.name);
  return j.data.map((row) => Object.fromEntries(names.map((n, i) => [n, n === "source_id" ? String(row[i]) : row[i]])));
}

async function jpl(ra: number, dec: number, date: string, hw: number) {
  const url = `https://ssd-api.jpl.nasa.gov/sb_ident.api?sb-kind=a&mpc-code=500&obs-time=${date}&fov-ra-center=${sexa(ra, true)}&fov-dec-center=${sexa(dec, false)}&fov-ra-hwidth=${hw}&fov-dec-hwidth=${hw}`;
  for (let a = 0; a < 3; a++) {
    const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(60_000) });
    if (res.ok) {
      const j = (await res.json()) as { fields_first?: string[]; data_first_pass?: string[][]; fields_second?: string[]; data_second_pass?: string[][] };
      // Second pass = precise positions; first pass is a coarse screen over a much wider area.
      const second = j.data_second_pass && j.fields_second;
      const f = (second ? j.fields_second : j.fields_first) ?? [];
      const rows = (second ? j.data_second_pass : j.data_first_pass) ?? [];
      const normKey = f.findIndex((k) => /Norm/.test(k));
      const inside = rows.filter((r) => normKey < 0 || Number(r[normKey]) <= hw * 3600 * Math.SQRT2);
      return { date, count: inside.length, objects: inside.slice(0, 25).map((r) => Object.fromEntries(f.map((k, i) => [k, r[i]]))) };
    }
    await new Promise((s) => setTimeout(s, 1500 * (a + 1)));
  }
  throw new Error("JPL SB Ident unavailable");
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const ra = Number(sp.get("ra"));
  const dec = Number(sp.get("dec"));
  const r = Math.min(0.15, Math.max(0.005, Number(sp.get("r") ?? 0.06)));
  const dates = (sp.get("dates") ?? "").split(",").filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(0, 4);
  if (!Number.isFinite(ra) || !Number.isFinite(dec) || ra < 0 || ra >= 360 || Math.abs(dec) > 90) return Response.json({ error: "ra/dec out of range" }, { status: 400 });
  const key = `${ra.toFixed(4)}:${dec.toFixed(4)}:${r}:${dates.join(",")}`;
  if (memo.has(key)) return Response.json(memo.get(key));
  const [g, ...asteroids] = await Promise.allSettled([gaia(ra, dec, r), ...dates.map((d) => jpl(ra, dec, d, Math.max(0.05, r)))]);
  const body = {
    ra, dec, radiusDeg: r,
    gaia: g.status === "fulfilled" ? { source: "ESA Gaia DR3", stars: g.value } : { source: "ESA Gaia DR3", error: (g.reason as Error).message, stars: [] },
    asteroids: asteroids.map((a, i) => (a.status === "fulfilled" ? { source: "NASA/JPL SB Ident", ...a.value } : { source: "NASA/JPL SB Ident", date: dates[i], error: (a.reason as Error).message, count: 0, objects: [] })),
  };
  if (memo.size > 300) memo.clear();
  memo.set(key, body);
  return Response.json(body);
}

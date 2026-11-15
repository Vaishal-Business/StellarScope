import type { RaDec } from "./healpix";

const DEG = Math.PI / 180;

/**
 * ICRS (ra, dec) -> scene unit vector.
 *   X = cos(dec)cos(ra), Y = sin(dec), Z = -cos(dec)sin(ra)
 * Seen from the origin with north up, RA increases to the left (east-left), like the real sky.
 */
export function radecToVec(ra: number, dec: number, out: [number, number, number] = [0, 0, 0]) {
  const a = ra * DEG;
  const d = dec * DEG;
  const c = Math.cos(d);
  out[0] = c * Math.cos(a);
  out[1] = Math.sin(d);
  out[2] = -c * Math.sin(a);
  return out;
}

export function vecToRadec(x: number, y: number, z: number): RaDec {
  const r = Math.hypot(x, y, z) || 1;
  const dec = Math.asin(Math.max(-1, Math.min(1, y / r))) / DEG;
  let ra = Math.atan2(-z, x) / DEG;
  if (ra < 0) ra += 360;
  return { ra, dec };
}

/** Great-circle separation in degrees. */
export function angularDistance(a: RaDec, b: RaDec): number {
  const d1 = a.dec * DEG;
  const d2 = b.dec * DEG;
  const dra = (b.ra - a.ra) * DEG;
  const s =
    Math.sin((d2 - d1) / 2) ** 2 + Math.cos(d1) * Math.cos(d2) * Math.sin(dra / 2) ** 2;
  return (2 * Math.asin(Math.min(1, Math.sqrt(s)))) / DEG;
}

export function formatRA(ra: number, precise = false): string {
  const h = ra / 15;
  const hh = Math.floor(h);
  const m = (h - hh) * 60;
  const mm = Math.floor(m);
  const s = (m - mm) * 60;
  return precise
    ? `${String(hh).padStart(2, "0")}h ${String(mm).padStart(2, "0")}m ${s.toFixed(1).padStart(4, "0")}s`
    : `${String(hh).padStart(2, "0")}h ${String(mm).padStart(2, "0")}m`;
}

export function formatDec(dec: number, precise = false): string {
  const sign = dec < 0 ? "−" : "+";
  const a = Math.abs(dec);
  const dd = Math.floor(a);
  const m = (a - dd) * 60;
  const mm = Math.floor(m);
  const s = (m - mm) * 60;
  return precise
    ? `${sign}${String(dd).padStart(2, "0")}° ${String(mm).padStart(2, "0")}′ ${s.toFixed(0).padStart(2, "0")}″`
    : `${sign}${String(dd).padStart(2, "0")}° ${String(mm).padStart(2, "0")}′`;
}

/** Ecliptic longitude (deg) -> ICRS, J2000 mean obliquity. */
export function eclipticToRadec(lon: number, lat = 0): RaDec {
  const e = 23.4392911 * DEG;
  const l = lon * DEG;
  const b = lat * DEG;
  const x = Math.cos(b) * Math.cos(l);
  const y = Math.cos(b) * Math.sin(l) * Math.cos(e) - Math.sin(b) * Math.sin(e);
  const z = Math.cos(b) * Math.sin(l) * Math.sin(e) + Math.sin(b) * Math.cos(e);
  let ra = Math.atan2(y, x) / DEG;
  if (ra < 0) ra += 360;
  return { ra, dec: Math.asin(z) / DEG };
}

/** Galactic (l, b) -> ICRS using the standard J2000 rotation matrix (transpose of the ICRS->Gal matrix). */
export function galacticToRadec(l: number, b: number): RaDec {
  const T = [
    [-0.0548755604162154, -0.873437090234885, -0.4838350155487132],
    [0.4941094278755837, -0.4448296299600112, 0.7469822444972189],
    [-0.867666148981161, -0.1980763734312015, 0.4559837761750669],
  ];
  const lr = l * DEG;
  const br = b * DEG;
  const g = [Math.cos(br) * Math.cos(lr), Math.cos(br) * Math.sin(lr), Math.sin(br)];
  const x = T[0][0] * g[0] + T[1][0] * g[1] + T[2][0] * g[2];
  const y = T[0][1] * g[0] + T[1][1] * g[1] + T[2][1] * g[2];
  const z = T[0][2] * g[0] + T[1][2] * g[1] + T[2][2] * g[2];
  let ra = Math.atan2(y, x) / DEG;
  if (ra < 0) ra += 360;
  return { ra, dec: Math.asin(Math.max(-1, Math.min(1, z))) / DEG };
}

export const mjdToDate = (mjd: number) => new Date((mjd - 40587) * 86400000);

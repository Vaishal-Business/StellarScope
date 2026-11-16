/** Low-precision solar-system geometry (heliocentric ecliptic J2000, AU) — good to ~0.01 AU for display. */
const R = Math.PI / 180;
export type V3 = [number, number, number];
export const mjdToJd = (mjd: number) => mjd + 2400000.5;

/** Earth's heliocentric ecliptic position (AU) from the Sun's apparent geocentric longitude. */
export function earthHelio(jd: number): V3 {
  const n = jd - 2451545.0;
  const L = 280.46 + 0.9856474 * n;
  const g = (357.528 + 0.9856003 * n) * R;
  const lam = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * R;
  const r = 1.00014 - 0.01671 * Math.cos(g) - 0.00014 * Math.cos(2 * g);
  return [-r * Math.cos(lam), -r * Math.sin(lam), 0];
}

/** RA/Dec (deg) -> ecliptic unit vector. */
export function radecToEcl(ra: number, dec: number): V3 {
  const e = 23.4392911 * R;
  const x = Math.cos(dec * R) * Math.cos(ra * R);
  const y = Math.cos(dec * R) * Math.sin(ra * R);
  const z = Math.sin(dec * R);
  return [x, y * Math.cos(e) + z * Math.sin(e), -y * Math.sin(e) + z * Math.cos(e)];
}

/** Ecliptic vector -> RA/Dec (deg). */
export function eclToRadec(v: V3) {
  const e = 23.4392911 * R;
  const x = v[0], y = v[1] * Math.cos(e) - v[2] * Math.sin(e), z = v[1] * Math.sin(e) + v[2] * Math.cos(e);
  const r = Math.hypot(x, y, z);
  return { ra: ((Math.atan2(y, x) / R) + 360) % 360, dec: Math.asin(z / r) / R };
}

export interface Elements { a: number; e: number; i: number; om: number; w: number; ma: number; epochJd: number }

/** Heliocentric ecliptic position (AU) of a body on a Keplerian orbit at jd. */
export function keplerPos(el: Elements, jd: number): V3 {
  const n = 0.9856076686 / Math.pow(el.a, 1.5); // deg/day
  const M = ((el.ma + n * (jd - el.epochJd)) % 360) * R;
  let E = M;
  for (let k = 0; k < 30; k++) E = E - (E - el.e * Math.sin(E) - M) / (1 - el.e * Math.cos(E));
  const xv = el.a * (Math.cos(E) - el.e);
  const yv = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E);
  const v = Math.atan2(yv, xv), r = Math.hypot(xv, yv);
  const O = el.om * R, w = el.w * R, i = el.i * R;
  return [
    r * (Math.cos(O) * Math.cos(v + w) - Math.sin(O) * Math.sin(v + w) * Math.cos(i)),
    r * (Math.sin(O) * Math.cos(v + w) + Math.cos(O) * Math.sin(v + w) * Math.cos(i)),
    r * Math.sin(v + w) * Math.sin(i),
  ];
}

/** Where a body on `el` appears from Earth at jd. */
export function apparentRadec(el: Elements, jd: number) {
  const p = keplerPos(el, jd), e = earthHelio(jd);
  return eclToRadec([p[0] - e[0], p[1] - e[1], p[2] - e[2]]);
}

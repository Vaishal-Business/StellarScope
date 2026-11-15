/**
 * HEALPix NESTED scheme — a direct port of the reference routines in
 * HEALPix C++ (healpix_base.cc: loc2pix / xyf2loc / nest2xyf / xyf2nest).
 *
 * Coordinates: z = sin(dec), phi = RA in radians. All functions work for
 * orders 0..13 using plain JS numbers (12·4^13 < 2^53, bit ops avoided above 2^31).
 */

export const JRLL = [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4];
export const JPLL = [1, 3, 5, 7, 0, 2, 4, 6, 1, 3, 5, 7];

const HALF_PI = Math.PI / 2;
const DEG = Math.PI / 180;

export const nside = (order: number) => 2 ** order;
export const npixTotal = (order: number) => 12 * 4 ** order;

/** Interleave the bits of v into the even bit positions (v < 2^16). */
function spread(v: number): number {
  let r = 0;
  for (let b = 0; v > 0; b++, v = Math.floor(v / 2)) {
    if (v % 2) r += 2 ** (2 * b);
  }
  return r;
}

/** Collect the even bits of v into a compact integer. */
function compact(v: number): number {
  let r = 0;
  for (let b = 0; v > 0; b++, v = Math.floor(v / 4)) {
    if (v % 2) r += 2 ** b;
  }
  return r;
}

export function xyf2nest(order: number, ix: number, iy: number, face: number): number {
  return face * 4 ** order + spread(ix) + 2 * spread(iy);
}

export function nest2xyf(order: number, ipix: number): { face: number; ix: number; iy: number } {
  const npface = 4 ** order;
  const face = Math.floor(ipix / npface);
  const p = ipix - face * npface;
  return { face, ix: compact(p), iy: compact(Math.floor(p / 2)) };
}

/**
 * Continuous face coordinates -> (z, phi).  x, y ∈ [0,1] span a whole base face.
 * Port of T_Healpix_Base::xyf2loc.
 */
export function xyf2loc(x: number, y: number, face: number): { z: number; phi: number } {
  const jr = JRLL[face] - x - y;
  let nr: number;
  let z: number;
  if (jr < 1) {
    nr = jr;
    z = 1 - (nr * nr) / 3;
  } else if (jr > 3) {
    nr = 4 - jr;
    z = (nr * nr) / 3 - 1;
  } else {
    nr = 1;
    z = ((2 - jr) * 2) / 3;
  }
  let tmp = JPLL[face] * nr + x - y;
  if (tmp < 0) tmp += 8;
  if (tmp >= 8) tmp -= 8;
  const phi = nr < 1e-15 ? 0 : (0.5 * HALF_PI * tmp) / nr;
  return { z, phi };
}

/** (ra, dec) in degrees -> NESTED pixel index. Port of loc2pix (nested branch). */
export function ang2pix(order: number, raDeg: number, decDeg: number): number {
  const ns = nside(order);
  const z = Math.sin(decDeg * DEG);
  const za = Math.abs(z);
  let phi = (raDeg * DEG) % (2 * Math.PI);
  if (phi < 0) phi += 2 * Math.PI;
  let tt = phi / HALF_PI;
  if (tt >= 4) tt -= 4;

  if (za <= 2 / 3) {
    const temp1 = ns * (0.5 + tt);
    const temp2 = ns * (z * 0.75);
    const jp = Math.floor(temp1 - temp2);
    const jm = Math.floor(temp1 + temp2);
    const ifp = Math.floor(jp / ns);
    const ifm = Math.floor(jm / ns);
    const face = ifp === ifm ? (ifp % 4) + 4 : ifp < ifm ? ifp % 4 : (ifm % 4) + 8;
    const ix = ((jm % ns) + ns) % ns;
    const iy = ns - (((jp % ns) + ns) % ns) - 1;
    return xyf2nest(order, ix, iy, face);
  }
  const ntt = Math.min(3, Math.floor(tt));
  const tp = tt - ntt;
  const cosDec = Math.cos(decDeg * DEG);
  const tmp = za < 0.99 ? ns * Math.sqrt(3 * (1 - za)) : (ns * cosDec) / Math.sqrt((1 + za) / 3);
  let jp = Math.floor(tp * tmp);
  let jm = Math.floor((1 - tp) * tmp);
  jp = Math.min(jp, ns - 1);
  jm = Math.min(jm, ns - 1);
  return z >= 0 ? xyf2nest(order, ns - jm - 1, ns - jp - 1, ntt) : xyf2nest(order, jp, jm, ntt + 8);
}

export interface RaDec {
  ra: number;
  dec: number;
}

const locToRaDec = (z: number, phi: number): RaDec => {
  let ra = (phi / DEG) % 360;
  if (ra < 0) ra += 360;
  return { ra, dec: Math.asin(Math.max(-1, Math.min(1, z))) / DEG };
};

/** Position of a fractional point (u,v ∈ [0,1]) inside a tile. u ↔ face x, v ↔ face y. */
export function tilePoint(order: number, ipix: number, u: number, v: number): RaDec {
  const { face, ix, iy } = nest2xyf(order, ipix);
  const ns = nside(order);
  const { z, phi } = xyf2loc((ix + u) / ns, (iy + v) / ns, face);
  return locToRaDec(z, phi);
}

export const pix2ang = (order: number, ipix: number): RaDec => tilePoint(order, ipix, 0.5, 0.5);

/** Corners in HEALPix convention order: N, W, S, E. */
export function corners(order: number, ipix: number): RaDec[] {
  return [
    tilePoint(order, ipix, 1, 1),
    tilePoint(order, ipix, 0, 1),
    tilePoint(order, ipix, 0, 0),
    tilePoint(order, ipix, 1, 0),
  ];
}

/** Closed boundary polyline (N→W→S→E→N), `step` samples per edge. */
export function boundary(order: number, ipix: number, step: number): RaDec[] {
  const pts: RaDec[] = [];
  const path: Array<[number, number, number, number]> = [
    [1, 1, 0, 1], // N -> W  (u 1->0, v=1)
    [0, 1, 0, 0], // W -> S  (u=0, v 1->0)
    [0, 0, 1, 0], // S -> E
    [1, 0, 1, 1], // E -> N
  ];
  for (const [u0, v0, u1, v1] of path) {
    for (let i = 0; i < step; i++) {
      const t = i / step;
      pts.push(tilePoint(order, ipix, u0 + (u1 - u0) * t, v0 + (v1 - v0) * t));
    }
  }
  pts.push(pts[0]);
  return pts;
}

export const parentOf = (ipix: number) => Math.floor(ipix / 4);
export const childrenOf = (ipix: number) => [ipix * 4, ipix * 4 + 1, ipix * 4 + 2, ipix * 4 + 3];

/** Mean tile size in degrees at an order (sqrt of the equal pixel area). */
export const tileSizeDeg = (order: number) => Math.sqrt((4 * Math.PI) / npixTotal(order)) / DEG;
/** Tile area in square degrees (all HEALPix pixels at an order have equal area). */
export const tileAreaDeg2 = (order: number) => (4 * Math.PI) / npixTotal(order) / (DEG * DEG);

/** Neighbouring pixels found by stepping just outside each edge midpoint and corner. */
export function neighbours(order: number, ipix: number): number[] {
  const eps = 1e-4;
  const out = new Set<number>();
  const probes: Array<[number, number]> = [
    [0.5, 1 + eps], [0.5, -eps], [1 + eps, 0.5], [-eps, 0.5],
    [1 + eps, 1 + eps], [-eps, -eps], [1 + eps, -eps], [-eps, 1 + eps],
  ];
  const { face, ix, iy } = nest2xyf(order, ipix);
  const ns = nside(order);
  for (const [u, v] of probes) {
    const x = (ix + u) / ns;
    const y = (iy + v) / ns;
    // Points slightly outside the face: approximate via a tiny step toward the outside on the sphere.
    const c = pix2ang(order, ipix);
    const inside = xyf2loc(Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y)), face);
    const p = locToRaDec(inside.z, inside.phi);
    // push the boundary point 2% of the tile size further away from the centre
    const dRa = ((p.ra - c.ra + 540) % 360) - 180;
    const dDec = p.dec - c.dec;
    const q = { ra: p.ra + dRa * 0.04, dec: Math.max(-90, Math.min(90, p.dec + dDec * 0.04)) };
    const n = ang2pix(order, q.ra, q.dec);
    if (n !== ipix) out.add(n);
  }
  return [...out];
}

/** The HiPS "Dir" folder for a pixel: floor(ipix/10000)*10000. */
export const hipsDir = (ipix: number) => Math.floor(ipix / 10000) * 10000;

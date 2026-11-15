import * as THREE from "three";
import { nest2xyf, nside, xyf2loc, tilePoint, boundary, pix2ang, corners } from "./healpix";
import { radecToVec } from "./coords";
import { HIPS } from "./spherex";

/**
 * Builds a tile mesh in true HEALPix geometry. Each vertex is placed with the exact
 * continuous face → sphere mapping (xyf2loc), so the curved cell boundaries are honoured.
 *
 * Texture mapping (validated against the FITS HPX WCS of Norder5/Npix445 and HiPS PNG layout):
 *   PNG column / width  = local face y (v)
 *   PNG row-from-top / height = local face x (u)
 * Bitmaps are uploaded vertically flipped, so tex.s = v and tex.t = 1 − u.
 */
export function segmentsForOrder(order: number) {
  return [32, 24, 16, 8, 6, 4, 4, 4][Math.min(order, 7)];
}

const v3: [number, number, number] = [0, 0, 0];

function locToVec(z: number, phi: number, r: number, out: Float32Array, o: number) {
  const s = Math.sqrt(Math.max(0, 1 - z * z));
  // phi = RA (radians); use the same convention as radecToVec
  out[o] = r * s * Math.cos(phi);
  out[o + 1] = r * z;
  out[o + 2] = -r * s * Math.sin(phi);
}

export function buildTileGeometry(
  order: number,
  ipix: number,
  radius = 1,
  seg = segmentsForOrder(order),
  uvRect: [number, number, number, number] = [0, 0, 1, 1], // s0, t0, sW, tH in texture space
): THREE.BufferGeometry {
  const { face, ix, iy } = nest2xyf(order, ipix);
  const ns = nside(order);
  const n = seg + 1;
  const pos = new Float32Array(n * n * 3);
  const uv = new Float32Array(n * n * 2);
  const [s0, t0, sw, th] = uvRect;
  for (let i = 0; i <= seg; i++) {
    for (let j = 0; j <= seg; j++) {
      const u = i / seg;
      const v = j / seg;
      const { z, phi } = xyf2loc((ix + u) / ns, (iy + v) / ns, face);
      const k = i * n + j;
      locToVec(z, phi, radius, pos, k * 3);
      uv[k * 2] = s0 + v * sw;
      uv[k * 2 + 1] = t0 + (1 - u) * th;
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * n + j;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** All 768 order-3 cells textured from the 1728×1856 Allsky atlas (27 tiles of 64 px per row). */
export function buildAllskyGeometry(radius = 1, seg = 6): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const { allskyCols: cols, allskyTile: ts, allskyWidth: W, allskyHeight: H } = HIPS;
  const inset = 0.5; // half-pixel inset to avoid atlas bleeding
  for (let n = 0; n < 768; n++) {
    const col = n % cols;
    const row = Math.floor(n / cols);
    // in flipped (bottom-up) texture space, the PNG cell occupying rows [row*ts, row*ts+ts) maps to
    // t ∈ [1 − (row+1)·ts/H, 1 − row·ts/H]
    const s0 = (col * ts + inset) / W;
    const sw = (ts - 2 * inset) / W;
    const t0 = 1 - ((row + 1) * ts - inset) / H;
    const th = (ts - 2 * inset) / H;
    parts.push(buildTileGeometry(3, n, radius, seg, [s0, t0, sw, th]));
  }
  return mergeGeometries(parts);
}

function mergeGeometries(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let nv = 0;
  let ni = 0;
  for (const p of parts) {
    nv += p.getAttribute("position").count;
    ni += p.getIndex()!.count;
  }
  const pos = new Float32Array(nv * 3);
  const uv = new Float32Array(nv * 2);
  const idx = new Uint32Array(ni);
  let ov = 0;
  let oi = 0;
  for (const p of parts) {
    const pa = p.getAttribute("position").array as Float32Array;
    const ua = p.getAttribute("uv").array as Float32Array;
    const ia = p.getIndex()!.array;
    pos.set(pa, ov * 3);
    uv.set(ua, ov * 2);
    for (let k = 0; k < ia.length; k++) idx[oi + k] = ia[k] + ov;
    ov += pa.length / 3;
    oi += ia.length;
    p.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

/** Line-segment positions (pairs) for the boundaries of a set of tiles. */
export function tileBoundarySegments(order: number, tiles: number[], radius = 1, step?: number): Float32Array {
  const st = step ?? Math.max(2, Math.round(segmentsForOrder(order) / 1.5));
  const out: number[] = [];
  for (const n of tiles) {
    const pts = boundary(order, n, st);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = radecToVec(pts[i].ra, pts[i].dec, v3);
      out.push(a[0] * radius, a[1] * radius, a[2] * radius);
      const b = radecToVec(pts[i + 1].ra, pts[i + 1].dec, v3);
      out.push(b[0] * radius, b[1] * radius, b[2] * radius);
    }
  }
  return new Float32Array(out);
}

/** Closed polyline positions (flat, for Line2) of one tile boundary. */
export function tileOutline(order: number, ipix: number, radius = 1): number[] {
  const pts = boundary(order, ipix, Math.max(4, segmentsForOrder(order) * 2));
  const out: number[] = [];
  for (const p of pts) {
    const a = radecToVec(p.ra, p.dec, v3);
    out.push(a[0] * radius, a[1] * radius, a[2] * radius);
  }
  return out;
}

export interface TileBound {
  center: THREE.Vector3;
  radius: number; // radians
}

const boundCache = new Map<string, TileBound>();
export function tileBound(order: number, ipix: number): TileBound {
  const key = `${order}/${ipix}`;
  let b = boundCache.get(key);
  if (b) return b;
  const c = pix2ang(order, ipix);
  const cv = new THREE.Vector3(...radecToVec(c.ra, c.dec));
  let r = 0;
  const samples = [...corners(order, ipix), tilePoint(order, ipix, 0.5, 1), tilePoint(order, ipix, 0.5, 0), tilePoint(order, ipix, 1, 0.5), tilePoint(order, ipix, 0, 0.5)];
  for (const p of samples) {
    const pv = new THREE.Vector3(...radecToVec(p.ra, p.dec));
    r = Math.max(r, cv.angleTo(pv));
  }
  b = { center: cv, radius: r * 1.08 };
  if (boundCache.size > 60000) boundCache.clear();
  boundCache.set(key, b);
  return b;
}

/** Hierarchical cone query: tiles at `order` intersecting a cone (dir, half-angle in radians). */
export function tilesInCone(order: number, dir: THREE.Vector3, halfAngle: number, limit = 4000): number[] {
  const out: number[] = [];
  const stack: Array<[number, number]> = [];
  for (let f = 11; f >= 0; f--) stack.push([0, f]);
  while (stack.length) {
    const [k, n] = stack.pop()!;
    const b = tileBound(k, n);
    if (b.center.angleTo(dir) > halfAngle + b.radius) continue;
    if (k === order) {
      out.push(n);
      if (out.length >= limit) break;
    } else {
      for (let c = 3; c >= 0; c--) stack.push([k + 1, n * 4 + c]);
    }
  }
  return out;
}

import { describe, expect, it } from "vitest";
import {
  ang2pix, pix2ang, corners, nest2xyf, xyf2nest, parentOf, childrenOf, npixTotal, neighbours, hipsDir, tilePoint,
} from "../src/sky/healpix";
import { radecToVec, vecToRadec, angularDistance, galacticToRadec } from "../src/sky/coords";
import { tileUrl, scienceUrl, WAVELENGTHS_UM, isBlankFrame, frameBand } from "../src/sky/spherex";
import { hpxPixToSky } from "../src/sky/hpx-wcs";
import { cubePixel } from "../src/lib/objects";
import { parseQuery } from "../src/lib/parse";

describe("HEALPix NESTED against official SPHEREx references", () => {
  it("official tutorial example: RA 60.8109955 Dec 51.3404038 order 5 -> 445", () => {
    expect(ang2pix(5, 60.8109955, 51.3404038)).toBe(445);
  });

  it("corners of Npix445 match the IRSA HpxFinder STC polygon (N, W, S, E)", () => {
    // HpxFinder/Norder5/Dir0/Npix445: POLYGON J2000 61.200000 52.801854 58.846154 51.255807 60.000000 49.702390 62.307692 51.255807
    const ref = [
      [61.2, 52.801854], [58.846154, 51.255807], [60.0, 49.70239], [62.307692, 51.255807],
    ];
    corners(5, 445).forEach((c, i) => {
      expect(c.ra).toBeCloseTo(ref[i][0], 5);
      expect(c.dec).toBeCloseTo(ref[i][1], 5);
    });
  });

  it("HpxFinder centre RA/Dec of Npix445 (60.576923, 51.255807) lies in tile 445", () => {
    expect(ang2pix(5, 60.576923, 51.255807)).toBe(445);
  });

  it("order-0 faces: equator RA 0 -> 4, north 45/60 -> 0, south 45/-60 -> 8", () => {
    expect(ang2pix(0, 0, 0.1)).toBe(4);
    expect(ang2pix(0, 45, 60)).toBe(0);
    expect(ang2pix(0, 45, -60)).toBe(8);
    expect(ang2pix(0, 135, 60)).toBe(1);
  });

  it("round trip: every pixel centre at orders 0..5 maps back to itself", () => {
    for (let k = 0; k <= 5; k++) {
      for (let n = 0; n < npixTotal(k); n++) {
        const c = pix2ang(k, n);
        if (ang2pix(k, c.ra, c.dec) !== n) throw new Error(`order ${k} pix ${n}`);
      }
    }
  });

  it("poles resolve to valid polar faces", () => {
    const n = ang2pix(5, 0, 90);
    const s = ang2pix(5, 0, -90);
    expect(nest2xyf(5, n).face).toBeLessThan(4);
    expect(nest2xyf(5, s).face).toBeGreaterThanOrEqual(8);
    for (const ra of [0, 90, 180, 270]) {
      expect(nest2xyf(5, ang2pix(5, ra, 89.99)).face).toBe(Math.floor(ra / 90) % 4);
    }
  });

  it("RA seam: 359.9999 and 0.0001 are adjacent, never the same cell far away", () => {
    const a = ang2pix(5, 359.9999, 10);
    const b = ang2pix(5, 0.0001, 10);
    const d = angularDistance(pix2ang(5, a), pix2ang(5, b));
    expect(d).toBeLessThan(2.5);
    expect(ang2pix(5, 360, 10)).toBe(ang2pix(5, 0, 10));
    expect(ang2pix(5, -0.5, 10)).toBe(ang2pix(5, 359.5, 10));
  });

  it("parent/child hierarchy is consistent with positions", () => {
    for (const n of [0, 445, 1000, 12287]) {
      const c = pix2ang(5, n);
      expect(ang2pix(4, c.ra, c.dec)).toBe(parentOf(n));
      expect(childrenOf(parentOf(n))).toContain(n);
    }
  });

  it("xyf2nest/nest2xyf are inverse", () => {
    for (const n of [0, 1, 2, 3, 445, 4095, 12287]) {
      const { face, ix, iy } = nest2xyf(5, n);
      expect(xyf2nest(5, ix, iy, face)).toBe(n);
    }
  });

  it("neighbours of an equatorial cell are 8 distinct adjacent tiles", () => {
    const n = ang2pix(5, 30, 5);
    const nb = neighbours(5, n);
    expect(nb.length).toBe(8);
    nb.forEach((m) => expect(angularDistance(pix2ang(5, m), pix2ang(5, n))).toBeLessThan(3.6));
  });
});

describe("coordinate conventions", () => {
  it("radec <-> vec round trip, including poles and seam", () => {
    for (const [ra, dec] of [[0, 0], [359.99, -45], [123.4, 89.9], [271.2, -89.9], [180, 12]]) {
      const v = radecToVec(ra, dec);
      const r = vecToRadec(v[0], v[1], v[2]);
      expect(r.dec).toBeCloseTo(dec, 8);
      expect(angularDistance(r, { ra, dec })).toBeLessThan(1e-8);
    }
  });

  it("RA increases to the left when looking at +X with north up (east-left)", () => {
    const v = radecToVec(90, 0); // RA 90 is at -Z; camera right vector looking +X with up +Y is +Z
    expect(v[2]).toBeCloseTo(-1, 9);
  });

  it("galactic centre maps to Sgr A* direction (266.405, -28.936)", () => {
    const g = galacticToRadec(0, 0);
    expect(g.ra).toBeCloseTo(266.405, 2);
    expect(g.dec).toBeCloseTo(-28.936, 2);
  });
});

describe("HPX WCS ↔ HEALPix consistency (Npix445_cube.fits header)", () => {
  const w = { crpix1: 1024.5, crpix2: 20480.5, pc11: -0.00274658203125, pc12: -0.00274658203125, pc21: 0.00274658203125, pc22: -0.00274658203125, cdelt1: 1, cdelt2: 1 };
  it("FITS pixel corners land on the HEALPix tile corners", () => {
    const c = corners(5, 445); // N, W, S, E
    const e = hpxPixToSky(w, 0.5, 0.5); // -> E
    const n = hpxPixToSky(w, 512.5, 0.5); // -> N
    const s = hpxPixToSky(w, 0.5, 512.5); // -> S
    const wv = hpxPixToSky(w, 512.5, 512.5); // -> W
    [[n, c[0]], [wv, c[1]], [s, c[2]], [e, c[3]]].forEach(([a, b]) => expect(angularDistance(a, b)).toBeLessThan(1e-6));
  });
  it("cubePixel() inverts the WCS: WCS(pixel centre) == HEALPix order-14 sub-pixel centre, and within half a 12.9″ pixel diagonal", () => {
    for (const [ra, dec] of [[60.81, 51.34], [60.5769, 51.2558], [61.9, 51.2], [59.2, 51.0]]) {
      const p = cubePixel(ra, dec);
      expect(p.tile).toBe(445);
      const back = hpxPixToSky(w, p.x + 1, p.y + 1);
      const sub = tilePoint(5, 445, (511 - p.y + 0.5) / 512, (p.x + 0.5) / 512);
      expect(angularDistance(back, sub) * 3600).toBeLessThan(0.01);
      expect(angularDistance(back, { ra, dec }) * 3600).toBeLessThan(9.2);
    }
  });
});

describe("SPHEREx product addressing", () => {
  it("tile URLs follow the IRSA cube layout Norder/Dir/NpixN/NpixN_f.png", () => {
    expect(tileUrl(3, 100, 0)).toMatch(/Norder3\/Dir0\/Npix100\/Npix100\.png$/);
    expect(tileUrl(5, 12000, 40)).toMatch(/Norder5\/Dir10000\/Npix12000\/Npix12000_40\.png$/);
    expect(hipsDir(9999)).toBe(0);
  });

  it("science URL for 445 matches the official sample product", () => {
    expect(scienceUrl(445)).toBe(
      "https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/hips5_cube/hips_20261026/Norder5/Dir0/Npix445_cube.fits",
    );
  });

  it("search parser handles degrees, sexagesimal and tile IDs", () => {
    expect(parseQuery("83.82 -5.39")).toEqual({ ra: 83.82, dec: -5.39 });
    const s = parseQuery("05h35m17.3s -05°23′28″") as { ra: number; dec: number };
    expect(s.ra).toBeCloseTo(83.822, 3);
    expect(s.dec).toBeCloseTo(-5.391, 3);
    expect(parseQuery("SPX-5-00445")).toEqual({ order: 5, ipix: 445 });
    expect(parseQuery("3/100")).toEqual({ order: 3, ipix: 100 });
    expect(parseQuery("hello")).toBeNull();
  });

  it("102 channels, ascending, 0.753–4.988 µm, frames 50/51 blank", () => {
    expect(WAVELENGTHS_UM.length).toBe(102);
    for (let i = 1; i < 102; i++) expect(WAVELENGTHS_UM[i]).toBeGreaterThan(WAVELENGTHS_UM[i - 1]);
    expect(isBlankFrame(50) && isBlankFrame(51) && !isBlankFrame(49)).toBe(true);
    expect(frameBand(50)).toEqual({ band: 3, channel: 17 });
    expect(frameBand(51)).toEqual({ band: 4, channel: 1 });
  });
});

import { hipsDir, pix2ang, corners, parentOf, childrenOf, tileSizeDeg, tileAreaDeg2 } from "./healpix";

/**
 * Validated against https://irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube/properties
 * (hips_release_date 2026-11-01, HipsGen v12.900). Values below are copied from that file.
 */
export const HIPS_BASE = "https://irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube";
export const SCIENCE_BASE =
  "https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/hips5_cube/hips_20261026";

export const HIPS = {
  title: "SPHEREx DR1 all-sky data cube",
  creatorDid: "ivo://IPAC/P/SPHEREx/DR1/cube",
  frame: "equatorial (ICRS)",
  maxOrder: 5,
  tileWidth: 512,
  tileFormat: "png",
  pixelScaleDeg: 0.0035786,
  cubeDepth: 102,
  pixelCut: "0 40",
  pixelFunction: "asinh",
  dataRange: "-1418.79 … 11348.3",
  releaseDate: "2026-11-01",
  tMinMjd: 60789.75076,
  tMaxMjd: 61174.49276,
  allskyOrder: 3,
  allskyCols: 27,
  allskyTile: 64,
  allskyWidth: 1728,
  allskyHeight: 1856,
  emMinUm: 0.743,
  emMaxUm: 5.009,
} as const;

/** data_cube_crval3_arr — central wavelength (µm) of each of the 102 frames. */
export const WAVELENGTHS_UM = [
  0.753, 0.771, 0.79, 0.809, 0.828, 0.848, 0.868, 0.889, 0.91, 0.932, 0.955, 0.978, 1.001, 1.025, 1.05,
  1.075, 1.102, 1.113, 1.139, 1.167, 1.195, 1.224, 1.254, 1.284, 1.315, 1.346, 1.378, 1.412, 1.446, 1.481,
  1.517, 1.554, 1.592, 1.631, 1.656, 1.695, 1.735, 1.775, 1.818, 1.861, 1.905, 1.949, 1.995, 2.041, 2.089,
  2.139, 2.189, 2.24, 2.292, 2.345, 2.399, 2.445, 2.506, 2.575, 2.646, 2.719, 2.794, 2.871, 2.951, 3.033,
  3.118, 3.204, 3.293, 3.383, 3.476, 3.57, 3.667, 3.768, 3.833, 3.867, 3.901, 3.935, 3.97, 4.005, 4.04,
  4.076, 4.112, 4.148, 4.184, 4.22, 4.257, 4.294, 4.331, 4.368, 4.405, 4.435, 4.467, 4.5, 4.533, 4.566, 4.6,
  4.635, 4.669, 4.704, 4.739, 4.773, 4.808, 4.843, 4.879, 4.915, 4.951, 4.988,
] as const;

/** Frames 50 and 51 (band 3 ch 17, band 4 ch 1 — the dichroic channels) are blank per obs_description. */
export const BLANK_FRAMES = new Set([50, 51]);
export const isBlankFrame = (f: number) => BLANK_FRAMES.has(f);

/** frame index = 17*(band-1) + (channel-1) */
export const frameBand = (f: number) => ({ band: Math.floor(f / 17) + 1, channel: (f % 17) + 1 });

/** Default false-colour composite: B 0.848 µm · G 1.905 µm · R 3.293 µm (3.3 µm PAH feature). */
export const DEFAULT_RGB = { r: 62, g: 40, b: 5 } as const;

export const tileUrl = (order: number, ipix: number, frame: number, base = HIPS_BASE) =>
  `${base}/Norder${order}/Dir${hipsDir(ipix)}/Npix${ipix}/Npix${ipix}${frame > 0 ? `_${frame}` : ""}.png`;

export const allskyUrl = (frame: number, base = HIPS_BASE) =>
  `${base}/Norder3/Allsky${frame > 0 ? `_${frame}` : ""}.png`;

/** Full 512×512×102 science cube (IMAGE/NHITS/FLAGS/SPECTRAL_CHANNELS/WCS-WAVE), order 5 only. ~320 MB. */
export const scienceUrl = (ipix: number) =>
  `${SCIENCE_BASE}/Norder5/Dir${hipsDir(ipix)}/Npix${ipix}_cube.fits`;

export const hpxFinderUrl = (ipix: number) => `${HIPS_BASE}/HpxFinder/Norder5/Dir${hipsDir(ipix)}/Npix${ipix}`;

export const tileId = (order: number, ipix: number) => `SPX-${order}-${String(ipix).padStart(order >= 4 ? 5 : 4, "0")}`;

export interface TileInfo {
  order: number;
  ipix: number;
  id: string;
  center: { ra: number; dec: number };
  corners: { ra: number; dec: number }[];
  parent: number | null;
  children: number[];
  sizeDeg: number;
  areaDeg2: number;
  pixelScaleArcsec: number;
  scienceProducts: number[]; // order-5 tiles whose cubes cover this region
}

export function describeTile(order: number, ipix: number): TileInfo {
  const scienceProducts =
    order === 5
      ? [ipix]
      : order < 5 && order >= 3
        ? Array.from({ length: 4 ** (5 - order) }, (_, i) => ipix * 4 ** (5 - order) + i)
        : [];
  return {
    order,
    ipix,
    id: tileId(order, ipix),
    center: pix2ang(order, ipix),
    corners: corners(order, ipix),
    parent: order > 0 ? parentOf(ipix) : null,
    children: order < HIPS.maxOrder ? childrenOf(ipix) : [],
    sizeDeg: tileSizeDeg(order),
    areaDeg2: tileAreaDeg2(order),
    pixelScaleArcsec: HIPS.pixelScaleDeg * 2 ** (HIPS.maxOrder - order) * 3600,
    scienceProducts,
  };
}

export const fmtWl = (f: number) => `${WAVELENGTHS_UM[f].toFixed(3)} µm`;

/** Approximate visible colour for a wavelength position on the 0.75–5 µm strip (UI only). */
export function wavelengthHue(f: number) {
  const t = f / 101;
  return `oklch(0.78 0.13 ${Math.round(250 - t * 230)})`;
}

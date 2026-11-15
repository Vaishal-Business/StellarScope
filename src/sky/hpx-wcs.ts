/**
 * Inverse HEALPix (HPX) projection, Calabretta & Roukema (2007), for H = 4, K = 3
 * as used by the SPHEREx DR1 order-5 cubes (CTYPE RA---HPX/DEC--HPX, PV2_1 = 4, PV2_2 = 3,
 * CRVAL = 0,0, LONPOLE = 0 so native (φ, θ) equal (RA, Dec)).
 */
export interface HpxWcs {
  crpix1: number;
  crpix2: number;
  pc11: number;
  pc12: number;
  pc21: number;
  pc22: number;
  cdelt1: number;
  cdelt2: number;
}

export function wcsFromCards(cards: { key: string; value: unknown }[]): HpxWcs | null {
  const g = (k: string, d?: number) => {
    const v = cards.find((c) => c.key === k)?.value;
    return typeof v === "number" ? v : d;
  };
  const crpix1 = g("CRPIX1");
  const crpix2 = g("CRPIX2");
  if (crpix1 === undefined || crpix2 === undefined) return null;
  return {
    crpix1,
    crpix2,
    pc11: g("PC1_1", 1)!,
    pc12: g("PC1_2", 0)!,
    pc21: g("PC2_1", 0)!,
    pc22: g("PC2_2", 1)!,
    cdelt1: g("CDELT1", 1)!,
    cdelt2: g("CDELT2", 1)!,
  };
}

/** FITS 1-based pixel (p1, p2) -> (ra, dec) degrees. */
export function hpxPixToSky(w: HpxWcs, p1: number, p2: number): { ra: number; dec: number } {
  const dx = p1 - w.crpix1;
  const dy = p2 - w.crpix2;
  const x = w.cdelt1 * (w.pc11 * dx + w.pc12 * dy);
  const y = w.cdelt2 * (w.pc21 * dx + w.pc22 * dy);
  let ra: number;
  let dec: number;
  if (Math.abs(y) <= 45) {
    ra = x;
    dec = (Math.asin(Math.max(-1, Math.min(1, y / 67.5))) * 180) / Math.PI;
  } else {
    const sigma = 2 - Math.abs(y) / 45;
    const xc = -180 + (2 * Math.floor((x + 180) / 90) + 1) * 45;
    ra = sigma > 1e-12 ? xc + (x - xc) / sigma : xc;
    dec = Math.sign(y) * (Math.asin(Math.max(-1, Math.min(1, 1 - (sigma * sigma) / 3))) * 180) / Math.PI;
  }
  ra = ((ra % 360) + 360) % 360;
  return { ra, dec };
}

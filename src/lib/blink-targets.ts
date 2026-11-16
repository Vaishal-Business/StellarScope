/**
 * Real fields with a known answer, used for blink practice. Positions are catalogue values;
 * Barnard's Star is propagated with its Gaia DR3 proper motion to the SPHEREx era (≈2026.0),
 * because it has moved ~4.4′ since J2000.
 */
export interface BlinkTarget {
  id: string;
  name: string;
  ra: number;
  dec: number;
  what: "mover" | "variable" | "field";
  why: string;
  answer?: { ra: number; dec: number; tolerancePx: number };
}

const BARNARD = { ra: 269.4520827, dec: 4.6933639, pmra: -801.551, pmdec: 10362.394 }; // J2000 ICRS, mas/yr (Gaia DR3)
const T = 26.0; // years after J2000
const barnardRa = BARNARD.ra + (BARNARD.pmra * T) / 3.6e6 / Math.cos((BARNARD.dec * Math.PI) / 180);
const barnardDec = BARNARD.dec + (BARNARD.pmdec * T) / 3.6e6;

export const BLINK_TARGETS: BlinkTarget[] = [
  {
    id: "barnard", name: "Barnard's Star", ra: barnardRa, dec: barnardDec, what: "mover",
    why: "The fastest-moving star in the sky: about 10.4″ per year north. Across a year of SPHEREx epochs it shifts ~1.7 pixels — look for a paired dark/bright residual near the centre.",
    answer: { ra: barnardRa, dec: barnardDec, tolerancePx: 4 },
  },
  {
    id: "rdra", name: "R Draconis", ra: 248.1675, dec: 66.7506, what: "variable",
    why: "A Mira variable whose infrared brightness swings over ~245 days. Between SPHEREx epochs it brightens or fades in place — a single residual, not a pair.",
    answer: { ra: 248.1675, dec: 66.7506, tolerancePx: 4 },
  },
  {
    id: "t445", name: "DR1 tutorial tile (Npix445)", ra: 60.5769, dec: 51.2558, what: "field",
    why: "The official DR1 example field in Camelopardalis. A good control: most residuals here should be noise or artefacts.",
  },
];

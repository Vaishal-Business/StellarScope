import { ang2pix } from "@/sky/healpix";

/**
 * Real objects with standard catalogue coordinates (ICRS, J2000; SIMBAD-equivalent to ~arcsec).
 * Every object page resolves its SPHEREx DR1 tile live from these coordinates.
 */
export interface SkyObject {
  slug: string;
  name: string;
  ids: string[];
  type: string;
  category: "Nebula" | "Galaxy" | "Star" | "Cluster" | "Region";
  ra: number;
  dec: number;
  fov: number; // good framing in degrees
  distance?: string;
  constellation: string;
  summary: string;
  infrared: string; // why it matters at 0.75–5 µm
  related: string[];
}

export const OBJECTS: SkyObject[] = [
  {
    slug: "orion-nebula", name: "Orion Nebula", ids: ["M42", "NGC 1976"], type: "H II region / star-forming nebula", category: "Nebula",
    ra: 83.8221, dec: -5.3911, fov: 3, distance: "≈ 1,350 ly", constellation: "Orion",
    summary: "The nearest massive star-forming region to the Sun, lit by the Trapezium cluster's young O and B stars.",
    infrared: "Near-infrared light pierces the dust to reveal embedded protostars; the 3.3 µm PAH feature traces UV-excited organic molecules on cloud surfaces.",
    related: ["horsehead", "betelgeuse", "rigel"],
  },
  {
    slug: "rho-ophiuchi", name: "ρ Ophiuchi Cloud Complex", ids: ["Rho Oph", "LDN 1688"], type: "Dark molecular cloud", category: "Region",
    ra: 246.79, dec: -24.54, fov: 8, distance: "≈ 460 ly", constellation: "Ophiuchus",
    summary: "One of the closest stellar nurseries, a tangle of dust lanes and reflection nebulae near Antares.",
    infrared: "SPHEREx targets interstellar ices (H₂O at 3.0 µm, CO₂ at 4.27 µm, CO at 4.67 µm) by measuring background starlight shining through clouds like this one.",
    related: ["antares", "galactic-center"],
  },
  {
    slug: "andromeda", name: "Andromeda Galaxy", ids: ["M31", "NGC 224"], type: "Spiral galaxy (SA(s)b)", category: "Galaxy",
    ra: 10.6847, dec: 41.2689, fov: 4.5, distance: "≈ 2.5 million ly", constellation: "Andromeda",
    summary: "The nearest large spiral galaxy and the most distant object easily visible to the naked eye.",
    infrared: "At 1–2 µm the old stellar population dominates and the bulge brightens; longer wavelengths trace warm dust in the spiral arms.",
    related: ["triangulum", "pleiades"],
  },
  {
    slug: "pleiades", name: "Pleiades", ids: ["M45", "Melotte 22"], type: "Open star cluster", category: "Cluster",
    ra: 56.75, dec: 24.1167, fov: 3, distance: "≈ 444 ly", constellation: "Taurus",
    summary: "A young open cluster of hot B-type stars drifting through an unrelated dusty cloud.",
    infrared: "Reflection nebulosity and the brightest stars' diffraction structure are prominent in short-wavelength SPHEREx channels.",
    related: ["aldebaran", "orion-nebula"],
  },
  {
    slug: "betelgeuse", name: "Betelgeuse", ids: ["α Ori", "HIP 27989"], type: "Red supergiant (M1–M2 Ia–ab)", category: "Star",
    ra: 88.7929, dec: 7.4071, fov: 1.5, distance: "≈ 550 ly", constellation: "Orion",
    summary: "A pulsating red supergiant nearing the end of its life; its 2019–20 'Great Dimming' was caused by ejected dust.",
    infrared: "Peaks near 1 µm. It saturates the SPHEREx detectors, so the core pixels are flagged — a good example of why FLAGS matter.",
    related: ["orion-nebula", "rigel"],
  },
  {
    slug: "rigel", name: "Rigel", ids: ["β Ori", "HIP 24436"], type: "Blue supergiant (B8 Ia)", category: "Star",
    ra: 78.6345, dec: -8.2016, fov: 1.5, distance: "≈ 860 ly", constellation: "Orion",
    summary: "A luminous blue supergiant that illuminates the faint Witch Head reflection nebula.",
    infrared: "A hot star's spectrum falls steeply across 0.75–5 µm (Rayleigh–Jeans tail) — the opposite slope to a cool brown dwarf.",
    related: ["betelgeuse", "orion-nebula"],
  },
  {
    slug: "galactic-center", name: "Galactic Centre", ids: ["Sgr A*", "l = 0°, b = 0°"], type: "Nuclear star cluster / SMBH", category: "Region",
    ra: 266.4168, dec: -29.0078, fov: 6, distance: "≈ 26,700 ly", constellation: "Sagittarius",
    summary: "The dynamical centre of the Milky Way, hosting a 4-million-solar-mass black hole behind ~30 magnitudes of visual extinction.",
    infrared: "Optical light is fully absorbed, but 2–5 µm light gets through, revealing the dense nuclear star cluster.",
    related: ["rho-ophiuchi", "lagoon"],
  },
  {
    slug: "lagoon", name: "Lagoon Nebula", ids: ["M8", "NGC 6523"], type: "Emission nebula", category: "Nebula",
    ra: 270.9042, dec: -24.3867, fov: 2.5, distance: "≈ 4,100 ly", constellation: "Sagittarius",
    summary: "A giant interstellar cloud with an embedded young cluster (NGC 6530) and dark Bok globules.",
    infrared: "Brackett and Paschen hydrogen recombination lines fall inside SPHEREx's range.",
    related: ["galactic-center", "eagle"],
  },
  {
    slug: "eagle", name: "Eagle Nebula", ids: ["M16", "NGC 6611"], type: "Emission nebula + cluster", category: "Nebula",
    ra: 274.7, dec: -13.8067, fov: 2.5, distance: "≈ 5,700 ly", constellation: "Serpens",
    summary: "Home of the 'Pillars of Creation', columns of gas and dust being eroded by nearby massive stars.",
    infrared: "Dust pillars that are opaque in visible light become partly transparent in the near infrared.",
    related: ["lagoon", "galactic-center"],
  },
  {
    slug: "carina", name: "Carina Nebula", ids: ["NGC 3372"], type: "Giant H II region", category: "Nebula",
    ra: 161.265, dec: -59.8667, fov: 4, distance: "≈ 8,500 ly", constellation: "Carina",
    summary: "One of the largest diffuse nebulae in the sky, containing the eruptive massive star η Carinae.",
    infrared: "Strong PAH emission at 3.3 µm outlines photodissociation regions across the complex.",
    related: ["lmc", "galactic-center"],
  },
  {
    slug: "lmc", name: "Large Magellanic Cloud", ids: ["LMC"], type: "Satellite dwarf galaxy (SBm)", category: "Galaxy",
    ra: 80.8938, dec: -69.7561, fov: 12, distance: "≈ 160,000 ly", constellation: "Dorado",
    summary: "The Milky Way's largest satellite, rich in star formation including the Tarantula Nebula.",
    infrared: "Close to the south ecliptic pole, where SPHEREx builds its deepest coverage.",
    related: ["carina", "andromeda"],
  },
  {
    slug: "crab", name: "Crab Nebula", ids: ["M1", "NGC 1952"], type: "Supernova remnant (pulsar wind nebula)", category: "Nebula",
    ra: 83.6331, dec: 22.0145, fov: 1.2, distance: "≈ 6,500 ly", constellation: "Taurus",
    summary: "The remnant of the supernova recorded by astronomers in 1054 CE, powered by a central pulsar.",
    infrared: "Synchrotron emission produces a smooth power-law continuum across the SPHEREx band.",
    related: ["pleiades", "betelgeuse"],
  },
  {
    slug: "horsehead", name: "Horsehead Nebula", ids: ["Barnard 33", "IC 434"], type: "Dark nebula", category: "Nebula",
    ra: 85.2458, dec: -2.4583, fov: 1.5, distance: "≈ 1,375 ly", constellation: "Orion",
    summary: "A dark dust cloud silhouetted against the glowing emission nebula IC 434.",
    infrared: "The cloud's edge glows in PAH emission while the interior becomes partially transparent at longer wavelengths.",
    related: ["orion-nebula", "betelgeuse"],
  },
  {
    slug: "cats-eye", name: "Cat's Eye Nebula", ids: ["NGC 6543"], type: "Planetary nebula", category: "Nebula",
    ra: 269.6392, dec: 66.6331, fov: 1.2, distance: "≈ 3,300 ly", constellation: "Draco",
    summary: "A complex planetary nebula lying almost exactly at the north ecliptic pole.",
    infrared: "Sits in SPHEREx's deep north ecliptic pole field, which is observed far more often than the average sky.",
    related: ["vega", "andromeda"],
  },
  {
    slug: "vega", name: "Vega", ids: ["α Lyr", "HIP 91262"], type: "A0 V main-sequence star", category: "Star",
    ra: 279.2347, dec: 38.7837, fov: 1.5, distance: "≈ 25 ly", constellation: "Lyra",
    summary: "The photometric zero-point of the classic magnitude system, surrounded by a debris disk.",
    infrared: "Its debris disk was the first discovered via an infrared excess (IRAS, 1983).",
    related: ["cats-eye", "altair"],
  },
  {
    slug: "triangulum", name: "Triangulum Galaxy", ids: ["M33", "NGC 598"], type: "Spiral galaxy (SA(s)cd)", category: "Galaxy",
    ra: 23.4621, dec: 30.6599, fov: 2, distance: "≈ 2.7 million ly", constellation: "Triangulum",
    summary: "The third-largest member of the Local Group, with prominent H II regions like NGC 604.",
    infrared: "Star-forming knots stand out in the 3.3 µm PAH channels.",
    related: ["andromeda", "pleiades"],
  },
];

export const objectBySlug = (s: string) => OBJECTS.find((o) => o.slug === s);

/**
 * Pixel (x, y) inside the order-5 science cube for a sky position.
 * Order 14 = 5 + log2(512): the order-14 NESTED index identifies the cube pixel.
 * FITS axis 1 (x) follows face-local y; FITS axis 2 (y, from bottom) is 511 − face-local x
 * (validated against the HPX WCS in Npix445_cube.fits).
 */
export function cubePixel(ra: number, dec: number) {
  const tile = ang2pix(5, ra, dec);
  const fine = ang2pix(14, ra, dec);
  const local = fine - tile * 512 * 512;
  let xi = 0;
  let yi = 0;
  for (let b = 0, v = local; v > 0; b++, v = Math.floor(v / 4)) {
    const two = v % 4;
    if (two & 1) xi += 2 ** b;
    if (two & 2) yi += 2 ** b;
  }
  return { tile, x: yi, y: 511 - xi };
}

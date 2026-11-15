export interface Module {
  slug: string;
  title: string;
  learn: string;
  minutes: number;
  level: "Beginner" | "Intermediate" | "Advanced";
  widget: "colours" | "composite" | "spectrum" | "noise" | "motion" | "browndwarf" | "galaxy" | "coverage" | "verify";
  sections: { h: string; p: string }[];
}

export const MODULES: Module[] = [
  {
    slug: "infrared-vision", title: "Infrared Vision", learn: "Why infrared astronomy matters", minutes: 6, level: "Beginner", widget: "composite",
    sections: [
      { h: "Seeing through dust", p: "Interstellar dust scatters blue light far more than red. At 1–5 µm, starlight passes through clouds that are opaque in visible light, revealing young stars and the Galactic Centre." },
      { h: "Cool things glow in the infrared", p: "Objects at a few hundred to a few thousand kelvin — brown dwarfs, dust, cool stars — emit most of their light at these wavelengths." },
      { h: "False colour, honestly labelled", p: "Composites map three infrared channels to red, green and blue. They are not what the eye would see; the explorer always labels them as false-colour infrared." },
    ],
  },
  {
    slug: "the-102-colours", title: "The 102 Colours", learn: "What spectral channels represent", minutes: 5, level: "Beginner", widget: "colours",
    sections: [
      { h: "A spectrum for every pixel", p: "SPHEREx uses linear variable filters across six detector bands, building up 102 channels from 0.75 to 5 µm as the sky drifts across the focal plane." },
      { h: "Bands and channels", p: "Frame index = 17 × (band − 1) + (channel − 1). Frames 50 and 51 sit on the dichroic boundary and are blank in the DR1 cube." },
      { h: "Resolution", p: "Spectral resolving power R ≈ 35–130 depending on band — enough for broad molecular and ice features, not for narrow lines." },
    ],
  },
  {
    slug: "reading-a-spectrum", title: "Reading a Spectrum", learn: "How to interpret spectral graphs", minutes: 8, level: "Intermediate", widget: "spectrum",
    sections: [
      { h: "Axes", p: "Wavelength (µm) runs left to right; surface brightness in MJy/sr runs up. The shape — slopes, dips, bumps — carries the physics." },
      { h: "Continuum vs features", p: "Look for the smooth continuum first, then deviations that span several adjacent channels: absorption dips (ices, molecules) or emission bumps (PAHs, recombination lines)." },
      { h: "Check the quality columns", p: "NHITS tells you how many input pixels contributed; FLAGS tells you if a channel is suspect. A feature in flagged channels is not a feature yet." },
    ],
  },
  {
    slug: "noise-vs-signal", title: "Noise vs Signal", learn: "How to distinguish useful signals", minutes: 7, level: "Intermediate", widget: "noise",
    sections: [
      { h: "Signal-to-noise", p: "S/N compares a measurement with its uncertainty. S/N > 5 is rarely produced by random noise — but systematics can still exceed it." },
      { h: "Single-channel spikes", p: "A lone high value in one channel is usually a cosmic ray or detector artefact. Real astrophysical features are spectrally smooth across neighbours." },
      { h: "Robust scaling", p: "Charts default to a robust percentile scale so one spike doesn't flatten everything else; clipped points are marked with a triangle." },
    ],
  },
  {
    slug: "moving-objects", title: "Moving Objects", learn: "How motion is measured", minutes: 6, level: "Intermediate", widget: "motion",
    sections: [
      { h: "Visits and epochs", p: "SPHEREx revisits each point roughly every six months, with many visits clustered in each epoch. Sources that shift between visits may be asteroids or high-proper-motion stars." },
      { h: "Pixels aren't angles", p: "Displacement must be converted with each frame's WCS and timestamp into arcsec per day; registration errors can masquerade as motion." },
    ],
  },
  {
    slug: "brown-dwarfs", title: "Brown Dwarfs", learn: "What makes them interesting", minutes: 6, level: "Beginner", widget: "browndwarf",
    sections: [
      { h: "Failed stars", p: "Too light to sustain hydrogen fusion, brown dwarfs cool for ever. Their spectra show deep water and methane absorption." },
      { h: "What to look for", p: "A spectrum rising toward 1–2 µm with dips near 1.4 and 1.9 µm is suggestive — but dust reddening can mimic slope, so evidence must be combined." },
    ],
  },
  {
    slug: "galaxies", title: "Galaxies", learn: "How to investigate distant galaxies", minutes: 7, level: "Intermediate", widget: "galaxy",
    sections: [
      { h: "Stellar mass light", p: "Near-infrared traces the old stars that dominate a galaxy's mass." },
      { h: "SPHEREx cosmology", p: "SPHEREx measures redshifts for hundreds of millions of galaxies to map large-scale structure and test inflation." },
    ],
  },
  {
    slug: "survey-coverage", title: "Survey Coverage", learn: "How to understand observation gaps", minutes: 5, level: "Beginner", widget: "coverage",
    sections: [
      { h: "Footprints and visits", p: "Each exposure covers a field about 3.5° across. Coverage depth varies, with the ecliptic poles observed most often." },
      { h: "Coverage is not detection", p: "Being observed doesn't mean being detected. Depth, background and artefacts determine what could have been seen." },
    ],
  },
  {
    slug: "scientific-verification", title: "Scientific Verification", learn: "How a candidate becomes a supported discovery", minutes: 6, level: "Advanced", widget: "verify",
    sections: [
      { h: "Reproducibility", p: "A submission carries its data release, pixel, channels and model version so anyone can re-run it." },
      { h: "Independent review", p: "Peers re-measure; reviewers challenge with evidence; only consistent results enter the atlas — with their history attached." },
    ],
  },
];

export const moduleBySlug = (s: string) => MODULES.find((m) => m.slug === s);

export interface Module {
  slug: string;
  title: string;
  learn: string;
  minutes: number;
  level: "Beginner" | "Intermediate" | "Advanced";
  widget: "colours" | "composite" | "spectrum" | "noise" | "motion" | "browndwarf" | "galaxy" | "coverage" | "verify";
  sections: { h: string; p: string }[];
  steps?: { t: string; href?: string }[];
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
  {
    slug: "blink-comparator", title: "Blink Comparator Hunting", learn: "Find moving and changing objects on StellarScope", minutes: 12, level: "Intermediate", widget: "motion",
    sections: [
      { h: "Why blinking works", p: "Your eye is extremely sensitive to change. Flip quickly between two images of the same sky taken at different times and anything that moved or changed brightness jumps out, while the thousands of static stars stay still." },
      { h: "Epochs in SPHEREx", p: "SPHEREx revisits each part of the sky roughly every six months. StellarScope groups real L2 exposures into epochs and stacks them by inverse variance, so each blink frame is the deepest image available for that visit." },
      { h: "Reading a difference image", p: "Difference mode shows epoch B minus epoch A in signal-to-noise units. A moving star leaves a blue (vanished) and red (appeared) pair; a variable leaves a single blob; noise looks like salt-and-pepper below about 5 sigma." },
      { h: "Artefacts to distrust", p: "Residuals exactly at bright stars, on detector edges, or that appear in only one band are usually artefacts. Real movers appear in every band with the same offset." },
    ],
    steps: [
      { t: "Open Blink and pick a preset (start with Barnard's Star) or type coordinates.", href: "/blink" },
      { t: "Press 'Load real epochs'. The first load of a new position takes 1–2 minutes while IRSA cutouts download." },
      { t: "Play the blink, then switch to Difference mode and choose the two most separated epochs." },
      { t: "Turn on Auto-detect, keep the threshold at 5σ, and read the detection list: movers have a rate in arcsec/day." },
      { t: "Click Cross-match to overlay Gaia DR3 stars and query JPL for known asteroids on each epoch date." },
      { t: "If nothing known explains it, press Submit for review — your blink evidence is attached automatically." },
    ],
  },
  {
    slug: "train-your-eye", title: "Training With Blink Academy", learn: "Improve your detection skill on known answers", minutes: 6, level: "Beginner", widget: "motion",
    sections: [
      { h: "Practise where the answer is known", p: "The academy loads real SPHEREx fields around catalogued movers and variables. You click what changes and are scored against the catalogue position." },
      { h: "Learn from others", p: "Existing blink submissions are listed so you can open them in the comparator and judge them yourself." },
      { h: "Know your instrument", p: "The 3D orbit view shows where SPHEREx was for each exposure, which explains parallax for nearby objects and why some epochs differ." },
    ],
    steps: [
      { t: "Open Blink Academy and pick 'Find the mover · Barnard's Star'.", href: "/blink/academy" },
      { t: "Load the challenge, watch a few blinks, then click the object you think moved." },
      { t: "Repeat with R Draconis (a variable) and watch your accuracy and XP rise." },
    ],
  },
  {
    slug: "choosing-channels", title: "Choosing Channels With Spectral Scout", learn: "Let our ONNX model pick the best view", minutes: 7, level: "Intermediate", widget: "spectrum",
    sections: [
      { h: "Why the channel matters", p: "Of 102 channels, a few show a region best: dust and ices absorb at 3.05 and 4.27 µm, PAH emission peaks at 3.3 µm, and stellar photospheres dominate below 1.6 µm." },
      { h: "What Scout does", p: "Spectral Scout is our custom ONNX model. It reads real 102-channel cutouts and ranks channels by information content, entirely in your browser, only when you ask." },
    ],
    steps: [
      { t: "Open Explore, click a tile, then press 'Run Spectral Scout' in the inspector.", href: "/explore" },
      { t: "Inspect the top-ranked channels, and switch the sky view to the recommended one." },
      { t: "Open the region page to read the full spectrum for any pixel." },
    ],
  },
  {
    slug: "cross-matching", title: "Cross-matching & Verification Tools", learn: "Rule out known objects before you submit", minutes: 9, level: "Advanced", widget: "verify",
    sections: [
      { h: "Gaia DR3", p: "Gaia gives positions and proper motions for over a billion stars. A residual at a Gaia star with high proper motion is a known mover, not a discovery." },
      { h: "Solar-system objects", p: "JPL's Small-Body Identification service and the MPC's MPChecker list asteroids and comets in a field at a given date. Many SPHEREx movers will be asteroids." },
      { h: "Literature and images", p: "SIMBAD, IRSA Viewer, Aladin Lite and WiseView let you check whether a source is catalogued and how it looks in WISE and 2MASS epochs." },
    ],
    steps: [
      { t: "In Blink, press Cross-match; review Gaia markers and JPL counts." },
      { t: "Use the official tool links (IRSA, SIMBAD, MPChecker, WiseView) to look deeper." },
      { t: "On Submit for review, tick each verification step you completed, explain your reasoning, and submit.", href: "/submit" },
    ],
  },
];

export const moduleBySlug = (s: string) => MODULES.find((m) => m.slug === s);

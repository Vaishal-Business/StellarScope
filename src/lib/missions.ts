/**
 * Mission definitions (editorial content). Participation, progress and review counts are never
 * stored here — they come from the database via /api/stats.
 */
export type Difficulty = "Beginner" | "Intermediate" | "Advanced" | "Research";

export interface Mission {
  slug: string;
  room: string;
  title: string;
  kind: string;
  difficulty: Difficulty;
  duration: string;
  summary: string;
  briefing: string;
  skills: string[];
  target: { ra: number; dec: number; order: number; label: string };
  objectives: string[];
  xp: number;
}

export const ROOMS = [
  { id: "global", label: "Global" },
  { id: "brown-dwarf-hunt", label: "Brown Dwarf Hunt" },
  { id: "variable-stars", label: "Variable Stars" },
  { id: "spectral-anomaly", label: "Spectral Anomaly" },
  { id: "ices", label: "Ices" },
  { id: "planet-nine", label: "Planet Nine" },
  { id: "learn", label: "Learn" },
];

export const MISSIONS: Mission[] = [
  {
    slug: "infrared-detective", room: "brown-dwarf-hunt", title: "The Infrared Detective", kind: "Brown Dwarf Hunt", difficulty: "Beginner", duration: "10–15 min",
    summary: "Explore infrared signatures and flag sources whose spectra rise toward redder wavelengths.",
    briefing: "A star may look ordinary in a conventional image, but its infrared spectrum can tell a different story. Cool, low-mass objects get relatively brighter from 1 to 2 µm and show deep molecular absorption. Inspect the supplied region, compare the suggested channels and record what you see.",
    skills: ["Spectral analysis", "Spectral Scout model"], target: { ra: 60.81, dec: 51.34, order: 5, label: "Official DR1 tutorial tile" }, xp: 250,
    objectives: ["Inspect the provided sky region", "Run Spectral Scout and review its channel choices", "Compare the available survey epochs", "Submit a candidate interpretation with evidence"],
  },
  {
    slug: "variable-stars", room: "variable-stars", title: "Changing Lights", kind: "Variable Star Investigations", difficulty: "Intermediate", duration: "20 min",
    summary: "Compare SPHEREx survey epochs and investigate sources whose brightness changes.",
    briefing: "SPHEREx revisits every part of the sky roughly every six months. Sources that brighten or fade between epochs can be pulsating giants, eclipsing systems or young stars still accreting. R Draconis, a Mira variable, is one of the fields the Spectral Scout model was built around.",
    skills: ["Multi-epoch analysis"], target: { ra: 248.1675, dec: 66.7506, order: 5, label: "R Draconis (Mira variable)" }, xp: 400,
    objectives: ["Open the region's observation timeline", "Compare the per-epoch composites", "Check flags and coverage for each epoch", "Submit a variability assessment"],
  },
  {
    slug: "spectral-anomaly", room: "spectral-anomaly", title: "Signals in 102 Colours", kind: "Spectral Anomaly Search", difficulty: "Intermediate", duration: "25 min",
    summary: "Investigate unusual spectral signals and separate astrophysics from artefacts.",
    briefing: "Spectral Scout scores every channel for spectral features. Many high scores will be noise, cosmic rays or bright-star artefacts — your job is to tell the difference and document real features with the evidence attached.",
    skills: ["102-channel analysis", "Quality flags"], target: { ra: 246.79, dec: -24.54, order: 5, label: "ρ Ophiuchi cloud" }, xp: 450,
    objectives: ["Run Spectral Scout on the region", "Check the strongest anomaly channel and its S/N", "Inspect the calibrated spectrum and FLAGS", "Submit or dismiss the signal with reasoning"],
  },
  {
    slug: "ice-clouds", room: "ices", title: "Ices of the Nursery", kind: "Interstellar Ice Survey", difficulty: "Advanced", duration: "30 min",
    summary: "Look for water and CO₂ ice absorption against background stars behind molecular clouds.",
    briefing: "One of SPHEREx's core science goals is a census of interstellar ices. Background starlight passing through dense clouds picks up absorption near 3.0 µm (H₂O) and 4.27 µm (CO₂).",
    skills: ["Absorption features", "Extinction"], target: { ra: 83.82, dec: -5.39, order: 5, label: "Orion Nebula" }, xp: 600,
    objectives: ["Locate background stars behind the cloud", "Inspect 2.9–3.2 µm and 4.2–4.3 µm channels", "Compare with an unobscured reference star", "Submit an ice-feature measurement"],
  },
  {
    slug: "moving-sources", room: "planet-nine", title: "Barnard's Run", kind: "Moving Source Search", difficulty: "Intermediate", duration: "15 min",
    summary: "Barnard's Star moves over 10″ a year — see how Spectral Scout tracks motion across epochs.",
    briefing: "Barnard's Star has the largest proper motion of any star, about 10.4″ per year. SPHEREx's six-month epochs make that motion measurable. Run the model, check its track probability and moving-versus-static S/N, and record what you find.",
    skills: ["Motion", "Spectral Scout model"], target: { ra: 269.4521, dec: 4.6934, order: 5, label: "Barnard's Star" }, xp: 350,
    objectives: ["Run Spectral Scout on the field", "Compare moving-stack and static-stack S/N", "Check per-epoch positions", "Submit a motion assessment"],
  },
  {
    slug: "planet-nine", room: "planet-nine", title: "Planet Nine Coverage Search", kind: "Research challenge", difficulty: "Research", duration: "Campaign",
    summary: "Compare SPHEREx survey coverage against hypothetical orbits — coverage first, detection second.",
    briefing: "Planet Nine is a hypothesis, not a known object. This campaign asks a rigorous question: for a given orbit, did SPHEREx look at the right place at the right time, and could it have detected anything there?",
    skills: ["Orbital inference", "Coverage analysis"], target: { ra: 50, dec: 15, order: 3, label: "Example field" }, xp: 1200,
    objectives: ["Choose a position to test", "Query real SPHEREx exposures at that position", "Claim and inspect the tile", "Record coverage vs detectability"],
  },
];

export const missionBySlug = (s: string) => MISSIONS.find((m) => m.slug === s);

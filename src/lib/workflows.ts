/**
 * Guided, hands-on workflows. The coach panel walks through each step on the real pages; the SI
 * assistant can start any workflow (teach_workflow) and drive steps for the user.
 * `chrono` steps send a command to ChronoLens on the current region page.
 */
export interface WorkflowStep {
  title: string;
  body: string;
  path?: string; // page to open for this step
  anchor?: string; // element id to scroll to
  chrono?: { action: "load" | "play" | "difference" | "frames" | "crossmatch" | "submit" | "detect_on" | "select"; index?: number };
}
export interface Workflow {
  id: string;
  title: string;
  level: "Beginner" | "Intermediate" | "Advanced";
  minutes: number;
  goal: string;
  steps: WorkflowStep[];
}

const BARNARD = "/at?ra=269.44627&dec=4.7682";

export const WORKFLOWS: Workflow[] = [
  {
    id: "platform-tour",
    title: "Tour the whole platform",
    level: "Beginner",
    minutes: 5,
    goal: "Know where everything is: sky, regions, missions, academy, community and your lab.",
    steps: [
      { title: "Home", body: "The dashboard shows live platform activity and every tool at a glance. The demo video below gives a 30-second overview.", path: "/" },
      { title: "Explore the sky", body: "A 3D sky made from real SPHEREx infrared images. Drag to look around, scroll to zoom. Press ⌘K to search for any object or coordinates.", path: "/explore" },
      { title: "Open a region", body: "Click any tile in Explore and choose ‘Open region’. A region page has the viewer, observation dates, ChronoLens time-lapse, Spectral Lab and the raw science data.", path: "/region/5/445" },
      { title: "ChronoLens", body: "Every region has ChronoLens: a time-lapse of SPHEREx's visits to that spot that finds things that moved or changed.", path: "/region/5/445", anchor: "chronolens" },
      { title: "Missions", body: "Missions give you a goal (find a brown dwarf, a variable star, an ice cloud…) and walk you from briefing to submission.", path: "/missions" },
      { title: "Hunter Academy", body: "Practise spotting movers and variables where the answer is known, and see where SPHEREx is right now.", path: "/academy" },
      { title: "Community & Lab", body: "Community is where finds are discussed and peer-reviewed. My Lab keeps your saved regions, model runs and submissions.", path: "/community" },
    ],
  },
  {
    id: "find-a-mover",
    title: "Find a moving star with ChronoLens",
    level: "Beginner",
    minutes: 6,
    goal: "Use real SPHEREx epochs to see Barnard's Star move, identify it, and understand why it moves.",
    steps: [
      { title: "Go to Barnard's Star", body: "This opens the region containing Barnard's Star, the fastest-moving star in the sky, with ChronoLens aimed at it.", path: BARNARD, anchor: "chronolens" },
      { title: "Load the epochs", body: "ChronoLens downloads every SPHEREx exposure of this spot from NASA/IPAC IRSA and stacks them by visit. The first time takes 1–2 minutes.", anchor: "chronolens", chrono: { action: "load" } },
      { title: "Watch it play", body: "The frames play like a tiny video. Watch the star near the centre — it shifts slightly between visits.", anchor: "chronolens", chrono: { action: "play" } },
      { title: "See what changed", body: "‘What changed’ subtracts the first visit from the last. A blue spot next to a red spot means something moved from blue to red.", anchor: "chronolens", chrono: { action: "difference" } },
      { title: "Pick a candidate", body: "The auto-spotter lists what changed. Movers are marked ‘moved’ with a speed in arcseconds per year. Click one on the list or the image.", anchor: "chronolens", chrono: { action: "select", index: 1 } },
      { title: "Identify it", body: "Identify compares the spot with ESA Gaia stars and NASA/JPL asteroids. Read the ‘What is it?’ card, the ‘Is it real?’ checks and the 3D ‘Where Earth was’ view.", anchor: "chronolens", chrono: { action: "crossmatch" } },
    ],
  },
  {
    id: "first-discovery",
    title: "From a region to a submitted discovery",
    level: "Intermediate",
    minutes: 12,
    goal: "Hunt any region for something new and submit it with full evidence for peer review.",
    steps: [
      { title: "Choose a region", body: "In Explore, click a tile and open its region page. Regions away from the bright Milky Way plane are easier for beginners.", path: "/explore" },
      { title: "Load ChronoLens", body: "On the region page, scroll to ChronoLens and press ‘Load real epochs’.", anchor: "chronolens", chrono: { action: "load" } },
      { title: "Spot changes", body: "Switch to ‘What changed’. Adjust Sensitivity: 5σ is balanced. Each boxed spot is a candidate.", anchor: "chronolens", chrono: { action: "difference" } },
      { title: "Check one", body: "Click a candidate. The ‘Is it real?’ panel checks signal strength, whether it appears in several colours, and distance from the edge.", anchor: "chronolens", chrono: { action: "select", index: 1 } },
      { title: "Rule out the known", body: "Press Identify. If Gaia or NASA/JPL already know it, it's not new — but it's still good practice!", anchor: "chronolens", chrono: { action: "crossmatch" } },
      { title: "Double-check with NASA tools", body: "Open IRSA Viewer, JPL Small-Body ID or SIMBAD from the ‘Verify with NASA & ESA tools’ list to look for yourself.", anchor: "chronolens" },
      { title: "Submit for review", body: "Press ‘Submit for review’. Your epochs, candidate, checks, identity and light curve are attached automatically. Explain your reasoning and submit.", anchor: "chronolens", chrono: { action: "submit" } },
    ],
  },
  {
    id: "best-channel",
    title: "Let Spectral Scout pick the best colour",
    level: "Intermediate",
    minutes: 6,
    goal: "Run our custom ONNX model to choose the most informative of 102 infrared channels for a region.",
    steps: [
      { title: "Open a region", body: "Start from any region page. We'll use the DR1 tutorial tile.", path: "/region/5/445" },
      { title: "Spectral Lab", body: "Switch between Composite and Single channel; the strip below has all 102 colours from 0.75 to 5 µm.", anchor: "spectral" },
      { title: "Run Spectral Scout", body: "Press Run in the Spectral Scout panel. It runs in your browser on real SPHEREx data and ranks channels. Click a recommended channel to view it.", anchor: "spectral" },
      { title: "Read the spectrum", body: "In the Science inspector, click any pixel to see its full 102-channel spectrum from the calibrated cube.", anchor: "science" },
    ],
  },
  {
    id: "mission-run",
    title: "Complete a mission",
    level: "Beginner",
    minutes: 10,
    goal: "Learn the mission flow: briefing → tutorial → target → investigation → submission → peer verification.",
    steps: [
      { title: "Pick a mission", body: "Missions are sorted by difficulty. ‘Barnard's Run’ uses ChronoLens; ‘The Infrared Detective’ hunts brown dwarfs by colour.", path: "/missions" },
      { title: "Barnard's Run", body: "Read the briefing and tutorial, then follow the target to its region.", path: "/missions/moving-sources" },
      { title: "Investigate with ChronoLens", body: "Use ChronoLens on the mission target, then Submit for review — the mission is pre-selected.", path: BARNARD, anchor: "chronolens" },
      { title: "Get verified", body: "Two independent ‘verify’ reviews from the community mark a submission verified and complete the mission.", path: "/community" },
    ],
  },
  {
    id: "peer-review",
    title: "Review someone else's find",
    level: "Advanced",
    minutes: 8,
    goal: "Help verify the community's candidates with real evidence.",
    steps: [
      { title: "Open the review queue", body: "Community shows pending submissions. Each carries its data, position and evidence bundle.", path: "/community" },
      { title: "Reproduce it", body: "Open the submission's region, load ChronoLens and Identify. Does the candidate appear? Is it already known?", path: "/explore" },
      { title: "Vote with reasons", body: "Verify only if you could reproduce it and it isn't explained by a known object or artefact. Otherwise challenge it and say why.", path: "/community" },
    ],
  },
];

export const workflowById = (id: string) => WORKFLOWS.find((w) => w.id === id);

const KEY = "spx-coach";
export interface CoachState { id: string; step: number }
export function readCoach(): CoachState | null {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? "null");
  } catch {
    return null;
  }
}
export function startWorkflow(id: string, step = 0) {
  if (!workflowById(id)) return false;
  sessionStorage.setItem(KEY, JSON.stringify({ id, step }));
  window.dispatchEvent(new CustomEvent("coach", { detail: { id, step } }));
  return true;
}
export function stopWorkflow() {
  sessionStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent("coach", { detail: null }));
}

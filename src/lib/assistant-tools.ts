/**
 * Tool schema shared by the server (sent to the LLM) and the client (executes UI actions).
 * "server" tools run in /api/assistant with real data; "client" tools drive the user's browser.
 */
export const CLIENT_TOOLS = ["navigate", "fly_to", "select_tile", "set_wavelength", "set_composite", "toggle_layer", "run_spectral_scout", "open_settings", "teach_workflow", "chronolens", "start_mission"] as const;
export type ClientToolName = (typeof CLIENT_TOOLS)[number];
export interface ClientAction {
  name: ClientToolName;
  args: Record<string, unknown>;
}

export const LAYER_NAMES = ["imagery", "grid", "tileLabels", "eqGrid", "constellations", "constellationNames", "stars", "starNames", "ecliptic", "galactic"] as const;

import { WORKFLOWS } from "./workflows";

export const TOOL_DEFS = [
  {
    type: "function" as const,
    function: {
      name: "teach_workflow",
      description: `Start a hands-on guided workflow: a coach panel walks the user step by step through the real pages and can perform each step. Use whenever the user wants to learn how to do something on the platform. Workflows: ${WORKFLOWS.map((w) => `${w.id} (${w.title})`).join("; ")}. Optional step (0-based) to jump to.`,
      parameters: { type: "object", properties: { workflow: { type: "string", enum: WORKFLOWS.map((w) => w.id) }, step: { type: "integer" } }, required: ["workflow"] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "chronolens",
      description: "Control ChronoLens (time-lapse motion/change finder on region pages). If ra/dec are given, first opens the region at that position. Actions: load (fetch real epochs, 1-2 min first time), play, pause, difference ('What changed' view), frames (play view), detect_on, detect_off, select (candidate number `index`, 1-based), crossmatch (Identify with Gaia + JPL), submit (open Submit for review with evidence). Optional band: all,d1..d6; threshold: sigma 3-10.",
      parameters: { type: "object", properties: { action: { type: "string", enum: ["load", "play", "pause", "difference", "frames", "detect_on", "detect_off", "select", "crossmatch", "submit"] }, ra: { type: "number" }, dec: { type: "number" }, index: { type: "integer" }, band: { type: "string", enum: ["all", "d1", "d2", "d3", "d4", "d5", "d6"] }, threshold: { type: "number" } }, required: ["action"] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "start_mission",
      description: "Open a mission's page so the user can begin it. Slugs: infrared-detective, variable-stars, spectral-anomaly, ice-clouds, moving-sources, planet-nine.",
      parameters: { type: "object", properties: { slug: { type: "string" } }, required: ["slug"] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "resolve_object",
      description: "Resolve any astronomical object name (e.g. 'M31', 'Betelgeuse', 'NGC 1333') to ICRS RA/Dec in degrees using the CDS Sesame name resolver (SIMBAD/NED/VizieR). Always use this instead of recalling coordinates.",
      parameters: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_observations",
      description: "Query IRSA for real SPHEREx Level-2 exposures covering a position. Returns counts of exposures, visits and survey epochs with dates. Takes ~20 s.",
      parameters: { type: "object", properties: { ra: { type: "number" }, dec: { type: "number" }, collection: { type: "string", enum: ["spherex_dr1", "spherex_qr3"] } }, required: ["ra", "dec"] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "describe_tile",
      description: "Describe a HEALPix NESTED tile of the SPHEREx DR1 HiPS (order 0-5): centre RA/Dec, size, parent/children, science cube availability. Can also convert RA/Dec to the containing tile.",
      parameters: { type: "object", properties: { order: { type: "integer" }, ipix: { type: "integer" }, ra: { type: "number" }, dec: { type: "number" } } },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "platform_stats",
      description: "Real platform statistics from the database: users, posts, submissions, verified finds, pending reviews, Spectral Scout runs, mission participation and recent activity.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "navigate",
      description: "Open a page in the user's browser. Paths: / (home), /explore, /missions, /missions/<slug>, /missions/planet-nine, /discoveries, /discoveries/<slug>, /community, /ai (assistant page), /ai/engine (Spectral Scout model), /lab, /learn, /learn/<slug>, /settings, /region/<order>/<ipix>.",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "fly_to",
      description: "Fly the Explore sky view to coordinates. Opens /explore if the user is elsewhere. fov is the vertical field of view in degrees (0.6-130).",
      parameters: { type: "object", properties: { ra: { type: "number" }, dec: { type: "number" }, fov: { type: "number" } }, required: ["ra", "dec"] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "select_tile",
      description: "Select a HEALPix tile in the sky viewer and open its inspector (order 0-5).",
      parameters: { type: "object", properties: { order: { type: "integer" }, ipix: { type: "integer" } }, required: ["order", "ipix"] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_wavelength",
      description: "Show a single SPHEREx channel in the sky viewer, chosen by wavelength in micrometres (0.75-5.0). Frames at 2.40/2.45 µm are blank dichroic channels.",
      parameters: { type: "object", properties: { wavelength_um: { type: "number" }, colormap: { type: "string", enum: ["gray", "inferno", "ice", "viridis"] } }, required: ["wavelength_um"] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_composite",
      description: "Show a false-colour RGB composite of three wavelengths (µm). Omit all to restore the default (R 3.29, G 1.91, B 0.85 µm).",
      parameters: { type: "object", properties: { r_um: { type: "number" }, g_um: { type: "number" }, b_um: { type: "number" } } },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "toggle_layer",
      description: "Show or hide a sky overlay: imagery, grid (HEALPix), tileLabels, eqGrid, constellations, constellationNames, stars, starNames, ecliptic, galactic.",
      parameters: { type: "object", properties: { layer: { type: "string", enum: LAYER_NAMES as unknown as string[] }, visible: { type: "boolean" } }, required: ["layer", "visible"] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "run_spectral_scout",
      description: "Run the Spectral Scout v2 ONNX model (in the user's browser) on real SPHEREx L2 cutouts at a position. It picks the most useful of 102 channels, scores spectral anomalies and motion. Takes ~30-90 s the first time. Only run when the user asks.",
      parameters: { type: "object", properties: { ra: { type: "number" }, dec: { type: "number" }, apply_best_channel: { type: "boolean" } }, required: ["ra", "dec"] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "open_settings",
      description: "Open the settings page (intro video toggle, account, assistant provider preference).",
      parameters: { type: "object", properties: {} },
    },
  },
];

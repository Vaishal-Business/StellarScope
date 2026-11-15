/**
 * Tool schema shared by the server (sent to the LLM) and the client (executes UI actions).
 * "server" tools run in /api/assistant with real data; "client" tools drive the user's browser.
 */
export const CLIENT_TOOLS = ["navigate", "fly_to", "select_tile", "set_wavelength", "set_composite", "toggle_layer", "run_spectral_scout", "open_settings"] as const;
export type ClientToolName = (typeof CLIENT_TOOLS)[number];
export interface ClientAction {
  name: ClientToolName;
  args: Record<string, unknown>;
}

export const LAYER_NAMES = ["imagery", "grid", "tileLabels", "eqGrid", "constellations", "constellationNames", "stars", "starNames", "ecliptic", "galactic"] as const;

export const TOOL_DEFS = [
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

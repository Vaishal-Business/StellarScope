/**
 * Official NASA / partner tools for checking a candidate, deep-linked to a sky position.
 * StellarScope encourages users to verify every finding with these before submitting.
 */
export interface ExternalTool {
  id: string;
  name: string;
  org: string;
  purpose: string;
  url: (ra: number, dec: number, date?: string) => string;
}

const hms = (ra: number) => {
  const h = ra / 15;
  const a = Math.floor(h);
  const m = (h - a) * 60;
  const b = Math.floor(m);
  return `${a} ${b} ${((m - b) * 60).toFixed(1)}`;
};
const dms = (dec: number) => {
  const s = dec < 0 ? "-" : "+";
  const v = Math.abs(dec);
  const a = Math.floor(v);
  const m = (v - a) * 60;
  const b = Math.floor(m);
  return `${s}${a} ${b} ${((m - b) * 60).toFixed(0)}`;
};

export const TOOLS: ExternalTool[] = [
  { id: "irsa-viewer", name: "IRSA Viewer (Firefly)", org: "NASA/IPAC IRSA", purpose: "Official viewer for SPHEREx images, spectra and catalogues at this position.", url: (ra, dec) => `https://irsa.ipac.caltech.edu/irsaviewer/?__action=layout.showDropDown&view=MultiTableSearchCmd&ra=${ra}&dec=${dec}` },
  { id: "spherex-archive", name: "SPHEREx Data Explorer", org: "NASA/IPAC IRSA", purpose: "Search SPHEREx Level-2 images and spectrophotometry for the region.", url: () => "https://irsa.ipac.caltech.edu/Missions/spherex.html" },
  { id: "most", name: "Moving Object Search Tool (MOST)", org: "NASA/IPAC IRSA", purpose: "Find which survey images caught a known asteroid or comet.", url: () => "https://irsa.ipac.caltech.edu/applications/MOST/" },
  { id: "sbident", name: "Small-Body Identification", org: "NASA/JPL SSD", purpose: "Is a moving candidate a known asteroid or comet?", url: (ra, dec, date) => `https://ssd.jpl.nasa.gov/tools/sbid.html#/?fov=${ra.toFixed(4)},${dec.toFixed(4)},0.1&time=${date ?? ""}` },
  { id: "mpc", name: "MPChecker", org: "IAU Minor Planet Center", purpose: "Cross-check a moving object against all known minor planets.", url: () => "https://minorplanetcenter.net/cgi-bin/checkmp.cgi" },
  { id: "simbad", name: "SIMBAD", org: "CDS Strasbourg", purpose: "What known stars, galaxies and nebulae are at this position?", url: (ra, dec) => `https://simbad.cds.unistra.fr/simbad/sim-coo?Coord=${encodeURIComponent(`${hms(ra)} ${dms(dec)}`)}&Radius=2&Radius.unit=arcmin` },
  { id: "gaia", name: "Gaia DR3 archive", org: "ESA", purpose: "Precise positions and proper motions — explains slow-moving stars.", url: () => "https://gea.esac.esa.int/archive/" },
  { id: "aladin", name: "Aladin Lite", org: "CDS Strasbourg", purpose: "Compare the same field in WISE, 2MASS, Gaia and SPHEREx surveys.", url: (ra, dec) => `https://aladin.cds.unistra.fr/AladinLite/?target=${ra.toFixed(5)}%20${dec.toFixed(5)}&fov=0.2&survey=CDS%2FP%2FallWISE%2Fcolor` },
  { id: "wiseview", name: "WiseView", org: "Backyard Worlds team", purpose: "Blink unWISE images at this position to confirm long-baseline motion.", url: (ra, dec) => `http://byw.tools/wiseview#ra=${ra.toFixed(5)}&dec=${dec.toFixed(5)}&size=176&band=3&speed=164&minbright=-10.0000&maxbright=80&window=0.5&diff_window=1&linear=1&color=&zoom=9&border=1&gaia=1&invert=1&maxdyr=0&scandir=0&neowise=0&diff=0&outer_epochs=0&unique=1&smooth_scan=0&shift=0&pmra=0&pmdec=0&synth_a=0&synth_a_sub=0&synth_a_ra=&synth_a_dec=&synth_a_w1=&synth_a_w2=&synth_a_pmra=0&synth_a_pmdec=0&synth_a_mjd=&synth_b=0&synth_b_sub=0&synth_b_ra=&synth_b_dec=&synth_b_w1=&synth_b_w2=&synth_b_pmra=0&synth_b_pmdec=0&synth_b_mjd=` },
  { id: "byw", name: "Backyard Worlds: Planet 9", org: "NASA citizen science (Zooniverse)", purpose: "NASA's flagship blink project for brown dwarfs and new worlds.", url: () => "https://www.zooniverse.org/projects/marckuchner/backyard-worlds-planet-9" },
];

export function setReviewDraft(draft: Record<string, unknown>) {
  sessionStorage.setItem("spx-review-draft", JSON.stringify({ ...draft, savedAt: new Date().toISOString() }));
}
export function getReviewDraft(): Record<string, unknown> | null {
  try {
    return JSON.parse(sessionStorage.getItem("spx-review-draft") ?? "null");
  } catch {
    return null;
  }
}

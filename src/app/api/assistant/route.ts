import { headers } from "next/headers";
import { chat, providersConfigured, type ChatMessage } from "@/server/llm";
import { TOOL_DEFS, CLIENT_TOOLS, type ClientAction } from "@/lib/assistant-tools";
import { groupVisits, querySia } from "@/server/sia";
import { describeTile } from "@/sky/spherex";
import { ang2pix } from "@/sky/healpix";
import { MISSIONS } from "@/lib/missions";
import { OBJECTS } from "@/lib/objects";
import { MODULES } from "@/lib/learn";
import { WORKFLOWS } from "@/lib/workflows";
import { db } from "@/server/db";
import { currentUser } from "@/server/auth";

export const maxDuration = 120;

/* --------------------------- simple per-IP rate limit (protects the API keys) */
const buckets = new Map<string, { tokens: number; t: number }>();
function allow(ip: string) {
  const now = Date.now();
  const b = buckets.get(ip) ?? { tokens: 20, t: now };
  b.tokens = Math.min(20, b.tokens + ((now - b.t) / 60_000) * 20);
  b.t = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  buckets.set(ip, b);
  return true;
}

const SITE = `
You are "StellarScope SI" (Super Intelligence), the assistant of StellarScope: an expert astronomer. Always call yourself StellarScope SI and refer to AI features as SI and the built-in guide to this website.
The site is a citizen-science platform built on NASA SPHEREx Data Release 1 (released 12 Nov 2026): a 0.75–5.0 µm, 102-channel all-sky spectral survey.

PAGES (use navigate / fly_to / select_tile to take the user there):
- / Home dashboard. /settings: intro video on/off, account, assistant provider.
- /explore: Stellarium-style 3D sky streaming the real DR1 HiPS cube. Drag to rotate, scroll to zoom, click a HEALPix tile to select it and open the inspector (Overview, Observations from IRSA SIA, centre-pixel Spectrum from the calibrated cube, Science/FITS structure). Bottom dock: Composite vs Single channel, 102-channel strip, play through wavelengths, colormaps. Top-right toolbar toggles overlays. Left: map layers (survey coverage, community reviewed, Spectral Scout screened, candidates, claimed) — all from the real database. ⌘K searches objects, coordinates or tile IDs (SPX-5-445).
- /region/<order>/<ipix>: region page — north-up viewer, observation visits/epochs, Spectral Lab, Spectral Scout panel with per-epoch composites, Science inspector (IMAGE/NHITS/FLAGS planes read by byte range, pixel RA/Dec via HPX WCS, click a pixel for its 102-channel spectrum).
- /ai/engine: Spectral Scout v2 (scout-2.0.0, ONNX, runs in the browser). Input: 4 epochs × 102 channels × 64×64 north-up cutouts at 6.15″/px built from real L2 exposures. Outputs: channel_weights (best viewing channels), anomaly scores, track probability + moving vs static S/N, rate/positions, artefact probabilities. Thresholds come from the model card. Outputs are candidates for human review, never detections or discoveries. Known limits: trained on synthetic injections into real/Gaussian backgrounds; real-sky precision unmeasured.
- /missions and /missions/<slug>: ${MISSIONS.map((m) => `${m.slug} (${m.title})`).join(", ")}. Each has briefing → tutorial → target → investigation → submission → peer verification → reward. Submissions need an account; two independent "verify" reviews mark a submission verified.
- /missions/planet-nine: coverage-vs-detectability campaign. Planet Nine is hypothetical; never claim a location.
- /discoveries and /discoveries/<slug>: ${OBJECTS.map((o) => o.slug).join(", ")}. Each object page pulls a real spectrum from the cube.
- /community: rooms, threads linked to tiles, peer-review queue, leaderboard (real database).
- /lab: the user's saved regions, model runs, submissions, mission progress.
- /region/<order>/<ipix>#chronolens: ChronoLens, built into every region page — a time-lapse of real SPHEREx epochs for the region (or any ?ra=&dec=). Play epochs, "What changed" difference view, auto-spotter (sensitivity in σ), Identify (Gaia DR3 + NASA/JPL asteroids), a "What is it?" wiki card (who discovered it, distance, orbit), "Is it real?" checks, light curve and a 3D "Where Earth was" view. /at?ra=&dec= jumps there.
- /academy: Hunter Academy — scored trainer on known movers (Barnard's Star) and variables (R Draconis, RW Aurigae), challenge fields (WISE 0855−0714, Epsilon Indi B), live 3D SPHEREx orbit, discovery history, existing ChronoLens finds.
- /submit: Submit for review — composer that bundles ChronoLens evidence, cross-match, spectrum and a verification checklist.
- /learn/<slug>: ${MODULES.map((m) => m.slug).join(", ")}.

DATA FACTS: HiPS orders 0–5 (order 5 = 12,288 tiles, 12.9″/px HiPS pixels, 512×512 tiles); native detector pixels 6.15″. Frames 50/51 (≈2.40/2.45 µm) are blank. NHITS counts contributing input pixels, not visits. Science cubes are ~320 MB per order-5 tile.

TEACHING & WORKFLOWS: You can teach and operate the entire platform.
- When the user asks how to do something, or is new, call teach_workflow with the best-fitting workflow; it opens a step-by-step coach that navigates pages and can perform each step. Then summarise the steps in 2-4 bullets.
- When the user asks you to do it for them, drive it directly: navigate/fly_to/select_tile for the sky, chronolens (with ra/dec to go somewhere; then load → difference → select → crossmatch → submit) for finding moving or changing objects, start_mission for missions, run_spectral_scout for best channels.
- ChronoLens first loads take 1–2 minutes; tell the user to wait and that later steps (select/crossmatch) work after loading finishes.
- Workflows available: ${WORKFLOWS.map((w) => `${w.id} — ${w.goal}`).join(" | ")}.
- Challenge test targets: Barnard's Star, Epsilon Indi B, WISE 0855−0714 (RA 08h55m10.831s Dec −07°14′42.53″), RW Aurigae, R Draconis. Resolve names with resolve_object before using coordinates.

RULES:
- Use tools for any number, coordinate or data claim. Never invent observations, counts, coordinates or model outputs. If a tool fails, say so.
- When the user asks to see/go/show something, call the UI tools (they execute in the user's browser) and then briefly confirm what you did.
- Only run Spectral Scout when the user asks for it.
- Call model flags "candidates for review", never detections or discoveries.
- Be concise and friendly. Use short paragraphs or bullets. Answer general astronomy questions too.
`;

async function resolveObject(name: string) {
  const url = `https://cds.unistra.fr/cgi-bin/nph-sesame/-ox/SNV?${encodeURIComponent(name)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  const xml = await res.text();
  const ra = /<jradeg>([\d.+-]+)<\/jradeg>/.exec(xml)?.[1];
  const dec = /<jdedeg>([\d.+-]+)<\/jdedeg>/.exec(xml)?.[1];
  if (!ra || !dec) return { found: false, name };
  const otype = /<otype>([^<]+)<\/otype>/.exec(xml)?.[1];
  const oname = /<oname>([^<]+)<\/oname>/.exec(xml)?.[1];
  const r = Number(ra);
  const d = Number(dec);
  return { found: true, name: oname ?? name, type: otype ?? null, ra: r, dec: d, tile5: ang2pix(5, r, d), source: "CDS Sesame" };
}

async function runServerTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case "resolve_object":
      return resolveObject(String(args.name ?? ""));
    case "get_observations": {
      const ra = Number(args.ra);
      const dec = Number(args.dec);
      const ex = await querySia(ra, dec, args.collection === "spherex_qr3" ? "spherex_qr3" : "spherex_dr1");
      const { visits, epochs } = groupVisits(ex);
      const mjd = (m: number) => new Date((m - 40587) * 86400000).toISOString().slice(0, 10);
      return { exposures: ex.length, visits: visits.length, epochs: epochs.map((e) => ({ epoch: e.index, from: mjd(e.tStart), to: mjd(e.tEnd), visits: e.visits })), detectors: [...new Set(ex.map((e) => e.detector))] };
    }
    case "describe_tile": {
      let order = Number(args.order);
      let ipix = Number(args.ipix);
      if (Number.isFinite(Number(args.ra)) && Number.isFinite(Number(args.dec))) {
        order = Number.isInteger(order) && order >= 0 && order <= 5 ? order : 5;
        ipix = ang2pix(order, Number(args.ra), Number(args.dec));
      }
      if (!Number.isInteger(order) || order < 0 || order > 5 || !Number.isInteger(ipix) || ipix < 0 || ipix >= 12 * 4 ** order) return { error: "invalid tile" };
      const t = describeTile(order, ipix);
      return { id: t.id, order, ipix, centre: t.center, sizeDeg: t.sizeDeg, areaDeg2: t.areaDeg2, parent: t.parent, children: t.children, pixelScaleArcsec: t.pixelScaleArcsec, scienceCubes: t.scienceProducts.length };
    }
    case "platform_stats": {
      const d = db();
      const n = async (sql: string) => Number((await d.prepare(sql).get() as { n: number }).n);
      return {
        users: await n("SELECT COUNT(*) n FROM users"), posts: await n("SELECT COUNT(*) n FROM posts"), submissions: await n("SELECT COUNT(*) n FROM submissions"),
        verified: await n("SELECT COUNT(*) n FROM submissions WHERE status='verified'"), pendingReviews: await n("SELECT COUNT(*) n FROM submissions WHERE status='pending'"),
        scoutRuns: await n("SELECT COUNT(*) n FROM scout_runs"), scoutTiles: await n("SELECT COUNT(DISTINCT tile5) n FROM scout_runs"),
      };
    }
    default:
      return { error: `unknown tool ${name}` };
  }
}

export async function GET() {
  return Response.json({ providers: providersConfigured() });
}

export async function POST(req: Request) {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  if (!allow(ip)) return Response.json({ error: "Too many requests — please wait a moment." }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as {
    messages?: { role: string; content: string }[];
    context?: Record<string, unknown>;
    prefer?: "auto" | "ifm" | "nvidia";
  };
  const user = await currentUser();
  const history = (body.messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-14)
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content.slice(0, 4000) }));
  if (!history.length || history[history.length - 1].role !== "user") return Response.json({ error: "No question." }, { status: 400 });

  const ctx = JSON.stringify(body.context ?? {}).slice(0, 2500);
  const messages: ChatMessage[] = [
    { role: "system", content: `${SITE}\nCURRENT USER: ${user ? `${user.display_name} (signed in)` : "guest (not signed in)"}.\nCURRENT VIEW CONTEXT (from the browser): ${ctx}\nToday is ${new Date().toISOString().slice(0, 10)}.` },
    ...history,
  ];
  const actions: ClientAction[] = [];
  const trace: { tool: string; args: Record<string, unknown>; ok: boolean }[] = [];
  let used = { provider: "", model: "" };
  try {
    for (let step = 0; step < 5; step++) {
      const c = await chat(messages, TOOL_DEFS, body.prefer);
      used = { provider: c.provider, model: c.model };
      messages.push(c.message);
      if (!c.message.tool_calls?.length) {
        return Response.json({ reply: c.message.content || "Done.", actions, trace, ...used });
      }
      for (const call of c.message.tool_calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch {}
        let result: unknown;
        if ((CLIENT_TOOLS as readonly string[]).includes(call.function.name)) {
          actions.push({ name: call.function.name as ClientAction["name"], args });
          result = { status: "executed in the user's browser" };
          trace.push({ tool: call.function.name, args, ok: true });
        } else {
          try {
            result = await runServerTool(call.function.name, args);
            trace.push({ tool: call.function.name, args, ok: true });
          } catch (e) {
            result = { error: (e as Error).message };
            trace.push({ tool: call.function.name, args, ok: false });
          }
        }
        messages.push({ role: "tool", tool_call_id: call.id, name: call.function.name, content: JSON.stringify(result).slice(0, 6000) });
      }
    }
    return Response.json({ reply: "I ran out of steps — here's what I did so far.", actions, trace, ...used });
  } catch (e) {
    return Response.json({ error: (e as Error).message, actions, trace }, { status: 502 });
  }
}

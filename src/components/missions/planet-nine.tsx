"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, ArrowUpRight, CheckCircle2, CircleDashed, Loader2, MessageCircle, Search, Telescope, XCircle } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Reveal, RevealInView } from "@/components/motion/reveal";
import { Btn, Chip, LiveTag, Panel, PanelHeader } from "@/components/ui/kit";
import { eclipticToRadec, galacticToRadec, formatDec, formatRA, mjdToDate } from "@/sky/coords";
import { ang2pix } from "@/sky/healpix";
import { parseQuery } from "@/lib/parse";
import { useLive } from "@/lib/live";
import { api, useSession } from "@/lib/session";
import { useAssistant } from "@/components/assistant/assistant";
import type { ObservationsResponse } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const W = 720;
const H = 360;
const proj = (ra: number, dec: number) => ({ x: ((360 - ra) / 360) * W, y: ((90 - dec) / 180) * H });
const unproj = (x: number, y: number) => ({ ra: ((360 - (x / W) * 360) + 360) % 360, dec: 90 - (y / H) * 180 });

function curve(fn: (t: number) => { ra: number; dec: number }) {
  let d = "";
  let prevX = -1;
  for (let i = 0; i <= 360; i++) {
    const r = fn(i / 360);
    const p = proj(r.ra, r.dec);
    d += `${Math.abs(p.x - prevX) > W / 2 || i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    prevX = p.x;
  }
  return d;
}

interface Check {
  ra: number;
  dec: number;
  state: "loading" | "done" | "error";
  data?: ObservationsResponse;
  error?: string;
}

const PIPELINE = [
  ["Published orbital constraints & hypotheses", "Mass, orbital elements, uncertainties"],
  ["Orbital ensemble simulation", "Sample many plausible orbits"],
  ["Predicted sky-position distribution", "RA/Dec density at each SPHEREx epoch"],
  ["SPHEREx observation intersection", "Real L2 footprints & timestamps — live below"],
  ["Coverage & detectability", "Observed · unobserved · inconclusive · detectable"],
];

export function PlanetNine() {
  const { user, signIn } = useSession();
  const { setOpen, ask } = useAssistant();
  const [checks, setChecks] = useState<Check[]>([]);
  const [q, setQ] = useState("");
  const [qErr, setQErr] = useState<string | null>(null);
  const stats = useLive<{ missions: Record<string, { claims: number; submissions: number }> }>("/api/stats");

  const check = async (ra: number, dec: number) => {
    const c: Check = { ra, dec, state: "loading" };
    setChecks((cs) => [c, ...cs.filter((x) => Math.abs(x.ra - ra) > 1e-3 || Math.abs(x.dec - dec) > 1e-3)].slice(0, 8));
    try {
      const r = await fetch(`/api/observations?ra=${ra.toFixed(4)}&dec=${dec.toFixed(4)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setChecks((cs) => cs.map((x) => (x.ra === ra && x.dec === dec ? { ...x, state: "done", data: j } : x)));
    } catch (e) {
      setChecks((cs) => cs.map((x) => (x.ra === ra && x.dec === dec ? { ...x, state: "error", error: (e as Error).message } : x)));
    }
  };

  const claim = async (ra: number, dec: number) => {
    if (!user) return signIn("login");
    await api("/api/me", { json: { action: "claim", mission_slug: "planet-nine", tile_order: 3, tile_ipix: ang2pix(3, ra, dec) } }).catch((e) => alert((e as Error).message));
    stats.reload();
  };

  return (
    <AppShell>
      <div className="px-5 md:px-8">
        <Reveal delay={0.08}>
          <div className="eyebrow text-destructive/80">Research challenge · campaign</div>
          <h1 className="display mt-2 text-[40px] font-extralight text-white md:text-[52px]">Planet Nine Mission Control</h1>
          <p className="mt-3 max-w-2xl text-[14px] text-white/55">A rigorous search-coverage investigation — not a promise that SPHEREx will find Planet Nine. Test any predicted position against real SPHEREx observations.</p>
        </Reveal>

        <Reveal delay={0.14} className="mt-6">
          <div className="flex items-start gap-3 rounded-2xl border border-warn/20 bg-warn/[0.05] px-5 py-4 text-[12.5px] leading-relaxed text-white/70">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
            <span>
              <b className="font-medium text-white">Scientific boundary.</b> Planet Nine has not been discovered and its current position is not established. Previous searches (for example Pan-STARRS1 combined with ZTF and DES analyses) have excluded a large fraction of specific reference-model parameter space, but not all models. SPHEREx observes at 0.75–5 µm, far from a cold distant planet&apos;s thermal peak, so geometric coverage is not detection.
            </span>
          </div>
        </Reveal>

        <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Reveal delay={0.2}>
            <Panel className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <PanelHeader title="Coverage checker · click the sky or enter a position" />
                <LiveTag>IRSA SIA · spherex_dr1</LiveTag>
              </div>
              <form
                className="mt-3 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const p = parseQuery(q);
                  if (p && "ra" in p) {
                    setQErr(null);
                    check(p.ra, p.dec);
                  } else setQErr("Enter RA Dec in degrees (e.g. 45.2 -12.5) or sexagesimal.");
                }}
              >
                <label className="flex h-10 flex-1 items-center gap-2 rounded-full border border-white/10 bg-black/30 px-4">
                  <Search className="size-4 text-white/40" />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Predicted RA Dec, e.g. 50.0 15.0" className="flex-1 bg-transparent text-[12.5px] text-white outline-none placeholder:text-white/30" />
                </label>
                <Btn size="sm" variant="primary">Check coverage</Btn>
              </form>
              {qErr && <p className="mt-1.5 text-[11.5px] text-warn">{qErr}</p>}
              <div className="relative mt-3 overflow-hidden rounded-xl border border-white/[0.06] bg-[radial-gradient(ellipse_at_center,oklch(0.18_0.01_260),oklch(0.11_0.004_260))]">
                <svg
                  viewBox={`0 0 ${W} ${H}`}
                  className="w-full cursor-crosshair"
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    const p = unproj(((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H);
                    check(+p.ra.toFixed(3), +p.dec.toFixed(3));
                  }}
                >
                  {[...Array(13)].map((_, i) => <line key={`v${i}`} x1={(i / 12) * W} x2={(i / 12) * W} y1={0} y2={H} stroke="white" strokeOpacity="0.05" />)}
                  {[...Array(7)].map((_, i) => <line key={`h${i}`} x1={0} x2={W} y1={(i / 6) * H} y2={(i / 6) * H} stroke="white" strokeOpacity="0.05" />)}
                  <path d={curve((t) => galacticToRadec(t * 360, 0))} fill="none" stroke="oklch(0.75 0.12 320)" strokeOpacity="0.5" strokeDasharray="3 4" />
                  <path d={curve((t) => eclipticToRadec(t * 360))} fill="none" stroke="oklch(0.85 0.12 80)" strokeOpacity="0.6" strokeDasharray="5 4" />
                  {checks.map((c, i) => {
                    const p = proj(c.ra, c.dec);
                    const col = c.state === "loading" ? "white" : c.state === "error" ? "oklch(0.7 0.17 25)" : (c.data?.count ?? 0) > 0 ? "oklch(0.89 0.11 155)" : "oklch(0.85 0.13 80)";
                    return (
                      <g key={i}>
                        <circle cx={p.x} cy={p.y} r={7} fill="none" stroke={col} strokeWidth={1.5} opacity={c.state === "loading" ? 0.6 : 1}>
                          {c.state === "loading" && <animate attributeName="r" values="5;10;5" dur="1.4s" repeatCount="indefinite" />}
                        </circle>
                        <circle cx={p.x} cy={p.y} r={1.6} fill={col} />
                      </g>
                    );
                  })}
                  {[0, 6, 12, 18].map((h) => <text key={h} x={proj(h * 15, 0).x + 4} y={H - 6} className="fill-white/35 font-mono text-[9px]">{h}h</text>)}
                  <text x={8} y={14} className="fill-white/35 font-mono text-[9px]">+90°</text>
                  <text x={8} y={H / 2 - 4} className="fill-white/35 font-mono text-[9px]">0°</text>
                </svg>
              </div>
              <div className="mt-2 flex flex-wrap gap-4 font-mono text-[10px] text-white/45">
                <span><span className="mr-1 inline-block h-px w-4 bg-[oklch(0.85_0.12_80)] align-middle" /> ecliptic (most proposed orbits lie near it)</span>
                <span><span className="mr-1 inline-block h-px w-4 bg-[oklch(0.75_0.12_320)] align-middle" /> galactic plane (crowded, harder)</span>
              </div>

              <div className="mt-5 space-y-2">
                {checks.length === 0 && <p className="rounded-xl border border-dashed border-white/10 p-4 text-center text-[12px] text-white/45">No positions checked yet. Click anywhere on the map or enter a predicted position from your chosen orbital model.</p>}
                {checks.map((c, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.07] px-3 py-2.5">
                    {c.state === "loading" ? <Loader2 className="size-4 animate-spin text-white/50" /> : c.state === "error" ? <XCircle className="size-4 text-destructive" /> : (c.data?.count ?? 0) > 0 ? <CheckCircle2 className="size-4 text-signal" /> : <CircleDashed className="size-4 text-warn" />}
                    <span className="font-mono text-[11.5px] text-white">{formatRA(c.ra)} {formatDec(c.dec)}</span>
                    <span className="text-[11.5px] text-white/55">
                      {c.state === "loading" && "querying IRSA (~20 s)…"}
                      {c.state === "error" && c.error}
                      {c.state === "done" && c.data && (c.data.count > 0 ? `Covered · ${c.data.count} exposures, ${c.data.visits.length} visits, epochs ${c.data.epochs.map((e) => mjdToDate(e.tStart).toISOString().slice(0, 7)).join(", ")}` : "No DR1 footprint at this position")}
                    </span>
                    <span className="ml-auto flex gap-2">
                      <Link href={`/explore?ra=${c.ra}&dec=${c.dec}&fov=4`} className="text-[11px] text-white/50 hover:text-white">Sky →</Link>
                      <button onClick={() => claim(c.ra, c.dec)} className="text-[11px] text-white/50 hover:text-white">Claim SPX-3-{ang2pix(3, c.ra, c.dec)}</button>
                    </span>
                  </div>
                ))}
              </div>
            </Panel>
          </Reveal>

          <Reveal delay={0.26} className="space-y-4">
            <Panel className="p-4">
              <PanelHeader title="Ask the research assistant" />
              <p className="mt-2 text-[12px] leading-relaxed text-white/55">The assistant can resolve positions, query SPHEREx coverage and explain detectability — using real tools, never inventing an orbit.</p>
              <div className="mt-3 space-y-1.5">
                {[
                  "Explain the difference between coverage and detection for Planet Nine with SPHEREx",
                  "How many SPHEREx exposures cover RA 50, Dec 15?",
                ].map((s) => (
                  <button key={s} onClick={() => { setOpen(true); ask(s); }} className="flex w-full items-start gap-2 rounded-xl border border-white/[0.07] px-3 py-2 text-left text-[11.5px] text-white/70 hover:border-white/20 hover:text-white">
                    <MessageCircle className="mt-0.5 size-3.5 shrink-0 text-signal" /> {s}
                  </button>
                ))}
              </div>
            </Panel>
            <Panel className="p-4">
              <PanelHeader title="Search pipeline" />
              <div className="relative mt-4 space-y-3 pl-6">
                <span className="absolute bottom-2 left-[9px] top-2 w-px bg-white/10" />
                {PIPELINE.map(([t, s], i) => (
                  <div key={t} className="relative">
                    <span className={cn("absolute -left-6 top-0.5 flex size-[19px] items-center justify-center rounded-full border bg-[oklch(0.14_0.004_260)]", i === 3 ? "border-signal text-signal" : "border-white/15 text-white/30")}>
                      <span className="size-1 rounded-full bg-current" />
                    </span>
                    <div className={cn("text-[12px]", i === 3 ? "text-white" : "text-white/55")}>{t}</div>
                    <div className="text-[10.5px] text-white/40">{s}</div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[10.5px] text-white/35">Steps 1–3 need a chosen orbital model; bring positions from the literature. Step 4 runs live here.</p>
            </Panel>
            <Panel className="p-4">
              <PanelHeader title="Campaign" />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-white/[0.06] p-3">
                  <div className="eyebrow">Claimed tiles</div>
                  <div className="mt-1 text-[20px] font-light text-white">{stats.data?.missions["planet-nine"]?.claims ?? "–"}</div>
                </div>
                <div className="rounded-xl border border-white/[0.06] p-3">
                  <div className="eyebrow">Submissions</div>
                  <div className="mt-1 text-[20px] font-light text-white">{stats.data?.missions["planet-nine"]?.submissions ?? "–"}</div>
                </div>
              </div>
              <Btn size="sm" variant="outline" className="mt-3 w-full" href="/community">
                <Telescope className="size-3.5" /> Discuss in #planet-nine
              </Btn>
            </Panel>
          </Reveal>
        </div>

        <RevealInView className="mt-8">
          <Panel className="grid gap-4 p-5 md:grid-cols-2">
            <div>
              <div className="text-[13px] text-white">Geometric coverage</div>
              <p className="mt-1 text-[12px] text-white/55">Was the predicted position inside a real SPHEREx footprint at that observation time? The checker above answers this with live IRSA data.</p>
            </div>
            <div>
              <div className="text-[13px] text-white">Detection completeness</div>
              <p className="mt-1 text-[12px] text-white/55">Given the model&apos;s predicted brightness, background, instrument response, noise and image quality, could it have been seen? That requires a sensitivity model — record your reasoning in a submission.</p>
            </div>
          </Panel>
        </RevealInView>
        <div className="mt-4 flex justify-end">
          <Link href="/missions" className="flex items-center gap-1 text-[12px] text-white/50 hover:text-white">All missions <ArrowUpRight className="size-3.5" /></Link>
        </div>
      </div>
    </AppShell>
  );
}

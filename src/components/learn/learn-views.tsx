"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, CheckCircle2, Clock, GraduationCap, Lock } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Reveal, RevealInView } from "@/components/motion/reveal";
import { TileImage } from "@/components/sky/tile-image";
import { SpectrumChart } from "@/components/sky/spectrum-chart";
import { ChannelStrip } from "@/components/explore/spectral-dock";
import { Btn, Chip, LiveTag, Panel, PanelHeader, SectionTitle } from "@/components/ui/kit";
import { MODULES, type Module } from "@/lib/learn";
import { useJson, type ObservationsResponse, type SpectrumResponse } from "@/lib/hooks";
import { cubePixel } from "@/lib/objects";
import { ang2pix } from "@/sky/healpix";
import { WAVELENGTHS_UM, DEFAULT_RGB } from "@/sky/spherex";
import { mjdToDate } from "@/sky/coords";
import { cn } from "@/lib/utils";

const ORION4 = ang2pix(4, 83.82, -5.39);
const GC3 = ang2pix(3, 266.42, -29.0);

export function LearnIndex() {
  return (
    <AppShell>
      <div className="px-5 md:px-8">
        <Reveal delay={0.1}>
          <SectionTitle eyebrow="Learn the Universe" title="Interactive lessons built on live SPHEREx data" desc="Every module uses real tiles and spectra from the platform. Essential explanations are always open; missions unlock deeper challenges." />
        </Reveal>
        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {MODULES.map((m, i) => (
            <RevealInView key={m.slug} delay={(i % 3) * 0.06}>
              <Link href={`/learn/${m.slug}`} className="glass group block overflow-hidden rounded-[22px] transition hover:border-white/20">
                <div className="relative h-36">
                  <TileImage order={i % 2 ? 3 : 4} ipix={i % 2 ? GC3 : ORION4} view={i % 3 === 0 ? { kind: "rgb", ...DEFAULT_RGB } : { kind: "mono", frame: [12, 42, 62, 86][i % 4] }} className="absolute inset-0 transition-transform duration-[1.6s] group-hover:scale-110" gain={1.2} />
                  <div className="absolute inset-0 bg-gradient-to-t from-[oklch(0.15_0.004_260)] to-transparent" />
                  <span className="absolute left-4 top-4 font-mono text-[10px] text-white/70">MODULE {String(i + 1).padStart(2, "0")}</span>
                </div>
                <div className="p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[16px] text-white">{m.title}</h3>
                    <ArrowUpRight className="size-4 text-white/30 group-hover:text-white" />
                  </div>
                  <p className="mt-1 text-[12.5px] text-white/50">{m.learn}</p>
                  <div className="mt-4 flex items-center gap-3 font-mono text-[10.5px] text-white/40">
                    <span className="flex items-center gap-1"><Clock className="size-3" /> {m.minutes} min</span>
                    <Chip tone={m.level === "Beginner" ? "signal" : m.level === "Intermediate" ? "info" : "warn"}>{m.level}</Chip>
                  </div>
                </div>
              </Link>
            </RevealInView>
          ))}
        </div>
        <RevealInView className="mt-12">
          <Panel className="grid gap-4 p-6 md:grid-cols-3">
            {[
              ["Beginner", "Visual source discovery · guided identification · AI-assisted exploration · basic lessons"],
              ["Advanced", "Spectral investigations · multi-visit analysis · anomaly investigation · motion analysis"],
              ["Researcher", "Custom data queries · FITS & calibrated products · custom models · reproducible notebooks"],
            ].map(([h, p]) => (
              <div key={h}>
                <div className="flex items-center gap-2"><GraduationCap className="size-4 text-signal" /><span className="text-[14px] text-white">{h}</span></div>
                <p className="mt-2 text-[12px] leading-relaxed text-white/50">{p}</p>
              </div>
            ))}
          </Panel>
        </RevealInView>
      </div>
    </AppShell>
  );
}

function Widget({ m }: { m: Module }) {
  const [frame, setFrame] = useState(40);
  const [rgb, setRgb] = useState(true);
  const orionPx = cubePixel(83.8221, -5.3911);
  const betel = cubePixel(88.7929, 7.4071);
  const wantSpec = m.widget === "spectrum" || m.widget === "noise" || m.widget === "browndwarf";
  const spec = useJson<SpectrumResponse>(wantSpec ? (m.widget === "browndwarf" ? `/api/science/${betel.tile}/spectrum?x=${betel.x}&y=${betel.y}` : `/api/science/${orionPx.tile}/spectrum?x=${orionPx.x}&y=${orionPx.y}`) : null);
  const obs = useJson<ObservationsResponse>(m.widget === "coverage" ? "/api/observations?ra=269.6392&dec=66.6331" : null);

  if (m.widget === "colours" || m.widget === "composite" || m.widget === "galaxy") {
    const tile = m.widget === "galaxy" ? { o: 4, i: ang2pix(4, 10.6847, 41.2689) } : m.widget === "composite" ? { o: 3, i: GC3 } : { o: 4, i: ORION4 };
    return (
      <Panel className="p-5">
        <div className="flex items-center justify-between">
          <PanelHeader title={m.widget === "composite" ? "Try it: Galactic Centre, composite vs one channel" : m.widget === "galaxy" ? "Try it: Andromeda across wavelengths" : "Try it: step through the 102 channels"} />
          <LiveTag>Real tile</LiveTag>
        </div>
        <div className="mt-4 grid gap-5 md:grid-cols-[minmax(0,320px)_1fr]">
          <TileImage order={tile.o} ipix={tile.i} view={rgb && m.widget !== "colours" ? { kind: "rgb", ...DEFAULT_RGB } : { kind: "mono", frame }} className="aspect-square rounded-xl border border-white/[0.06]" gain={1.25} />
          <div className="flex flex-col justify-center">
            {m.widget !== "colours" && (
              <div className="mb-4 flex gap-1 self-start rounded-full border border-white/10 p-0.5">
                <button onClick={() => setRgb(true)} className={cn("rounded-full px-3 py-1 text-[11px]", rgb ? "bg-white text-black" : "text-white/60")}>Composite</button>
                <button onClick={() => setRgb(false)} className={cn("rounded-full px-3 py-1 text-[11px]", !rgb ? "bg-white text-black" : "text-white/60")}>Single channel</button>
              </div>
            )}
            <div className="font-mono text-[24px] font-light text-white">{rgb && m.widget !== "colours" ? "3.29 / 1.91 / 0.85 µm" : `${WAVELENGTHS_UM[frame].toFixed(3)} µm`}</div>
            <div className="mb-5 text-[12px] text-white/45">{rgb && m.widget !== "colours" ? "False-colour infrared composite" : `Frame ${frame} — watch which structures brighten or fade.`}</div>
            <ChannelStrip value={rgb && m.widget !== "colours" ? null : frame} onChange={(f) => { setRgb(false); setFrame(f); }} />
          </div>
        </div>
      </Panel>
    );
  }
  if (wantSpec) {
    return (
      <Panel className="p-5">
        <div className="flex items-center justify-between">
          <PanelHeader title={m.widget === "browndwarf" ? "Compare: a cool supergiant (Betelgeuse) — note the flags" : "Real spectrum: Orion Nebula, one cube pixel"} />
          <LiveTag>DR1 cube</LiveTag>
        </div>
        {spec.loading && <div className="py-14 text-center text-[12px] text-white/50">Extracting spectrum from the science cube… {spec.elapsed.toFixed(1)}s</div>}
        {spec.error && <div className="py-8 text-[12px] text-destructive">{spec.error}</div>}
        {spec.data && <SpectrumChart data={spec.data} height={230} className="mt-3" />}
        <p className="mt-2 text-[11.5px] text-white/45">
          {m.widget === "noise" ? "Toggle the robust/full-range scale (top-left of the chart) and look for single-channel spikes versus smooth multi-channel structure." : m.widget === "browndwarf" ? "Bright stars saturate SPHEREx detectors; orange points carry FLAGS. A genuine brown dwarf would be faint, with deep 1.4/1.9 µm water bands." : "Hover to read values. Bars along the bottom show NHITS."}
        </p>
      </Panel>
    );
  }
  if (m.widget === "coverage") {
    return (
      <Panel className="p-5">
        <div className="flex items-center justify-between">
          <PanelHeader title="Live: how often SPHEREx looked at the north ecliptic pole (Cat's Eye Nebula)" />
          <LiveTag>IRSA SIA</LiveTag>
        </div>
        {obs.loading && <div className="py-10 text-center text-[12px] text-white/50">Querying spherex_dr1… {obs.elapsed.toFixed(1)}s</div>}
        {obs.error && <div className="py-8 text-[12px] text-destructive">{obs.error}</div>}
        {obs.data && (
          <div className="mt-4">
            <div className="text-[28px] font-extralight text-white">{obs.data.count} exposures · {obs.data.visits.length} visits</div>
            <div className="mt-3 flex h-16 items-end gap-[1px]">
              {obs.data.visits.slice(0, 220).map((v) => <span key={v.id} className="flex-1 rounded-sm bg-signal/60" style={{ height: 8 + v.detectors.length * 8 }} />)}
            </div>
            <p className="mt-2 font-mono text-[10.5px] text-white/45">{obs.data.epochs.map((e) => `epoch ${e.index}: ${mjdToDate(e.tStart).toISOString().slice(0, 10)} (${e.visits})`).join(" · ")}</p>
            <p className="mt-2 text-[11.5px] text-white/45">Compare with a typical sky position (e.g. tile 445: 258 exposures) — the poles are visited far more often.</p>
          </div>
        )}
      </Panel>
    );
  }
  if (m.widget === "motion") {
    return (
      <Panel className="p-5">
        <PanelHeader title="Concept: positions across four visits" />
        <svg viewBox="0 0 400 160" className="mt-4 w-full rounded-xl border border-white/[0.06] bg-black/30">
          {[0, 1, 2, 3].map((v) => (
            <g key={v}>
              <circle cx={80 + v * 70} cy={110 - v * 22} r={7} fill="none" stroke="oklch(0.78 0.1 245)" strokeOpacity={0.4 + v * 0.18} />
              <text x={80 + v * 70} y={96 - v * 22} textAnchor="middle" className="fill-white/50 font-mono text-[9px]">visit {v + 1}</text>
            </g>
          ))}
          <circle cx={200} cy={60} r={4} fill="white" fillOpacity="0.7" />
          <text x={210} y={63} className="fill-white/40 font-mono text-[9px]">stationary star</text>
        </svg>
        <p className="mt-2 text-[11.5px] text-white/45">A moving source changes position consistently between visits; stationary stars stay put. Consistency across ≥3 visits separates real motion from noise.</p>
      </Panel>
    );
  }
  return (
    <Panel className="p-5">
      <PanelHeader title="The path from candidate to discovery" />
      <div className="mt-4 grid gap-2 md:grid-cols-5">
        {["AI prioritises", "Contributor investigates", "Evidence submitted", "Peers reproduce", "Atlas entry with provenance"].map((s, i) => (
          <div key={s} className="rounded-xl border border-white/[0.07] p-3">
            <span className="font-mono text-[10px] text-signal">0{i + 1}</span>
            <div className="mt-1 text-[12px] text-white">{s}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function LearnModule({ m }: { m: Module }) {
  const idx = MODULES.findIndex((x) => x.slug === m.slug);
  const next = MODULES[(idx + 1) % MODULES.length];
  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-5 md:px-8">
        <Reveal delay={0.08}>
          <Link href="/learn" className="inline-flex items-center gap-2 text-[12px] text-white/50 hover:text-white"><ArrowLeft className="size-3.5" /> All modules</Link>
        </Reveal>
        <Reveal delay={0.14} className="mt-6">
          <div className="eyebrow text-signal/80">Module {String(idx + 1).padStart(2, "0")} · {m.minutes} min · {m.level}</div>
          <h1 className="display mt-3 text-[40px] font-extralight text-white md:text-[52px]">{m.title}</h1>
          <p className="mt-2 text-[15px] text-white/55">{m.learn}</p>
        </Reveal>
        <Reveal delay={0.2} className="mt-8">
          <Widget m={m} />
        </Reveal>
        <div className="mt-8 space-y-4">
          {m.sections.map((s, i) => (
            <RevealInView key={s.h} delay={i * 0.05}>
              <Panel className="grid gap-4 p-6 md:grid-cols-[60px_1fr]">
                <span className="display text-[28px] font-extralight text-white/25">0{i + 1}</span>
                <div>
                  <h2 className="text-[17px] text-white">{s.h}</h2>
                  <p className="mt-2 text-[13.5px] leading-relaxed text-white/60">{s.p}</p>
                </div>
              </Panel>
            </RevealInView>
          ))}
        </div>
        <RevealInView className="mt-10 flex items-center justify-between">
          <Btn variant="outline" href="/explore">Practise in the sky</Btn>
          <Btn variant="primary" href={`/learn/${next.slug}`}>Next: {next.title} <ArrowRight className="size-3.5" /></Btn>
        </RevealInView>
      </div>
    </AppShell>
  );
}

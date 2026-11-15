"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, BookOpen, Bookmark, Brain, ChevronRight, Compass, FlaskConical, Rocket, Sparkles } from "lucide-react";
import type { SkyEngine } from "@/sky/engine";
import { AppShell } from "@/components/shell/app-shell";
import { Reveal, RevealInView } from "@/components/motion/reveal";
import { SkyCanvas } from "@/components/sky/sky-canvas";
import { TileImage } from "@/components/sky/tile-image";
import { ChannelStrip } from "@/components/explore/spectral-dock";
import { ScienceInspector } from "./science-inspector";
import { Btn, Chip, KV, LiveTag, Panel, PanelHeader, SectionTitle } from "@/components/ui/kit";
import { describeTile, WAVELENGTHS_UM, DEFAULT_RGB, fmtWl } from "@/sky/spherex";
import { ang2pix, pix2ang } from "@/sky/healpix";
import { formatDec, formatRA, mjdToDate } from "@/sky/coords";
import { useJson, type ObservationsResponse } from "@/lib/hooks";
import { buildStatusProvider, type TileStatus } from "@/lib/live";
import { ScoutPanel } from "@/components/scout/scout-panel";
import { api, useSession } from "@/lib/session";
import { rememberRegion } from "@/lib/settings";
import { OBJECTS } from "@/lib/objects";
import { angularDistance } from "@/sky/coords";
import { cn } from "@/lib/utils";

const LAYERS = [
  { id: null, label: "Sky composite", sub: "Easy viewing" },
  { id: "coverage", label: "Observation coverage", sub: "DR1 MOC footprint" },
  { id: "candidates", label: "Model candidates", sub: "Spectral Scout flags" },
  { id: "reviewed", label: "Community progress", sub: "Peer-reviewed tiles" },
] as const;

export function RegionView({ order, ipix }: { order: number; ipix: number }) {
  const info = describeTile(order, ipix);
  const [engine, setEngine] = useState<SkyEngine | null>(null);
  const [layer, setLayer] = useState<string | null>(null);
  const [frame, setFrame] = useState(42);
  const [rgb, setRgb] = useState(true);
  const sci = order === 5 ? ipix : ang2pix(5, info.center.ra, info.center.dec);
  const sci5 = pix2ang(5, sci);
  const obs = useJson<ObservationsResponse>(`/api/observations?ra=${sci5.ra.toFixed(4)}&dec=${sci5.dec.toFixed(4)}`);
  const near = OBJECTS.map((o) => ({ o, d: angularDistance(o, info.center) })).sort((a, b) => a.d - b.d).slice(0, 3);
  const { user, signIn } = useSession();
  const [saved, setSaved] = useState<boolean | null>(null);
  const [status, setStatus] = useState<TileStatus | null>(null);

  const onEngine = useCallback((e: SkyEngine | null) => setEngine(e), []);
  useEffect(() => {
    rememberRegion({ order, ipix });
    fetch("/api/tiles/status").then((r) => r.json()).then(setStatus).catch(() => {});
  }, [order, ipix]);
  useEffect(() => {
    engine?.setStatusProvider(buildStatusProvider(status));
  }, [engine, status]);
  const toggleSave = async () => {
    if (!user) return signIn("login");
    const r = await api<{ saved: boolean }>("/api/me", { json: { action: "save", kind: "tile", ref: `${order}/${ipix}`, label: info.id } });
    setSaved(r.saved);
  };
  useEffect(() => {
    if (!engine) return;
    engine.setLayers({ constellations: false, constellationNames: false, eqGrid: false, starNames: true, gridOrder: Math.min(5, order + 1) });
    const t = setTimeout(() => engine.selectTile(order, ipix, true), 200);
    return () => clearTimeout(t);
  }, [engine, order, ipix]);
  useEffect(() => {
    engine?.setLayers({ status: layer });
  }, [engine, layer]);
  useEffect(() => {
    if (location.hash === "#science") setTimeout(() => document.getElementById("science")?.scrollIntoView({ behavior: "smooth" }), 600);
  }, []);

  return (
    <AppShell>
      <div className="px-5 md:px-8">
        <Reveal delay={0.1} className="flex flex-wrap items-center gap-2 text-[12px] text-white/45">
          <Link href="/explore" className="hover:text-white">Explore</Link>
          <ChevronRight className="size-3" />
          {info.parent !== null && (
            <>
              <Link href={`/region/${order - 1}/${info.parent}`} className="font-mono hover:text-white">SPX-{order - 1}-{info.parent}</Link>
              <ChevronRight className="size-3" />
            </>
          )}
          <span className="font-mono text-signal">{info.id}</span>
        </Reveal>

        <div className="mt-4 flex flex-wrap items-end justify-between gap-6">
          <Reveal delay={0.15}>
            <div className="eyebrow text-signal/80">Selected region · HEALPix order {order}</div>
            <h1 className="display mt-2 text-[40px] font-extralight tracking-wide text-white md:text-[52px]">{info.id}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Chip>{formatRA(info.center.ra)} · {formatDec(info.center.dec)}</Chip>
              <Chip>{info.sizeDeg.toFixed(2)}° tile</Chip>
              <Chip>{info.pixelScaleArcsec.toFixed(1)}″/px</Chip>
              <LiveTag />
            </div>
          </Reveal>
          <Reveal delay={0.22} className="flex flex-wrap gap-2">
            <Btn variant="outline" href={`/explore?tile=${order}/${ipix}`}>
              <Compass className="size-3.5" /> Open in sky
            </Btn>
            <Btn variant="outline" href={`/ai/engine?tile=${order}/${ipix}`}>
              <Brain className="size-3.5" /> Quick analyze
            </Btn>
            <Btn variant="primary" href={`/missions/infrared-detective?tile=${order}/${ipix}`}>
              <Rocket className="size-3.5" /> Start mission
            </Btn>
          </Reveal>
        </div>

        {/* ---------- four principal areas ---------- */}
        <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <Reveal delay={0.25}>
            <Panel className="overflow-hidden p-0">
              <div className="flex items-center justify-between px-5 py-3.5">
                <PanelHeader title="Region visualizer" meta="Quick view · north up" />
              </div>
              <div className="relative aspect-[16/10] w-full">
                <SkyCanvas
                  onEngine={onEngine}
                  className="absolute inset-0"
                  options={{ initial: { ra: info.center.ra, dec: info.center.dec, fov: Math.min(120, info.sizeDeg * 2.4) }, statusProvider: buildStatusProvider(null) }}
                />
                <div className="pointer-events-none absolute bottom-3 left-4 font-mono text-[10px] text-white/60">
                  False-colour IR · R {fmtWl(DEFAULT_RGB.r)} · G {fmtWl(DEFAULT_RGB.g)} · B {fmtWl(DEFAULT_RGB.b)}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 p-4 md:grid-cols-4">
                {LAYERS.map((l) => (
                  <button
                    key={l.label}
                    onClick={() => setLayer(l.id)}
                    className={cn("rounded-xl border px-3 py-2.5 text-left transition", layer === l.id ? "border-white/25 bg-white/[0.07]" : "border-white/[0.06] hover:bg-white/[0.04]")}
                  >
                    <div className="flex items-center justify-between text-[12px] text-white">{l.label}</div>
                    <div className="text-[10.5px] text-white/40">{l.sub}</div>
                  </button>
                ))}
              </div>
            </Panel>
          </Reveal>

          <div className="space-y-4">
            <Reveal delay={0.3}>
              <Panel className="p-4">
                <div className="flex items-center justify-between">
                  <PanelHeader title="Observation visits" />
                  <LiveTag>IRSA SIA</LiveTag>
                </div>
                {obs.loading && (
                  <div className="mt-4">
                    <div className="h-[2px] overflow-hidden rounded-full bg-white/[0.06]">
                      <div className="h-full bg-signal/70 transition-[width]" style={{ width: `${Math.min(95, (obs.elapsed / 24) * 100)}%` }} />
                    </div>
                    <p className="mt-2 font-mono text-[10.5px] text-white/40">Querying spherex_dr1 exposures at tile centre… {obs.elapsed.toFixed(1)}s</p>
                    <div className="mt-3 grid grid-cols-4 gap-2">
                      {[1, 2, 3, 4].map((v) => (
                        <div key={v} className="h-16 animate-pulse rounded-xl bg-white/[0.04]" />
                      ))}
                    </div>
                  </div>
                )}
                {obs.error && <p className="mt-3 text-[12px] text-destructive">{obs.error}</p>}
                {obs.data && (
                  <>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {obs.data.epochs.map((e) => (
                        <div key={e.index} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[12px] text-white">Epoch {e.index}</span>
                            <span className="font-mono text-[10px] text-signal">{e.visits} visits</span>
                          </div>
                          <div className="mt-1 font-mono text-[10px] text-white/45">
                            {mjdToDate(e.tStart).toISOString().slice(0, 10)}
                            <br />→ {mjdToDate(e.tEnd).toISOString().slice(0, 10)}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex items-end gap-[2px]">
                      {obs.data.visits.slice(0, 90).map((v) => (
                        <span key={v.id} title={`${v.id} · ${mjdToDate(v.tMin).toISOString().slice(0, 10)} · ${v.detectors.join(",")}`} className="flex-1 rounded-sm bg-signal/50" style={{ height: 6 + v.detectors.length * 4 }} />
                      ))}
                    </div>
                    <p className="mt-2 text-[10.5px] text-white/40">
                      {obs.data.count} L2 exposures · {obs.data.visits.length} visits. Bar height = detectors covering this point per visit.
                    </p>
                  </>
                )}
              </Panel>
            </Reveal>

            <Reveal delay={0.36}>
              <Panel className="p-4">
                <PanelHeader title="Next steps" />
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {[
                    { icon: Brain, t: "Spectral Scout", s: "Run the custom model", href: `/ai/engine?tile=${order}/${ipix}` },
                    { icon: FlaskConical, t: "Spectral Lab", s: "Explore wavelengths", href: "#spectral" },
                    { icon: Rocket, t: "Start Mission", s: "Investigate a target", href: `/missions/infrared-detective?tile=${order}/${ipix}` },
                    { icon: BookOpen, t: "Region Guide", s: "Learn what is here", href: "#guide" },
                  ].map((a) => (
                    <Link key={a.t} href={a.href} className="group rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 transition hover:border-white/20 hover:bg-white/[0.05]">
                      <a.icon className="size-4 text-signal" />
                      <div className="mt-2 text-[12.5px] text-white">{a.t}</div>
                      <div className="text-[10.5px] text-white/40">{a.s}</div>
                    </Link>
                  ))}
                </div>
              </Panel>
            </Reveal>
          </div>
        </div>

        {/* ---------- spectral lab ---------- */}
        <section id="spectral" className="mt-14 scroll-mt-24">
          <RevealInView>
            <SectionTitle eyebrow="Spectral Lab" title="Change wavelength like changing a filter" desc="Every frame below is a real SPHEREx DR1 channel for this tile. Switching is instant — the tiles stream straight from IRSA." />
          </RevealInView>
          <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <RevealInView>
              <Panel className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 rounded-full border border-white/10 p-0.5">
                    <button onClick={() => setRgb(true)} className={cn("rounded-full px-3 py-1 text-[11px]", rgb ? "bg-white text-black" : "text-white/60")}>Composite</button>
                    <button onClick={() => setRgb(false)} className={cn("rounded-full px-3 py-1 text-[11px]", !rgb ? "bg-white text-black" : "text-white/60")}>Single channel</button>
                  </div>
                  <span className="font-mono text-[11px] text-white/70">{rgb ? "R/G/B 3.29 · 1.91 · 0.85 µm" : `${WAVELENGTHS_UM[frame].toFixed(3)} µm · f${frame}`}</span>
                </div>
                <TileImage order={order} ipix={ipix} view={rgb ? { kind: "rgb", ...DEFAULT_RGB } : { kind: "mono", frame }} gain={order <= 2 ? 1.8 : 1.2} gamma={order <= 2 ? 0.85 : 1.05} className="mt-3 aspect-square w-full rounded-xl border border-white/[0.06]" />
                <div className="mt-4">
                  <ChannelStrip value={rgb ? null : frame} onChange={(f) => { setRgb(false); setFrame(f); }} />
                </div>
              </Panel>
            </RevealInView>
            <RevealInView delay={0.08} className="space-y-4">
              <Panel className="p-4">
                <div className="flex items-center justify-between">
                  <PanelHeader title="Spectral Scout · best channels & epochs" />
                  <LiveTag>ONNX · real L2 cutouts</LiveTag>
                </div>
                <p className="mt-1 mb-3 text-[11px] text-white/40">Runs only when you ask. Click a recommended channel to view it in the Spectral Lab.</p>
                <ScoutPanel
                  ra={sci5.ra}
                  dec={sci5.dec}
                  order={order}
                  ipix={ipix}
                  onApplyFrame={(f) => {
                    setRgb(false);
                    setFrame(f);
                    engine?.setColor({ kind: "mono", frame: f, cmap: "inferno" });
                  }}
                  onResult={() => fetch("/api/tiles/status").then((r) => r.json()).then(setStatus).catch(() => {})}
                />
              </Panel>
            </RevealInView>
          </div>
        </section>

        {/* ---------- region guide ---------- */}
        <section id="guide" className="mt-14 grid scroll-mt-24 gap-4 md:grid-cols-3">
          {near.map(({ o, d }, i) => (
            <RevealInView key={o.slug} delay={i * 0.06}>
              <Link href={`/discoveries/${o.slug}`} className="glass group flex gap-3 rounded-[22px] p-3 transition hover:border-white/20">
                <TileImage order={4} ipix={ang2pix(4, o.ra, o.dec)} className="size-20 shrink-0 rounded-xl" />
                <div className="min-w-0">
                  <div className="eyebrow">{d < 1 ? "Inside region" : `${d.toFixed(1)}° away`}</div>
                  <div className="mt-1 truncate text-[13.5px] text-white">{o.name}</div>
                  <div className="line-clamp-2 text-[11px] text-white/45">{o.type}</div>
                </div>
                <ArrowUpRight className="ml-auto size-4 shrink-0 text-white/30 group-hover:text-white" />
              </Link>
            </RevealInView>
          ))}
        </section>

        {/* ---------- science ---------- */}
        <section id="science" className="mt-14 scroll-mt-24">
          <RevealInView>
            <SectionTitle
              eyebrow="Science inspector"
              title="Calibrated data, not pretty pictures"
              desc={`Planes are read directly from Npix${sci}_cube.fits on IRSA with HTTP byte-range requests — about 1 MB per plane from a ~320 MB cube. Quantities shown are the stored FITS values.`}
              right={order !== 5 ? <Chip>Showing order-5 cube at this tile&apos;s centre</Chip> : undefined}
            />
          </RevealInView>
          <RevealInView delay={0.06} className="mt-6">
            <ScienceInspector ipix={sci} />
          </RevealInView>
          <RevealInView delay={0.1} className="mt-4">
            <Panel className="grid gap-x-8 p-4 md:grid-cols-3">
              <KV k="IMAGE" v="Surface brightness, MJy/sr" mono={false} />
              <KV k="NHITS" v="Input pixels contributing (not visits)" mono={false} />
              <KV k="FLAGS" v="Per-pixel quality bitmask" mono={false} />
            </Panel>
          </RevealInView>
        </section>

        <div className="mt-10 flex justify-end">
          <Btn variant="ghost" size="sm" onClick={toggleSave}>
            <Bookmark className={cn("size-3.5", saved && "fill-current text-signal")} /> {saved ? "Saved to My Lab" : "Save region to My Lab"}
          </Btn>
          <Btn variant="ghost" size="sm" href="/community">
            <Sparkles className="size-3.5" /> Discuss region
          </Btn>
        </div>
      </div>
    </AppShell>
  );
}

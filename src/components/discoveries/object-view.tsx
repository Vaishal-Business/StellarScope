"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ArrowUpRight, Compass, Download, Rocket } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Reveal, RevealInView } from "@/components/motion/reveal";
import { TileImage } from "@/components/sky/tile-image";
import { SpectrumChart } from "@/components/sky/spectrum-chart";
import { ChannelStrip } from "@/components/explore/spectral-dock";
import { Btn, Chip, KV, LiveTag, Panel, PanelHeader } from "@/components/ui/kit";
import { OBJECTS, cubePixel, objectBySlug, type SkyObject } from "@/lib/objects";
import { ScoutPanel } from "@/components/scout/scout-panel";
import { useLive, timeAgo } from "@/lib/live";
import { useJson, type SpectrumResponse } from "@/lib/hooks";
import { ang2pix } from "@/sky/healpix";
import { formatDec, formatRA, angularDistance } from "@/sky/coords";
import { DEFAULT_RGB, WAVELENGTHS_UM, scienceUrl, isBlankFrame } from "@/sky/spherex";
import { objOrder } from "./discoveries-view";

export function ObjectView({ obj }: { obj: SkyObject }) {
  const order = objOrder(obj);
  const tile = ang2pix(order, obj.ra, obj.dec);
  const px = cubePixel(obj.ra, obj.dec);
  const [frame, setFrame] = useState<number | null>(null);
  const spec = useJson<SpectrumResponse>(`/api/science/${px.tile}/spectrum?x=${px.x}&y=${px.y}`);
  const related = obj.related.map(objectBySlug).filter(Boolean) as SkyObject[];
  const nearby = OBJECTS.filter((o) => o.slug !== obj.slug).map((o) => ({ o, d: angularDistance(o, obj) })).sort((a, b) => a.d - b.d).slice(0, 3);
  const flagged = spec.data?.flags?.filter((f, i) => f && !isBlankFrame(i)).length ?? 0;
  const threads = useLive<{ posts: { id: number; title: string; author: string; replies: number; created_at: number }[] }>(`/api/posts?tile=5/${px.tile}`);

  return (
    <AppShell>
      <div className="px-5 md:px-8">
        <Reveal delay={0.08}>
          <Link href="/discoveries" className="inline-flex items-center gap-2 text-[12px] text-white/50 hover:text-white"><ArrowLeft className="size-3.5" /> Discovery atlas</Link>
        </Reveal>

        <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          <Reveal delay={0.14}>
            <div className="relative aspect-square overflow-hidden rounded-[28px] border border-white/[0.07]">
              <TileImage order={order} ipix={tile} view={frame === null ? { kind: "rgb", ...DEFAULT_RGB } : { kind: "mono", frame }} className="absolute inset-0" gain={1.2} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />
              {/* reticle at the object's position (approx. centre of its tile) */}
              <div className="absolute left-4 top-4 flex gap-2">
                <LiveTag>SPX-{order}-{tile}</LiveTag>
              </div>
              <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between font-mono text-[10px] text-white/70">
                <span>{frame === null ? "False-colour IR · R 3.29 / G 1.91 / B 0.85 µm" : `${WAVELENGTHS_UM[frame].toFixed(3)} µm · frame ${frame}`}</span>
                <span>N↑ E←</span>
              </div>
            </div>
            <div className="mt-4">
              <ChannelStrip value={frame} onChange={setFrame} />
              <button onClick={() => setFrame(null)} className="mt-2 text-[11px] text-white/45 hover:text-white">Reset to composite</button>
            </div>
          </Reveal>

          <div>
            <Reveal delay={0.18}>
              <div className="flex flex-wrap gap-2">
                <Chip tone="signal">{obj.category}</Chip>
                <Chip>{obj.constellation}</Chip>
                {obj.distance && <Chip>{obj.distance}</Chip>}
              </div>
              <h1 className="display mt-4 text-[42px] font-extralight leading-tight text-white md:text-[54px]">{obj.name}</h1>
              <div className="mt-1 font-mono text-[12px] text-white/45">{obj.ids.join(" · ")}</div>
              <p className="mt-5 text-[14.5px] leading-relaxed text-white/65">{obj.summary}</p>
              <div className="mt-4 rounded-2xl border border-signal/15 bg-signal/[0.04] p-4">
                <div className="eyebrow text-signal/80">Why it matters at 0.75–5 µm</div>
                <p className="mt-2 text-[13px] leading-relaxed text-white/70">{obj.infrared}</p>
              </div>
            </Reveal>
            <Reveal delay={0.24} className="mt-6 grid gap-4 md:grid-cols-2">
              <Panel className="p-4">
                <PanelHeader title="Identity" />
                <div className="mt-2">
                  <KV k="RA (ICRS)" v={formatRA(obj.ra, true)} />
                  <KV k="Dec (ICRS)" v={formatDec(obj.dec, true)} />
                  <KV k="Object type" v={obj.type} mono={false} />
                  <KV k="Classification" v="Literature (SIMBAD-equivalent)" mono={false} />
                </div>
              </Panel>
              <Panel className="p-4">
                <PanelHeader title="SPHEREx data" />
                <div className="mt-2">
                  <KV k="Order-5 tile" v={`SPX-5-${px.tile}`} />
                  <KV k="Cube pixel" v={`(${px.x}, ${px.y})`} />
                  <KV k="Channels" v="102 · 0.75–5.0 µm" />
                  <KV k="Flagged channels" v={spec.data ? `${flagged} of 100` : "…"} />
                </div>
              </Panel>
            </Reveal>
            <Reveal delay={0.3} className="mt-5 flex flex-wrap gap-2">
              <Btn variant="primary" href={`/explore?ra=${obj.ra}&dec=${obj.dec}&fov=${obj.fov}`}><Compass className="size-3.5" /> Fly to in sky</Btn>
              <Btn variant="outline" href={`/region/5/${px.tile}#science`}>Science inspector <ArrowUpRight className="size-3.5" /></Btn>
              <Btn variant="ghost" href={`/missions/spectral-anomaly?tile=5/${px.tile}`}><Rocket className="size-3.5" /> Investigate</Btn>
            </Reveal>
          </div>
        </div>

        <RevealInView className="mt-12">
          <Panel className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <PanelHeader title={`SPHEREx spectrum at ${obj.name}`} />
              <div className="flex items-center gap-2">
                <LiveTag>DR1 calibrated cube</LiveTag>
                <a href={scienceUrl(px.tile)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-[10.5px] text-white/60 hover:text-white">
                  FITS <Download className="size-3" />
                </a>
              </div>
            </div>
            <p className="mt-1 font-mono text-[10.5px] text-white/40">
              Npix{px.tile}_cube.fits · pixel ({px.x}, {px.y}) — single 12.9″ pixel at the catalogue position, not an aperture photometry measurement.
            </p>
            {spec.loading && <div className="py-16 text-center text-[12px] text-white/50">Reading 306 values from the 320 MB cube with byte-range requests… {spec.elapsed.toFixed(1)}s</div>}
            {spec.error && <div className="py-8 text-center text-[12px] text-destructive">{spec.error}</div>}
            {spec.data && (
              <>
                <SpectrumChart data={spec.data} height={240} highlight={frame} onPick={setFrame} className="mt-3" />
                {flagged > 0 && (
                  <p className="mt-2 text-[11.5px] text-warn/90">
                    {flagged} channels carry quality flags at this pixel — bright sources often saturate the detectors. Treat flagged points (orange) with caution.
                  </p>
                )}
              </>
            )}
          </Panel>
        </RevealInView>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <RevealInView>
            <Panel className="h-full p-5">
              <PanelHeader title="Spectral Scout" />
              <div className="mt-3">
                <ScoutPanel ra={obj.ra} dec={obj.dec} order={5} ipix={px.tile} compact onApplyFrame={setFrame} />
              </div>
            </Panel>
          </RevealInView>
          <RevealInView delay={0.05}>
            <Panel className="h-full p-5">
              <PanelHeader title="Community investigations" />
              <div className="mt-3 space-y-2">
                {threads.data?.posts.length === 0 && (
                  <p className="text-[12px] text-white/45">
                    No threads about this tile yet. <Link href={`/community?tile=5/${px.tile}`} className="text-white/70 underline">Start one</Link>.
                  </p>
                )}
                {threads.data?.posts.map((p) => (
                  <Link key={p.id} href="/community" className="block rounded-xl border border-white/[0.06] px-3 py-2 text-[12px] text-white/75 hover:border-white/20">
                    {p.title}
                    <div className="text-[10px] text-white/35">{p.author} · {p.replies} replies · {timeAgo(p.created_at)}</div>
                  </Link>
                ))}
              </div>
            </Panel>
          </RevealInView>
          <RevealInView delay={0.1}>
            <Panel className="h-full p-5">
              <PanelHeader title="Related & nearby" />
              <div className="mt-3 space-y-2">
                {[...related, ...nearby.map((n) => n.o)].filter((o, i, a) => a.findIndex((x) => x.slug === o.slug) === i).slice(0, 4).map((o) => (
                  <Link key={o.slug} href={`/discoveries/${o.slug}`} className="flex items-center gap-3 rounded-xl border border-white/[0.06] p-2 hover:border-white/20">
                    <TileImage order={4} ipix={ang2pix(4, o.ra, o.dec)} className="size-10 shrink-0 rounded-lg" />
                    <span className="min-w-0">
                      <span className="block truncate text-[12.5px] text-white">{o.name}</span>
                      <span className="block text-[10px] text-white/40">{angularDistance(o, obj).toFixed(1)}° away</span>
                    </span>
                  </Link>
                ))}
              </div>
            </Panel>
          </RevealInView>
        </div>
      </div>
    </AppShell>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Reveal, RevealInView } from "@/components/motion/reveal";
import { TileImage } from "@/components/sky/tile-image";
import { Chip, LiveTag, Panel, PanelHeader, SectionTitle } from "@/components/ui/kit";
import { OBJECTS, type SkyObject } from "@/lib/objects";
import { useLive, timeAgo } from "@/lib/live";
import { ang2pix } from "@/sky/healpix";
import { formatDec, formatRA } from "@/sky/coords";
import { cn } from "@/lib/utils";

const CATS = ["All", "Nebula", "Galaxy", "Star", "Cluster", "Region"] as const;
export const objOrder = (o: SkyObject) => (o.fov >= 8 ? 2 : o.fov >= 3 ? 3 : 4);

export function DiscoveriesView() {
  const [cat, setCat] = useState<(typeof CATS)[number]>("All");
  const [q, setQ] = useState("");
  const list = OBJECTS.filter((o) => (cat === "All" || o.category === cat) && (!q || `${o.name} ${o.ids.join(" ")} ${o.type} ${o.constellation}`.toLowerCase().includes(q.toLowerCase())));
  const feature = OBJECTS[0];
  const subs = useLive<{ submissions: { id: number; tile_order: number; tile_ipix: number; interpretation: string; status: string; author: string; created_at: number }[] }>("/api/submissions");
  return (
    <AppShell>
      <div className="px-5 md:px-8">
        <Reveal delay={0.1}>
          <SectionTitle eyebrow="Discovery atlas" title="The infrared universe, object by object" desc="Every page resolves its SPHEREx DR1 tile live from catalogue coordinates and can pull a calibrated 102-channel spectrum straight from the science cube." right={<LiveTag>Real tiles & spectra</LiveTag>} />
        </Reveal>

        <Reveal delay={0.18} className="mt-8">
          <Link href={`/discoveries/${feature.slug}`} className="glass group grid overflow-hidden rounded-[26px] md:grid-cols-[1.3fr_1fr]">
            <div className="relative min-h-[300px]">
              <TileImage order={objOrder(feature)} ipix={ang2pix(objOrder(feature), feature.ra, feature.dec)} className="absolute inset-0 transition-transform duration-[2s] group-hover:scale-105" gain={1.2} />
              <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[oklch(0.14_0.004_260)]" />
            </div>
            <div className="flex flex-col justify-center p-8">
              <Chip tone="signal" className="w-fit">Featured</Chip>
              <h2 className="display mt-4 text-[34px] font-extralight text-white">{feature.name}</h2>
              <div className="mt-1 font-mono text-[11px] text-white/45">{feature.ids.join(" · ")} · {feature.constellation}</div>
              <p className="mt-4 text-[13.5px] leading-relaxed text-white/60">{feature.infrared}</p>
              <span className="mt-6 inline-flex items-center gap-2 text-[12px] text-white/70 group-hover:text-white">Open object page <ArrowUpRight className="size-3.5" /></span>
            </div>
          </Link>
        </Reveal>

        <Reveal delay={0.25} className="mt-10 flex flex-wrap items-center justify-between gap-4">
          <div className="glass flex items-center gap-0.5 rounded-full p-1">
            {CATS.map((c) => (
              <button key={c} onClick={() => setCat(c)} className={cn("rounded-full px-4 py-1.5 text-[12px] transition", cat === c ? "bg-white text-black" : "text-white/55 hover:text-white")}>
                {c}
              </button>
            ))}
          </div>
          <label className="glass flex h-10 w-72 items-center gap-2 rounded-full px-4">
            <Search className="size-4 text-white/40" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, catalogue ID, type…" className="flex-1 bg-transparent text-[12.5px] text-white outline-none placeholder:text-white/30" />
          </label>
        </Reveal>

        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {list.map((o, i) => (
            <RevealInView key={o.slug} delay={(i % 4) * 0.05}>
              <Link href={`/discoveries/${o.slug}`} className="glass group block overflow-hidden rounded-[22px] transition hover:border-white/20">
                <div className="relative aspect-[4/3]">
                  <TileImage order={objOrder(o)} ipix={ang2pix(objOrder(o), o.ra, o.dec)} className="absolute inset-0 transition-transform duration-[1.6s] group-hover:scale-110" gain={1.2} />
                  <div className="absolute inset-0 bg-gradient-to-t from-[oklch(0.15_0.004_260)] via-transparent to-transparent" />
                  <Chip className="absolute left-3 top-3">{o.category}</Chip>
                </div>
                <div className="p-4">
                  <div className="truncate text-[14px] text-white">{o.name}</div>
                  <div className="mt-0.5 truncate font-mono text-[10.5px] text-white/40">{o.ids[0]} · {o.constellation}</div>
                  <div className="mt-3 flex items-center justify-between font-mono text-[10px] text-white/45">
                    <span>{formatRA(o.ra)} {formatDec(o.dec)}</span>
                    <span>SPX-5-{ang2pix(5, o.ra, o.dec)}</span>
                  </div>
                </div>
              </Link>
            </RevealInView>
          ))}
        </div>

        <RevealInView className="mt-14">
          <Panel className="p-6">
            <PanelHeader title="Community submissions & verified finds" meta={subs.data ? `${subs.data.submissions.length}` : ""} />
            {subs.data?.submissions.length === 0 && (
              <p className="mt-4 rounded-xl border border-dashed border-white/10 p-5 text-center text-[12px] text-white/45">
                No community submissions yet. Verified mission findings appear here with their full provenance. <Link href="/missions" className="text-white/70 underline">Start a mission</Link>.
              </p>
            )}
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {subs.data?.submissions.slice(0, 12).map((s) => (
                <Link key={s.id} href="/community" className="flex gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 transition hover:border-white/20">
                  <TileImage order={s.tile_order} ipix={s.tile_ipix} className="size-16 shrink-0 rounded-lg" gain={1.3} />
                  <div className="min-w-0">
                    <Chip tone={s.status === "verified" ? "signal" : s.status === "challenged" ? "warn" : "info"}>{s.status === "verified" ? "Peer verified" : s.status === "challenged" ? "Challenged" : "Candidate · in review"}</Chip>
                    <div className="mt-1.5 truncate text-[12.5px] text-white">{s.interpretation} · SPX-{s.tile_order}-{s.tile_ipix}</div>
                    <div className="text-[10.5px] text-white/40">{s.author} · {timeAgo(s.created_at)}</div>
                  </div>
                </Link>
              ))}
            </div>
          </Panel>
        </RevealInView>
      </div>
    </AppShell>
  );
}

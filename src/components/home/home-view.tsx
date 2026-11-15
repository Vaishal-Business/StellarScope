"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowDown, ArrowUpRight, Boxes, Brain, Compass, FlaskConical, GraduationCap, Grid3x3, Layers, Play, Radar, Rocket, Sparkles, Users } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Reveal, RevealInView } from "@/components/motion/reveal";
import { SkyGlobe } from "@/components/sky/sky-globe";
import { TileImage } from "@/components/sky/tile-image";
import { BentoGrid, BentoGridItem } from "@/components/ui/bento-grid";
import { useEffect, useState } from "react";
import { Btn, Chip, LiveTag, Panel, PanelHeader, SectionTitle } from "@/components/ui/kit";
import { ang2pix } from "@/sky/healpix";
import { MISSIONS } from "@/lib/missions";
import { OBJECTS } from "@/lib/objects";
import { useLive, useStats, timeAgo, type StatsResponse } from "@/lib/live";
import { lastRegion } from "@/lib/settings";
import { useSession } from "@/lib/session";
import { describeTile, HIPS } from "@/sky/spherex";
import { mjdToDate } from "@/sky/coords";
import { cn } from "@/lib/utils";

const rhoOph = { order: 3, ipix: ang2pix(3, 246.79, -24.54) };

/** Dated milestones from the mission record and the DR1 HiPS metadata. */
const TIMELINE = [
  { title: "SPHEREx launch", sub: "Falcon 9 Â· Vandenberg", state: "complete" as const, time: "2025-03-11" },
  { title: "DR1 survey window opens", sub: "HiPS t_min", state: "complete" as const, time: mjdToDate(HIPS.tMinMjd).toISOString().slice(0, 10) },
  { title: "DR1 HiPS cube built", sub: "HipsGen v12.900 Â· 102 channels", state: "complete" as const, time: HIPS.releaseDate },
  { title: "Data Release 1 public", sub: "All-sky spectral cube", state: "progress" as const, time: "2026-11-12" },
];

export function HomeView() {
  const next = MISSIONS[0];
  const { data: stats } = useStats();
  const posts = useLive<{ posts: { id: number; title: string; author: string; created_at: number; tile_order: number | null; tile_ipix: number | null }[] }>("/api/posts?limit=3");
  const { user, stats: me, signIn } = useSession();
  const [last, setLast] = useState<{ order: number; ipix: number } | null>(null);
  useEffect(() => setLast(lastRegion()), []);
  const cont = last ?? { order: 3, ipix: ang2pix(3, 83.82, -5.39) };
  return (
    <AppShell>
      {/* ================= HERO ================= */}
      <section className="relative grid min-h-[620px] grid-cols-[56px_1fr] gap-0 px-5 md:px-8 lg:grid-cols-[56px_minmax(0,1fr)_minmax(0,1.1fr)_96px]">
        {/* left timeline rail */}
        <Reveal delay={0.2} className="relative hidden flex-col items-center py-10 md:flex">
          <div className="absolute inset-y-10 left-1/2 w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-white/15 to-transparent" />
          <div className="relative mt-24 flex flex-col items-center gap-2">
            <span className="h-3 w-px bg-white/40" />
            <span className="h-px w-3 bg-white/40" />
            <span className="h-3 w-px bg-white/40" />
          </div>
          <div className="relative mt-auto mb-8 flex flex-col items-center gap-3">
            <Link href="/explore" className="flex size-11 items-center justify-center rounded-full border border-white/15 bg-white/[0.04] text-white transition hover:border-white/40 hover:bg-white/10" aria-label="Enter the sky">
              <Play className="ml-0.5 size-4 fill-current" />
            </Link>
          </div>
        </Reveal>

        {/* copy */}
        <div className="relative z-10 flex flex-col justify-center py-10 lg:py-16">
          <Reveal delay={0.25}>
            <div className="glass inline-flex items-center gap-3 rounded-full py-1.5 pl-3 pr-3.5">
              <span className="eyebrow text-white/60">System status</span>
              <span className="h-3 w-px bg-white/15" />
              <span className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.16em] text-signal">
                <span className="size-1.5 rounded-full bg-signal animate-pulse-dot" /> DR1 online
              </span>
            </div>
          </Reveal>
          <h1 className="display mt-8 text-[44px] font-extralight leading-[1.02] tracking-[0.02em] text-white sm:text-[60px] xl:text-[76px]">
            <Reveal delay={0.32}>EXPLORE.</Reveal>
            <Reveal delay={0.4}>DISCOVER.</Reveal>
            <Reveal delay={0.48} className="text-signal">CONTRIBUTE.</Reveal>
          </h1>
          <Reveal delay={0.58}>
            <p className="mt-6 max-w-md text-[15px] leading-relaxed text-white/60">
              Step inside NASA SPHEREx&apos;s 102-colour infrared map of the entire sky. Investigate real tiles, let AI point you to
              the interesting signals, and turn what you find into verifiable discoveries.
            </p>
          </Reveal>
          <Reveal delay={0.68} className="mt-9 flex flex-wrap items-center gap-3">
            <Btn variant="primary" size="lg" href="/explore">
              Launch explorer <ArrowUpRight className="size-4" />
            </Btn>
            <Btn variant="outline" size="lg" href="/missions">
              View missions <Compass className="size-4" />
            </Btn>
          </Reveal>
          <Reveal delay={0.78} className="mt-10 flex items-center gap-6 text-[11px] text-white/40">
            <span className="flex items-center gap-2">
              <span className="font-mono text-white/80">0.75â€“5.0 Âµm</span> spectral range
            </span>
            <span className="h-3 w-px bg-white/10" />
            <span className="flex items-center gap-2">
              <span className="font-mono text-white/80">6.2â€³</span> native pixels
            </span>
          </Reveal>
        </div>

        {/* globe */}
        <div className="relative col-span-2 min-h-[460px] lg:col-span-1">
          <Reveal delay={0.35} x={30} blur={20} duration={1.4} className="absolute inset-0">
            {/* orbits */}
            <svg viewBox="0 0 600 600" className="pointer-events-none absolute left-1/2 top-1/2 h-[118%] -translate-x-1/2 -translate-y-1/2 overflow-visible" aria-hidden>
              <g className="animate-orbit-slow" style={{ transformOrigin: "300px 300px" }}>
                <ellipse cx="300" cy="300" rx="300" ry="118" fill="none" stroke="white" strokeOpacity="0.1" transform="rotate(-24 300 300)" />
                <circle cx="574" cy="186" r="4" fill="white" fillOpacity="0.8" />
              </g>
              <g className="animate-orbit" style={{ transformOrigin: "300px 300px" }}>
                <ellipse cx="300" cy="300" rx="262" ry="262" fill="none" stroke="white" strokeOpacity="0.05" strokeDasharray="2 6" />
                <circle cx="300" cy="38" r="2.5" fill="oklch(0.89 0.11 155)" />
              </g>
            </svg>
            <SkyGlobe className="absolute inset-[6%]" />
          </Reveal>
          <Reveal delay={0.9} x={20} className="absolute right-2 top-[14%] hidden md:block">
            <Link href={`/explore?tile=5/445`} className="glass block rounded-2xl px-4 py-3 transition hover:border-white/20">
              <div className="eyebrow">Target</div>
              <div className="display mt-1 text-[14px] text-white">SPX-5-00445</div>
              <div className="mt-0.5 font-mono text-[10px] text-white/45">RA 04h 02m Â· Dec +51Â° 15â€²</div>
            </Link>
          </Reveal>
          <Reveal delay={1.0} x={20} className="absolute bottom-[10%] left-0 hidden md:block">
            <div className="glass rounded-2xl px-4 py-3">
              <div className="flex items-center gap-2">
                <LiveTag>All-sky cube</LiveTag>
              </div>
              <div className="mt-2 font-mono text-[10.5px] text-white/55">R 3.293 Â· G 1.905 Â· B 0.848 Âµm</div>
              <div className="mt-0.5 text-[10px] text-white/35">False-colour infrared Â· drag to spin</div>
            </div>
          </Reveal>
        </div>

        {/* right stat rail */}
        <Reveal delay={0.5} x={24} className="relative hidden flex-col items-center justify-center gap-0 lg:flex">
          <div className="glass flex flex-col items-center rounded-full px-2 py-4">
            {[
              { icon: Rocket, v: String(MISSIONS.length).padStart(2, "0"), k: "Missions" },
              { icon: Grid3x3, v: "12,288", k: "Science tiles" },
              { icon: Layers, v: "102", k: "Channels" },
            ].map((s, i) => (
              <div key={s.k} className={cn("flex w-[76px] flex-col items-center py-4 text-center", i > 0 && "border-t border-white/[0.07]")}>
                <s.icon className="size-4 text-white/50" />
                <div className="mt-2 text-[17px] font-light tabular-nums text-white">{s.v}</div>
                <div className="mt-0.5 text-[9px] uppercase leading-tight tracking-[0.14em] text-white/40">{s.k}</div>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ================= BOTTOM CARD ROW ================= */}
      <section className="relative z-10 grid grid-cols-1 gap-3 px-5 pb-6 sm:grid-cols-2 md:px-8 lg:grid-cols-[1fr_1fr_1fr_1.15fr_0.62fr]">
        <Reveal delay={0.85}>
          <Panel className="flex h-[300px] flex-col p-4">
            <PanelHeader title={last ? "Continue exploring" : "Start exploring"} meta={last ? "last region" : "suggested"} />
            <Link href={`/region/${cont.order}/${cont.ipix}`} className="group relative mt-3 flex-1 overflow-hidden rounded-xl border border-white/[0.06]">
              <TileImage order={cont.order} ipix={cont.ipix} className="absolute inset-0 transition-transform duration-[1.6s] group-hover:scale-105" gain={cont.order <= 2 ? 1.8 : 1.2} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
              <span className="absolute bottom-2 left-3 font-mono text-[10px] text-white/80">{describeTile(cont.order, cont.ipix).id}</span>
            </Link>
            <div className="mt-3 text-[13px] text-white">{last ? "Pick up where you left off" : "Orion Molecular Cloud"}</div>
            <div className="mt-1 font-mono text-[10px] text-white/45">
              {describeTile(cont.order, cont.ipix).sizeDeg.toFixed(2)}Â° tile Â· {describeTile(cont.order, cont.ipix).pixelScaleArcsec.toFixed(1)}â€³/px
            </div>
          </Panel>
        </Reveal>

        <Reveal delay={0.92}>
          <Panel className="flex h-[300px] flex-col p-4">
            <PanelHeader title="Next mission" meta={next.duration} />
            <div className="relative mt-3 flex-1 overflow-hidden rounded-xl border border-white/[0.06]">
              <TileImage order={4} ipix={ang2pix(4, next.target.ra, next.target.dec)} className="absolute inset-0" view={{ kind: "mono", frame: 42 }} gain={1.2} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
            </div>
            <div className="mt-3 flex items-end justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-[13px] text-white">{next.title}</div>
                <div className="mt-0.5 text-[11px] text-white/45">{next.kind} Â· {next.difficulty}</div>
              </div>
              <Link href={`/missions/${next.slug}`} className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/15 text-white/80 transition hover:border-white/40 hover:text-white" aria-label="Open mission">
                <ArrowUpRight className="size-4" />
              </Link>
            </div>
          </Panel>
        </Reveal>

        <Reveal delay={0.99}>
          <Panel className="flex h-[300px] flex-col p-4">
            <PanelHeader title="Spectral Scout" meta={<span className="text-signal">â— Live</span>} />
            <div className="relative mx-auto mt-2 aspect-square w-[170px]">
              {[1, 0.74, 0.48, 0.24].map((s) => (
                <span key={s} className="absolute rounded-full border border-white/[0.09]" style={{ inset: `${(1 - s) * 50}%` }} />
              ))}
              <span className="absolute inset-0 rounded-full animate-sweep" style={{ background: "conic-gradient(from 0deg, oklch(0.89 0.11 155 / 0.22), transparent 22%)" }} />
              {[
                [22, 30], [68, 22], [80, 58], [40, 72], [55, 44], [30, 55], [62, 80],
              ].slice(0, Math.min(7, stats?.totals.candidates ?? 0)).map(([x, y], i) => (
                <motion.span key={i} className="absolute size-1.5 rounded-full bg-signal shadow-[0_0_10px_oklch(0.89_0.11_155)]" style={{ left: `${x}%`, top: `${y}%` }} animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.35 }} />
              ))}
              <span className="absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
            </div>
            <div className="mt-auto flex items-end justify-between">
              <div>
                <div className="text-[22px] font-light text-white">{stats ? stats.totals.scoutTiles : "â€“"}</div>
                <div className="text-[10.5px] uppercase tracking-[0.14em] text-white/45">Tiles screened Â· {stats?.totals.candidates ?? 0} cand.</div>
              </div>
              <Btn size="sm" href="/ai/engine">
                View <ArrowUpRight className="size-3" />
              </Btn>
            </div>
          </Panel>
        </Reveal>

        <Reveal delay={1.06}>
          <Panel className="flex h-[300px] flex-col p-4">
            <PanelHeader title="Mission timeline" meta="Milestones" />
            <div className="relative mt-4 flex-1 space-y-2.5 pl-6">
              <span className="absolute bottom-3 left-[7px] top-3 w-px bg-white/10" />
              {TIMELINE.map((t) => (
                <div key={t.title} className="relative">
                  <span className={cn("absolute -left-[22px] top-3 size-2.5 rounded-full border", t.state === "complete" ? "border-signal bg-signal/30" : t.state === "progress" ? "border-signal bg-signal" : "border-white/25 bg-transparent")} />
                  <div className={cn("flex items-center justify-between rounded-xl border px-3 py-2", t.state === "progress" ? "border-white/15 bg-white/[0.06]" : "border-white/[0.05] bg-white/[0.02]")}>
                    <div className="min-w-0">
                      <div className={cn("truncate text-[12px]", "text-white")}>{t.title}</div>
                      <div className="truncate text-[10px] text-white/40">{t.sub}</div>
                    </div>
                    <span className={cn("font-mono text-[10px]", t.state === "complete" ? "text-signal" : "text-white/50")}>{t.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </Reveal>

        <Reveal delay={1.13} className="hidden lg:block">
          <a href="#platform" className="glass group relative flex h-[300px] flex-col items-center justify-end overflow-hidden rounded-[22px] p-4">
            <div className="absolute -right-24 top-6 size-64 overflow-hidden rounded-full border border-white/10 opacity-80">
              <TileImage order={3} ipix={rhoOph.ipix} className="absolute inset-0" />
            </div>
            <div className="relative text-center">
              <div className="eyebrow text-white/70">Scroll to</div>
              <div className="eyebrow text-white/70">explore</div>
              <span className="mx-auto mt-3 flex size-9 items-center justify-center rounded-full border border-white/20 text-white transition group-hover:translate-y-1">
                <ArrowDown className="size-4" />
              </span>
            </div>
          </a>
        </Reveal>
      </section>

      {/* ================= PLATFORM BENTO ================= */}
      <section id="platform" className="relative z-10 px-5 pt-16 md:px-8">
        <RevealInView>
          <SectionTitle
            eyebrow="One universe Â· seven destinations"
            title="Citizen-science discovery infrastructure, built around SPHEREx"
            desc="The sky is the interface. AI is the scientific engine. Missions are the reason to come back."
            right={<Btn href="/explore" variant="outline">Open the sky <ArrowUpRight className="size-3.5" /></Btn>}
          />
        </RevealInView>
        <RevealInView delay={0.1} className="mt-10">
          <BentoGrid className="max-w-none md:auto-rows-[19rem]">
            {bento(stats).map((b, i) => (
              <Link key={b.title} href={b.href} className={cn("contents")}>
                <BentoGridItem
                  title={<span className="display text-[15px] font-normal tracking-wide text-white">{b.title}</span>}
                  description={<span className="text-[12.5px] leading-relaxed text-white/50">{b.desc}</span>}
                  header={b.header}
                  icon={<b.icon className="size-4 text-signal" />}
                  className={cn("glass !rounded-[22px] !border-white/[0.07] !bg-transparent p-4 hover:!border-white/15", i === 0 && "md:col-span-2", i === 3 && "md:col-span-2")}
                />
              </Link>
            ))}
          </BentoGrid>
        </RevealInView>
      </section>

      {/* ================= DISCOVERIES + COMMUNITY ================= */}
      <section className="relative z-10 grid gap-4 px-5 pt-16 md:px-8 lg:grid-cols-[1.4fr_1fr]">
        <RevealInView>
          <Panel className="p-5">
            <div className="flex items-center justify-between">
              <PanelHeader title="Featured in the infrared" />
              <Link href="/discoveries" className="text-[11px] text-white/50 hover:text-white">
                Discovery atlas â†’
              </Link>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              {OBJECTS.slice(0, 4).map((o) => (
                <Link key={o.slug} href={`/discoveries/${o.slug}`} className="group">
                  <div className="relative aspect-square overflow-hidden rounded-xl border border-white/[0.06]">
                    <TileImage order={o.fov > 5 ? 3 : 4} ipix={ang2pix(o.fov > 5 ? 3 : 4, o.ra, o.dec)} className="absolute inset-0 transition-transform duration-[1.4s] group-hover:scale-110" />
                  </div>
                  <div className="mt-2 truncate text-[12.5px] text-white">{o.name}</div>
                  <div className="truncate font-mono text-[10px] text-white/40">{o.ids[0]} Â· {o.category}</div>
                </Link>
              ))}
            </div>
          </Panel>
        </RevealInView>
        <RevealInView delay={0.1}>
          <Panel className="h-full p-5">
            <PanelHeader title="Community progress" meta={stats ? `${stats.totals.users} members` : ""} />
            <div className="mt-4 space-y-3">
              {posts.data?.posts.length === 0 && (
                <p className="rounded-xl border border-dashed border-white/10 p-4 text-[12px] text-white/45">
                  No threads yet. <Link href="/community" className="text-white/70 underline">Start the first conversation</Link>.
                </p>
              )}
              {posts.data?.posts.map((p) => (
                <Link key={p.id} href="/community" className="flex items-start gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] p-3 transition hover:border-white/15">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-[10.5px] uppercase text-white">{p.author.slice(0, 2)}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] text-white">{p.title}</span>
                    <span className="mt-0.5 block text-[10.5px] text-white/40">
                      {p.author} Â· {timeAgo(p.created_at)}{p.tile_order !== null ? ` Â· SPX-${p.tile_order}-${p.tile_ipix}` : ""}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/[0.06] pt-4">
              {user && me ? (
                <>
                  <MiniStat k="Your rank" v={me.rank} />
                  <MiniStat k="Verified" v={String(me.verified)} />
                  <MiniStat k="XP" v={String(me.xp)} />
                </>
              ) : (
                <>
                  <MiniStat k="Verified finds" v={String(stats?.totals.verified ?? 0)} />
                  <MiniStat k="In review" v={String(stats?.totals.pendingReviews ?? 0)} />
                  <button onClick={() => signIn("register")} className="text-left text-[12px] text-signal hover:underline">Join â†’</button>
                </>
              )}
            </div>
          </Panel>
        </RevealInView>
      </section>
    </AppShell>
  );
}

function MiniStat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="eyebrow">{k}</div>
      <div className="mt-1 text-[14px] text-white">{v}</div>
    </div>
  );
}

const bento = (stats: StatsResponse | null) => [
  {
    title: "Explore the infrared sky",
    desc: "A Stellarium-grade celestial sphere streaming real DR1 HiPS tiles with a true HEALPix grid, 102-channel switching and live tile inspection.",
    href: "/explore",
    icon: Compass,
    header: (
      <div className="relative h-full min-h-[8rem] flex-1 overflow-hidden rounded-xl border border-white/[0.06]">
        <TileImage order={2} ipix={ang2pix(2, 266.4, -29)} className="absolute inset-0" gain={1.3} />
        <div className="absolute inset-0 bg-[linear-gradient(transparent_49%,rgba(255,255,255,.12)_50%,transparent_51%),linear-gradient(90deg,transparent_49%,rgba(255,255,255,.12)_50%,transparent_51%)] bg-[size:25%_25%]" />
      </div>
    ),
  },
  {
    title: "Missions",
    desc: "Guided investigations: brown dwarfs, variables, ices, anomalies and the Planet Nine coverage campaign.",
    href: "/missions",
    icon: Rocket,
    header: <BentoStat a={String(MISSIONS.length)} b="missions" c={stats ? `${stats.totals.submissions} submissions Â· ${stats.totals.verified} verified` : "loadingâ€¦"} />,
  },
  {
    title: "Spectral Scout AI",
    desc: "Your custom ONNX model weighs all 102 channels on real L2 cutouts, picks the best viewing channel and scores anomalies and motion â€” evidence, not verdicts.",
    href: "/ai/engine",
    icon: Brain,
    header: <BentoStat a="102" b="channels weighed per run" c={stats ? `scout-2.0.0 Â· ${stats.totals.scoutRuns} runs so far` : "scout-2.0.0 Â· ONNX"} />,
  },
  {
    title: "Discovery atlas",
    desc: "Every object gets a page with its real SPHEREx tile, calibrated spectrum pulled from the DR1 cube, and community investigations.",
    href: "/discoveries",
    icon: Sparkles,
    header: (
      <div className="grid h-full min-h-[8rem] flex-1 grid-cols-4 gap-2">
        {OBJECTS.slice(4, 8).map((o) => (
          <div key={o.slug} className="relative overflow-hidden rounded-xl border border-white/[0.06]">
            <TileImage order={4} ipix={ang2pix(4, o.ra, o.dec)} className="absolute inset-0" />
          </div>
        ))}
      </div>
    ),
  },
  { title: "Community", desc: "Claim regions, peer-review evidence and build a reproducible contribution record.", href: "/community", icon: Users, header: <BentoStat a={String(stats?.totals.users ?? "â€“")} b="members" c={stats ? `${stats.totals.posts} threads Â· ${stats.totals.pendingReviews} awaiting review` : "loadingâ€¦"} /> },
  { title: "My Lab", desc: "Saved regions, model runs, submissions and exportable results.", href: "/lab", icon: FlaskConical, header: <BentoStat a="JSON" b="exportable provenance" c="saved Â· runs Â· submissions" /> },
  { title: "Learn the Universe", desc: "Interactive modules built on live data â€” from infrared vision to scientific verification.", href: "/learn", icon: GraduationCap, header: <BentoStat a="9" b="interactive modules" c="102 colours Â· spectra Â· noise" /> },
  { title: "Planet Nine Control", desc: "Test predicted positions against real SPHEREx footprints: coverage, then detectability.", href: "/missions/planet-nine", icon: Radar, header: <BentoStat a="P9" b="coverage campaign" c={stats ? `${stats.missions["planet-nine"]?.claims ?? 0} tiles claimed` : "research challenge"} /> },
  { title: "Science data", desc: "FITS IMAGE, NHITS and FLAGS planes read straight from IRSA with byte-range requests.", href: "/region/5/445#science", icon: Boxes, header: <BentoStat a="320 MB" b="per cube, ~1 MB read" c="IMAGE Â· NHITS Â· FLAGS" /> },
];

function BentoStat({ a, b, c }: { a: string; b: string; c: string }) {
  return (
    <div className="relative flex h-full min-h-[8rem] flex-1 flex-col justify-end overflow-hidden rounded-xl border border-white/[0.06] bg-[radial-gradient(circle_at_80%_20%,oklch(0.89_0.11_155/0.12),transparent_60%)] p-4">
      <div className="display text-[34px] font-extralight text-white">{a}</div>
      <div className="text-[11px] uppercase tracking-[0.14em] text-white/50">{b}</div>
      <div className="mt-1 font-mono text-[10px] text-white/35">{c}</div>
      <Chip className="absolute right-3 top-3">open</Chip>
    </div>
  );
}


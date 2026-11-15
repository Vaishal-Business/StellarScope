"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Award, CheckCircle2, Clock, Crown, Medal, Users } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Reveal, RevealInView } from "@/components/motion/reveal";
import { TileImage } from "@/components/sky/tile-image";
import { Btn, Chip, Panel, PanelHeader, Progress, SectionTitle } from "@/components/ui/kit";
import { MISSIONS, type Difficulty } from "@/lib/missions";
import { useStats } from "@/lib/live";
import { useSession } from "@/lib/session";
import { ang2pix } from "@/sky/healpix";
import { cn } from "@/lib/utils";

const RANKS = ["Explorer", "Observer", "Analyst", "Investigator", "Discovery Contributor"];
const FILTERS: ("All" | Difficulty)[] = ["All", "Beginner", "Intermediate", "Advanced", "Research"];
const toneFor = (d: Difficulty) => (d === "Beginner" ? "signal" : d === "Intermediate" ? "info" : d === "Advanced" ? "warn" : "danger") as "signal" | "info" | "warn" | "danger";
const missionHref = (slug: string) => (slug === "planet-nine" ? "/missions/planet-nine" : `/missions/${slug}`);

export function MissionsView() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const { data: stats } = useStats();
  const { user, stats: me, signIn } = useSession();
  const active = MISSIONS[0];
  const list = MISSIONS.filter((m) => filter === "All" || m.difficulty === filter);
  const ms = (slug: string) => stats?.missions[slug];

  return (
    <AppShell>
      <div className="px-5 md:px-8">
        <Reveal delay={0.1}>
          <SectionTitle eyebrow="Mission control" title="Real investigations, organised like quests" desc="Every mission gives you a real SPHEREx region, teaches the concepts, and turns your evidence into a submission other contributors can independently verify." />
        </Reveal>

        <Reveal delay={0.2} className="mt-8">
          <Panel strong className="grid overflow-hidden p-0 lg:grid-cols-[1.1fr_1fr]">
            <div className="relative min-h-[320px]">
              <TileImage order={4} ipix={ang2pix(4, active.target.ra, active.target.dec)} className="absolute inset-0" gain={1.3} />
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-[oklch(0.14_0.004_260)]" />
              <div className="absolute left-5 top-5 flex gap-2">
                <Chip tone="signal" dot>Start here</Chip>
                <Chip>{active.difficulty} · {active.duration}</Chip>
              </div>
              <div className="absolute bottom-4 left-5 font-mono text-[10px] text-white/60">{active.target.label} · SPX-4-{ang2pix(4, active.target.ra, active.target.dec)}</div>
            </div>
            <div className="p-6 md:p-8">
              <div className="eyebrow text-signal/80">{active.kind}</div>
              <h2 className="display mt-2 text-[32px] font-extralight text-white">{active.title}</h2>
              <p className="mt-3 text-[13.5px] leading-relaxed text-white/60">{active.briefing}</p>
              <div className="mt-5 space-y-2">
                {active.objectives.map((o, i) => (
                  <div key={o} className="flex items-center gap-3 text-[12.5px] text-white/75">
                    <span className="flex size-5 items-center justify-center rounded-full border border-white/15 font-mono text-[9.5px] text-white/50">{i + 1}</span>
                    {o}
                  </div>
                ))}
              </div>
              <div className="mt-6 flex items-center justify-between gap-4">
                <span className="font-mono text-[11px] text-white/45">
                  {ms(active.slug) ? `${ms(active.slug)!.participants} participants · ${ms(active.slug)!.submissions} submissions` : "loading…"}
                </span>
                <Btn variant="primary" href={missionHref(active.slug)}>
                  Start mission <ArrowUpRight className="size-3.5" />
                </Btn>
              </div>
            </div>
          </Panel>
        </Reveal>

        <Reveal delay={0.3} className="mt-12 flex flex-wrap items-center justify-between gap-4">
          <div className="glass flex items-center gap-0.5 rounded-full p-1">
            {FILTERS.map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={cn("rounded-full px-4 py-1.5 text-[12px] transition", filter === f ? "bg-white text-black" : "text-white/55 hover:text-white")}>
                {f}
              </button>
            ))}
          </div>
          <span className="font-mono text-[11px] text-white/40">{list.length} missions</span>
        </Reveal>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((m, i) => {
            const s = ms(m.slug);
            return (
              <RevealInView key={m.slug} delay={i * 0.05}>
                <Link href={missionHref(m.slug)} className="glass group block overflow-hidden rounded-[22px] transition hover:border-white/20">
                  <div className="relative h-44">
                    <TileImage order={m.target.order === 3 ? 3 : 4} ipix={ang2pix(m.target.order === 3 ? 3 : 4, m.target.ra, m.target.dec)} className="absolute inset-0 transition-transform duration-[1.6s] group-hover:scale-105" gain={1.25} />
                    <div className="absolute inset-0 bg-gradient-to-t from-[oklch(0.15_0.004_260)] to-transparent" />
                    <div className="absolute left-4 top-4">
                      <Chip tone={toneFor(m.difficulty)}>{m.difficulty}</Chip>
                    </div>
                  </div>
                  <div className="p-5">
                    <div className="eyebrow">{m.kind}</div>
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <h3 className="text-[16px] text-white">{m.title}</h3>
                      <ArrowUpRight className="size-4 text-white/30 transition group-hover:text-white" />
                    </div>
                    <p className="mt-2 line-clamp-2 text-[12.5px] leading-relaxed text-white/50">{m.summary}</p>
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {m.skills.map((sk) => (
                        <span key={sk} className="rounded-full border border-white/10 px-2 py-0.5 text-[10.5px] text-white/55">{sk}</span>
                      ))}
                    </div>
                    <div className="mt-4 flex items-center gap-4 font-mono text-[10.5px] text-white/45">
                      <span className="flex items-center gap-1"><Clock className="size-3" /> {m.duration}</span>
                      <span className="flex items-center gap-1"><Users className="size-3" /> {s?.participants ?? "–"}</span>
                      <span className="ml-auto text-signal">+{m.xp} XP</span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 border-t border-white/[0.05] pt-3 font-mono text-[10px] text-white/45">
                      <span>{s?.submissions ?? 0} submitted</span>
                      <span>{s?.verified ?? 0} verified</span>
                      <span>{s?.claims ?? 0} claimed</span>
                    </div>
                  </div>
                </Link>
              </RevealInView>
            );
          })}
        </div>

        <div className="mt-14 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <RevealInView>
            <Panel className="h-full p-6">
              <PanelHeader title="Your progression" />
              {user && me ? (
                <>
                  <div className="mt-5 flex items-center gap-1">
                    {RANKS.map((r, i) => {
                      const cur = RANKS.indexOf(me.rank);
                      return (
                        <div key={r} className="flex-1">
                          <div className={cn("h-1 rounded-full", i < cur ? "bg-signal" : i === cur ? "bg-gradient-to-r from-signal to-white/10" : "bg-white/10")} />
                          <div className={cn("mt-2 text-[10.5px]", i === cur ? "text-signal" : i < cur ? "text-white/70" : "text-white/35")}>{r}</div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-6 grid grid-cols-3 gap-4">
                    <div>
                      <div className="eyebrow">XP</div>
                      <div className="mt-1 text-[24px] font-light text-white">{me.xp.toLocaleString()}</div>
                      <div className="text-[11px] text-white/40">{me.nextXp ? `${(me.nextXp - me.xp).toLocaleString()} to ${me.nextRank}` : "top rank"}</div>
                    </div>
                    <div>
                      <div className="eyebrow">Verified</div>
                      <div className="mt-1 text-[24px] font-light text-white">{me.verified}</div>
                      <div className="text-[11px] text-white/40">of {me.submissions} submissions</div>
                    </div>
                    <div>
                      <div className="eyebrow">Reviews</div>
                      <div className="mt-1 text-[24px] font-light text-white">{me.reviews}</div>
                      <div className="text-[11px] text-white/40">independent checks</div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-white/[0.07] p-4">
                  <p className="text-[12.5px] text-white/55">Sign in to track XP, ranks and verified contributions.</p>
                  <Btn size="sm" variant="primary" onClick={() => signIn("register")}>Create account</Btn>
                </div>
              )}
              <div className="mt-6 grid grid-cols-2 gap-2 md:grid-cols-3">
                {[
                  ["Post in the community", "+10 XP"],
                  ["Run Spectral Scout", "+15 XP"],
                  ["Review someone's submission", "+40 XP"],
                  ["Submit evidence", "+60 XP"],
                  ["Submission verified by 2 peers", "+200 XP"],
                  ["Reply with help", "+5 XP"],
                ].map(([a, r]) => (
                  <div key={a} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                    <Award className="size-4 text-white/40" />
                    <div className="mt-2 text-[11.5px] text-white/80">{a}</div>
                    <div className="text-[10px] text-signal/80">{r}</div>
                  </div>
                ))}
              </div>
            </Panel>
          </RevealInView>
          <RevealInView delay={0.08}>
            <Panel className="h-full p-6">
              <PanelHeader title="Leaderboard · verified contributions" />
              <p className="mt-1 text-[11px] text-white/40">Ranked by peer-verified work, then reviews — not by tiles clicked.</p>
              <div className="mt-4 space-y-1.5">
                {stats && stats.leaderboard.length === 0 && <p className="rounded-xl border border-dashed border-white/10 p-4 text-[12px] text-white/45">No contributions yet. Complete a mission to appear here.</p>}
                {stats?.leaderboard.map((l, i) => (
                  <div key={l.name + i} className={cn("flex items-center gap-3 rounded-xl border px-3 py-2.5", user && l.name === user.display_name ? "border-signal/30 bg-signal/[0.06]" : "border-white/[0.05]")}>
                    <span className="w-5 font-mono text-[11px] text-white/45">{i === 0 ? <Crown className="size-3.5 text-warn" /> : i < 3 ? <Medal className="size-3.5 text-white/60" /> : i + 1}</span>
                    <span className="flex size-7 items-center justify-center rounded-full bg-white/[0.07] text-[10px] uppercase text-white">{l.name.slice(0, 2)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] text-white">{l.name}</span>
                      <span className="block text-[10px] text-white/40">{l.rank}</span>
                    </span>
                    <span className="text-right font-mono text-[11px]">
                      <span className="block text-white"><CheckCircle2 className="mr-1 inline size-3 text-signal" />{l.verified}</span>
                      <span className="block text-[9.5px] text-white/40">{l.reviews} reviews · {l.xp} XP</span>
                    </span>
                  </div>
                ))}
              </div>
            </Panel>
          </RevealInView>
        </div>
      </div>
    </AppShell>
  );
}

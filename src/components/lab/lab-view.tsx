"use client";

import Link from "next/link";
import { BookMarked, Brain, Download, FileJson, LogIn, Rocket, ShieldCheck, Target } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Reveal, RevealInView } from "@/components/motion/reveal";
import { TileImage } from "@/components/sky/tile-image";
import { Btn, Chip, Panel, PanelHeader, Progress, SectionTitle, Stat } from "@/components/ui/kit";
import { useSession } from "@/lib/session";
import { useLive, timeAgo } from "@/lib/live";
import { MISSIONS, missionBySlug } from "@/lib/missions";
import { OBJECTS } from "@/lib/objects";
import { ang2pix } from "@/sky/healpix";
import { cn } from "@/lib/utils";

interface Me {
  saved: { kind: string; ref: string; label: string; created_at: number }[];
  progress: { mission_slug: string; stage: number; objectives_json: string; updated_at: number }[];
  claims: { tile_order: number; tile_ipix: number; mission_slug: string; expires_at: number }[];
}
interface Sub { id: number; mission_slug: string; tile_order: number; tile_ipix: number; interpretation: string; status: string; verifies: number; challenges: number; created_at: number; reasoning: string; evidence_json: string }
interface Run { id: number; tile_order: number; tile_ipix: number; tile5: number; ra: number; dec: number; summary_json: string; created_at: number; track_flag: number; anomaly_flag: number; incomplete: number }

function download(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function LabView() {
  const { user, stats, signIn, loading } = useSession();
  const me = useLive<Me>(user ? "/api/me" : null, [user?.id]);
  const subs = useLive<{ submissions: Sub[] }>(user ? "/api/submissions?mine=1" : null, [user?.id]);
  const runs = useLive<{ runs: Run[] }>(user ? "/api/scout/runs?mine=1" : null, [user?.id]);

  if (!loading && !user)
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl px-5 py-16 text-center md:px-8">
          <Reveal delay={0.1}>
            <div className="eyebrow text-signal/80">My Lab</div>
            <h1 className="display mt-3 text-[38px] font-extralight text-white">Your personal research workspace</h1>
            <p className="mt-3 text-[14px] text-white/55">Saved regions, Spectral Scout runs, mission progress, submissions and their verification history — all kept with full provenance.</p>
            <div className="mt-8 flex justify-center gap-3">
              <Btn variant="primary" onClick={() => signIn("register")}>Create account</Btn>
              <Btn variant="outline" onClick={() => signIn("login")}><LogIn className="size-3.5" /> Sign in</Btn>
            </div>
          </Reveal>
        </div>
      </AppShell>
    );

  const savedTiles = me.data?.saved ?? [];
  return (
    <AppShell>
      <div className="px-5 md:px-8">
        <Reveal delay={0.1} className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex items-center gap-5">
            <span className="flex size-16 items-center justify-center rounded-full bg-gradient-to-br from-white/30 to-white/5 text-[18px] uppercase text-white">{user?.display_name.slice(0, 2)}</span>
            <div>
              <div className="eyebrow text-signal/80">My Lab</div>
              <h1 className="display mt-1 text-[34px] font-extralight text-white">{user?.display_name}</h1>
              <div className="mt-1 flex items-center gap-2"><Chip tone="signal">{stats?.rank}</Chip><span className="font-mono text-[11px] text-white/40">@{user?.username}</span></div>
            </div>
          </div>
          <Btn
            variant="outline"
            onClick={() => download(`spherex-explorer-${user?.username}.json`, { exportedAt: new Date().toISOString(), user: { username: user?.username, display_name: user?.display_name }, stats, saved: me.data?.saved, progress: me.data?.progress, submissions: subs.data?.submissions, spectralScoutRuns: runs.data?.runs })}
          >
            <Download className="size-3.5" /> Export everything (JSON)
          </Btn>
        </Reveal>

        <Reveal delay={0.16} className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Panel className="p-4"><Stat label="Experience" value={(stats?.xp ?? 0).toLocaleString()} sub={stats?.nextXp ? `${(stats.nextXp - stats.xp).toLocaleString()} XP to ${stats.nextRank}` : "top rank"} /></Panel>
          <Panel className="p-4"><Stat label="Verified contributions" value={stats?.verified ?? 0} sub={`${stats?.submissions ?? 0} submitted`} /></Panel>
          <Panel className="p-4"><Stat label="Reviews given" value={stats?.reviews ?? 0} sub="independent checks" /></Panel>
          <Panel className="p-4"><Stat label="Spectral Scout runs" value={stats?.scouts ?? 0} sub={`${savedTiles.length} saved items`} /></Panel>
        </Reveal>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <RevealInView>
            <Panel className="h-full p-5">
              <PanelHeader title={<span className="flex items-center gap-2"><BookMarked className="size-3.5" /> Saved</span>} meta={savedTiles.length} />
              {savedTiles.length === 0 ? (
                <p className="mt-4 text-[12px] text-white/45">Nothing saved yet. Use “Save region to My Lab” on any region page.</p>
              ) : (
                <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
                  {savedTiles.map((s) => {
                    const [o, i] = s.kind === "tile" ? s.ref.split("/").map(Number) : [4, (() => { const ob = OBJECTS.find((x) => x.slug === s.ref); return ob ? ang2pix(4, ob.ra, ob.dec) : 0; })()];
                    return (
                      <Link key={s.kind + s.ref} href={s.kind === "tile" ? `/region/${o}/${i}` : `/discoveries/${s.ref}`} className="group">
                        <TileImage order={o} ipix={i} className="aspect-video rounded-xl border border-white/[0.06]" gain={1.2} />
                        <div className="mt-2 truncate text-[12.5px] text-white">{s.label}</div>
                        <div className="font-mono text-[10px] text-white/40">{timeAgo(s.created_at)}</div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </Panel>
          </RevealInView>

          <RevealInView delay={0.05}>
            <Panel className="h-full p-5">
              <PanelHeader title={<span className="flex items-center gap-2"><Brain className="size-3.5" /> Spectral Scout runs</span>} meta={runs.data?.runs.length ?? 0} />
              {runs.data?.runs.length === 0 && <p className="mt-4 text-[12px] text-white/45">No runs yet. Open any tile&apos;s Scout tab or the AI Engine page.</p>}
              <div className="mt-4 space-y-2">
                {runs.data?.runs.map((r) => {
                  const s = JSON.parse(r.summary_json) as { bestWavelengthUm?: number; anomalyGlobal?: number; trackProb?: number };
                  return (
                    <Link key={r.id} href={`/ai/engine?tile=${r.tile_order}/${r.tile_ipix}`} className="flex items-center gap-3 rounded-xl border border-white/[0.06] p-2.5 hover:border-white/20">
                      <TileImage order={5} ipix={r.tile5} className="size-11 shrink-0 rounded-lg" gain={1.3} />
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-[11.5px] text-white">SPX-5-{r.tile5}</div>
                        <div className="text-[10.5px] text-white/45">best {s.bestWavelengthUm?.toFixed(2)} µm · anomaly {s.anomalyGlobal?.toFixed(2)} · track {s.trackProb?.toFixed(2)}</div>
                      </div>
                      {r.incomplete ? <Chip tone="warn">incomplete</Chip> : r.anomaly_flag || r.track_flag ? <Chip tone="warn">candidate</Chip> : <Chip tone="signal">clear</Chip>}
                    </Link>
                  );
                })}
              </div>
            </Panel>
          </RevealInView>

          <RevealInView delay={0.08}>
            <Panel className="h-full p-5">
              <PanelHeader title={<span className="flex items-center gap-2"><ShieldCheck className="size-3.5" /> Submissions</span>} meta={subs.data?.submissions.length ?? 0} />
              {subs.data?.submissions.length === 0 && <p className="mt-4 text-[12px] text-white/45">No submissions yet. Missions end with a reviewable submission.</p>}
              <div className="mt-4 space-y-2">
                {subs.data?.submissions.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 rounded-xl border border-white/[0.06] px-3 py-2.5">
                    <span className={cn("size-2 rounded-full", s.status === "verified" ? "bg-signal" : s.status === "challenged" ? "bg-warn" : "bg-info")} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12.5px] text-white">{s.interpretation} · SPX-{s.tile_order}-{s.tile_ipix}</div>
                      <div className="text-[10.5px] text-white/40">{missionBySlug(s.mission_slug)?.title} · {timeAgo(s.created_at)} · {s.verifies}✓ {s.challenges}✗</div>
                    </div>
                    <Chip tone={s.status === "verified" ? "signal" : s.status === "challenged" ? "warn" : "info"}>{s.status}</Chip>
                  </div>
                ))}
              </div>
            </Panel>
          </RevealInView>

          <RevealInView delay={0.1}>
            <Panel className="h-full p-5">
              <PanelHeader title={<span className="flex items-center gap-2"><Rocket className="size-3.5" /> Missions & claims</span>} />
              {me.data?.progress.length === 0 && me.data?.claims.length === 0 && <p className="mt-4 text-[12px] text-white/45">Start a mission to track progress here.</p>}
              <div className="mt-4 space-y-3">
                {me.data?.progress.map((p) => {
                  const m = missionBySlug(p.mission_slug);
                  const obj = JSON.parse(p.objectives_json) as boolean[];
                  const pct = m ? (obj.filter(Boolean).length / m.objectives.length) * 100 : 0;
                  return (
                    <Link key={p.mission_slug} href={`/missions/${p.mission_slug}`} className="block">
                      <div className="flex justify-between text-[12.5px]"><span className="text-white">{m?.title ?? p.mission_slug}</span><span className="font-mono text-[10px] text-white/45">stage {p.stage + 1}/7 · {Math.round(pct)}%</span></div>
                      <Progress value={Math.max(3, pct)} className="mt-1.5" />
                    </Link>
                  );
                })}
                {me.data?.claims.map((c) => (
                  <div key={`${c.tile_order}/${c.tile_ipix}/${c.mission_slug}`} className="flex items-center gap-2 font-mono text-[11px] text-white/60">
                    <Target className="size-3.5 text-violet-300" /> SPX-{c.tile_order}-{c.tile_ipix} · {c.mission_slug} · expires {timeAgo(c.expires_at).replace(" ago", "")}
                  </div>
                ))}
              </div>
              <div className="mt-5 border-t border-white/[0.06] pt-4">
                <div className="eyebrow mb-2">Available missions</div>
                <div className="flex flex-wrap gap-1.5">
                  {MISSIONS.map((m) => (
                    <Link key={m.slug} href={m.slug === "planet-nine" ? "/missions/planet-nine" : `/missions/${m.slug}`} className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-white/60 hover:text-white">{m.title}</Link>
                  ))}
                </div>
              </div>
            </Panel>
          </RevealInView>
        </div>
        <RevealInView className="mt-4">
          <Panel className="flex flex-wrap items-center justify-between gap-3 p-4">
            <span className="flex items-center gap-2 text-[12.5px] text-white/65"><FileJson className="size-4 text-signal" /> Exports include data release, tile, pixel, model version and reviewer history for every item.</span>
            <div className="flex gap-2">
              <Btn size="sm" variant="outline" onClick={() => download("submissions.json", subs.data?.submissions ?? [])}>Submissions</Btn>
              <Btn size="sm" variant="outline" onClick={() => download("spectral-scout-runs.json", runs.data?.runs ?? [])}>Scout runs</Btn>
            </div>
          </Panel>
        </RevealInView>
      </div>
    </AppShell>
  );
}

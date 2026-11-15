"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { ArrowBigUp, CheckCircle2, ExternalLink, Flag, Loader2, MessageSquare, Plus, ShieldCheck, Swords, X } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Reveal, RevealInView } from "@/components/motion/reveal";
import { TileImage } from "@/components/sky/tile-image";
import { Btn, Chip, Panel, PanelHeader, SectionTitle } from "@/components/ui/kit";
import { ROOMS, MISSIONS } from "@/lib/missions";
import { useLive, useStats, timeAgo } from "@/lib/live";
import { api, useSession } from "@/lib/session";
import { describeTile } from "@/sky/spherex";
import { cn } from "@/lib/utils";

interface Post {
  id: number; room: string; kind: string; title: string; body: string; tile_order: number | null; tile_ipix: number | null;
  submission_id: number | null; created_at: number; author: string; votes: number; replies: number; my_vote: number; submission_status: string | null;
}
interface Sub {
  id: number; mission_slug: string; tile_order: number; tile_ipix: number; interpretation: string; confidence: number; reasoning: string;
  evidence_json: string; status: string; created_at: number; author: string; verifies: number; challenges: number; my_verdict: string | null;
}

const TABS = ["Feed", "Review queue", "All submissions"] as const;

export function CommunityView() {
  const { user, signIn } = useSession();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Feed");
  const [room, setRoom] = useState("global");
  const [tileCtx, setTileCtx] = useState<{ order: number; ipix: number } | null>(null);
  const [composer, setComposer] = useState(false);
  const posts = useLive<{ posts: Post[] }>(`/api/posts?room=${room}`, [room]);
  const queue = useLive<{ submissions: Sub[] }>(user ? "/api/submissions?reviewable=1" : null, [user?.id]);
  const allSubs = useLive<{ submissions: Sub[] }>("/api/submissions");
  const { data: stats, reload: reloadStats } = useStats();

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tile");
    if (t) {
      const [o, i] = t.split("/").map(Number);
      if (Number.isInteger(o) && Number.isInteger(i) && o >= 0 && o <= 5) {
        setTileCtx({ order: o, ipix: i });
        setComposer(true);
      }
    }
  }, []);

  const vote = async (p: Post) => {
    if (!user) return signIn("login");
    await api(`/api/posts/${p.id}`, { json: { action: "vote" } }).catch(() => {});
    posts.reload();
  };

  return (
    <AppShell>
      <div className="px-5 md:px-8">
        <Reveal delay={0.1}>
          <SectionTitle
            eyebrow="Community"
            title="Where investigations are organised"
            desc="Threads link to real tiles and submissions, so conversations stay scientifically useful. Everything here was written by people using the platform."
            right={
              <Btn variant="primary" onClick={() => (user ? setComposer(true) : signIn("login"))}>
                <Plus className="size-3.5" /> New thread
              </Btn>
            }
          />
        </Reveal>

        <AnimatePresence>
          {composer && user && (
            <Composer
              room={room === "global" ? "global" : room}
              tile={tileCtx}
              onClose={() => setComposer(false)}
              onPosted={() => {
                setComposer(false);
                posts.reload();
                reloadStats();
              }}
            />
          )}
        </AnimatePresence>

        <div className="mt-8 grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)_300px]">
          <Reveal delay={0.18}>
            <Panel className="p-3 lg:sticky lg:top-6">
              <div className="eyebrow px-2 py-1.5">Rooms</div>
              {ROOMS.map((r) => (
                <button key={r.id} onClick={() => { setRoom(r.id); setTab("Feed"); }} className={cn("flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[12.5px] transition", room === r.id ? "bg-white/[0.08] text-white" : "text-white/55 hover:text-white")}>
                  <span># {r.id}</span>
                </button>
              ))}
            </Panel>
          </Reveal>

          <div className="min-w-0">
            <Reveal delay={0.22} className="glass inline-flex items-center gap-0.5 rounded-full p-1">
              {TABS.map((t) => (
                <button key={t} onClick={() => setTab(t)} className={cn("rounded-full px-4 py-1.5 text-[12px] transition", tab === t ? "bg-white text-black" : "text-white/55 hover:text-white")}>
                  {t}
                  {t === "Review queue" && queue.data && queue.data.submissions.length > 0 && <span className="ml-1.5 rounded-full bg-signal/20 px-1.5 font-mono text-[9.5px] text-signal">{queue.data.submissions.length}</span>}
                </button>
              ))}
            </Reveal>

            <AnimatePresence mode="wait">
              <motion.div key={tab + room} initial={{ opacity: 0, x: -16, filter: "blur(8px)" }} animate={{ opacity: 1, x: 0, filter: "blur(0px)" }} exit={{ opacity: 0 }} transition={{ duration: 0.45 }} className="mt-5 space-y-3">
                {tab === "Feed" && (
                  <>
                    {posts.loading && !posts.data && <div className="flex items-center gap-2 text-[12px] text-white/45"><Loader2 className="size-3.5 animate-spin" /> Loading threads…</div>}
                    {posts.data?.posts.length === 0 && (
                      <Empty title="No threads in this room yet" body="Start the first conversation — link it to a tile so others can open exactly what you're looking at." action={<Btn size="sm" variant="outline" onClick={() => (user ? setComposer(true) : signIn("login"))}>Start a thread</Btn>} />
                    )}
                    {posts.data?.posts.map((p) => <PostCard key={p.id} p={p} onVote={() => vote(p)} onChanged={posts.reload} />)}
                  </>
                )}
                {tab === "Review queue" &&
                  (!user ? (
                    <Empty title="Sign in to review" body="Peer review is how candidates become verified contributions. You can't review your own submissions." action={<Btn size="sm" variant="primary" onClick={() => signIn("login")}>Sign in</Btn>} />
                  ) : queue.data?.submissions.length === 0 ? (
                    <Empty title="Nothing waiting for review" body="When other contributors submit mission findings, they'll appear here for independent verification." />
                  ) : (
                    queue.data?.submissions.map((s) => <ReviewCard key={s.id} s={s} onDone={() => { queue.reload(); allSubs.reload(); reloadStats(); }} />)
                  ))}
                {tab === "All submissions" &&
                  (allSubs.data?.submissions.length === 0 ? (
                    <Empty title="No submissions yet" body="Complete a mission to submit the first finding." action={<Btn size="sm" variant="outline" href="/missions">Browse missions</Btn>} />
                  ) : (
                    allSubs.data?.submissions.map((s) => <SubRow key={s.id} s={s} />)
                  ))}
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="space-y-4">
            <RevealInView>
              <Panel className="p-4">
                <PanelHeader title="Live research activity" />
                <div className="mt-3 space-y-2.5 text-[11.5px]">
                  {stats?.activity.length === 0 && <p className="text-white/40">No activity yet.</p>}
                  {stats?.activity.map((a, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-signal" />
                      <span className="min-w-0 flex-1">
                        <span className="text-white/85">{a.who}</span> <span className="text-white/45">{a.type === "post" ? "posted" : a.type === "review" ? "reviewed" : a.type === "scout" ? "ran Spectral Scout" : "claimed"}</span>
                        <span className="block truncate text-white/55">{a.what}</span>
                      </span>
                      <span className="shrink-0 font-mono text-[9.5px] text-white/35">{timeAgo(a.t)}</span>
                    </div>
                  ))}
                </div>
              </Panel>
            </RevealInView>
            <RevealInView delay={0.05}>
              <Panel className="p-4">
                <PanelHeader title="Top contributors" />
                <div className="mt-3 space-y-2">
                  {stats?.leaderboard.length === 0 && <p className="text-[11.5px] text-white/40">Be the first on the board.</p>}
                  {stats?.leaderboard.slice(0, 5).map((l, i) => (
                    <div key={l.name + i} className="flex items-center gap-2.5">
                      <span className="w-4 font-mono text-[10.5px] text-white/40">{i + 1}</span>
                      <span className="flex size-7 items-center justify-center rounded-full bg-white/[0.07] text-[10px] uppercase text-white">{l.name.slice(0, 2)}</span>
                      <span className="flex-1 truncate text-[12px] text-white">{l.name}</span>
                      <span className="font-mono text-[10.5px] text-white/60">{l.verified}✓ · {l.reviews}r</span>
                    </div>
                  ))}
                </div>
              </Panel>
            </RevealInView>
            <RevealInView delay={0.1}>
              <Panel className="p-4">
                <PanelHeader title="Campaigns" />
                <div className="mt-3 space-y-2.5">
                  {MISSIONS.map((m) => {
                    const s = stats?.missions[m.slug];
                    return (
                      <Link key={m.slug} href={m.slug === "planet-nine" ? "/missions/planet-nine" : `/missions/${m.slug}`} className="flex items-center justify-between text-[12px] text-white/75 hover:text-white">
                        <span className="truncate">{m.kind}</span>
                        <span className="font-mono text-[10px] text-white/45">{s ? `${s.submissions} sub · ${s.verified} ✓` : "–"}</span>
                      </Link>
                    );
                  })}
                </div>
              </Panel>
            </RevealInView>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Empty({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-[22px] border border-dashed border-white/10 p-8 text-center">
      <div className="text-[14px] text-white">{title}</div>
      <p className="mx-auto mt-1.5 max-w-md text-[12px] text-white/45">{body}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

function Composer({ room, tile, onClose, onPosted }: { room: string; tile: { order: number; ipix: number } | null; onClose: () => void; onPosted: () => void }) {
  const [r, setR] = useState(room);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [attach, setAttach] = useState(!!tile);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const post = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api("/api/posts", { json: { room: r, title, body, tile_order: attach && tile ? tile.order : null, tile_ipix: attach && tile ? tile.ipix : null } });
      onPosted();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <motion.div initial={{ opacity: 0, y: -8, filter: "blur(8px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -6 }} className="glass-strong mt-6 rounded-[22px] p-5">
      <div className="flex items-center justify-between">
        <span className="eyebrow text-white/70">New thread</span>
        <button onClick={onClose} className="text-white/40 hover:text-white" aria-label="Close"><X className="size-4" /></button>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-[200px_1fr]">
        <select value={r} onChange={(e) => setR(e.target.value)} className="h-10 rounded-xl border border-white/10 bg-black/40 px-3 text-[12.5px] text-white outline-none">
          {ROOMS.map((x) => <option key={x.id} value={x.id}>#{x.id}</option>)}
        </select>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="h-10 rounded-xl border border-white/10 bg-black/30 px-3 text-[13px] text-white outline-none placeholder:text-white/30 focus:border-white/30" />
      </div>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="What are you looking at? Mention channels, epochs and what you've checked." className="mt-3 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-[13px] text-white outline-none placeholder:text-white/25 focus:border-white/30" />
      {tile && (
        <label className="mt-2 flex items-center gap-2 text-[12px] text-white/65">
          <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} /> Link tile {describeTile(tile.order, tile.ipix).id}
        </label>
      )}
      {err && <p className="mt-2 text-[12px] text-destructive">{err}</p>}
      <div className="mt-3 flex justify-end">
        <Btn variant="primary" size="sm" onClick={post} disabled={busy}>{busy && <Loader2 className="size-3.5 animate-spin" />} Post</Btn>
      </div>
    </motion.div>
  );
}

function PostCard({ p, onVote, onChanged }: { p: Post; onVote: () => void; onChanged: () => void }) {
  const { user, signIn } = useSession();
  const [open, setOpen] = useState(false);
  const [replies, setReplies] = useState<{ id: number; body: string; author: string; created_at: number }[] | null>(null);
  const [reply, setReply] = useState("");
  const load = () => api<{ replies: typeof replies }>(`/api/posts/${p.id}`).then((r) => setReplies(r.replies)).catch(() => {});
  const send = async () => {
    if (!user) return signIn("login");
    if (!reply.trim()) return;
    await api(`/api/posts/${p.id}`, { json: { action: "reply", body: reply } }).catch(() => {});
    setReply("");
    load();
    onChanged();
  };
  return (
    <Panel className="flex gap-4 p-4">
      <div className="flex flex-col items-center gap-1">
        <button onClick={onVote} className={cn("flex size-8 items-center justify-center rounded-lg border transition", p.my_vote ? "border-signal/40 bg-signal/15 text-signal" : "border-white/10 text-white/50 hover:text-white")} aria-label="Upvote">
          <ArrowBigUp className="size-4" />
        </button>
        <span className="font-mono text-[11px] text-white/70">{p.votes}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/45">
          <span className="text-white/80">{p.author}</span>
          <span>· {timeAgo(p.created_at)}</span>
          <span>· #{p.room}</span>
          {p.kind === "submission" && <Chip tone={p.submission_status === "verified" ? "signal" : p.submission_status === "challenged" ? "warn" : "info"}>{p.submission_status === "verified" ? <ShieldCheck className="size-3" /> : null}submission · {p.submission_status}</Chip>}
        </div>
        <h3 className="mt-2 text-[15px] text-white">{p.title}</h3>
        <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-white/60">{p.body}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {p.tile_order !== null && p.tile_ipix !== null && (
            <Link href={`/explore?tile=${p.tile_order}/${p.tile_ipix}`} className="flex items-center gap-2 rounded-full border border-white/10 py-0.5 pl-0.5 pr-2.5 font-mono text-[10.5px] text-white/70 hover:border-white/25 hover:text-white">
              <TileImage order={p.tile_order} ipix={p.tile_ipix} className="size-5 rounded-full" />
              SPX-{p.tile_order}-{p.tile_ipix}
            </Link>
          )}
          <button onClick={() => { setOpen((v) => !v); if (!replies) load(); }} className="ml-auto flex items-center gap-1 text-[11px] text-white/45 hover:text-white">
            <MessageSquare className="size-3.5" /> {p.replies} {open ? "· hide" : ""}
          </button>
        </div>
        {open && (
          <div className="mt-3 space-y-2 border-t border-white/[0.06] pt-3">
            {replies?.map((r) => (
              <div key={r.id} className="rounded-xl bg-white/[0.03] px-3 py-2 text-[12px] text-white/70">
                <span className="text-white/85">{r.author}</span> <span className="text-[10px] text-white/35">· {timeAgo(r.created_at)}</span>
                <p className="mt-0.5 whitespace-pre-wrap">{r.body}</p>
              </div>
            ))}
            <div className="flex gap-2">
              <input value={reply} onChange={(e) => setReply(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder={user ? "Reply…" : "Sign in to reply"} className="h-9 flex-1 rounded-full border border-white/10 bg-black/30 px-4 text-[12.5px] text-white outline-none placeholder:text-white/30" />
              <Btn size="sm" variant="outline" onClick={send}>Reply</Btn>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}

function ReviewCard({ s, onDone }: { s: Sub; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const ev = (() => {
    try {
      return JSON.parse(s.evidence_json) as Record<string, unknown>;
    } catch {
      return {};
    }
  })();
  const review = async (verdict: "verify" | "challenge") => {
    setBusy(verdict);
    setErr(null);
    try {
      await api(`/api/submissions/${s.id}/review`, { json: { verdict, note } });
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Panel className="grid gap-4 p-4 md:grid-cols-[110px_1fr]">
      <TileImage order={s.tile_order} ipix={s.tile_ipix} className="aspect-square rounded-xl" gain={1.3} />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><Chip tone="warn">Awaiting review</Chip><span className="text-[11px] text-white/40">{s.author} · {timeAgo(s.created_at)} · {s.verifies}✓ {s.challenges}✗</span></div>
        <h3 className="mt-2 text-[14.5px] text-white">{s.interpretation} · {s.confidence}%</h3>
        <p className="mt-1 whitespace-pre-wrap text-[12px] text-white/60">{s.reasoning}</p>
        <div className="mt-2 font-mono text-[10.5px] text-white/40">
          SPX-{s.tile_order}-{s.tile_ipix} · {String(ev.scienceCube ?? "")} {Array.isArray(ev.pixel) ? `(${(ev.pixel as number[]).join(", ")})` : ""} · {s.mission_slug}
        </div>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Your independent check (required to challenge)" className="mt-3 w-full rounded-xl border border-white/10 bg-black/30 p-2.5 text-[12px] text-white outline-none placeholder:text-white/25" />
        {err && <p className="mt-1 text-[11.5px] text-destructive">{err}</p>}
        <div className="mt-2 flex flex-wrap gap-2">
          <Btn size="sm" variant="signal" onClick={() => review("verify")} disabled={!!busy}>{busy === "verify" ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />} Verify</Btn>
          <Btn size="sm" variant="outline" onClick={() => review("challenge")} disabled={!!busy}>{busy === "challenge" ? <Loader2 className="size-3.5 animate-spin" /> : <Flag className="size-3.5" />} Challenge</Btn>
          <Btn size="sm" variant="ghost" href={`/region/${s.tile_order}/${s.tile_ipix}#science`}><ExternalLink className="size-3.5" /> Inspect data</Btn>
        </div>
      </div>
    </Panel>
  );
}

function SubRow({ s }: { s: Sub }) {
  return (
    <Panel className="flex items-center gap-3 p-3">
      <TileImage order={s.tile_order} ipix={s.tile_ipix} className="size-12 shrink-0 rounded-lg" gain={1.3} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] text-white">{s.interpretation}</div>
        <div className="text-[10.5px] text-white/40">{s.author} · {s.mission_slug} · SPX-{s.tile_order}-{s.tile_ipix} · {timeAgo(s.created_at)}</div>
      </div>
      <Chip tone={s.status === "verified" ? "signal" : s.status === "challenged" ? "warn" : "info"}>{s.status === "verified" ? <ShieldCheck className="size-3" /> : s.status === "challenged" ? <Swords className="size-3" /> : null}{s.status} · {s.verifies}✓</Chip>
    </Panel>
  );
}

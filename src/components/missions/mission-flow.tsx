"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Award, BookOpen, Check, CheckCircle2, Crosshair, FileCheck2, Hourglass, Loader2, Lock, Paperclip, Send, ShieldCheck, Sparkles, Target, XCircle } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Reveal } from "@/components/motion/reveal";
import { TileImage } from "@/components/sky/tile-image";
import { ChannelStrip } from "@/components/explore/spectral-dock";
import { SpectrumChart } from "@/components/sky/spectrum-chart";
import { ScoutPanel } from "@/components/scout/scout-panel";
import { Btn, Chip, KV, LiveTag, Panel, PanelHeader, Progress } from "@/components/ui/kit";
import type { Mission } from "@/lib/missions";
import { ang2pix, pix2ang } from "@/sky/healpix";
import { formatDec, formatRA } from "@/sky/coords";
import { WAVELENGTHS_UM, describeTile, HIPS } from "@/sky/spherex";
import { cubePixel } from "@/lib/objects";
import { useJson, type SpectrumResponse } from "@/lib/hooks";
import { api, useSession } from "@/lib/session";
import type { ScoutResult } from "@/lib/scout-client";
import { cn } from "@/lib/utils";

const STAGES = [
  { key: "briefing", label: "Briefing", icon: BookOpen },
  { key: "tutorial", label: "Tutorial", icon: Sparkles },
  { key: "target", label: "Target", icon: Target },
  { key: "investigate", label: "Investigation", icon: Crosshair },
  { key: "submit", label: "Submission", icon: Send },
  { key: "verify", label: "Verification", icon: ShieldCheck },
  { key: "reward", label: "Reward", icon: Award },
] as const;

const INTERPRETATIONS = ["Red-sloped point source", "Absorption feature", "Emission feature", "Moving source", "Artefact / cosmic ray", "No candidate found", "Uncertain"];

interface Sub {
  id: number;
  status: string;
  verifies: number;
  challenges: number;
  interpretation: string;
  created_at: number;
  tile_order: number;
  tile_ipix: number;
}

export function MissionFlow({ mission }: { mission: Mission }) {
  const { user, signIn, refresh } = useSession();
  const [stage, setStage] = useState(0);
  const [tile, setTile] = useState<{ order: number; ipix: number }>(() => ({ order: 5, ipix: ang2pix(5, mission.target.ra, mission.target.dec) }));
  const [done, setDone] = useState<boolean[]>(mission.objectives.map(() => false));
  const [frame, setFrame] = useState(40);
  const [interp, setInterp] = useState(INTERPRETATIONS[5]);
  const [confidence, setConfidence] = useState(60);
  const [notes, setNotes] = useState("");
  const [claim, setClaim] = useState<{ state: "none" | "mine" | "busy"; msg?: string }>({ state: "none" });
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [submission, setSubmission] = useState<Sub | null>(null);
  const [scout, setScout] = useState<ScoutResult | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("tile");
    if (p) {
      const [o, i] = p.split("/").map(Number);
      if (Number.isInteger(o) && Number.isInteger(i) && o >= 0 && o <= 5 && i >= 0 && i < 12 * 4 ** o) setTile({ order: o, ipix: i });
    }
  }, []);

  // restore saved progress
  useEffect(() => {
    if (!user || loaded.current) return;
    loaded.current = true;
    api<{ progress: { stage: number; objectives_json: string }[]; claims: { tile_order: number; tile_ipix: number; mission_slug: string }[] }>(`/api/me?mission=${mission.slug}`)
      .then((r) => {
        const pr = r.progress[0];
        if (pr) {
          setStage(Math.min(pr.stage, 4));
          const obj = JSON.parse(pr.objectives_json) as boolean[];
          setDone(mission.objectives.map((_, i) => !!obj[i]));
        }
        if (r.claims.some((c) => c.mission_slug === mission.slug && c.tile_order === tile.order && c.tile_ipix === tile.ipix)) setClaim({ state: "mine" });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // persist progress
  useEffect(() => {
    if (!user || !loaded.current) return;
    const id = setTimeout(() => api("/api/me", { json: { action: "progress", mission_slug: mission.slug, stage, objectives: done } }).catch(() => {}), 600);
    return () => clearTimeout(id);
  }, [user, stage, done, mission.slug]);

  // live verification status
  useEffect(() => {
    if (stage < 5 || !submission) return;
    const poll = () =>
      api<{ submissions: Sub[] }>("/api/submissions?mine=1")
        .then((r) => {
          const s = r.submissions.find((x) => x.id === submission.id);
          if (s) setSubmission(s);
        })
        .catch(() => {});
    poll();
    const id = setInterval(poll, 8000);
    return () => clearInterval(id);
  }, [stage, submission?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const info = describeTile(tile.order, tile.ipix);
  const c5 = pix2ang(5, ang2pix(5, info.center.ra, info.center.dec));
  const px = cubePixel(c5.ra, c5.dec);
  const spec = useJson<SpectrumResponse>(stage >= 3 ? `/api/science/${px.tile}/spectrum?x=${px.x}&y=${px.y}` : null);
  const completed = done.filter(Boolean).length;
  const mark = (i: number) => setDone((d) => d.map((v, k) => (k === i ? true : v)));

  const doClaim = async () => {
    if (!user) return signIn("login");
    setClaim({ state: "busy" });
    try {
      const r = await api<{ claimed: boolean }>("/api/me", { json: { action: "claim", mission_slug: mission.slug, tile_order: tile.order, tile_ipix: tile.ipix, release: claim.state === "mine" } });
      setClaim({ state: r.claimed ? "mine" : "none" });
    } catch (e) {
      setClaim({ state: "none", msg: (e as Error).message });
    }
  };

  const submit = async () => {
    if (!user) return signIn("login");
    setSubmitting(true);
    setSubmitErr(null);
    try {
      const evidence = {
        tile: info.id, scienceCube: `Npix${px.tile}_cube.fits`, pixel: [px.x, px.y], channelInspectedUm: WAVELENGTHS_UM[frame], dataRelease: "SPHEREx DR1",
        spectrum: spec.data ? { bunit: spec.data.bunit, flaggedChannels: (spec.data.flags ?? []).filter(Boolean).length } : null,
        spectralScout: scout
          ? { model: scout.card.model_version, bestWavelengthUm: scout.topChannels[0]?.wavelengthUm, anomalyGlobal: scout.outputs.anomaly_global[0], trackProb: scout.outputs.track_prob[0], incomplete: scout.incomplete, planes: scout.input.planes.length }
          : null,
      };
      const r = await api<{ id: number }>("/api/submissions", { json: { mission_slug: mission.slug, tile_order: tile.order, tile_ipix: tile.ipix, interpretation: interp, confidence, reasoning: notes, evidence } });
      setSubmission({ id: r.id, status: "pending", verifies: 0, challenges: 0, interpretation: interp, created_at: Date.now(), tile_order: tile.order, tile_ipix: tile.ipix });
      mark(3);
      setStage(5);
      refresh();
    } catch (e) {
      setSubmitErr((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell>
      <div className="px-5 md:px-8">
        <Reveal delay={0.08} className="flex items-center justify-between gap-4">
          <Link href="/missions" className="flex items-center gap-2 text-[12px] text-white/50 hover:text-white">
            <ArrowLeft className="size-3.5" /> All missions
          </Link>
          <div className="flex items-center gap-2">
            <Chip>{mission.difficulty} · {mission.duration}</Chip>
            <Chip tone="signal">+{mission.xp} XP on verification</Chip>
          </div>
        </Reveal>

        <div className="mt-6 grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <Reveal delay={0.12}>
            <Panel className="p-4 lg:sticky lg:top-6">
              <div className="eyebrow text-signal/80">{mission.kind}</div>
              <h1 className="display mt-2 text-[22px] font-light leading-tight text-white">{mission.title}</h1>
              <div className="mt-5 space-y-1">
                {STAGES.map((s, i) => {
                  const locked = i >= 5 && !submission;
                  return (
                    <button key={s.key} disabled={locked} onClick={() => setStage(i)} className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition disabled:opacity-40", stage === i ? "bg-white/[0.08]" : "hover:bg-white/[0.04]")}>
                      <span className={cn("flex size-7 items-center justify-center rounded-full border", i < stage ? "border-signal/40 bg-signal/15 text-signal" : stage === i ? "border-white/40 text-white" : "border-white/10 text-white/35")}>
                        {i < stage ? <Check className="size-3.5" /> : locked ? <Lock className="size-3" /> : <s.icon className="size-3.5" />}
                      </span>
                      <span className={cn("text-[12.5px]", stage === i ? "text-white" : i < stage ? "text-white/70" : "text-white/40")}>{s.label}</span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-5 border-t border-white/[0.06] pt-4">
                <div className="flex justify-between font-mono text-[10px] text-white/45">
                  <span>Mission completion</span>
                  <span>{completed} / {mission.objectives.length}</span>
                </div>
                <Progress value={(completed / mission.objectives.length) * 100} className="mt-2" />
                {!user && (
                  <button onClick={() => signIn("login")} className="mt-3 text-[11px] text-white/50 underline hover:text-white">
                    Sign in to save progress
                  </button>
                )}
              </div>
            </Panel>
          </Reveal>

          <div className="min-w-0">
            <AnimatePresence mode="wait">
              <motion.div key={stage} initial={{ opacity: 0, x: -24, filter: "blur(10px)" }} animate={{ opacity: 1, x: 0, filter: "blur(0px)" }} exit={{ opacity: 0, x: 16, filter: "blur(6px)" }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
                {stage === 0 && (
                  <Panel strong className="overflow-hidden p-0">
                    <div className="relative h-64">
                      <TileImage order={tile.order} ipix={tile.ipix} className="absolute inset-0" gain={1.3} />
                      <div className="absolute inset-0 bg-gradient-to-t from-[oklch(0.14_0.004_260)] to-transparent" />
                      <div className="absolute bottom-5 left-6"><Chip tone="signal" dot>Mission briefing</Chip></div>
                    </div>
                    <div className="p-6 md:p-8">
                      <h2 className="display text-[30px] font-extralight text-white">What are we investigating, and why?</h2>
                      <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-white/65">{mission.briefing}</p>
                      <div className="mt-6 grid gap-2 md:grid-cols-2">
                        {mission.objectives.map((o, i) => (
                          <div key={o} className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-[12.5px] text-white/75">
                            <span className="font-mono text-[10px] text-white/40">0{i + 1}</span> {o}
                          </div>
                        ))}
                      </div>
                    </div>
                  </Panel>
                )}

                {stage === 1 && (
                  <div className="grid gap-4 md:grid-cols-3">
                    {[
                      { t: "Infrared reveals temperature", b: "Cool objects emit most of their light at longer wavelengths. A spectrum that rises from 1 to 2 µm hints at a cool source — or heavy dust reddening." },
                      { t: "Molecules leave fingerprints", b: "Water and methane absorb specific wavelengths. SPHEREx's 102 channels can see broad absorption bands, e.g. near 1.4 µm, 1.9 µm and 3.0 µm." },
                      { t: "Artefacts mimic signals", b: "Cosmic rays hit single channels; saturated stars leave rings. Always check FLAGS and whether a feature spans adjacent channels." },
                    ].map((c, i) => (
                      <Panel key={c.t} className="p-5">
                        <span className="font-mono text-[10px] text-signal">LESSON 0{i + 1}</span>
                        <h3 className="mt-2 text-[15px] text-white">{c.t}</h3>
                        <p className="mt-2 text-[12.5px] leading-relaxed text-white/55">{c.b}</p>
                      </Panel>
                    ))}
                    <Panel className="p-5 md:col-span-3">
                      <PanelHeader title="Try it: step through wavelengths on your target" />
                      <div className="mt-4 grid gap-4 md:grid-cols-[200px_1fr]">
                        <TileImage order={tile.order} ipix={tile.ipix} view={{ kind: "mono", frame }} className="aspect-square rounded-xl" gain={1.3} />
                        <div className="flex flex-col justify-center">
                          <div className="font-mono text-[20px] text-white">{WAVELENGTHS_UM[frame].toFixed(3)} µm</div>
                          <div className="mb-4 text-[11.5px] text-white/45">Click the strip — each bar is a real SPHEREx channel.</div>
                          <ChannelStrip value={frame} onChange={setFrame} />
                        </div>
                      </div>
                    </Panel>
                  </div>
                )}

                {stage === 2 && (
                  <Panel className="grid gap-6 p-6 md:grid-cols-[1fr_1fr]">
                    <TileImage order={tile.order} ipix={tile.ipix} className="aspect-square rounded-2xl border border-white/[0.06]" gain={1.25} />
                    <div>
                      <LiveTag>Assigned target · {mission.target.label}</LiveTag>
                      <h2 className="display mt-3 text-[28px] font-extralight text-white">{info.id}</h2>
                      <div className="mt-4">
                        <KV k="Centre" v={`${formatRA(info.center.ra, true)}  ${formatDec(info.center.dec, true)}`} />
                        <KV k="Order · tile size" v={`${tile.order} · ${info.sizeDeg.toFixed(2)}°`} />
                        <KV k="Pixel scale" v={`${info.pixelScaleArcsec.toFixed(1)}″`} />
                        <KV k="Channels" v="102 (0.75–5.0 µm)" />
                        <KV k="Data release" v={`DR1 · ${HIPS.releaseDate}`} />
                        <KV k="Claim" v={claim.state === "mine" ? <span className="text-signal">Claimed by you · 48 h</span> : "Unclaimed"} />
                      </div>
                      {claim.msg && <p className="mt-2 text-[11.5px] text-warn">{claim.msg}</p>}
                      <div className="mt-5 flex flex-wrap gap-2">
                        <Btn variant={claim.state === "mine" ? "signal" : "primary"} size="sm" onClick={doClaim} disabled={claim.state === "busy"}>
                          {claim.state === "busy" ? <Loader2 className="size-3.5 animate-spin" /> : null}
                          {claim.state === "mine" ? "Release claim" : "Claim this tile"}
                        </Btn>
                        <Btn variant="outline" size="sm" href={`/explore?tile=${tile.order}/${tile.ipix}`}>Open in sky</Btn>
                        <Btn variant="outline" size="sm" href={`/region/${tile.order}/${tile.ipix}`}>Region page</Btn>
                      </div>
                      <p className="mt-4 text-[11px] text-white/40">Claims stop two contributors investigating the same tile for the same mission at once.</p>
                    </div>
                  </Panel>
                )}

                {stage === 3 && (
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                    <div className="space-y-4">
                      <Panel className="p-5">
                        <div className="flex items-center justify-between">
                          <PanelHeader title="Calibrated spectrum" />
                          <LiveTag>DR1 cube</LiveTag>
                        </div>
                        <div className="mt-4 grid gap-4 md:grid-cols-[200px_1fr]">
                          <TileImage order={tile.order} ipix={tile.ipix} view={{ kind: "mono", frame }} className="aspect-square rounded-xl" gain={1.3} />
                          <div>
                            <div className="font-mono text-[11px] text-white/45">Npix{px.tile}_cube.fits · pixel ({px.x}, {px.y})</div>
                            {spec.loading && <div className="py-10 text-center text-[12px] text-white/50">Extracting 102-channel spectrum… {spec.elapsed.toFixed(1)}s</div>}
                            {spec.error && <div className="py-6 text-[12px] text-destructive">{spec.error}</div>}
                            {spec.data && <SpectrumChart data={spec.data} height={200} highlight={frame} onPick={(f) => { setFrame(f); mark(0); }} />}
                          </div>
                        </div>
                        <div className="mt-4"><ChannelStrip value={frame} onChange={(f) => { setFrame(f); mark(0); }} /></div>
                      </Panel>
                      <Panel className="p-5">
                        <PanelHeader title="Spectral Scout on this target" />
                        <div className="mt-3">
                          <ScoutPanel ra={c5.ra} dec={c5.dec} order={tile.order} ipix={tile.ipix} compact onApplyFrame={setFrame} onResult={(r) => { setScout(r); mark(1); mark(2); }} />
                        </div>
                      </Panel>
                    </div>
                    <Panel className="h-fit p-5">
                      <PanelHeader title="Objectives" />
                      <div className="mt-4 space-y-2">
                        {mission.objectives.map((o, i) => (
                          <button key={o} onClick={() => mark(i)} className={cn("flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left text-[12.5px] transition", done[i] ? "border-signal/30 bg-signal/[0.06] text-white" : "border-white/[0.07] text-white/65 hover:border-white/20")}>
                            {done[i] ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-signal" /> : <span className="mt-0.5 size-4 shrink-0 rounded-full border border-white/25" />}
                            {o}
                          </button>
                        ))}
                      </div>
                      <p className="mt-4 text-[11px] leading-relaxed text-white/40">Features spanning several adjacent channels are more likely astrophysical than single-channel spikes.</p>
                    </Panel>
                  </div>
                )}

                {stage === 4 && (
                  <Panel className="grid gap-6 p-6 lg:grid-cols-[1fr_320px]">
                    <div>
                      <h2 className="display text-[26px] font-extralight text-white">Submit your interpretation</h2>
                      <p className="mt-2 text-[13px] text-white/55">Explain what you think is there, and why. Your evidence bundle is attached automatically.</p>
                      <div className="mt-5 space-y-4">
                        <div>
                          <div className="eyebrow mb-2">Interpretation</div>
                          <div className="flex flex-wrap gap-2">
                            {INTERPRETATIONS.map((o) => (
                              <button key={o} onClick={() => setInterp(o)} className={cn("rounded-full border px-3 py-1.5 text-[12px] transition", interp === o ? "border-white bg-white text-black" : "border-white/12 text-white/65 hover:border-white/30")}>
                                {o}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="eyebrow mb-2 flex justify-between"><span>Confidence</span><span className="text-white/70">{confidence}%</span></div>
                          <input type="range" min={0} max={100} value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} className="w-full accent-[oklch(0.89_0.11_155)]" />
                        </div>
                        <div>
                          <div className="eyebrow mb-2 flex justify-between"><span>Reasoning</span><span className={notes.trim().length >= 20 ? "text-signal" : "text-white/40"}>{notes.trim().length}/20+</span></div>
                          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} placeholder="What did you see, in which channels and epochs? Were FLAGS clean? What does Spectral Scout's evidence say?" className="w-full rounded-xl border border-white/10 bg-black/30 p-3 text-[13px] text-white outline-none placeholder:text-white/25 focus:border-white/30" />
                        </div>
                      </div>
                      {submitErr && <p className="mt-3 text-[12px] text-destructive">{submitErr}</p>}
                      <div className="mt-6 flex justify-end">
                        {user ? (
                          <Btn variant="signal" onClick={submit} disabled={submitting || notes.trim().length < 20}>
                            {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} Submit for verification
                          </Btn>
                        ) : (
                          <Btn variant="primary" onClick={() => signIn("login")}>Sign in to submit</Btn>
                        )}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
                      <div className="flex items-center gap-2"><Paperclip className="size-4 text-white/50" /><span className="eyebrow text-white/70">Evidence bundle</span></div>
                      <div className="mt-3 space-y-2 font-mono text-[10.5px]">
                        {[
                          ["Tile", info.id],
                          ["Science cube", `Npix${px.tile}_cube.fits`],
                          ["Pixel", `(${px.x}, ${px.y})`],
                          ["Channel inspected", `${WAVELENGTHS_UM[frame].toFixed(3)} µm`],
                          ["Data release", "SPHEREx DR1"],
                          ["Spectral Scout", scout ? `${scout.card.model_version} · best ${scout.topChannels[0]?.wavelengthUm.toFixed(2)} µm` : "not run"],
                        ].map(([k, v]) => (
                          <div key={k} className="flex justify-between gap-3 border-b border-white/[0.05] pb-1.5">
                            <span className="text-white/40">{k}</span>
                            <span className="truncate text-white/85">{v}</span>
                          </div>
                        ))}
                      </div>
                      <p className="mt-3 text-[10.5px] leading-relaxed text-white/40">Provenance travels with the submission so any reviewer can reproduce your measurement.</p>
                    </div>
                  </Panel>
                )}

                {stage === 5 && submission && (
                  <Panel className="p-6 md:p-8">
                    <h2 className="display text-[26px] font-extralight text-white">Independent verification</h2>
                    <p className="mt-2 max-w-xl text-[13px] text-white/55">Other contributors review your submission from the community review queue. Two independent &ldquo;verify&rdquo; reviews (more than any challenges) mark it verified; any challenge must include evidence.</p>
                    <div className="mt-6 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-xl border border-white/[0.07] p-4">
                        <div className="eyebrow">Status</div>
                        <div className="mt-2 flex items-center gap-2 text-[16px] text-white">
                          {submission.status === "verified" ? <CheckCircle2 className="size-5 text-signal" /> : submission.status === "challenged" ? <XCircle className="size-5 text-warn" /> : <Hourglass className="size-5 animate-pulse text-white/50" />}
                          {submission.status}
                        </div>
                      </div>
                      <div className="rounded-xl border border-white/[0.07] p-4">
                        <div className="eyebrow">Verifications</div>
                        <div className="mt-2 text-[22px] font-light text-white">{submission.verifies} / 2</div>
                      </div>
                      <div className="rounded-xl border border-white/[0.07] p-4">
                        <div className="eyebrow">Challenges</div>
                        <div className="mt-2 text-[22px] font-light text-white">{submission.challenges}</div>
                      </div>
                    </div>
                    <p className="mt-4 font-mono text-[10.5px] text-white/35">Submission #{submission.id} · updates every 8 s</p>
                    <div className="mt-6 flex flex-wrap justify-end gap-2">
                      <Btn variant="outline" href="/community">Open review queue</Btn>
                      <Btn variant="primary" onClick={() => setStage(6)}>Continue <ArrowRight className="size-3.5" /></Btn>
                    </div>
                  </Panel>
                )}

                {stage === 6 && submission && (
                  <Panel strong className="relative overflow-hidden p-10 text-center">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,oklch(0.89_0.11_155/0.18),transparent_60%)]" />
                    <motion.div initial={{ scale: 0.4, opacity: 0, rotate: -30 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 160, damping: 14 }} className="relative mx-auto flex size-24 items-center justify-center rounded-full border border-signal/40 bg-signal/10">
                      <FileCheck2 className="size-10 text-signal" />
                    </motion.div>
                    <div className="relative">
                      <div className="eyebrow mt-6 text-signal">Contribution recorded</div>
                      <h2 className="display mt-2 text-[34px] font-extralight text-white">{submission.status === "verified" ? `+${mission.xp} XP · verified` : "+60 XP · awaiting review"}</h2>
                      <p className="mx-auto mt-3 max-w-lg text-[13.5px] text-white/55">
                        &ldquo;{submission.interpretation}&rdquo; ({confidence}% confidence) is now part of {info.id}&apos;s investigation record with its data release, pixel and evidence. Verification XP is added when two peers confirm it.
                      </p>
                      <div className="mt-8 flex justify-center gap-3">
                        <Btn variant="primary" href="/missions">Next mission</Btn>
                        <Btn variant="outline" href="/lab">View in My Lab</Btn>
                      </div>
                    </div>
                  </Panel>
                )}
              </motion.div>
            </AnimatePresence>

            {stage < 4 && (
              <div className="mt-5 flex justify-between">
                <Btn variant="ghost" onClick={() => setStage((s) => Math.max(0, s - 1))} disabled={stage === 0}>
                  <ArrowLeft className="size-3.5" /> Back
                </Btn>
                <Btn variant="primary" onClick={() => setStage((s) => s + 1)}>
                  {stage === 0 ? "Start mission" : "Continue"} <ArrowRight className="size-3.5" />
                </Btn>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Award, CheckCircle2, Loader2, Pause, Play, Satellite, Target, XCircle } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Reveal, RevealInView } from "@/components/motion/reveal";
import { Btn, Chip, KV, LiveTag, Panel, PanelHeader, Progress, SectionTitle } from "@/components/ui/kit";
import { BlinkCanvas, type Marker } from "./blink-canvas";
import { Orbit3D } from "./orbit-3d";
import { buildFrames, mjdToIso, skyToPix, type Frame } from "@/lib/blink";
import { fetchInput, type ScoutInputPayload } from "@/lib/scout-client";
import { BLINK_TARGETS } from "@/lib/blink-targets";
import { useLive, timeAgo } from "@/lib/live";
import { cn } from "@/lib/utils";

const HISTORY = [
  { year: "1916", who: "E. E. Barnard", what: "Measured the record proper motion of the star now named after him by comparing photographic plates taken years apart." },
  { year: "1930", who: "Clyde Tombaugh", what: "Discovered Pluto at Lowell Observatory by blinking pairs of photographic plates on a blink comparator." },
  { year: "1992", who: "David Jewitt & Jane Luu", what: "Found 1992 QB1, the first Kuiper Belt object after Pluto, by comparing successive CCD images for slow motion." },
  { year: "2014", who: "Kevin Luhman", what: "Identified WISE 0855−0714, the coldest known brown dwarf, from its motion across multi-epoch WISE images." },
  { year: "2017", who: "NASA · Backyard Worlds: Planet 9", what: "Launched a citizen-science project where volunteers blink WISE images to find brown dwarfs and new worlds near the Sun." },
  { year: "2020", who: "Dan Caselden (citizen scientist)", what: "Spotted 'The Accident', an unusual fast-moving brown dwarf, while blinking WISE data with the WiseView tool." },
];

interface Skill {
  attempts: number;
  hits: number;
  streak: number;
  xp: number;
}
const SKILL_KEY = "spx-blink-skill";
const levelOf = (xp: number) => (xp >= 600 ? "Master Hunter" : xp >= 300 ? "Sharp Eye" : xp >= 100 ? "Spotter" : "Novice");

export function AcademyView() {
  const [targetId, setTargetId] = useState(BLINK_TARGETS[0].id);
  const target = BLINK_TARGETS.find((t) => t.id === targetId)!;
  const [input, setInput] = useState<ScoutInputPayload | null>(null);
  const [loading, setLoading] = useState<{ msg: string; frac: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [guess, setGuess] = useState<{ x: number; y: number } | null>(null);
  const [skill, setSkill] = useState<Skill>({ attempts: 0, hits: 0, streak: 0, xp: 0 });
  const [orbit, setOrbit] = useState<{ alt: number; lat: number; lon: number; tle: string; period: number } | null>(null);
  const subs = useLive<{ submissions: { id: number; interpretation: string; tile_order: number; tile_ipix: number; author: string; status: string; created_at: number; evidence_json: string }[] }>("/api/submissions");

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(SKILL_KEY) ?? "null");
      if (s) setSkill(s);
    } catch {}
  }, []);

  const load = async () => {
    setErr(null);
    setInput(null);
    setGuess(null);
    try {
      setInput(await fetchInput(target.ra, target.dec, (msg, frac) => setLoading({ msg, frac })));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(null);
    }
  };

  const frames: Frame[] = useMemo(() => (input ? buildFrames(input, "all") : []), [input]);
  useEffect(() => {
    if (!playing || frames.length < 2) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % frames.length), 650);
    return () => clearInterval(id);
  }, [playing, frames.length]);

  const answerPx = target.answer ? skyToPix(target.ra, target.dec, target.answer.ra, target.answer.dec) : null;
  const correct = guess && answerPx ? Math.hypot(guess.x - answerPx.x, guess.y - answerPx.y) <= (target.answer?.tolerancePx ?? 4) : null;

  const pick = (p: { x: number; y: number }) => {
    if (guess || !target.answer) return;
    setGuess(p);
    const hit = answerPx ? Math.hypot(p.x - answerPx.x, p.y - answerPx.y) <= target.answer.tolerancePx : false;
    const next = { attempts: skill.attempts + 1, hits: skill.hits + (hit ? 1 : 0), streak: hit ? skill.streak + 1 : 0, xp: skill.xp + (hit ? 50 + skill.streak * 10 : 5) };
    setSkill(next);
    localStorage.setItem(SKILL_KEY, JSON.stringify(next));
  };

  const markers: Marker[] = [];
  if (guess) markers.push({ x: guess.x, y: guess.y, color: correct ? "#b8f5c8" : "#ff5a4f", r: 2, label: "your pick" });
  if (guess && answerPx) markers.push({ x: answerPx.x, y: answerPx.y, color: "#ffd166", r: 3, label: target.name });

  const exposures = useMemo(() => (input ? input.planes.filter((p) => p.sc).map((p) => ({ pos: p.sc as [number, number, number], label: p.obsId })) : []), [input]);
  const blinkFinds = (subs.data?.submissions ?? []).filter((s) => s.interpretation === "Moving source" || s.evidence_json.includes('"blink"'));

  return (
    <AppShell>
      <div className="px-5 md:px-8">
        <Reveal delay={0.08}>
          <SectionTitle
            eyebrow="Hunter Academy"
            title="Train your eye on real SPHEREx data"
            desc="Practise on real fields where the answer is known from catalogues, learn where SPHEREx was when it took each exposure, and see how comparing images over time led to some of astronomy's best finds."
            right={<Btn variant="outline" href="/explore">Find a region to hunt in</Btn>}
          />
        </Reveal>

        <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <Reveal delay={0.12}>
            <Panel className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <PanelHeader title={<span className="flex items-center gap-2"><Target className="size-3.5" /> Skill trainer</span>} />
                <Chip tone="signal">{levelOf(skill.xp)} · {skill.xp} XP</Chip>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {BLINK_TARGETS.filter((t) => t.answer).map((t) => (
                  <button key={t.id} onClick={() => { setTargetId(t.id); setInput(null); setGuess(null); }} className={cn("rounded-full border px-3 py-1 text-[11.5px]", targetId === t.id ? "border-signal/40 bg-signal/10 text-signal" : "border-white/10 text-white/60")}>
                    {t.what === "mover" ? "Find the mover" : "Find the variable"} · {t.name}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-[12px] leading-relaxed text-white/55">{target.why}</p>
              {!input ? (
                <div className="mt-4">
                  <Btn variant="primary" size="sm" onClick={load} disabled={!!loading}>
                    {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />} Load challenge
                  </Btn>
                  {loading && <p className="mt-2 font-mono text-[10px] text-white/45">{loading.msg} ({Math.round(loading.frac * 100)}%)</p>}
                  {err && <p className="mt-2 text-[11.5px] text-destructive">{err}</p>}
                </div>
              ) : frames.length < 2 ? (
                <p className="mt-4 text-[12px] text-warn">Only {frames.length} epoch available here so far — time-lapse needs two.</p>
              ) : (
                <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_200px]">
                  <BlinkCanvas data={frames[idx].img} markers={markers} onPick={pick} />
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setPlaying((p) => !p)} className="flex size-8 items-center justify-center rounded-full bg-white text-black" aria-label="Play or pause">{playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}</button>
                      <span className="font-mono text-[10.5px] text-white/60">E{frames[idx].epoch} · {mjdToIso(frames[idx].mjd)}</span>
                    </div>
                    {!guess ? (
                      <p className="text-[12px] text-white/60">Watch the time-lapse, then click the object that {target.what === "mover" ? "moves" : "changes brightness"}.</p>
                    ) : (
                      <div className={cn("rounded-xl border p-3 text-[12px]", correct ? "border-signal/30 bg-signal/[0.06] text-signal" : "border-destructive/30 bg-destructive/[0.06] text-destructive")}>
                        {correct ? <CheckCircle2 className="mb-1 size-4" /> : <XCircle className="mb-1 size-4" />}
                        {correct ? "Correct — that's it!" : "Not quite. The yellow ring marks the catalogue position."}
                        <Btn size="sm" variant="outline" className="mt-3 w-full" onClick={() => setGuess(null)}>Try again</Btn>
                      </div>
                    )}
                    <div>
                      <div className="flex justify-between font-mono text-[10px] text-white/45"><span>Accuracy</span><span>{skill.attempts ? Math.round((skill.hits / skill.attempts) * 100) : 0}%</span></div>
                      <Progress value={skill.attempts ? (skill.hits / skill.attempts) * 100 : 0} className="mt-1" />
                      <div className="mt-2 font-mono text-[10px] text-white/45">streak {skill.streak} · {skill.attempts} attempts</div>
                    </div>
                  </div>
                </div>
              )}
            </Panel>
          </Reveal>

          <Reveal delay={0.16}>
            <Panel className="p-5">
              <div className="flex items-center justify-between">
                <PanelHeader title={<span className="flex items-center gap-2"><Satellite className="size-3.5" /> Where SPHEREx is</span>} />
                <LiveTag>CelesTrak · SGP4</LiveTag>
              </div>
              <Orbit3D className="mt-3 h-[340px] w-full" exposures={exposures} onInfo={setOrbit} />
              <div className="mt-3 grid grid-cols-2 gap-x-6">
                <KV k="Altitude" v={orbit ? `${orbit.alt.toFixed(0)} km` : "…"} />
                <KV k="Sub-satellite point" v={orbit ? `${orbit.lat.toFixed(1)}°, ${orbit.lon.toFixed(1)}°` : "…"} />
                <KV k="Orbital period" v={orbit ? `${orbit.period.toFixed(1)} min` : "…"} />
                <KV k="Exposures plotted" v={exposures.length ? `${exposures.length} (yellow)` : "load a challenge"} />
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-white/45">
                SPHEREx flies a ~650 km Sun-synchronous polar orbit, scanning great circles of sky as it goes around ~14.7 times a day. Yellow points are the real spacecraft positions (X_SC/Y_SC/Z_SC) recorded in the FITS header of each exposure used in your challenge.
              </p>
            </Panel>
          </Reveal>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <RevealInView>
            <Panel className="h-full p-5">
              <PanelHeader title={<span className="flex items-center gap-2"><Award className="size-3.5" /> Who found what by comparing images</span>} />
              <div className="relative mt-4 space-y-4 pl-6">
                <span className="absolute bottom-1 left-[7px] top-1 w-px bg-white/10" />
                {HISTORY.map((h) => (
                  <div key={h.year} className="relative">
                    <span className="absolute -left-[22px] top-1 size-2.5 rounded-full border border-signal bg-signal/30" />
                    <div className="font-mono text-[11px] text-signal">{h.year} · {h.who}</div>
                    <p className="mt-0.5 text-[12.5px] leading-relaxed text-white/65">{h.what}</p>
                  </div>
                ))}
              </div>
            </Panel>
          </RevealInView>
          <RevealInView delay={0.06}>
            <Panel className="h-full p-5">
              <PanelHeader title="Existing ChronoLens finds on StellarScope" meta={blinkFinds.length} />
              {blinkFinds.length === 0 && <p className="mt-3 text-[12px] text-white/45">No ChronoLens submissions yet. Open any region in <Link href="/explore" className="underline">Explore</Link> and use ChronoLens and it will appear here for others to study and verify.</p>}
              <div className="mt-3 space-y-2">
                {blinkFinds.slice(0, 10).map((s) => (
                  <Link key={s.id} href={`/region/${s.tile_order}/${s.tile_ipix}#chronolens`} className="flex items-center justify-between rounded-xl border border-white/[0.06] px-3 py-2 hover:border-white/20">
                    <span>
                      <span className="block text-[12.5px] text-white">{s.interpretation} · SPX-{s.tile_order}-{s.tile_ipix}</span>
                      <span className="block text-[10.5px] text-white/40">{s.author} · {timeAgo(s.created_at)}</span>
                    </span>
                    <Chip tone={s.status === "verified" ? "signal" : "info"}>{s.status}</Chip>
                  </Link>
                ))}
              </div>
              <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-[11.5px] leading-relaxed text-white/55">
                Practice targets with known answers: {BLINK_TARGETS.filter((t) => t.answer).map((t) => t.name).join(" and ")}. Their positions come from catalogues (Barnard&apos;s Star propagated with its Gaia DR3 proper motion).
              </div>
            </Panel>
          </RevealInView>
        </div>
      </div>
    </AppShell>
  );
}

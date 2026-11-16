"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, GraduationCap, Loader2, Pause, Play, Radar, Search, Send, Wand2 } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Reveal } from "@/components/motion/reveal";
import { Btn, Chip, KV, LiveTag, Panel, PanelHeader, SectionTitle } from "@/components/ui/kit";
import { BlinkCanvas, type Marker } from "./blink-canvas";
import { BANDS, buildFrames, detect, difference, mjdToIso, pixToSky, skyToPix, PIX_ARCSEC, type BandId, type Candidate, type Frame } from "@/lib/blink";
import { fetchInput, type ScoutInputPayload } from "@/lib/scout-client";
import { BLINK_TARGETS } from "@/lib/blink-targets";
import { TOOLS, setReviewDraft } from "@/lib/tools";
import { parseQuery } from "@/lib/parse";
import { ang2pix, pix2ang } from "@/sky/healpix";
import { formatDec, formatRA } from "@/sky/coords";
import { cn } from "@/lib/utils";

interface Cross {
  gaia: { source: string; error?: string; stars: { source_id: string; ra: number; dec: number; phot_g_mean_mag: number; pmra: number | null; pmdec: number | null; sep: number }[] };
  asteroids: { date: string; count: number; error?: string; objects: Record<string, string>[] }[];
}

export function BlinkView() {
  const router = useRouter();
  const [target, setTarget] = useState({ ra: BLINK_TARGETS[2].ra, dec: BLINK_TARGETS[2].dec, label: BLINK_TARGETS[2].name });
  const [q, setQ] = useState("");
  const [input, setInput] = useState<ScoutInputPayload | null>(null);
  const [loading, setLoading] = useState<{ msg: string; frac: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [band, setBand] = useState<BandId>("all");
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(700);
  const [mode, setMode] = useState<"blink" | "diff">("blink");
  const [pair, setPair] = useState<[number, number]>([0, 1]);
  const [auto, setAuto] = useState(true);
  const [thr, setThr] = useState(5);
  const [sel, setSel] = useState<number | null>(null);
  const [cross, setCross] = useState<Cross | null>(null);
  const [crossBusy, setCrossBusy] = useState(false);
  const [showGaia, setShowGaia] = useState(true);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const ra = Number(p.get("ra"));
    const dec = Number(p.get("dec"));
    const tile = p.get("tile");
    if (p.get("ra") && Number.isFinite(ra) && Number.isFinite(dec)) setTarget({ ra, dec, label: `${formatRA(ra)} ${formatDec(dec)}` });
    else if (tile) {
      const [o, i] = tile.split("/").map(Number);
      if (Number.isInteger(o) && Number.isInteger(i) && o >= 0 && o <= 5) {
        const c = pix2ang(o, i);
        const c5 = pix2ang(5, ang2pix(5, c.ra, c.dec));
        setTarget({ ra: c5.ra, dec: c5.dec, label: `SPX-${o}-${i}` });
      }
    }
  }, []);

  const load = async () => {
    abort.current?.abort();
    abort.current = new AbortController();
    setErr(null);
    setInput(null);
    setCross(null);
    setSel(null);
    setLoading({ msg: "Requesting real SPHEREx L2 exposures…", frac: 0.02 });
    try {
      const d = await fetchInput(target.ra, target.dec, (msg, frac) => setLoading({ msg, frac }), abort.current.signal);
      setInput(d);
      setIdx(0);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setErr((e as Error).message);
    } finally {
      setLoading(null);
    }
  };

  const frames: Frame[] = useMemo(() => (input ? buildFrames(input, band) : []), [input, band]);
  useEffect(() => {
    if (frames.length >= 2) setPair([0, frames.length - 1]);
    setIdx(0);
  }, [frames.length]);

  useEffect(() => {
    if (!playing || mode !== "blink" || frames.length < 2) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % frames.length), speed);
    return () => clearInterval(id);
  }, [playing, mode, frames.length, speed]);

  const A = frames[pair[0]];
  const B = frames[pair[1]];
  const diff = useMemo(() => (A && B && A !== B ? difference(A, B) : null), [A, B]);
  const cands: Candidate[] = useMemo(() => (auto && A && B && A !== B ? detect(A, B, thr) : []), [auto, A, B, thr]);

  const gaiaMarkers: Marker[] = useMemo(() => {
    if (!cross || !showGaia || !A || !B) return [];
    const years = (B.mjd - A.mjd) / 365.25;
    return cross.gaia.stars
      .filter((s) => s.phot_g_mean_mag < 17)
      .map((s) => {
        const p = skyToPix(target.ra, target.dec, s.ra, s.dec);
        const pm = Math.hypot(s.pmra ?? 0, s.pmdec ?? 0);
        const dx = (-(s.pmra ?? 0) * years) / 1000 / PIX_ARCSEC;
        const dy = ((s.pmdec ?? 0) * years) / 1000 / PIX_ARCSEC;
        return { x: p.x, y: p.y, color: pm > 200 ? "#ff8bd1" : "rgba(130,200,255,0.55)", r: 1.2, arrow: pm > 200 ? { dx: dx * 4, dy: dy * 4 } : undefined, label: pm > 200 ? `PM ${(pm / 1000).toFixed(2)}″/yr` : undefined };
      })
      .filter((m) => m.x > -2 && m.x < 66 && m.y > -2 && m.y < 66);
  }, [cross, showGaia, A, B, target]);

  const runCross = async () => {
    if (!frames.length) return;
    setCrossBusy(true);
    try {
      const dates = [...new Set(frames.map((f) => mjdToIso(f.mjd)))].join(",");
      const r = await fetch(`/api/crossmatch?ra=${target.ra.toFixed(5)}&dec=${target.dec.toFixed(5)}&r=0.08&dates=${dates}`);
      setCross(await r.json());
    } finally {
      setCrossBusy(false);
    }
  };

  const toReview = () => {
    const c = sel !== null ? cands[sel] : cands[0];
    const at = c ? pixToSky(target.ra, target.dec, c.x, c.y) : { ra: target.ra, dec: target.dec };
    setReviewDraft({
      source: "blink",
      ra: at.ra,
      dec: at.dec,
      tile: { order: 5, ipix: ang2pix(5, at.ra, at.dec) },
      interpretation: c?.kind === "mover" ? "Moving source" : c ? "Uncertain" : "No candidate found",
      blink: {
        band: BANDS.find((b) => b.id === band)?.label,
        epochs: frames.map((f) => ({ epoch: f.epoch, date: mjdToIso(f.mjd), planes: f.planes, spacecraftKm: f.sc })),
        compared: A && B ? [mjdToIso(A.mjd), mjdToIso(B.mjd)] : null,
        thresholdSigma: thr,
        candidate: c ?? null,
        allCandidates: cands.length,
      },
      crossmatch: cross
        ? {
            gaiaStarsInField: cross.gaia.stars.length,
            highPmStars: cross.gaia.stars.filter((s) => Math.hypot(s.pmra ?? 0, s.pmdec ?? 0) > 200).map((s) => ({ id: `Gaia DR3 ${s.source_id}`, pmMasYr: Math.round(Math.hypot(s.pmra ?? 0, s.pmdec ?? 0)) })),
            knownAsteroids: cross.asteroids.map((a) => ({ date: a.date, count: a.count, names: a.objects.slice(0, 5).map((o) => o["Object name"]) })),
          }
        : null,
      input: input ? { planes: input.planes.length, exposures: [...new Set(input.planes.map((p) => p.obsId))].slice(0, 40) } : null,
    });
    router.push("/submit");
  };

  const cur = frames[idx];

  return (
    <AppShell>
      <div className="px-5 md:px-8">
        <Reveal delay={0.08}>
          <SectionTitle
            eyebrow="Blink comparator · real SPHEREx epochs"
            title="Blink the sky to find what moves and what changes"
            desc="The technique that found Pluto, rebuilt on SPHEREx: each frame stacks the real L2 exposures from one survey epoch. Play them, subtract them, and let auto-detection flag movers and variables for you to check."
            right={
              <div className="flex gap-2">
                <Btn variant="outline" href="/blink/academy"><GraduationCap className="size-3.5" /> Blink Academy</Btn>
              </div>
            }
          />
        </Reveal>

        <div className="mt-8 grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)_340px]">
          {/* left: target + controls */}
          <Reveal delay={0.12} className="space-y-4">
            <Panel className="p-4">
              <PanelHeader title="Target" />
              <div className="mt-2 font-mono text-[12px] text-white">{target.label}</div>
              <div className="font-mono text-[10.5px] text-white/45">{formatRA(target.ra, true)} {formatDec(target.dec, true)}</div>
              <form
                className="mt-3 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const p = parseQuery(q);
                  if (p && "ra" in p) setTarget({ ra: p.ra, dec: p.dec, label: `${formatRA(p.ra)} ${formatDec(p.dec)}` });
                  else if (p && "order" in p) {
                    const c = pix2ang(p.order, p.ipix);
                    const c5 = pix2ang(5, ang2pix(5, c.ra, c.dec));
                    setTarget({ ra: c5.ra, dec: c5.dec, label: `SPX-${p.order}-${p.ipix}` });
                  }
                }}
              >
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="RA Dec or SPX-5-445" className="h-9 min-w-0 flex-1 rounded-full border border-white/10 bg-black/30 px-3 text-[12px] text-white outline-none placeholder:text-white/30" />
                <button className="flex size-9 items-center justify-center rounded-full border border-white/10 text-white/70 hover:text-white" aria-label="Set target"><Search className="size-3.5" /></button>
              </form>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {BLINK_TARGETS.map((t) => (
                  <button key={t.id} onClick={() => setTarget({ ra: t.ra, dec: t.dec, label: t.name })} className={cn("rounded-full border px-2.5 py-1 text-[11px]", target.label === t.name ? "border-signal/40 bg-signal/10 text-signal" : "border-white/10 text-white/60 hover:text-white")}>
                    {t.name}
                  </button>
                ))}
              </div>
              <Btn variant="primary" size="sm" className="mt-4 w-full" onClick={load} disabled={!!loading}>
                {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Radar className="size-3.5" />} Load real epochs
              </Btn>
              {loading && (
                <div className="mt-3">
                  <div className="h-[3px] overflow-hidden rounded-full bg-white/[0.07]"><div className="h-full bg-signal transition-[width]" style={{ width: `${Math.max(3, loading.frac * 100)}%` }} /></div>
                  <p className="mt-1.5 font-mono text-[10px] text-white/45">{loading.msg}</p>
                  <p className="mt-1 text-[10px] text-white/35">First load of a position takes 1–2 min (IRSA); cached afterwards.</p>
                </div>
              )}
              {err && <p className="mt-2 text-[11.5px] text-destructive">{err}</p>}
            </Panel>

            <Panel className="p-4">
              <PanelHeader title="Wavelength band" />
              <div className="mt-3 flex flex-wrap gap-1.5">
                {BANDS.map((b) => (
                  <button key={b.id} onClick={() => setBand(b.id)} className={cn("rounded-full border px-2.5 py-1 font-mono text-[10.5px]", band === b.id ? "border-white bg-white text-black" : "border-white/10 text-white/60 hover:text-white")}>
                    {b.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[10.5px] text-white/40">Stacks only the real cutouts whose wavelength falls in this band.</p>
            </Panel>

            <Panel className="p-4">
              <PanelHeader title="Auto motion detection" />
              <label className="mt-3 flex items-center justify-between text-[12px] text-white/80">
                Detect movers & variables
                <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="accent-[oklch(0.89_0.11_155)]" />
              </label>
              <div className="mt-3 flex justify-between font-mono text-[10.5px] text-white/50"><span>Threshold</span><span>{thr.toFixed(1)}σ</span></div>
              <input type="range" min={3} max={10} step={0.5} value={thr} onChange={(e) => setThr(Number(e.target.value))} className="w-full accent-[oklch(0.89_0.11_155)]" />
              <p className="mt-1 text-[10.5px] leading-relaxed text-white/40">Pairs a fading residual with a nearby brightening one (≤ 8 px) as a mover; unpaired residuals are variability candidates.</p>
            </Panel>
          </Reveal>

          {/* centre: viewer */}
          <Reveal delay={0.16}>
            <Panel className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-1 rounded-full border border-white/10 p-0.5">
                  {(["blink", "diff"] as const).map((m) => (
                    <button key={m} onClick={() => setMode(m)} className={cn("rounded-full px-3 py-1 text-[11px]", mode === m ? "bg-white text-black" : "text-white/60")}>
                      {m === "blink" ? "Blink frames" : "Difference (B − A)"}
                    </button>
                  ))}
                </div>
                {frames.length > 0 && <LiveTag>{frames.length} epochs · {frames.reduce((s, f) => s + f.planes, 0)} real cutouts</LiveTag>}
              </div>

              <div className="mt-3">
                {frames.length === 0 ? (
                  <div className="flex aspect-square w-full flex-col items-center justify-center rounded-xl border border-dashed border-white/10 text-center">
                    <Radar className="size-8 text-white/30" />
                    <p className="mt-3 max-w-xs text-[12.5px] text-white/50">{input ? "No real cutouts fall in this band — choose another band." : "Pick a target and load its real SPHEREx epochs to start blinking."}</p>
                  </div>
                ) : mode === "blink" ? (
                  <BlinkCanvas data={cur?.img ?? null} candidates={cands} selected={sel} markers={gaiaMarkers} />
                ) : (
                  <BlinkCanvas data={diff} diverging candidates={cands} selected={sel} markers={gaiaMarkers} />
                )}
              </div>

              {frames.length > 0 && (
                <div className="mt-3 space-y-3">
                  {mode === "blink" ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <button onClick={() => setPlaying((p) => !p)} className="flex size-9 items-center justify-center rounded-full bg-white text-black" aria-label={playing ? "Pause" : "Play"}>
                        {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
                      </button>
                      <div className="flex gap-1">
                        {frames.map((f, i) => (
                          <button key={i} onClick={() => { setPlaying(false); setIdx(i); }} className={cn("rounded-md border px-2 py-1 font-mono text-[10.5px]", i === idx ? "border-signal/50 bg-signal/15 text-signal" : "border-white/10 text-white/60")}>
                            E{f.epoch} · {mjdToIso(f.mjd)}
                          </button>
                        ))}
                      </div>
                      <label className="ml-auto flex items-center gap-2 font-mono text-[10.5px] text-white/50">
                        speed
                        <input type="range" min={150} max={1500} step={50} value={1650 - speed} onChange={(e) => setSpeed(1650 - Number(e.target.value))} className="w-24 accent-[oklch(0.89_0.11_155)]" />
                      </label>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-white/70">
                      A
                      <select value={pair[0]} onChange={(e) => setPair([Number(e.target.value), pair[1]])} className="rounded-md border border-white/10 bg-black/40 px-2 py-1">
                        {frames.map((f, i) => <option key={i} value={i}>E{f.epoch} {mjdToIso(f.mjd)}</option>)}
                      </select>
                      B
                      <select value={pair[1]} onChange={(e) => setPair([pair[0], Number(e.target.value)])} className="rounded-md border border-white/10 bg-black/40 px-2 py-1">
                        {frames.map((f, i) => <option key={i} value={i}>E{f.epoch} {mjdToIso(f.mjd)}</option>)}
                      </select>
                      <span className="text-white/40">red = brighter in B · blue = brighter in A · ±8σ scale</span>
                    </div>
                  )}
                  {cur && mode === "blink" && (
                    <div className="grid grid-cols-3 gap-2 font-mono text-[10.5px] text-white/55">
                      <span>{cur.planes} cutouts stacked</span>
                      <span>Δt to last: {(frames[frames.length - 1].mjd - frames[0].mjd).toFixed(0)} d</span>
                      <span>{cur.sc ? `SPHEREx alt ${(Math.hypot(...cur.sc) - 6371).toFixed(0)} km` : "position n/a"}</span>
                    </div>
                  )}
                </div>
              )}
            </Panel>
          </Reveal>

          {/* right: candidates + cross-match + review */}
          <Reveal delay={0.2} className="space-y-4">
            <Panel className="p-4">
              <PanelHeader title="Detections" meta={auto ? `${cands.length}` : "off"} />
              {frames.length > 0 && auto && cands.length === 0 && <p className="mt-3 text-[12px] text-white/45">No residuals above {thr}σ between these epochs.</p>}
              <div className="scroll-thin mt-3 max-h-64 space-y-1.5 overflow-y-auto">
                {cands.map((c, i) => {
                  const s = pixToSky(target.ra, target.dec, c.x, c.y);
                  return (
                    <button key={i} onClick={() => setSel(i)} className={cn("w-full rounded-xl border px-3 py-2 text-left", sel === i ? "border-white/30 bg-white/[0.06]" : "border-white/[0.06] hover:border-white/20")}>
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] text-white">#{i + 1} {c.kind}</span>
                        <Chip tone={c.kind === "mover" ? "danger" : "warn"}>{c.snr.toFixed(1)}σ</Chip>
                      </div>
                      <div className="mt-0.5 font-mono text-[10px] text-white/45">
                        {formatRA(s.ra, true)} {formatDec(s.dec, true)}
                        {c.kind === "mover" && ` · ${c.shiftPx!.toFixed(1)} px · ${(c.arcsecPerDay! * 365.25).toFixed(1)}″/yr`}
                      </div>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-white/35">Candidates for human review — check FLAGS, edges and the cross-match before believing any of them.</p>
            </Panel>

            <Panel className="p-4">
              <div className="flex items-center justify-between">
                <PanelHeader title="Cross-match" />
                <Btn size="sm" variant="outline" onClick={runCross} disabled={!frames.length || crossBusy}>
                  {crossBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />} Run
                </Btn>
              </div>
              {!cross && <p className="mt-2 text-[11px] text-white/45">Gaia DR3 stars (with proper motions) and NASA/JPL known asteroids on each epoch date.</p>}
              {cross && (
                <div className="mt-3 space-y-2 text-[11.5px]">
                  <KV k="Gaia DR3 stars (r=0.08°)" v={cross.gaia.error ? "unavailable" : cross.gaia.stars.length} />
                  <KV k="High-PM stars (>0.2″/yr)" v={cross.gaia.stars.filter((s) => Math.hypot(s.pmra ?? 0, s.pmdec ?? 0) > 200).length} />
                  {cross.asteroids.map((a) => (
                    <KV key={a.date} k={`Known asteroids ${a.date}`} v={a.error ? "unavailable" : a.count} />
                  ))}
                  <label className="flex items-center justify-between pt-1 text-white/70">
                    Show Gaia overlay
                    <input type="checkbox" checked={showGaia} onChange={(e) => setShowGaia(e.target.checked)} />
                  </label>
                </div>
              )}
            </Panel>

            <Panel className="p-4">
              <PanelHeader title="Verify with official tools" />
              <div className="mt-3 space-y-1">
                {TOOLS.slice(0, 6).map((t) => (
                  <a key={t.id} href={t.url(target.ra, target.dec, frames[0] ? mjdToIso(frames[0].mjd) : undefined)} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-lg px-2 py-1.5 text-[11.5px] text-white/70 hover:bg-white/[0.05] hover:text-white">
                    <span>{t.name} <span className="text-white/35">· {t.org}</span></span>
                    <ExternalLink className="size-3" />
                  </a>
                ))}
              </div>
              <Btn variant="signal" size="sm" className="mt-3 w-full" onClick={toReview} disabled={!frames.length}>
                <Send className="size-3.5" /> Submit for review
              </Btn>
              <Link href="/submit" className="mt-2 block text-center text-[10.5px] text-white/40 hover:text-white">Open the review composer</Link>
            </Panel>
          </Reveal>
        </div>
      </div>
    </AppShell>
  );
}

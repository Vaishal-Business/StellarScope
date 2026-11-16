"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, CircleHelp, ExternalLink, Gauge, Loader2, Pause, Play, Radar, Search, Send, Wand2, XCircle, AlertTriangle, Orbit } from "lucide-react";
import { Btn, Chip, KV, LiveTag, Panel, PanelHeader } from "@/components/ui/kit";
import { BlinkCanvas, type Marker } from "@/components/blink/blink-canvas";
import { Solar3D } from "./solar-3d";
import { ObjectCard, gaiaAt, identify, type Cross, type Identity } from "./object-card";
import { BANDS, HW, buildFrames, detect, difference, mjdToIso, pixToSky, skyToPix, PIX_ARCSEC, type BandId, type Candidate, type Frame } from "@/lib/blink";
import { fetchInput, type ScoutInputPayload } from "@/lib/scout-client";
import { BLINK_TARGETS } from "@/lib/blink-targets";
import { TOOLS, setReviewDraft } from "@/lib/tools";
import { parseQuery } from "@/lib/parse";
import { ang2pix, pix2ang } from "@/sky/healpix";
import { formatDec, formatRA } from "@/sky/coords";
import { mjdToJd } from "@/lib/solar";
import { cn } from "@/lib/utils";

/** Commands other parts of the app (the SI assistant, guided workflows) can send to ChronoLens. */
export type ChronoCommand = { action: "load" | "play" | "pause" | "difference" | "frames" | "crossmatch" | "submit" | "detect_on" | "detect_off" | "select"; index?: number; band?: BandId; threshold?: number };
export function sendChrono(cmd: ChronoCommand) {
  window.dispatchEvent(new CustomEvent("chronolens", { detail: cmd }));
}

function Help({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button type="button" onClick={() => setOpen((o) => !o)} className="text-white/35 hover:text-signal" aria-label="Explain">
        <CircleHelp className="size-3.5" />
      </button>
      {open && <span className="absolute left-5 top-0 z-30 w-64 rounded-xl border border-white/10 bg-[#0b0e14] p-3 text-[11.5px] normal-case leading-relaxed tracking-normal text-white/75 shadow-2xl">{children}</span>}
    </span>
  );
}

const STEPS = ["Load epochs", "Watch it change", "Find candidates", "Identify", "Submit"];

/** Motion → what kind of object could move that fast, in plain words. */
function motionStory(arcsecPerYear: number) {
  if (arcsecPerYear > 2000) return { t: "Solar-system speed", d: "Moving several arcseconds per day — far too fast for a star. Almost certainly an asteroid or comet. Check the JPL match." };
  if (arcsecPerYear > 30) return { t: "Extremely fast", d: "Faster than any known star (Barnard's Star is 10.4″/yr). Most likely a slow, distant solar-system body or a mismatch — verify carefully." };
  if (arcsecPerYear > 0.5) return { t: "Nearby-star speed", d: "Typical of stars or brown dwarfs within a few hundred light-years. Check Gaia — an unmatched mover like this is exactly what Backyard Worlds volunteers hunt for." };
  return { t: "Barely moving", d: "Below what SPHEREx's 6″ pixels can reliably measure in a year. Treat as noise unless it repeats." };
}

export function ChronoLens({ ra, dec, label, compact = false }: { ra: number; dec: number; label: string; compact?: boolean }) {
  const router = useRouter();
  const [target, setTarget] = useState({ ra, dec, label });
  useEffect(() => setTarget({ ra, dec, label }), [ra, dec, label]);
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
  const [contrast, setContrast] = useState(1);
  const [sel, setSel] = useState<number | null>(null);
  const [cross, setCross] = useState<Cross | null>(null);
  const [crossBusy, setCrossBusy] = useState(false);
  const [showGaia, setShowGaia] = useState(true);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const abort = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abort.current?.abort();
    abort.current = new AbortController();
    setErr(null);
    setInput(null);
    setCross(null);
    setSel(null);
    setIdentity(null);
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
  }, [target]);

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
  const cand = sel !== null ? cands[sel] : null;
  const candSky = cand ? pixToSky(target.ra, target.dec, cand.x, cand.y) : null;

  const runCross = useCallback(async () => {
    if (!frames.length) return;
    setCrossBusy(true);
    try {
      const dates = [...new Set(frames.map((f) => mjdToIso(f.mjd)))].join(",");
      const r = await fetch(`/api/crossmatch?ra=${target.ra.toFixed(5)}&dec=${target.dec.toFixed(5)}&r=0.08&dates=${dates}`);
      setCross(await r.json());
    } finally {
      setCrossBusy(false);
    }
  }, [frames, target]);

  // identify the selected candidate against the cross-match
  useEffect(() => {
    if (!cand || !candSky) return setIdentity(null);
    let live = true;
    const yr = A ? 1970 + (A.mjd - 40587) / 365.25 : 2026;
    identify(candSky.ra, candSky.dec, cand, cross, yr).then((id) => live && setIdentity(id));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, cross, cands]);

  // is-it-real checks for the selected candidate
  const checks = useMemo(() => {
    if (!cand || !input || !A || !B) return null;
    let bandsSeen = 0, bandsTried = 0;
    for (const b of BANDS.slice(1)) {
      const fr = buildFrames(input, b.id);
      const fa = fr.find((f) => f.epoch === A.epoch), fb = fr.find((f) => f.epoch === B.epoch);
      if (!fa || !fb) continue;
      bandsTried++;
      const d = difference(fa, fb);
      let peak = 0;
      for (let y = Math.max(0, Math.round(cand.y) - 1); y <= Math.min(HW - 1, Math.round(cand.y) + 1); y++)
        for (let x = Math.max(0, Math.round(cand.x) - 1); x <= Math.min(HW - 1, Math.round(cand.x) + 1); x++) peak = Math.max(peak, Math.abs(d[y * HW + x]));
      if (peak > 3) bandsSeen++;
    }
    const edge = Math.min(cand.x, cand.y, HW - 1 - cand.x, HW - 1 - cand.y) < 4;
    const known = identity && identity.kind !== "unknown";
    return [
      { ok: cand.snr >= 7, warn: cand.snr >= 5, t: "Strong signal", d: `${cand.snr.toFixed(1)}σ — above 7σ is solid; 5–7σ is worth a careful look.` },
      { ok: bandsTried > 0 && bandsSeen >= Math.ceil(bandsTried / 2), warn: bandsSeen >= 2, t: "Seen in several colours", d: `Visible in ${bandsSeen} of ${bandsTried} wavelength bands. Real objects show up in many bands; cosmic rays and glitches usually in one.` },
      { ok: !edge, warn: false, t: "Away from the edge", d: edge ? "Within 4 px of the cutout edge, where data are less reliable." : "Comfortably inside the cutout." },
      { ok: !!cross, warn: false, t: "Checked against catalogues", d: cross ? (known ? `Matches ${identity!.title} — a known object.` : "No known star or asteroid here — interesting!") : "Run Identify (cross-match) to compare with Gaia and NASA/JPL." },
    ];
  }, [cand, input, A, B, identity, cross]);

  const lightCurve = useMemo(() => {
    if (!cand) return null;
    return frames.map((f) => {
      let s = 0, n = 0, sig = 0;
      for (let y = Math.round(cand.y) - 1; y <= Math.round(cand.y) + 1; y++)
        for (let x = Math.round(cand.x) - 1; x <= Math.round(cand.x) + 1; x++) {
          if (x < 0 || y < 0 || x >= HW || y >= HW) continue;
          const v = f.img[y * HW + x];
          if (Number.isFinite(v)) {
            s += v;
            sig += f.sigma[y * HW + x] ** 2;
            n++;
          }
        }
      return { date: mjdToIso(f.mjd), v: n ? s / n : NaN, e: n ? Math.sqrt(sig) / n : NaN };
    });
  }, [cand, frames]);

  const gaiaMarkers: Marker[] = useMemo(() => {
    if (!cross || !showGaia || !A || !B) return [];
    const years = (B.mjd - A.mjd) / 365.25;
    const yrA = 1970 + (A.mjd - 40587) / 365.25;
    return cross.gaia.stars
      .filter((s) => s.phot_g_mean_mag < 17)
      .map((g) => gaiaAt(g, yrA))
      .map((s) => {
        const p = skyToPix(target.ra, target.dec, s.ra, s.dec);
        const pm = Math.hypot(s.pmra ?? 0, s.pmdec ?? 0);
        const dx = (-(s.pmra ?? 0) * years) / 1000 / PIX_ARCSEC;
        const dy = ((s.pmdec ?? 0) * years) / 1000 / PIX_ARCSEC;
        return { x: p.x, y: p.y, color: pm > 200 ? "#ff8bd1" : "rgba(130,200,255,0.55)", r: 1.2, arrow: pm > 200 ? { dx: dx * 4, dy: dy * 4 } : undefined, label: pm > 200 ? `PM ${(pm / 1000).toFixed(2)}″/yr` : undefined };
      })
      .filter((m) => m.x > -2 && m.x < 66 && m.y > -2 && m.y < 66);
  }, [cross, showGaia, A, B, target]);

  const toReview = useCallback(() => {
    const c = cand ?? cands[0];
    const at = c ? pixToSky(target.ra, target.dec, c.x, c.y) : { ra: target.ra, dec: target.dec };
    setReviewDraft({
      source: "blink",
      ra: at.ra,
      dec: at.dec,
      tile: { order: 5, ipix: ang2pix(5, at.ra, at.dec) },
      interpretation: c?.kind === "mover" ? "Moving source" : c ? "Uncertain" : "No candidate found",
      blink: {
        tool: "ChronoLens",
        band: BANDS.find((b) => b.id === band)?.label,
        epochs: frames.map((f) => ({ epoch: f.epoch, date: mjdToIso(f.mjd), planes: f.planes, spacecraftKm: f.sc })),
        compared: A && B ? [mjdToIso(A.mjd), mjdToIso(B.mjd)] : null,
        thresholdSigma: thr,
        candidate: c ?? null,
        allCandidates: cands.length,
        checks: checks?.map((k) => ({ check: k.t, passed: k.ok, detail: k.d })) ?? null,
        identity: identity ? { kind: identity.kind, title: identity.title, facts: identity.facts } : null,
        lightCurve,
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
  }, [cand, cands, target, band, frames, A, B, thr, checks, identity, lightCurve, cross, input, router]);

  // external commands (SI assistant, guided workflows)
  const cmdRef = useRef<(c: ChronoCommand) => void>(() => {});
  cmdRef.current = (c) => {
    if (c.band) setBand(c.band);
    if (c.threshold) setThr(c.threshold);
    if (c.action === "load") load();
    else if (c.action === "play") { setMode("blink"); setPlaying(true); }
    else if (c.action === "pause") setPlaying(false);
    else if (c.action === "difference") setMode("diff");
    else if (c.action === "frames") setMode("blink");
    else if (c.action === "detect_on") setAuto(true);
    else if (c.action === "detect_off") setAuto(false);
    else if (c.action === "crossmatch") runCross();
    else if (c.action === "select") setSel(Math.max(0, (c.index ?? 1) - 1));
    else if (c.action === "submit") toReview();
  };
  useEffect(() => {
    const h = (e: Event) => cmdRef.current((e as CustomEvent<ChronoCommand>).detail);
    window.addEventListener("chronolens", h);
    window.__chronoReady = true;
    return () => {
      window.removeEventListener("chronolens", h);
      window.__chronoReady = false;
    };
  }, []);

  const step = !input ? 0 : !auto || (mode === "blink" && cands.length === 0) ? 1 : sel === null ? 2 : !cross ? 3 : 4;
  const cur = frames[idx];
  const stretch = undefined;
  const cl = contrast;

  return (
    <div className="space-y-4">
      {/* guided steps */}
      <div className="flex flex-wrap items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className={cn("flex items-center gap-2 rounded-full border px-3 py-1 text-[11px]", i < step ? "border-signal/30 text-signal" : i === step ? "border-white/40 bg-white/[0.06] text-white" : "border-white/[0.07] text-white/35")}>
            <span className="font-mono">{i < step ? "✓" : i + 1}</span> {s}
          </div>
        ))}
      </div>

      <div className={cn("grid gap-4", compact ? "" : "xl:grid-cols-[290px_minmax(0,1fr)_340px]")}>
        {/* left */}
        <div className="space-y-4">
          <Panel className="p-4">
            <PanelHeader title={<span className="flex items-center gap-1.5">Where to look <Help>ChronoLens uses the position at the centre of this region. You can also type coordinates (e.g. <code>269.45 4.74</code>) or pick a practice target with a known answer.</Help></span>} />
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
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Other position: RA Dec" className="h-9 min-w-0 flex-1 rounded-full border border-white/10 bg-black/30 px-3 text-[12px] text-white outline-none placeholder:text-white/30" />
              <button className="flex size-9 items-center justify-center rounded-full border border-white/10 text-white/70 hover:text-white" aria-label="Set position"><Search className="size-3.5" /></button>
            </form>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <button onClick={() => setTarget({ ra, dec, label })} className={cn("rounded-full border px-2.5 py-1 text-[11px]", target.label === label ? "border-signal/40 bg-signal/10 text-signal" : "border-white/10 text-white/60")}>This region</button>
              {BLINK_TARGETS.filter((t) => t.answer).map((t) => (
                <button key={t.id} onClick={() => setTarget({ ra: t.ra, dec: t.dec, label: t.name })} className={cn("rounded-full border px-2.5 py-1 text-[11px]", target.label === t.name ? "border-signal/40 bg-signal/10 text-signal" : "border-white/10 text-white/60 hover:text-white")}>
                  Practice: {t.name}
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
                <p className="mt-1 text-[10px] text-white/35">First load of a new position takes 1–2 minutes while NASA/IPAC IRSA sends the data; it&apos;s instant after that.</p>
              </div>
            )}
            {err && <p className="mt-2 text-[11.5px] text-destructive">{err}</p>}
          </Panel>

          <Panel className="p-4">
            <PanelHeader title={<span className="flex items-center gap-1.5">Colour band <Help>SPHEREx sees 102 infrared colours. &quot;All&quot; stacks every cutout for the deepest image. Picking one band helps test whether a change is real — a real object usually appears in several bands.</Help></span>} />
            <div className="mt-3 flex flex-wrap gap-1.5">
              {BANDS.map((b) => (
                <button key={b.id} onClick={() => setBand(b.id)} className={cn("rounded-full border px-2.5 py-1 font-mono text-[10.5px]", band === b.id ? "border-white bg-white text-black" : "border-white/10 text-white/60 hover:text-white")}>
                  {b.label}
                </button>
              ))}
            </div>
          </Panel>

          <Panel className="p-4">
            <PanelHeader title={<span className="flex items-center gap-1.5">Auto-spotter <Help>Subtracts two epochs and looks for spots that changed by more than the threshold, in units of the noise (σ). A dark spot next to a bright one is something that <b>moved</b>; a single spot is something that <b>brightened or faded</b>. Lower thresholds find fainter things but more false alarms.</Help></span>} />
            <label className="mt-3 flex items-center justify-between text-[12px] text-white/80">
              Find moving & changing things
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="accent-[oklch(0.89_0.11_155)]" />
            </label>
            <div className="mt-3 flex justify-between font-mono text-[10.5px] text-white/50"><span>Sensitivity</span><span>{thr.toFixed(1)}σ {thr <= 4 ? "· many false alarms" : thr >= 8 ? "· only strong" : "· balanced"}</span></div>
            <input type="range" min={3} max={10} step={0.5} value={thr} onChange={(e) => setThr(Number(e.target.value))} className="w-full accent-[oklch(0.89_0.11_155)]" />
            <div className="mt-3 flex justify-between font-mono text-[10.5px] text-white/50"><span>Contrast</span><span>×{contrast.toFixed(1)}</span></div>
            <input type="range" min={0.4} max={3} step={0.1} value={contrast} onChange={(e) => setContrast(Number(e.target.value))} className="w-full accent-[oklch(0.89_0.11_155)]" />
          </Panel>
        </div>

        {/* centre */}
        <Panel className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1 rounded-full border border-white/10 p-0.5">
              {(["blink", "diff"] as const).map((m) => (
                <button key={m} onClick={() => setMode(m)} className={cn("rounded-full px-3 py-1 text-[11px]", mode === m ? "bg-white text-black" : "text-white/60")}>
                  {m === "blink" ? "Play epochs" : "What changed"}
                </button>
              ))}
            </div>
            {frames.length > 0 && <LiveTag>{frames.length} epochs · {frames.reduce((s, f) => s + f.planes, 0)} real cutouts</LiveTag>}
          </div>
          <div className="mt-3" style={{ filter: `contrast(${cl}) brightness(${0.85 + cl * 0.15})` }}>
            {frames.length === 0 ? (
              <div className="flex aspect-square w-full flex-col items-center justify-center rounded-xl border border-dashed border-white/10 text-center">
                <Radar className="size-8 text-white/30" />
                <p className="mt-3 max-w-xs text-[12.5px] text-white/50">{input ? "No real cutouts in this band — choose another." : "Press “Load real epochs”. ChronoLens fetches every SPHEREx exposure of this spot and stacks them by visit, so you can watch the sky change over months."}</p>
              </div>
            ) : mode === "blink" ? (
              <BlinkCanvas data={cur?.img ?? null} candidates={cands} selected={sel} markers={gaiaMarkers} stretch={stretch} onPick={(p) => {
                const best = cands.map((c, i) => ({ i, d: Math.hypot(c.x - p.x, c.y - p.y) })).sort((a, b) => a.d - b.d)[0];
                if (best && best.d < 4) setSel(best.i);
              }} />
            ) : (
              <BlinkCanvas data={diff} diverging candidates={cands} selected={sel} markers={gaiaMarkers} onPick={(p) => {
                const best = cands.map((c, i) => ({ i, d: Math.hypot(c.x - p.x, c.y - p.y) })).sort((a, b) => a.d - b.d)[0];
                if (best && best.d < 4) setSel(best.i);
              }} />
            )}
          </div>
          {frames.length > 0 && (
            <div className="mt-3 space-y-3">
              {mode === "blink" ? (
                <div className="flex flex-wrap items-center gap-3">
                  <button onClick={() => setPlaying((p) => !p)} className="flex size-9 items-center justify-center rounded-full bg-white text-black" aria-label={playing ? "Pause" : "Play"}>
                    {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
                  </button>
                  <div className="flex flex-wrap gap-1">
                    {frames.map((f, i) => (
                      <button key={i} onClick={() => { setPlaying(false); setIdx(i); }} className={cn("rounded-md border px-2 py-1 font-mono text-[10.5px]", i === idx ? "border-signal/50 bg-signal/15 text-signal" : "border-white/10 text-white/60")}>
                        {mjdToIso(f.mjd)}
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
                  From
                  <select value={pair[0]} onChange={(e) => setPair([Number(e.target.value), pair[1]])} className="rounded-md border border-white/10 bg-black/40 px-2 py-1">
                    {frames.map((f, i) => <option key={i} value={i}>{mjdToIso(f.mjd)}</option>)}
                  </select>
                  to
                  <select value={pair[1]} onChange={(e) => setPair([pair[0], Number(e.target.value)])} className="rounded-md border border-white/10 bg-black/40 px-2 py-1">
                    {frames.map((f, i) => <option key={i} value={i}>{mjdToIso(f.mjd)}</option>)}
                  </select>
                  <span className="text-white/40">red = got brighter · blue = got fainter or left</span>
                </div>
              )}
              <p className="text-[11px] text-white/40">Tip: click a boxed spot on the image to inspect it. Pink arrows are known fast-moving stars from Gaia.</p>
            </div>
          )}
        </Panel>

        {/* right */}
        <div className="space-y-4">
          <Panel className="p-4">
            <PanelHeader title="Spotted" meta={auto ? `${cands.length}` : "off"} />
            {frames.length > 0 && auto && cands.length === 0 && <p className="mt-3 text-[12px] text-white/45">Nothing changed by more than {thr}σ between these dates. Try a lower sensitivity or another band.</p>}
            <div className="scroll-thin mt-3 max-h-52 space-y-1.5 overflow-y-auto">
              {cands.map((c, i) => {
                const s = pixToSky(target.ra, target.dec, c.x, c.y);
                return (
                  <button key={i} onClick={() => setSel(i)} className={cn("w-full rounded-xl border px-3 py-2 text-left", sel === i ? "border-white/30 bg-white/[0.06]" : "border-white/[0.06] hover:border-white/20")}>
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] text-white">#{i + 1} {c.kind === "mover" ? "moved" : c.kind}</span>
                      <Chip tone={c.kind === "mover" ? "danger" : "warn"}>{c.snr.toFixed(1)}σ</Chip>
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] text-white/45">
                      {formatRA(s.ra, true)} {formatDec(s.dec, true)}
                      {c.kind === "mover" && ` · ${(c.arcsecPerDay! * 365.25).toFixed(1)}″/yr`}
                    </div>
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel className="p-4">
            <div className="flex items-center justify-between">
              <PanelHeader title={<span className="flex items-center gap-1.5">Identify <Help>Compares the field with ESA&apos;s Gaia catalogue (1.8 billion stars with motions and distances) and NASA/JPL&apos;s list of every known asteroid and comet on each observation date. If your spot matches, it&apos;s known; if not, it might be new.</Help></span>} />
              <Btn size="sm" variant="outline" onClick={runCross} disabled={!frames.length || crossBusy}>
                {crossBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />} {cross ? "Re-run" : "Run"}
              </Btn>
            </div>
            {cross && (
              <div className="mt-3 space-y-1 text-[11.5px]">
                <KV k="Gaia stars in view" v={cross.gaia.error ? "unavailable" : cross.gaia.stars.length} />
                <KV k="Fast-moving stars" v={cross.gaia.stars.filter((s) => Math.hypot(s.pmra ?? 0, s.pmdec ?? 0) > 200).length} />
                <KV k="Known asteroids (all dates)" v={cross.asteroids.reduce((s, a) => s + (a.count || 0), 0)} />
                <label className="flex items-center justify-between pt-1 text-white/70">
                  Show Gaia stars on image
                  <input type="checkbox" checked={showGaia} onChange={(e) => setShowGaia(e.target.checked)} />
                </label>
              </div>
            )}
          </Panel>

          <Panel className="p-4">
            <PanelHeader title="Verify with NASA & ESA tools" />
            <div className="mt-2 space-y-0.5">
              {TOOLS.slice(0, 6).map((t) => (
                <a key={t.id} href={t.url(candSky?.ra ?? target.ra, candSky?.dec ?? target.dec, frames[0] ? mjdToIso(frames[0].mjd) : undefined)} target="_blank" rel="noreferrer" title={t.purpose} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-[11.5px] text-white/70 hover:bg-white/[0.05] hover:text-white">
                  <span>{t.name} <span className="text-white/35">· {t.org}</span></span>
                  <ExternalLink className="size-3" />
                </a>
              ))}
            </div>
            <Btn variant="signal" size="sm" className="mt-3 w-full" onClick={toReview} disabled={!frames.length}>
              <Send className="size-3.5" /> Submit for review
            </Btn>
          </Panel>
        </div>
      </div>

      {/* inspection of the selected spot */}
      {cand && candSky && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Panel className="p-4">
            <PanelHeader title={<span className="flex items-center gap-1.5"><Gauge className="size-3.5" /> Is it real?</span>} meta={`#${sel! + 1}`} />
            <div className="mt-3 space-y-2.5">
              {checks?.map((k) => (
                <div key={k.t} className="flex gap-2">
                  {k.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-signal" /> : k.warn ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />}
                  <div>
                    <div className="text-[12.5px] text-white">{k.t}</div>
                    <div className="text-[11px] leading-relaxed text-white/50">{k.d}</div>
                  </div>
                </div>
              ))}
            </div>
            {cand.kind === "mover" && (
              <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                <div className="font-mono text-[10.5px] text-signal">Motion · {(cand.arcsecPerDay! * 365.25).toFixed(1)}″/yr · {cand.shiftPx!.toFixed(1)} px</div>
                <div className="mt-1 text-[12px] text-white">{motionStory(cand.arcsecPerDay! * 365.25).t}</div>
                <p className="mt-1 text-[11px] leading-relaxed text-white/50">{motionStory(cand.arcsecPerDay! * 365.25).d}</p>
              </div>
            )}
            {lightCurve && <LightCurve data={lightCurve} />}
          </Panel>
          <ObjectCard identity={identity} cand={cand} ra={candSky.ra} dec={candSky.dec} hasCross={!!cross} onCross={runCross} busy={crossBusy} />
          <Panel className="p-4">
            <PanelHeader title={<span className="flex items-center gap-1.5"><Orbit className="size-3.5" /> Where Earth was <Help>Each coloured dot is Earth (carrying SPHEREx) on an observation date. The dashed lines point to your spot. Because Earth moves ~2 AU across its orbit in six months, nearby objects appear to shift (parallax). For a known asteroid, its real NASA/JPL orbit is drawn in pink with its position on the same dates.</Help></span>} />
            <Solar3D className="mt-3 h-[300px] w-full" epochs={frames.map((f) => ({ jd: mjdToJd(f.mjd), label: mjdToIso(f.mjd) }))} ra={candSky.ra} dec={candSky.dec} elements={identity?.elements ?? null} />
            <p className="mt-2 text-[10.5px] text-white/40">Drag to rotate · Sun at centre · blue ring = Earth&apos;s orbit{identity?.elements ? " · pink = asteroid orbit (JPL)" : ""}</p>
          </Panel>
        </div>
      )}
    </div>
  );
}

function LightCurve({ data }: { data: { date: string; v: number; e: number }[] }) {
  const ok = data.filter((d) => Number.isFinite(d.v));
  if (ok.length < 2) return null;
  const lo = Math.min(...ok.map((d) => d.v - d.e)), hi = Math.max(...ok.map((d) => d.v + d.e));
  const y = (v: number) => 54 - ((v - lo) / (hi - lo || 1)) * 46;
  const x = (i: number) => 14 + (i / (data.length - 1)) * 232;
  return (
    <div className="mt-4">
      <div className="flex items-center gap-1.5 font-mono text-[10.5px] text-white/50">Brightness over time <Help>Average brightness (MJy/sr) of the 3×3 pixels at this spot in each epoch, with ±1σ error bars. A variable star changes; a moving object makes the spot bright on one date and empty on another.</Help></div>
      <svg viewBox="0 0 260 64" className="mt-1 w-full">
        <polyline fill="none" stroke="oklch(0.89 0.11 155)" strokeWidth="1.2" points={data.map((d, i) => (Number.isFinite(d.v) ? `${x(i)},${y(d.v)}` : "")).join(" ")} />
        {data.map((d, i) =>
          Number.isFinite(d.v) ? (
            <g key={i}>
              <line x1={x(i)} x2={x(i)} y1={y(d.v - d.e)} y2={y(d.v + d.e)} stroke="rgba(255,255,255,.35)" />
              <circle cx={x(i)} cy={y(d.v)} r="2.2" fill="white" />
              <text x={x(i)} y="63" fontSize="6" fill="rgba(255,255,255,.4)" textAnchor="middle">{d.date.slice(2)}</text>
            </g>
          ) : null,
        )}
      </svg>
    </div>
  );
}

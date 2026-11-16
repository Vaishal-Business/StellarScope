"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, FileCheck2, Loader2, Paperclip, Send } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Reveal } from "@/components/motion/reveal";
import { TileImage } from "@/components/sky/tile-image";
import { SpectrumChart } from "@/components/sky/spectrum-chart";
import { Btn, Chip, KV, LiveTag, Panel, PanelHeader, SectionTitle } from "@/components/ui/kit";
import { MISSIONS } from "@/lib/missions";
import { TOOLS, getReviewDraft } from "@/lib/tools";
import { cubePixel } from "@/lib/objects";
import { useJson, type SpectrumResponse } from "@/lib/hooks";
import { api, useSession } from "@/lib/session";
import { parseQuery } from "@/lib/parse";
import { ang2pix } from "@/sky/healpix";
import { formatDec, formatRA } from "@/sky/coords";
import { cn } from "@/lib/utils";

const INTERPRETATIONS = ["Red-sloped point source", "Absorption feature", "Emission feature", "Moving source", "Artefact / cosmic ray", "No candidate found", "Uncertain"];
const CHECKS = [
  { id: "flags", label: "Checked FLAGS / NHITS in the science inspector" },
  { id: "adjacent", label: "Feature spans adjacent channels or epochs (not a single spike)" },
  { id: "gaia", label: "Cross-matched with Gaia DR3 (proper motion / known star)" },
  { id: "jpl", label: "Checked NASA/JPL Small-Body Identification for known asteroids" },
  { id: "simbad", label: "Looked up the position in SIMBAD / Aladin" },
  { id: "edge", label: "Candidate is not at a cutout edge or saturated star" },
];

export function SubmitView() {
  const { user, signIn, refresh } = useSession();
  const [draft, setDraft] = useState<Record<string, unknown> | null>(null);
  const [pos, setPos] = useState<{ ra: number; dec: number } | null>(null);
  const [q, setQ] = useState("");
  const [mission, setMission] = useState("moving-sources");
  const [interp, setInterp] = useState("Uncertain");
  const [confidence, setConfidence] = useState(50);
  const [notes, setNotes] = useState("");
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  useEffect(() => {
    const d = getReviewDraft();
    if (d) {
      setDraft(d);
      if (typeof d.ra === "number" && typeof d.dec === "number") setPos({ ra: d.ra, dec: d.dec });
      if (typeof d.interpretation === "string") setInterp(d.interpretation);
      if (d.source === "blink") setMission("moving-sources");
    }
  }, []);

  const tile = pos ? { order: 5, ipix: ang2pix(5, pos.ra, pos.dec) } : null;
  const px = pos ? cubePixel(pos.ra, pos.dec) : null;
  const spec = useJson<SpectrumResponse>(px ? `/api/science/${px.tile}/spectrum?x=${px.x}&y=${px.y}` : null);

  const submit = async () => {
    if (!user) return signIn("login");
    if (!tile || !pos) return setErr("Set a position first.");
    setBusy(true);
    setErr(null);
    try {
      const flagged = spec.data?.flags?.filter(Boolean).length ?? null;
      const r = await api<{ id: number }>("/api/submissions", {
        json: {
          mission_slug: mission, tile_order: tile.order, tile_ipix: tile.ipix, interpretation: interp, confidence, reasoning: notes,
          evidence: {
            position: { ra: pos.ra, dec: pos.dec }, scienceCube: px ? `Npix${px.tile}_cube.fits` : null, pixel: px ? [px.x, px.y] : null,
            spectrum: spec.data ? { bunit: spec.data.bunit, flaggedChannels: flagged } : null,
            blink: draft?.blink ?? null, crossmatch: draft?.crossmatch ?? null, inputs: draft?.input ?? null,
            verification: CHECKS.filter((c) => checks[c.id]).map((c) => c.label), dataRelease: "SPHEREx DR1",
          },
        },
      });
      setDone(r.id);
      sessionStorage.removeItem("spx-review-draft");
      refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const blink = draft?.blink as { band?: string; compared?: string[]; candidate?: { kind: string; snr: number; shiftPx?: number; arcsecPerDay?: number } | null; epochs?: { date: string; planes: number }[] } | undefined;
  const cross = draft?.crossmatch as { gaiaStarsInField: number; highPmStars: { id: string; pmMasYr: number }[]; knownAsteroids: { date: string; count: number; names: string[] }[] } | undefined;

  if (done)
    return (
      <AppShell>
        <div className="mx-auto max-w-xl px-5 py-20 text-center">
          <FileCheck2 className="mx-auto size-12 text-signal" />
          <h1 className="display mt-6 text-[32px] font-extralight text-white">Submitted for review</h1>
          <p className="mt-3 text-[13.5px] text-white/55">Submission #{done} is in the community review queue with its full evidence bundle. Two independent verifications mark it verified.</p>
          <div className="mt-8 flex justify-center gap-3">
            <Btn variant="primary" href="/community">Open review queue</Btn>
            <Btn variant="outline" href="/explore">Hunt another region</Btn>
          </div>
        </div>
      </AppShell>
    );

  return (
    <AppShell>
      <div className="px-5 md:px-8">
        <Reveal delay={0.08}>
          <SectionTitle eyebrow="Submit for review" title="Package your evidence" desc="Every submission carries the real data behind it — ChronoLens epochs, auto-detections, catalogue cross-matches, the calibrated spectrum and your verification checklist — so any reviewer can reproduce it." />
        </Reveal>
        <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <Reveal delay={0.12} className="space-y-4">
            <Panel className="p-5">
              <PanelHeader title="1 · Position" />
              {pos ? (
                <div className="mt-3 flex items-center gap-4">
                  {tile && <TileImage order={5} ipix={tile.ipix} className="size-24 shrink-0 rounded-xl" gain={1.3} />}
                  <div>
                    <div className="font-mono text-[13px] text-white">{formatRA(pos.ra, true)} {formatDec(pos.dec, true)}</div>
                    <div className="font-mono text-[10.5px] text-white/45">SPX-5-{tile?.ipix} · cube pixel ({px?.x}, {px?.y})</div>
                    {draft?.source === "blink" && <Chip tone="info" className="mt-2">from blink comparator</Chip>}
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-[12px] text-white/45">No draft yet — enter a position, or start from the <Link href="/explore" className="underline">Blink comparator</Link>.</p>
              )}
              <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); const p = parseQuery(q); if (p && "ra" in p) setPos(p); }}>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="RA Dec (deg or sexagesimal)" className="h-9 flex-1 rounded-full border border-white/10 bg-black/30 px-3 text-[12px] text-white outline-none placeholder:text-white/30" />
                <Btn size="sm" variant="outline">Set</Btn>
              </form>
            </Panel>

            <Panel className="p-5">
              <PanelHeader title="2 · Interpretation" />
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-[11px] text-white/50">Mission
                  <select value={mission} onChange={(e) => setMission(e.target.value)} className="mt-1 h-9 w-full rounded-xl border border-white/10 bg-black/40 px-2 text-[12.5px] text-white">
                    {MISSIONS.map((m) => <option key={m.slug} value={m.slug}>{m.title}</option>)}
                  </select>
                </label>
                <label className="text-[11px] text-white/50">Confidence {confidence}%
                  <input type="range" min={0} max={100} value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} className="mt-3 w-full accent-[oklch(0.89_0.11_155)]" />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {INTERPRETATIONS.map((o) => (
                  <button key={o} onClick={() => setInterp(o)} className={cn("rounded-full border px-3 py-1.5 text-[11.5px]", interp === o ? "border-white bg-white text-black" : "border-white/12 text-white/65")}>{o}</button>
                ))}
              </div>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} placeholder="What did you see, between which epochs and channels? What do Gaia and JPL say? Why is it (or isn't it) real?" className="mt-3 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-[13px] text-white outline-none placeholder:text-white/25" />
              <div className="mt-1 text-right font-mono text-[10px] text-white/40">{notes.trim().length}/20+ characters</div>
            </Panel>

            <Panel className="p-5">
              <PanelHeader title="3 · Verification checklist" />
              <div className="mt-3 space-y-1.5">
                {CHECKS.map((c) => (
                  <button key={c.id} onClick={() => setChecks((x) => ({ ...x, [c.id]: !x[c.id] }))} className={cn("flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-[12px]", checks[c.id] ? "border-signal/30 bg-signal/[0.06] text-white" : "border-white/[0.07] text-white/60")}>
                    {checks[c.id] ? <CheckCircle2 className="size-4 text-signal" /> : <span className="size-4 rounded-full border border-white/25" />} {c.label}
                  </button>
                ))}
              </div>
              {err && <p className="mt-3 text-[12px] text-destructive">{err}</p>}
              <div className="mt-4 flex justify-end">
                {user ? (
                  <Btn variant="signal" onClick={submit} disabled={busy || notes.trim().length < 20 || !pos}>
                    {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} Submit for review
                  </Btn>
                ) : (
                  <Btn variant="primary" onClick={() => signIn("login")}>Sign in to submit</Btn>
                )}
              </div>
            </Panel>
          </Reveal>

          <Reveal delay={0.16} className="space-y-4">
            <Panel className="p-5">
              <div className="flex items-center gap-2"><Paperclip className="size-4 text-white/50" /><PanelHeader title="Evidence bundle" /></div>
              <div className="mt-3 space-y-0.5">
                <KV k="ChronoLens band" v={blink?.band ?? "—"} />
                <KV k="Epochs compared" v={blink?.compared?.join(" → ") ?? "—"} />
                <KV k="Detection" v={blink?.candidate ? `${blink.candidate.kind} · ${blink.candidate.snr.toFixed(1)}σ${blink.candidate.arcsecPerDay ? ` · ${(blink.candidate.arcsecPerDay * 365.25).toFixed(1)}″/yr` : ""}` : "—"} />
                <KV k="Gaia DR3 stars in field" v={cross ? cross.gaiaStarsInField : "—"} />
                <KV k="High proper-motion stars" v={cross ? cross.highPmStars.length : "—"} />
                <KV k="Known asteroids (JPL)" v={cross ? cross.knownAsteroids.map((a) => `${a.date}: ${a.count}`).join(" · ") : "—"} />
              </div>
            </Panel>
            {pos && (
              <Panel className="p-5">
                <div className="flex items-center justify-between"><PanelHeader title="Calibrated spectrum at position" /><LiveTag>DR1 cube</LiveTag></div>
                {spec.loading && <p className="py-8 text-center text-[12px] text-white/45">Reading 102 channels… {spec.elapsed.toFixed(0)}s</p>}
                {spec.data && <SpectrumChart data={spec.data} height={180} className="mt-2" />}
              </Panel>
            )}
            <Panel className="p-5">
              <PanelHeader title="Official tools to verify with" />
              <div className="mt-3 space-y-1">
                {TOOLS.map((t) => (
                  <a key={t.id} href={pos ? t.url(pos.ra, pos.dec) : t.url(0, 0)} target="_blank" rel="noreferrer" className="flex items-start justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-white/[0.05]">
                    <span>
                      <span className="block text-[12px] text-white/85">{t.name} <span className="text-white/35">· {t.org}</span></span>
                      <span className="block text-[10.5px] text-white/40">{t.purpose}</span>
                    </span>
                    <ExternalLink className="mt-0.5 size-3 shrink-0 text-white/40" />
                  </a>
                ))}
              </div>
            </Panel>
          </Reveal>
        </div>
      </div>
    </AppShell>
  );
}

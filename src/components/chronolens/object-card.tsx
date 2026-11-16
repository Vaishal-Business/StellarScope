"use client";

import { BookOpen, ExternalLink, Loader2, Sparkles, Wand2 } from "lucide-react";
import { Btn, Chip, KV, Panel, PanelHeader } from "@/components/ui/kit";
import type { Candidate } from "@/lib/blink";
import type { Elements } from "@/lib/solar";
import { angularDistance } from "@/sky/coords";

export interface Cross {
  gaia: { source: string; error?: string; stars: { source_id: string; ra: number; dec: number; phot_g_mean_mag: number; pmra: number | null; pmdec: number | null; parallax?: number | null; sep: number }[] };
  asteroids: { date: string; count: number; error?: string; objects: Record<string, string>[] }[];
}

export interface Identity {
  kind: "star" | "asteroid" | "unknown";
  title: string;
  subtitle: string;
  story: string;
  facts: { k: string; v: string }[];
  links: { label: string; href: string }[];
  discovery?: { who?: string; date?: string; location?: string; text?: string } | null;
  elements?: Elements | null;
}

/** "08 55 10.8" / "-07 14'42\"" style sexagesimal → degrees. */
function sexa(s: string, hours: boolean) {
  const neg = /^\s*-/.test(s);
  const n = (s.match(/[\d.]+/g) ?? []).map(Number);
  if (n.length < 2) return NaN;
  const v = n[0] + (n[1] ?? 0) / 60 + (n[2] ?? 0) / 3600;
  return (neg ? -v : v) * (hours ? 15 : 1);
}

/** Move a Gaia DR3 position (epoch J2016.0) to a given decimal year using its proper motion. */
export function gaiaAt<T extends { ra: number; dec: number; pmra: number | null; pmdec: number | null }>(s: T, year: number): T {
  const dt = year - 2016.0;
  return { ...s, ra: s.ra + ((s.pmra ?? 0) * dt) / 3.6e6 / Math.cos((s.dec * Math.PI) / 180), dec: s.dec + ((s.pmdec ?? 0) * dt) / 3.6e6 };
}

export async function identify(ra: number, dec: number, cand: Candidate, cross: Cross | null, year = 2026): Promise<Identity> {
  const simbad = { label: "SIMBAD", href: `https://simbad.cds.unistra.fr/simbad/sim-coo?Coord=${ra}+${dec}&Radius=30&Radius.unit=arcsec` };
  if (cross) {
    // nearest known asteroid on any epoch date
    let best: { name: string; sep: number; date: string } | null = null;
    for (const day of cross.asteroids)
      for (const o of day.objects) {
        const raKey = Object.keys(o).find((k) => /RA/i.test(k) && /hh/i.test(k));
        const decKey = Object.keys(o).find((k) => /Dec/i.test(k) && /dd/i.test(k));
        if (!raKey || !decKey) continue;
        const sep = angularDistance({ ra, dec }, { ra: sexa(o[raKey], true), dec: sexa(o[decKey], false) }) * 3600;
        if (Number.isFinite(sep) && (!best || sep < best.sep)) best = { name: o["Object name"], sep, date: day.date };
      }
    if (best && best.sep < 40) {
      const r = await fetch(`/api/sbdb?name=${encodeURIComponent(best.name)}`).then((x) => x.json()).catch(() => null);
      return {
        kind: "asteroid",
        title: r?.fullname ?? best.name,
        subtitle: r?.orbitClass ?? "Known solar-system body",
        story: `NASA/JPL places this object ${best.sep.toFixed(0)}″ from your spot on ${best.date}. ${r?.discovery?.text ? `${r.discovery.text}.` : ""} Asteroids move against the stars every day, so ChronoLens sees them appear in one epoch and vanish in the next.`,
        facts: [
          ...(r?.diameterKm ? [{ k: "Diameter", v: `${r.diameterKm} km` }] : []),
          ...(r?.H ? [{ k: "Absolute magnitude H", v: String(r.H) }] : []),
          ...(r?.elements ? [{ k: "Orbit", v: `a = ${r.elements.a.toFixed(2)} AU · e = ${r.elements.e.toFixed(2)} · i = ${r.elements.i.toFixed(1)}°` }] : []),
          ...(r ? [{ k: "Near-Earth object", v: r.neo ? (r.pha ? "yes · potentially hazardous" : "yes") : "no" }] : []),
          { k: "Offset from your spot", v: `${best.sep.toFixed(0)}″ on ${best.date}` },
        ],
        links: [...(r?.url ? [{ label: "JPL Small-Body Database", href: r.url }] : []), simbad],
        discovery: r?.discovery ?? null,
        elements: r?.elements ?? null,
      };
    }
    // nearest Gaia star
    const star = cross.gaia.stars.map((s) => ({ s, sep: angularDistance({ ra, dec }, gaiaAt(s, year)) * 3600 })).sort((a, b) => a.sep - b.sep)[0];
    if (star && star.sep < 15) {
      const s = star.s;
      const pm = Math.hypot(s.pmra ?? 0, s.pmdec ?? 0);
      const plx = s.parallax ?? null;
      const pc = plx && plx > 0 ? 1000 / plx : null;
      return {
        kind: "star",
        title: `Gaia DR3 ${s.source_id}`,
        subtitle: pm > 200 ? "High proper-motion star" : "Catalogued star",
        story:
          cand.kind === "mover"
            ? pm > 200
              ? `A known fast-moving star: Gaia measures ${(pm / 1000).toFixed(2)}″ per year. Your detection is real motion — but it was already found by ESA's Gaia mission.`
              : "A known star that Gaia says barely moves. Apparent motion here is probably a blend, a bright-star artefact or noise."
            : "A known star at this spot. If it changed brightness, it may be a variable star — check its light curve and SIMBAD.",
        facts: [
          { k: "Gaia G magnitude", v: s.phot_g_mean_mag?.toFixed(2) ?? "—" },
          { k: "Proper motion", v: `${(pm / 1000).toFixed(3)}″/yr` },
          ...(pc ? [{ k: "Distance (1/parallax)", v: `${pc.toFixed(1)} pc · ${(pc * 3.2616).toFixed(1)} light-years` }] : []),
          { k: "Offset from your spot", v: `${star.sep.toFixed(1)}″` },
        ],
        links: [{ label: "Gaia archive", href: `https://gea.esac.esa.int/archive/` }, simbad],
      };
    }
  }
  return {
    kind: "unknown",
    title: cross ? "No known match" : "Not yet identified",
    subtitle: cross ? "Possibly new — needs checking" : "Run Identify to compare catalogues",
    story: cross
      ? "Neither Gaia nor NASA/JPL's asteroid list has anything here. That's how discoveries start! Work through the 'Is it real?' checks, look at it in the official tools, then submit it so others can verify."
      : "Press Run under Identify to compare this spot with ESA Gaia and NASA/JPL's known asteroids.",
    facts: [],
    links: [simbad],
  };
}

export function ObjectCard({ identity, cand, ra, dec, hasCross, onCross, busy }: { identity: Identity | null; cand: Candidate; ra: number; dec: number; hasCross: boolean; onCross: () => void; busy: boolean }) {
  return (
    <Panel className="p-4">
      <PanelHeader title={<span className="flex items-center gap-1.5"><BookOpen className="size-3.5" /> What is it?</span>} />
      {!identity ? (
        <p className="mt-3 flex items-center gap-2 text-[12px] text-white/45"><Loader2 className="size-3.5 animate-spin" /> Looking it up…</p>
      ) : (
        <div className="mt-3">
          <div className="flex items-center gap-2">
            {identity.kind === "unknown" && hasCross && <Sparkles className="size-4 text-signal" />}
            <div className="text-[15px] text-white">{identity.title}</div>
          </div>
          <div className="mt-1"><Chip tone={identity.kind === "unknown" ? "signal" : identity.kind === "asteroid" ? "warn" : "info"}>{identity.subtitle}</Chip></div>
          <p className="mt-3 text-[12px] leading-relaxed text-white/65">{identity.story}</p>
          {identity.discovery?.who && (
            <div className="mt-3 rounded-xl border border-signal/20 bg-signal/[0.05] p-3">
              <div className="eyebrow text-signal/80">Who found it</div>
              <div className="mt-1 text-[12.5px] text-white">{identity.discovery.who}</div>
              <div className="font-mono text-[10.5px] text-white/50">{identity.discovery.date}{identity.discovery.location ? ` · ${identity.discovery.location}` : ""}</div>
            </div>
          )}
          <div className="mt-3">{identity.facts.map((f) => <KV key={f.k} k={f.k} v={f.v} />)}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {identity.links.map((l) => (
              <a key={l.href} href={l.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-white/70 hover:text-white">
                {l.label} <ExternalLink className="size-3" />
              </a>
            ))}
          </div>
          {!hasCross && (
            <Btn size="sm" variant="outline" className="mt-3" onClick={onCross} disabled={busy}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />} Identify now
            </Btn>
          )}
          <p className="mt-3 font-mono text-[10px] text-white/30">{ra.toFixed(5)}, {dec.toFixed(5)} · {cand.kind}</p>
        </div>
      )}
    </Panel>
  );
}

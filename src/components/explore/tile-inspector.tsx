"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { ScoutPanel } from "@/components/scout/scout-panel";
import { ArrowUpRight, Brain, ChevronRight, Database, ExternalLink, FileBox, Flag, Layers3, MessagesSquare, Rocket, X } from "lucide-react";
import { describeTile, scienceUrl, hpxFinderUrl, HIPS, WAVELENGTHS_UM, isBlankFrame } from "@/sky/spherex";
import { ang2pix, pix2ang } from "@/sky/healpix";
import { formatDec, formatRA, mjdToDate } from "@/sky/coords";
import { cubePixel } from "@/lib/objects";
import { useJson, type ObservationsResponse, type ScienceIndex, type SpectrumResponse } from "@/lib/hooks";
import { TileImage } from "@/components/sky/tile-image";
import { SpectrumChart } from "@/components/sky/spectrum-chart";
import { Chip, KV, LiveTag, Btn } from "@/components/ui/kit";
import { cn } from "@/lib/utils";
import type { ColorMode } from "@/sky/engine";

type Tab = "overview" | "scout" | "observations" | "spectrum" | "science";

export function TileInspector({
  order,
  ipix,
  color,
  onSelect,
  onClose,
  onFrame,
  scoutRequest,
  onScoutDone,
}: {
  order: number;
  ipix: number;
  color: ColorMode;
  onSelect: (order: number, ipix: number) => void;
  onClose: () => void;
  onFrame: (f: number) => void;
  scoutRequest?: { ra: number; dec: number; apply: boolean; nonce: number } | null;
  onScoutDone?: () => void;
}) {
  const [tab, setTab] = useState<Tab>(scoutRequest ? "scout" : "overview");
  useEffect(() => {
    if (scoutRequest) setTab("scout");
  }, [scoutRequest]);
  const info = describeTile(order, ipix);
  const sciIpix = order === 5 ? ipix : ang2pix(5, info.center.ra, info.center.dec);
  const view = color.kind === "rgb" ? { kind: "rgb" as const, r: color.r, g: color.g, b: color.b } : { kind: "mono" as const, frame: color.frame };

  return (
    <motion.aside
      initial={{ opacity: 0, x: 40, filter: "blur(12px)" }}
      animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, x: 40, filter: "blur(12px)" }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="glass-strong pointer-events-auto flex max-h-full w-[380px] flex-col overflow-hidden rounded-[24px]"
    >
      <div className="relative">
        <TileImage order={order} ipix={ipix} view={view} gain={order <= 2 ? 1.9 : 1.15} gamma={order <= 2 ? 0.85 : 1.05} className="h-[168px] w-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-[oklch(0.14_0.004_260)] via-transparent to-black/30" />
        <button onClick={onClose} className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white/80 backdrop-blur hover:text-white" aria-label="Close inspector">
          <X className="size-4" />
        </button>
        <div className="absolute left-4 top-3">
          <LiveTag>Real tile · DR1</LiveTag>
        </div>
        <div className="absolute bottom-3 left-4 right-4">
          <div className="eyebrow text-white/60">Sky region · order {order}</div>
          <div className="display mt-1 text-[22px] font-light tracking-wide text-white">{info.id}</div>
        </div>
      </div>

      <div className="flex gap-1 border-b border-white/[0.06] px-3 pt-1">
        {(["overview", "scout", "observations", "spectrum", "science"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn("relative px-2 py-2.5 text-[11px] capitalize transition", tab === t ? "text-white" : "text-white/45 hover:text-white/80")}
          >
            {t}
            {tab === t && <motion.span layoutId="insp-tab" className="absolute inset-x-2 -bottom-px h-px bg-signal" />}
          </button>
        ))}
      </div>

      <div className="scroll-thin flex-1 overflow-y-auto px-4 pb-4 pt-3">
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, x: -10, filter: "blur(6px)" }} animate={{ opacity: 1, x: 0, filter: "blur(0px)" }} exit={{ opacity: 0, x: 10 }} transition={{ duration: 0.3 }}>
            {tab === "overview" && <Overview order={order} ipix={ipix} onSelect={onSelect} />}
            {tab === "scout" && (
              <ScoutPanel
                key={scoutRequest?.nonce ?? "manual"}
                ra={scoutRequest?.ra ?? pix2ang(5, sciIpix).ra}
                dec={scoutRequest?.dec ?? pix2ang(5, sciIpix).dec}
                order={order}
                ipix={ipix}
                compact
                autoRun={!!scoutRequest}
                onApplyFrame={onFrame}
                onResult={(r) => {
                  onScoutDone?.();
                  if (scoutRequest?.apply && r.bestFrame !== null) onFrame(r.bestFrame);
                }}
              />
            )}
            {tab === "observations" && <Observations ra={info.center.ra} dec={info.center.dec} />}
            {tab === "spectrum" && <Spectrum ra={info.center.ra} dec={info.center.dec} onFrame={onFrame} />}
            {tab === "science" && <Science ipix={sciIpix} order={order} />}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-white/[0.06] p-3">
        <Btn variant="primary" size="sm" href={`/region/${order}/${ipix}`}>
          Enter region <ArrowUpRight className="size-3.5" />
        </Btn>
        <Btn variant="outline" size="sm" onClick={() => setTab("scout")}>
          <Brain className="size-3.5" /> Spectral Scout
        </Btn>
        <Btn variant="ghost" size="sm" href={`/missions/infrared-detective?tile=${order}/${ipix}`}>
          <Rocket className="size-3.5" /> Start mission
        </Btn>
        <Btn variant="ghost" size="sm" href={`/community?tile=${order}/${ipix}`}>
          <MessagesSquare className="size-3.5" /> Discuss
        </Btn>
      </div>
    </motion.aside>
  );
}

function Overview({ order, ipix, onSelect }: { order: number; ipix: number; onSelect: (o: number, i: number) => void }) {
  const info = describeTile(order, ipix);
  return (
    <div className="space-y-4">
      <section>
        <div className="eyebrow mb-1.5">Identity</div>
        <KV k="HEALPix order / NSIDE" v={`${order} / ${2 ** order}`} />
        <KV k="NESTED pixel" v={ipix} />
        <KV k="Centre RA" v={`${formatRA(info.center.ra, true)} (${info.center.ra.toFixed(4)}°)`} />
        <KV k="Centre Dec" v={`${formatDec(info.center.dec, true)} (${info.center.dec.toFixed(4)}°)`} />
        <KV k="Tile size · area" v={`≈ ${info.sizeDeg.toFixed(2)}° · ${info.areaDeg2.toFixed(3)} deg²`} />
        <KV k="Native pixel scale" v={`${info.pixelScaleArcsec.toFixed(2)}″ (${HIPS.tileWidth}px tile)`} />
      </section>
      <section>
        <div className="eyebrow mb-2">Hierarchy</div>
        <div className="flex flex-wrap items-center gap-1.5">
          {info.parent !== null && (
            <button onClick={() => onSelect(order - 1, info.parent!)} className="rounded-full border border-white/10 px-2.5 py-1 font-mono text-[10.5px] text-white/70 hover:border-white/30 hover:text-white">
              ↑ parent {order - 1}/{info.parent}
            </button>
          )}
          {info.children.map((c) => (
            <button key={c} onClick={() => onSelect(order + 1, c)} className="rounded-full border border-white/10 px-2.5 py-1 font-mono text-[10.5px] text-white/70 hover:border-signal/40 hover:text-signal">
              {order + 1}/{c}
            </button>
          ))}
          {info.children.length === 0 && <Chip tone="warn">Maximum HiPS order</Chip>}
        </div>
      </section>
      <section>
        <div className="eyebrow mb-1.5">Data</div>
        <KV k="Imagery" v="102 frames · PNG (asinh 0–40)" />
        <KV k="Valid channels" v="100 of 102 (f50, f51 blank)" />
        <KV k="Data release" v="SPHEREx DR1 · HiPS 1.4" />
        <KV k="Processing" v={`HipsGen v12.900 · ${HIPS.releaseDate}`} />
        <KV k="Survey span" v={`${mjdToDate(HIPS.tMinMjd).toISOString().slice(0, 10)} → ${mjdToDate(HIPS.tMaxMjd).toISOString().slice(0, 10)}`} />
        <KV k="Coverage (MOC)" v={<span className="text-signal">Covered · sky fraction 1.0</span>} />
        <KV k="Science cubes" v={info.scienceProducts.length ? `${info.scienceProducts.length} × order-5 cube` : "Via order-3+ tiles"} />
      </section>
      <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
        <div className="flex items-start gap-2.5">
          <FileBox className="mt-0.5 size-4 text-white/50" />
          <div className="min-w-0 text-[12px] leading-relaxed text-white/60">
            {order === 5 ? (
              <>
                Science product <span className="font-mono text-white/85">Npix{ipix}_cube.fits</span> — IMAGE, NHITS, FLAGS (512×512×102), SPECTRAL_CHANNELS and WCS-WAVE.
                <div className="mt-2 flex flex-wrap gap-3">
                  <a className="inline-flex items-center gap-1 text-signal hover:underline" href={scienceUrl(ipix)} target="_blank" rel="noreferrer">
                    FITS (~320 MB) <ExternalLink className="size-3" />
                  </a>
                  <a className="inline-flex items-center gap-1 text-white/70 hover:underline" href={hpxFinderUrl(ipix)} target="_blank" rel="noreferrer">
                    HpxFinder record <ExternalLink className="size-3" />
                  </a>
                </div>
              </>
            ) : (
              <>Calibrated cubes exist at order 5. Zoom in or choose a child tile to reach individual science products; the Science tab inspects the cube at this tile&apos;s centre.</>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function Observations({ ra, dec }: { ra: number; dec: number }) {
  const { data, error, loading, elapsed } = useJson<ObservationsResponse>(`/api/observations?ra=${ra.toFixed(4)}&dec=${dec.toFixed(4)}`);
  if (loading)
    return (
      <div className="py-6">
        <div className="flex items-center gap-2 text-[12.5px] text-white/70">
          <Database className="size-4 animate-pulse text-signal" /> Querying IRSA SIAv2 · spherex_dr1
        </div>
        <div className="mt-3 h-[2px] overflow-hidden rounded-full bg-white/[0.06]">
          <div className="h-full bg-signal/70 transition-[width] duration-300" style={{ width: `${Math.min(95, (elapsed / 24) * 100)}%` }} />
        </div>
        <p className="mt-2 font-mono text-[10.5px] text-white/35">{elapsed.toFixed(1)} s · IRSA typically responds in ~20 s</p>
      </div>
    );
  if (error || !data) return <div className="py-6 text-[12px] text-destructive">IRSA query failed: {error}</div>;
  const first = data.exposures[0];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {[
          ["Exposures", data.count],
          ["Visits", data.visits.length],
          ["Epochs", data.epochs.length],
        ].map(([k, v]) => (
          <div key={k as string} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
            <div className="eyebrow">{k}</div>
            <div className="mt-1 text-[20px] font-light tabular-nums text-white">{v}</div>
          </div>
        ))}
      </div>
      <div>
        <div className="eyebrow mb-2">Survey epochs (visits clustered by &gt;30 d gaps)</div>
        <div className="space-y-1.5">
          {data.epochs.map((e) => (
            <div key={e.index} className="flex items-center gap-3 rounded-lg border border-white/[0.06] px-3 py-2">
              <span className="flex size-6 items-center justify-center rounded-full bg-white/[0.06] font-mono text-[10px] text-white">{e.index}</span>
              <span className="flex-1 font-mono text-[11px] text-white/80">
                {mjdToDate(e.tStart).toISOString().slice(0, 10)} → {mjdToDate(e.tEnd).toISOString().slice(0, 10)}
              </span>
              <Chip>{e.visits} visits</Chip>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="eyebrow mb-2">Level-2 exposures</div>
        <div className="max-h-56 overflow-y-auto rounded-xl border border-white/[0.06] scroll-thin">
          <table className="w-full text-left font-mono text-[10.5px]">
            <thead className="sticky top-0 bg-[oklch(0.16_0.004_260)] text-white/40">
              <tr>
                <th className="px-2 py-1.5 font-normal">obs_id</th>
                <th className="px-2 py-1.5 font-normal">det</th>
                <th className="px-2 py-1.5 font-normal">date</th>
                <th className="px-2 py-1.5 font-normal">λ µm</th>
              </tr>
            </thead>
            <tbody>
              {data.exposures.slice(0, 120).map((e, i) => (
                <tr key={i} className="border-t border-white/[0.04] text-white/75 hover:bg-white/[0.03]">
                  <td className="px-2 py-1">
                    <a href={e.accessUrl} target="_blank" rel="noreferrer" className="hover:text-signal">
                      {e.obsId}
                    </a>
                  </td>
                  <td className="px-2 py-1">{e.detector}</td>
                  <td className="px-2 py-1">{mjdToDate(e.tMin).toISOString().slice(0, 10)}</td>
                  <td className="px-2 py-1">
                    {e.emMinUm.toFixed(2)}–{e.emMaxUm.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {first && <p className="mt-2 text-[10.5px] text-white/35">Source: IRSA SIAv2 ({(data.elapsedMs / 1000).toFixed(1)} s). Each row links to its calibrated L2 FITS image.</p>}
      </div>
    </div>
  );
}

function Spectrum({ ra: ra0, dec: dec0, onFrame }: { ra: number; dec: number; onFrame: (f: number) => void }) {
  // A parent tile's centre is a vertex of its order-5 children; sample the centre of the order-5 cell instead.
  const c5 = pix2ang(5, ang2pix(5, ra0, dec0));
  const ra = c5.ra;
  const dec = c5.dec;
  const px = cubePixel(ra, dec);
  const { data, error, loading, elapsed } = useJson<SpectrumResponse>(`/api/science/${px.tile}/spectrum?x=${px.x}&y=${px.y}`);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="eyebrow">Centre-pixel spectrum</div>
        <LiveTag>Calibrated cube</LiveTag>
      </div>
      <p className="font-mono text-[10.5px] text-white/40">
        Npix{px.tile}_cube.fits · pixel ({px.x}, {px.y}) · {formatRA(ra)} {formatDec(dec)}
      </p>
      {loading && (
        <div className="py-8 text-center text-[12px] text-white/55">
          Reading 306 byte ranges from the 320 MB cube… <span className="font-mono">{elapsed.toFixed(1)}s</span>
        </div>
      )}
      {error && <div className="text-[12px] text-destructive">Spectrum unavailable: {error}</div>}
      {data && (
        <>
          <SpectrumChart data={data} height={200} onPick={onFrame} />
          <p className="text-[11px] leading-relaxed text-white/45">
            Points: calibrated IMAGE values ({data.bunit}); bars: NHITS (input pixels contributing, not visit count); orange points have non-zero FLAGS. Click a point to view that channel on the sky.
          </p>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              ["Valid", data.flux.filter((v, i) => v !== null && !isBlankFrame(i)).length],
              ["Flagged", data.flags ? data.flags.filter((f, i) => f && !isBlankFrame(i)).length : "—"],
              ["Peak λ", (() => {
                let best = 0;
                data.flux.forEach((v, i) => {
                  if (v !== null && !isBlankFrame(i) && (data.flux[best] === null || v > (data.flux[best] as number))) best = i;
                });
                return `${WAVELENGTHS_UM[best].toFixed(2)}µm`;
              })()],
            ].map(([k, v]) => (
              <div key={k as string} className="rounded-lg border border-white/[0.06] py-2">
                <div className="eyebrow">{k}</div>
                <div className="mt-0.5 font-mono text-[13px] text-white">{v}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Science({ ipix, order }: { ipix: number; order: number }) {
  const { data, error, loading, elapsed } = useJson<ScienceIndex>(`/api/science/${ipix}`);
  const c = pix2ang(5, ipix);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="eyebrow">FITS structure · Npix{ipix}_cube.fits</div>
        {order !== 5 && <Chip>centre child</Chip>}
      </div>
      {loading && <div className="py-6 text-[12px] text-white/55">Indexing HDUs with HTTP range requests… {elapsed.toFixed(1)}s</div>}
      {error && <div className="text-[12px] text-destructive">{error}</div>}
      {data && (
        <>
          <div className="space-y-1.5">
            {data.hdus.map((h) => (
              <div key={h.index} className="flex items-center gap-3 rounded-lg border border-white/[0.06] px-3 py-2">
                <Layers3 className="size-3.5 text-white/40" />
                <span className="w-32 truncate font-mono text-[11px] text-white">{h.name}</span>
                <span className="flex-1 truncate font-mono text-[10.5px] text-white/45">
                  {h.xtension} · {h.naxis.length ? h.naxis.join("×") : "header"} · {h.bitpix}b
                </span>
                <span className="font-mono text-[10px] text-white/35">{(h.dataBytes / 1048576).toFixed(1)}MB</span>
              </div>
            ))}
          </div>
          <KV k="Total size" v={`${(data.size / 1048576).toFixed(1)} MB`} />
          <KV k="Projection" v="RA---HPX / DEC--HPX · ICRS" />
          <KV k="Units" v={String(data.hdus.find((h) => h.name === "IMAGE")?.cards.find((x) => x.key === "BUNIT")?.value ?? "—")} />
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-[11.5px] leading-relaxed text-white/55">
            <Flag className="mb-1 size-3.5 text-warn" />
            Quantitative values come from IMAGE (calibrated), never the stretched PNG. NHITS counts contributing input pixels — it is not an observation count.
          </div>
          <Btn variant="signal" size="sm" href={`/region/5/${ipix}#science`} className="w-full">
            Open science inspector <ChevronRight className="size-3.5" />
          </Btn>
          <p className="font-mono text-[10px] text-white/30">
            Tile centre {c.ra.toFixed(4)}°, {c.dec.toFixed(4)}°
          </p>
        </>
      )}
    </div>
  );
}

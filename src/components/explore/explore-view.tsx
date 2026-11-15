"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft, Compass, Crosshair, Eye, Globe2, Grid3x3, Hash, Layers, Minus, Orbit, Plus, RotateCcw, Search, Sparkles, Spline, Star, Type, Waypoints, ChevronRight, Info,
} from "lucide-react";
import type { SkyEngine, SkyLayers, ColorMode, HoverInfo, TileRef, LoadingInfo } from "@/sky/engine";
import { SkyCanvas } from "@/components/sky/sky-canvas";
import { SpectralDock } from "./spectral-dock";
import { TileInspector } from "./tile-inspector";
import { Walkthrough } from "./walkthrough";
import { LogoMark } from "@/components/shell/logo";
import { useCommand } from "@/components/shell/command";
import { Reveal } from "@/components/motion/reveal";
import { DEFAULT_RGB, tileId, WAVELENGTHS_UM, describeTile } from "@/sky/spherex";
import { ang2pix, parentOf, tileSizeDeg } from "@/sky/healpix";
import { formatDec, formatRA } from "@/sky/coords";
import { MAP_LAYERS, buildStatusProvider, type TileStatus } from "@/lib/live";
import { drainSkyQueue, registerSky } from "@/lib/sky-bus";
import type { ClientAction } from "@/lib/assistant-tools";
import { frameForWavelength } from "@/lib/scout-client";
import { rememberRegion } from "@/lib/settings";
import { setAssistantContext } from "@/components/assistant/assistant";
import { cn } from "@/lib/utils";

type Cam = { ra: number; dec: number; fov: number; displayOrder: number; gridOrder: number; maxRes: boolean };

const TOOLBAR: { key: keyof SkyLayers; icon: React.ElementType; label: string }[] = [
  { key: "imagery", icon: Eye, label: "SPHEREx imagery" },
  { key: "grid", icon: Grid3x3, label: "HEALPix tile grid" },
  { key: "tileLabels", icon: Hash, label: "Tile numbers" },
  { key: "eqGrid", icon: Globe2, label: "Equatorial grid" },
  { key: "constellations", icon: Waypoints, label: "Constellation lines" },
  { key: "constellationNames", icon: Type, label: "Constellation names" },
  { key: "stars", icon: Star, label: "Bright-star markers" },
  { key: "starNames", icon: Sparkles, label: "Star names" },
  { key: "ecliptic", icon: Orbit, label: "Ecliptic" },
  { key: "galactic", icon: Spline, label: "Galactic equator" },
];

export function ExploreView() {
  const [engine, setEngine] = useState<SkyEngine | null>(null);
  const [cam, setCam] = useState<Cam>({ ra: 266.4, dec: -29, fov: 100, displayOrder: 0, gridOrder: 1, maxRes: false });
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [selected, setSelected] = useState<TileRef | null>(null);
  const [layers, setLayers] = useState<SkyLayers | null>(null);
  const [color, setColor] = useState<ColorMode>({ kind: "rgb", ...DEFAULT_RGB });
  const [loading, setLoading] = useState<LoadingInfo | null>(null);
  const [fps, setFps] = useState(0);
  const [ready, setReady] = useState(false);
  const [showLayers, setShowLayers] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [tileStatus, setTileStatus] = useState<TileStatus | null>(null);
  const [scoutRequest, setScoutRequest] = useState<{ ra: number; dec: number; apply: boolean; nonce: number } | null>(null);
  const camThrottle = useRef(0);
  const { open } = useCommand();

  const onEngine = useCallback((e: SkyEngine | null) => setEngine(e), []);

  const loadStatus = useCallback(() => {
    fetch("/api/tiles/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((s: TileStatus) => setTileStatus(s))
      .catch(() => {});
  }, []);
  useEffect(() => loadStatus(), [loadStatus]);
  useEffect(() => {
    engine?.setStatusProvider(buildStatusProvider(tileStatus));
  }, [engine, tileStatus]);

  // share live view state with the assistant
  useEffect(() => {
    setAssistantContext({
      camera: { ra: +cam.ra.toFixed(3), dec: +cam.dec.toFixed(3), fovDeg: +cam.fov.toFixed(2) },
      selectedTile: selected ? { order: selected.order, ipix: selected.ipix, centre: { ra: +selected.center.ra.toFixed(4), dec: +selected.center.dec.toFixed(4) } } : null,
      display: color.kind === "rgb" ? `RGB ${WAVELENGTHS_UM[color.r]}/${WAVELENGTHS_UM[color.g]}/${WAVELENGTHS_UM[color.b]} µm` : `single ${WAVELENGTHS_UM[color.frame]} µm`,
    });
  }, [cam, selected, color]);
  useEffect(() => {
    if (selected) rememberRegion({ order: selected.order, ipix: selected.ipix });
  }, [selected]);

  // assistant / global actions
  useEffect(() => {
    if (!engine) return;
    const run = (a: ClientAction): boolean => {
      const n = (k: string) => Number(a.args[k]);
      switch (a.name) {
        case "fly_to":
          if (Number.isFinite(n("ra")) && Number.isFinite(n("dec"))) engine.flyTo(((n("ra") % 360) + 360) % 360, Math.max(-90, Math.min(90, n("dec"))), Number.isFinite(n("fov")) ? n("fov") : 8, 2000);
          return true;
        case "select_tile":
          if (Number.isInteger(n("order")) && n("order") >= 0 && n("order") <= 5 && Number.isInteger(n("ipix"))) engine.selectTile(n("order"), n("ipix"));
          return true;
        case "set_wavelength": {
          const f = frameForWavelength(n("wavelength_um"));
          const cmap = (["gray", "inferno", "ice", "viridis"] as const).find((c) => c === a.args.colormap) ?? "inferno";
          const c: ColorMode = { kind: "mono", frame: f, cmap };
          setColor(c);
          engine.setColor(c);
          return true;
        }
        case "set_composite": {
          const c: ColorMode = Number.isFinite(n("r_um"))
            ? { kind: "rgb", r: frameForWavelength(n("r_um")), g: frameForWavelength(Number.isFinite(n("g_um")) ? n("g_um") : 1.9), b: frameForWavelength(Number.isFinite(n("b_um")) ? n("b_um") : 0.85) }
            : { kind: "rgb", ...DEFAULT_RGB };
          setColor(c);
          engine.setColor(c);
          return true;
        }
        case "toggle_layer": {
          const k = a.args.layer as keyof SkyLayers;
          engine.setLayers({ [k]: !!a.args.visible } as Partial<SkyLayers>);
          setLayers(engine.getLayers());
          return true;
        }
        case "run_spectral_scout": {
          const ra = Number.isFinite(n("ra")) ? n("ra") : (engine.getSelected()?.center.ra ?? cam.ra);
          const dec = Number.isFinite(n("dec")) ? n("dec") : (engine.getSelected()?.center.dec ?? cam.dec);
          engine.selectTile(5, ang2pix(5, ra, dec));
          setScoutRequest({ ra, dec, apply: a.args.apply_best_channel !== false, nonce: Date.now() });
          return true;
        }
        default:
          return false;
      }
    };
    const off = registerSky(run);
    const queued = drainSkyQueue();
    if (queued.length) setTimeout(() => queued.forEach(run), 700);
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  useEffect(() => {
    if (!engine) return;
    setLayers(engine.getLayers());
    const offs = [
      engine.on("ready", () => setReady(true)),
      engine.on("camera", (c) => {
        const now = performance.now();
        if (now - camThrottle.current > 60) {
          camThrottle.current = now;
          setCam(c);
        }
      }),
      engine.on("hover", setHover),
      engine.on("select", setSelected),
      engine.on("loading", setLoading),
      engine.on("fps", setFps),
      engine.on("error", (m) => {
        if (m.startsWith("Frame")) setToast(m);
      }),
    ];
    // deep links: ?ra=&dec=&fov= or ?tile=order/ipix
    const p = new URLSearchParams(window.location.search);
    const tile = p.get("tile");
    if (tile) {
      const [o, i] = tile.split("/").map(Number);
      if (Number.isInteger(o) && Number.isInteger(i) && o >= 0 && o <= 5) setTimeout(() => engine.selectTile(o, i), 400);
    } else if (p.get("ra") && p.get("dec")) {
      const ra = Number(p.get("ra"));
      const dec = Number(p.get("dec"));
      const fov = Number(p.get("fov") ?? 20);
      if (Number.isFinite(ra) && Number.isFinite(dec)) setTimeout(() => engine.flyTo(ra, dec, fov, 2200), 300);
    }
    const frame = Number(p.get("frame"));
    if (p.get("frame") && Number.isInteger(frame) && frame >= 0 && frame < 102) {
      const c: ColorMode = { kind: "mono", frame, cmap: "inferno" };
      setColor(c);
      engine.setColor(c);
    }
    return () => offs.forEach((o) => o());
  }, [engine]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(id);
  }, [toast]);

  const toggle = (k: keyof SkyLayers) => {
    if (!engine || !layers) return;
    const v = !layers[k];
    engine.setLayers({ [k]: v } as Partial<SkyLayers>);
    setLayers({ ...layers, [k]: v });
  };
  const setStatus = (id: string | null) => {
    if (!engine || !layers) return;
    engine.setLayers({ status: id });
    setLayers({ ...layers, status: id });
  };
  const applyColor = useCallback(
    (c: ColorMode) => {
      setColor(c);
      engine?.setColor(c);
    },
    [engine],
  );

  const crumbs = selected ? [
    ...(selected.order >= 2 ? [{ order: selected.order - 1, ipix: parentOf(selected.ipix) }] : []),
    { order: selected.order, ipix: selected.ipix },
  ] : [];

  return (
    <main className="fixed inset-0 overflow-hidden bg-black text-white">
      <SkyCanvas
        onEngine={onEngine}
        options={{
          initial: { ra: 266.4, dec: -29, fov: 100 },
          statusProvider: buildStatusProvider(null),
        }}
      />

      {/* vignette */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.55))]" />

      {/* ---------- top bar ---------- */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-4 p-4">
        <Reveal delay={0.05} className="pointer-events-auto flex items-center gap-2">
          <Link href="/" className="glass flex h-11 items-center gap-2.5 rounded-full pl-2 pr-4 text-white/80 hover:text-white">
            <span className="flex size-7 items-center justify-center rounded-full bg-white/[0.06]">
              <ArrowLeft className="size-3.5" />
            </span>
            <LogoMark className="size-5" />
            <span className="display text-[11px] font-light tracking-[0.4em]">STELLARSCOPE</span>
          </Link>
          <div className="glass hidden h-11 items-center gap-1.5 rounded-full px-4 text-[12px] md:flex">
            <button onClick={() => { engine?.clearSelection(); engine?.resetView(); }} className={cn("transition", selected ? "text-white/50 hover:text-white" : "text-white")}>
              All Sky
            </button>
            {crumbs.map((c, i) => (
              <span key={`${c.order}/${c.ipix}`} className="flex items-center gap-1.5">
                <ChevronRight className="size-3 text-white/30" />
                <button onClick={() => engine?.selectTile(c.order, c.ipix)} className={cn("font-mono text-[11px]", i === crumbs.length - 1 ? "text-signal" : "text-white/55 hover:text-white")}>
                  {tileId(c.order, c.ipix)}
                </button>
              </span>
            ))}
          </div>
        </Reveal>

        <Reveal delay={0.1} className="pointer-events-auto">
          <button onClick={open} className="glass hidden h-11 w-[300px] items-center gap-2.5 rounded-full px-4 text-left text-[12.5px] text-white/45 hover:text-white/80 lg:flex">
            <Search className="size-4" /> Search object, RA/Dec or tile ID
            <kbd className="ml-auto rounded-md border border-white/10 px-1.5 font-mono text-[10px]">⌘K</kbd>
          </button>
        </Reveal>

        {/* Stellarium-style toggle bar */}
        <Reveal delay={0.15} className="pointer-events-auto">
          <div className="glass flex items-center gap-0.5 rounded-full p-1">
            {TOOLBAR.map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                title={label}
                onClick={() => toggle(key)}
                className={cn(
                  "group relative flex size-9 items-center justify-center rounded-full transition-all duration-300",
                  layers?.[key] ? "bg-white/[0.1] text-white" : "text-white/35 hover:text-white/80",
                )}
              >
                <Icon className="size-[15px]" />
                <span className="pointer-events-none absolute top-11 whitespace-nowrap rounded-md border border-white/10 bg-black/80 px-2 py-1 text-[10.5px] text-white/85 opacity-0 transition group-hover:opacity-100">{label}</span>
              </button>
            ))}
          </div>
        </Reveal>
      </div>

      {/* ---------- left: layers ---------- */}
      <div className="pointer-events-none absolute left-4 top-20 bottom-24 flex flex-col gap-3">
        <Reveal delay={0.22} className="pointer-events-auto">
          <div className="glass w-[264px] rounded-[22px] p-4">
            <button onClick={() => setShowLayers((v) => !v)} className="flex w-full items-center justify-between">
              <span className="flex items-center gap-2">
                <Layers className="size-4 text-white/60" />
                <span className="text-[13px] text-white">Map layers</span>
              </span>
              <span className="font-mono text-[10px] text-white/40">{layers?.status ? "1 active" : "none"}</span>
            </button>
            <AnimatePresence initial={false}>
              {showLayers && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <p className="mt-1 text-[11px] text-white/40">Toggle what appears on the celestial map.</p>
                  <div className="mt-3 space-y-1">
                    {MAP_LAYERS.map((l) => {
                      const active = layers?.status === l.id;
                      return (
                        <button
                          key={l.id}
                          onClick={() => setStatus(active ? null : l.id)}
                          className={cn("flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition", active ? "border-white/20 bg-white/[0.07]" : "border-transparent hover:bg-white/[0.04]")}
                        >
                          <span className={cn("mt-0.5 flex size-4 items-center justify-center rounded-[5px] border", active ? "border-signal bg-signal" : "border-white/25")}>
                            {active && <span className="size-1.5 rounded-sm bg-black" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2 text-[12.5px] text-white">
                              {l.label}
                              {l.id !== "coverage" && tileStatus && (
                                <span className="font-mono text-[9px] text-white/35">{(tileStatus[l.id as keyof TileStatus] ?? []).length}</span>
                              )}
                            </span>
                            <span className="block text-[10.5px] text-white/40">{l.desc}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-3">
                    <span className="font-mono text-[10px] text-white/40">Grid order</span>
                    <div className="flex gap-0.5">
                      {(["auto", 0, 1, 2, 3, 4, 5] as const).map((o) => (
                        <button
                          key={o}
                          onClick={() => {
                            engine?.setLayers({ gridOrder: o });
                            if (layers) setLayers({ ...layers, gridOrder: o });
                          }}
                          className={cn("h-6 min-w-6 rounded-md px-1 font-mono text-[10px] transition", layers?.gridOrder === o ? "bg-white text-black" : "text-white/50 hover:bg-white/10")}
                        >
                          {o === "auto" ? "A" : o}
                        </button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </Reveal>

        <Reveal delay={0.3} className="pointer-events-auto">
          <div className="glass w-[264px] rounded-[22px] p-4">
            <div className="flex items-center justify-between">
              <span className="eyebrow">View</span>
              <span className="font-mono text-[10px] text-signal">{ready ? "STREAMING" : "CONNECTING"}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
              <Mini k="Centre RA" v={formatRA(cam.ra)} />
              <Mini k="Centre Dec" v={formatDec(cam.dec)} />
              <Mini k="Field of view" v={`${cam.fov.toFixed(cam.fov < 10 ? 2 : 1)}°`} />
              <Mini k="Imagery order" v={cam.displayOrder === 0 ? "Allsky" : `${cam.displayOrder} · ${(3.58 * 2 ** (5 - cam.displayOrder) * 3.6).toFixed(1)}″`} />
              <Mini k="Grid order" v={`${cam.gridOrder} · ${tileSizeDeg(cam.gridOrder).toFixed(1)}°`} />
              <Mini k="Tiles loaded" v={loading ? `${loading.loaded}${loading.pending ? ` +${loading.pending}` : ""}` : "—"} />
            </div>
          </div>
        </Reveal>
      </div>

      {/* ---------- hover card ---------- */}
      <AnimatePresence>
        {hover && (!selected || selected.ipix !== hover.ipix || selected.order !== hover.order) && (
          <motion.div
            key="hover"
            initial={{ opacity: 0, scale: 0.96, filter: "blur(6px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            className="glass-strong pointer-events-none absolute z-30 w-[236px] rounded-2xl p-3.5"
            style={{ left: Math.min(hover.x + 18, (typeof window !== "undefined" ? window.innerWidth : 1600) - 256), top: Math.max(hover.y - 20, 80) }}
          >
            <HoverBody hover={hover} status={tileStatus} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------- right: inspector ---------- */}
      <div className="pointer-events-none absolute bottom-[132px] right-4 top-20 flex items-start">
        <AnimatePresence>
          {selected && (
            <TileInspector
              key={`${selected.order}/${selected.ipix}`}
              order={selected.order}
              ipix={selected.ipix}
              color={color}
              onSelect={(o, i) => engine?.selectTile(o, i)}
              onClose={() => engine?.clearSelection()}
              onFrame={(f) => applyColor({ kind: "mono", frame: f, cmap: color.kind === "mono" ? color.cmap : "inferno" })}
              scoutRequest={scoutRequest && selected.order === 5 && selected.ipix === ang2pix(5, scoutRequest.ra, scoutRequest.dec) ? scoutRequest : null}
              onScoutDone={loadStatus}
            />
          )}
        </AnimatePresence>
      </div>

      {/* ---------- zoom controls ---------- */}
      <Reveal delay={0.35} x={20} className="pointer-events-auto absolute bottom-[132px] right-4" style={{ display: selected ? "none" : undefined }}>
        <div className="glass flex flex-col items-center gap-0.5 rounded-full p-1">
          <button onClick={() => engine?.zoomBy(0.6)} className="flex size-9 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white" aria-label="Zoom in">
            <Plus className="size-4" />
          </button>
          <button onClick={() => engine?.zoomBy(1.6)} className="flex size-9 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white" aria-label="Zoom out">
            <Minus className="size-4" />
          </button>
          <div className="my-0.5 h-px w-5 bg-white/10" />
          <button onClick={() => { engine?.clearSelection(); engine?.resetView(); }} className="flex size-9 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white" aria-label="Reset view">
            <RotateCcw className="size-4" />
          </button>
          <button onClick={() => engine?.flyTo(cam.ra, 90, 70)} className="flex size-9 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white" aria-label="North pole">
            <Compass className="size-4" />
          </button>
        </div>
      </Reveal>

      {/* ---------- max resolution notice ---------- */}
      <AnimatePresence>
        {cam.maxRes && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="glass-strong pointer-events-auto absolute left-1/2 top-20 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full py-1.5 pl-4 pr-1.5 text-[12px]">
            <Info className="size-4 text-warn" />
            Maximum SPHEREx all-sky mosaic resolution reached (12.9″/px).
            {selected && (
              <Link href={`/region/${selected.order}/${selected.ipix}#science`} className="rounded-full bg-white px-3 py-1 text-[11px] font-medium text-black">
                Inspect science data
              </Link>
            )}
          </motion.div>
        )}
        {toast && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="glass-strong absolute bottom-40 left-1/2 z-30 -translate-x-1/2 rounded-full px-4 py-2 text-[12px] text-warn">
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------- bottom: spectral dock + status ---------- */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 pb-3">
        <Reveal delay={0.4} x={0} y={24} className="pointer-events-auto">
          <SpectralDock color={color} onColor={applyColor} />
        </Reveal>
        <Reveal delay={0.5} x={0} y={10} className="pointer-events-auto">
          <div className="flex items-center gap-4 rounded-full px-4 py-1 font-mono text-[10.5px] text-white/55">
            <span className="text-white/80">SPHEREx DR1</span>
            <span>λ {color.kind === "mono" ? `${WAVELENGTHS_UM[color.frame].toFixed(3)} µm` : `RGB ${WAVELENGTHS_UM[color.r].toFixed(2)}/${WAVELENGTHS_UM[color.g].toFixed(2)}/${WAVELENGTHS_UM[color.b].toFixed(2)} µm`}</span>
            <span>FOV {cam.fov.toFixed(1)}°</span>
            <span>{fps} FPS</span>
            {hover && (
              <span className="text-white/80">
                <Crosshair className="mr-1 inline size-3" />
                {formatRA(hover.pointer.ra, true)} {formatDec(hover.pointer.dec, true)}
              </span>
            )}
            {loading && loading.pending > 0 && <span className="text-signal">streaming {loading.pending}</span>}
            <span className="hidden md:inline">{(loading ? loading.bytes / 1048576 : 0).toFixed(1)} MB</span>
          </div>
        </Reveal>
      </div>

      {!ready && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.2em] text-white/50">
            <span className="size-1.5 rounded-full bg-signal animate-pulse-dot" /> Streaming SPHEREx all-sky cube
          </div>
        </div>
      )}

      <Walkthrough engine={engine} />
    </main>
  );
}

function Mini({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate font-mono text-[9px] uppercase tracking-[0.14em] text-white/35">{k}</div>
      <div className="truncate font-mono text-[11.5px] text-white/85">{v}</div>
    </div>
  );
}

function HoverBody({ hover, status }: { hover: HoverInfo; status: TileStatus | null }) {
  const info = describeTile(hover.order, hover.ipix);
  const provider = buildStatusProviderCached(status);
  const ai = !!provider("screened", hover.order, hover.ipix);
  const reviewed = !!provider("reviewed", hover.order, hover.ipix);
  const candidate = !!provider("candidates", hover.order, hover.ipix);
  return (
    <>
      <div className="flex items-center justify-between">
        <span className="eyebrow">Sky region</span>
        <span className="flex items-center gap-1 font-mono text-[9.5px] uppercase tracking-wider text-signal">
          <span className="size-1.5 rounded-full bg-signal" /> Data available
        </span>
      </div>
      <div className="display mt-1.5 text-[18px] font-light text-white">{info.id}</div>
      <div className="mt-2.5 space-y-1 text-[11.5px]">
        <Row k="Order · pixel" v={`${hover.order} · ${hover.ipix}`} />
        <Row k="Centre" v={`${info.center.ra.toFixed(2)}°, ${info.center.dec.toFixed(2)}°`} />
        <Row k="Size" v={`${info.sizeDeg.toFixed(2)}°`} />
        <Row k="Spectral channels" v="102 (100 valid)" />
        <Row k="Science cubes" v={hover.order >= 3 ? `${info.scienceProducts.length}` : "zoom in"} />
        <Row k="Spectral Scout" v={candidate ? "Candidate" : ai ? "Screened" : "Not run"} />
        <Row k="Community review" v={reviewed ? "Reviewed" : "None yet"} />
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-white/[0.07] pt-2.5 text-[11px] text-white/60">
        Click to explore this region <ChevronRight className="size-3.5" />
      </div>
    </>
  );
}

let cachedFor: TileStatus | null | undefined;
let cachedProvider: ReturnType<typeof buildStatusProvider> | null = null;
function buildStatusProviderCached(s: TileStatus | null) {
  if (s !== cachedFor || !cachedProvider) {
    cachedFor = s;
    cachedProvider = buildStatusProvider(s);
  }
  return cachedProvider;
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-white/45">{k}</span>
      <span className="font-mono text-white/90">{v}</span>
    </div>
  );
}

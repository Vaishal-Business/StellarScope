"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { allskyUrl, DEFAULT_RGB, HIPS_BASE } from "@/sky/spherex";
import { LogoMark } from "./logo";

const STEPS = [
  "Connecting to IRSA · SPHEREx DR1",
  "Reading HiPS properties",
  "Streaming all-sky cube · 102 channels",
  "Building HEALPix NESTED grid",
  "Calibrating false-colour composite",
  "Entering the infrared sky",
];

/**
 * Loading curve: a deliberately slow, slightly hesitant crawl to ~74%, then a near-instant zip to 100%.
 * Real work (HiPS properties + all-sky composite frames) is warmed in the background meanwhile.
 */
function crawl(t: number) {
  // t in ms; asymptotic ease with micro-stalls
  const base = 0.74 * (1 - Math.exp(-t / 1100));
  const stall = 0.012 * Math.sin(t / 170) * Math.exp(-t / 2400);
  return Math.max(0, base + stall);
}

/**
 * mode "cover": opaque placeholder while settings are read (prevents a flash of content);
 * "run": animate the loading bar; "off": hidden.
 */
export function Splash({ mode, onDone }: { mode: "cover" | "run" | "off"; onDone?: () => void }) {
  const [finished, setFinished] = useState(false);
  const show = mode === "off" || finished ? false : mode === "run" ? true : null;
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState(0);
  const zipAt = useRef<number | null>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (mode !== "run") return;
    // warm the HTTP cache with what the sky needs first
    const warm = [
      `${HIPS_BASE}/properties`,
      allskyUrl(DEFAULT_RGB.r),
      allskyUrl(DEFAULT_RGB.g),
      allskyUrl(DEFAULT_RGB.b),
      "/data/sky-catalog.json",
    ].map((u) => fetch(u, { cache: "force-cache", mode: "cors" }).catch(() => null));
    let warmed = false;
    Promise.all(warm).then(() => (warmed = true));

    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = now - t0;
      let p: number;
      if (zipAt.current === null) {
        p = crawl(t);
        // zip once the minimum cinematic time has passed and assets are warm (or we've waited long enough)
        if ((t > 2600 && warmed) || t > 5200) zipAt.current = now;
      } else {
        const z = Math.min(1, (now - zipAt.current) / 240);
        const from = crawl(zipAt.current - t0);
        p = from + (1 - from) * (1 - Math.pow(1 - z, 3));
      }
      setProgress(p);
      setStep(Math.min(STEPS.length - 1, Math.floor((p / 0.78) * (STEPS.length - 1))));
      if (p >= 0.999) {
        setStep(STEPS.length - 1);
        setTimeout(() => {
          sessionStorage.setItem("spx-splash", "1");
          setFinished(true);
          setTimeout(() => doneRef.current?.(), 350);
        }, 260);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mode]);

  return (
    <AnimatePresence>
      {show !== false && (
        <motion.div
          key="splash"
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-[oklch(0.1_0.004_260)] grain"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, filter: "blur(12px)", scale: 1.02 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* concentric orbits */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            {[260, 420, 620, 880].map((s, i) => (
              <motion.div
                key={s}
                className="absolute rounded-full border border-white/[0.05]"
                style={{ width: s, height: s }}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1 + i * 0.12, duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
              >
                <span
                  className="absolute left-1/2 top-0 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/50"
                  style={{ animation: `orbit-spin ${18 + i * 9}s linear infinite`, transformOrigin: `50% ${s / 2}px` }}
                />
              </motion.div>
            ))}
            <div className="absolute size-[520px] rounded-full bg-[radial-gradient(circle,oklch(0.89_0.11_155/0.07),transparent_65%)]" />
          </div>

          {show && (
            <div className="relative flex w-[min(420px,80vw)] flex-col items-center">
              <motion.div
                initial={{ opacity: 0, filter: "blur(10px)", y: 8 }}
                animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
                transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
              >
                <LogoMark className="size-12 text-white" animated />
              </motion.div>
              <motion.div
                className="display mt-7 text-[22px] font-light tracking-[0.42em] text-white"
                initial={{ opacity: 0, letterSpacing: "0.8em", filter: "blur(8px)" }}
                animate={{ opacity: 1, letterSpacing: "0.42em", filter: "blur(0px)" }}
                transition={{ delay: 0.25, duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
              >
                STELLARSCOPE
              </motion.div>
              <motion.div
                className="eyebrow mt-2 tracking-[0.5em]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6, duration: 1 }}
              >
                Explorer
              </motion.div>

              <motion.div
                className="mt-14 w-full"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.8 }}
              >
                <div className="relative h-[2px] w-full overflow-hidden rounded-full bg-white/[0.07]">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-white/40 via-white to-signal"
                    style={{ width: `${progress * 100}%` }}
                  />
                  <div
                    className="absolute inset-y-[-3px] w-10 rounded-full bg-signal/50 blur-md"
                    style={{ left: `calc(${progress * 100}% - 20px)` }}
                  />
                </div>
                <div className="mt-3 flex items-center justify-between font-mono text-[10.5px] uppercase tracking-[0.16em] text-white/45">
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={step}
                      initial={{ opacity: 0, x: -8, filter: "blur(4px)" }}
                      animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                      exit={{ opacity: 0, x: 8, filter: "blur(4px)" }}
                      transition={{ duration: 0.3 }}
                    >
                      {STEPS[step]}
                    </motion.span>
                  </AnimatePresence>
                  <span className="tabular-nums text-white/70">{Math.round(progress * 100)}%</span>
                </div>
              </motion.div>
            </div>
          )}

          <div className="absolute bottom-8 left-0 right-0 flex justify-center">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/25">
              NASA SPHEREx · IPAC/IRSA DR1 · 0.75–5.0 <span className="normal-case">µm</span>
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

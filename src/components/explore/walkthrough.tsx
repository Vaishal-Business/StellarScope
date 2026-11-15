"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { ArrowRight, X } from "lucide-react";
import type { SkyEngine } from "@/sky/engine";
import { ang2pix } from "@/sky/healpix";
import { useSplashReady } from "@/components/motion/reveal";

const STEPS = [
  {
    title: "Welcome to the universe",
    body: "You are standing at the centre of the celestial sphere. Everything around you is real SPHEREx DR1 infrared imagery — drag to look around, scroll to zoom.",
    cta: "Explore the sky",
    run: (e: SkyEngine) => e.flyTo(266.4, -29, 95, 1800),
  },
  {
    title: "The sky is divided into tiles",
    body: "The grid is HEALPix — equal-area cells used by the SPHEREx archive. Each cell links to observations, 102 spectral channels and calibrated science cubes. Hover to see what's inside.",
    cta: "Show me a region",
    run: (e: SkyEngine) => e.setLayers({ grid: true }),
  },
  {
    title: "Select a region",
    body: "We'll fly to the Orion Nebula. Clicking a tile selects it, zooms in and opens its inspector — the cells subdivide into four children as you go deeper.",
    cta: "Fly to Orion",
    run: (e: SkyEngine) => e.selectTile(3, ang2pix(3, 83.82, -5.39)),
  },
  {
    title: "102 colours of infrared",
    body: "SPHEREx splits 0.75–5 µm into 102 channels. Switch to Single channel in the dock below and step through wavelengths — dust, ices and stars change character as you go.",
    cta: "Next",
    run: () => {},
  },
  {
    title: "Investigate and contribute",
    body: "The inspector pulls real observation visits, FITS structure and calibrated spectra straight from IRSA. Start a mission from any tile to turn your findings into a reviewable contribution.",
    cta: "Start exploring",
    run: () => {},
  },
];

export function Walkthrough({ engine }: { engine: SkyEngine | null }) {
  const [step, setStep] = useState<number | null>(null);
  const splashDone = useSplashReady();

  useEffect(() => {
    if (!engine || !splashDone) return;
    if (localStorage.getItem("spx-walkthrough") === "done") return;
    const id = setTimeout(() => setStep(0), 1400);
    return () => clearTimeout(id);
  }, [engine, splashDone]);

  const finish = () => {
    localStorage.setItem("spx-walkthrough", "done");
    setStep(null);
  };

  return (
    <AnimatePresence>
      {step !== null && (
        <motion.div
          key={step}
          initial={{ opacity: 0, x: -30, filter: "blur(12px)" }}
          animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, x: 20, filter: "blur(8px)" }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="glass-strong pointer-events-auto absolute bottom-[150px] left-[300px] z-40 w-[360px] rounded-[22px] p-5"
        >
          <div className="flex items-center justify-between">
            <span className="eyebrow text-signal/80">First contact · step {step + 1} of {STEPS.length}</span>
            <button onClick={finish} className="text-white/40 hover:text-white" aria-label="Skip tutorial">
              <X className="size-4" />
            </button>
          </div>
          <h3 className="display mt-3 text-[20px] font-light leading-tight text-white">{STEPS[step].title}</h3>
          <p className="mt-2 text-[13px] leading-relaxed text-white/60">{STEPS[step].body}</p>
          <div className="mt-4 flex gap-1">
            {STEPS.map((_, i) => (
              <span key={i} className={`h-[3px] flex-1 rounded-full transition-colors duration-500 ${i <= step ? "bg-signal" : "bg-white/10"}`} />
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between">
            <button onClick={() => (step > 0 ? setStep(step - 1) : finish())} className="text-[12px] text-white/50 hover:text-white">
              {step > 0 ? "Back" : "Skip"}
            </button>
            <button
              onClick={() => {
                if (engine) STEPS[step].run(engine);
                if (step === STEPS.length - 1) finish();
                else setStep(step + 1);
              }}
              className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-black"
            >
              {STEPS[step].cta} <ArrowRight className="size-3.5" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { SkipForward, Volume2, VolumeX } from "lucide-react";

/** Full-screen intro film shown on first load. Skippable; can be turned off in Settings. */
export function IntroVideo({ onDone }: { onDone: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [t, setT] = useState(0);
  const [skipVisible, setSkipVisible] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.play().catch(() => {});
    const id = setTimeout(() => setSkipVisible(true), 600);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") onDone();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(id);
      window.removeEventListener("keydown", onKey);
    };
  }, [onDone]);

  return (
    <motion.div
      className="fixed inset-0 z-[110] bg-black"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, filter: "blur(14px)", scale: 1.02 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
    >
      <video
        ref={ref}
        src="/media/intro.mp4"
        poster="/media/intro-poster.jpg"
        className="absolute inset-0 h-full w-full object-cover"
        playsInline
        muted={muted}
        preload="auto"
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime / (e.currentTarget.duration || 1))}
        onEnded={onDone}
        onError={onDone}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.65))]" />
      <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/10">
        <div className="h-full bg-white/80 transition-[width] duration-200" style={{ width: `${t * 100}%` }} />
      </div>
      <motion.div className="absolute bottom-8 right-8 flex items-center gap-2" initial={{ opacity: 0, x: 16 }} animate={{ opacity: skipVisible ? 1 : 0, x: skipVisible ? 0 : 16 }}>
        <button
          onClick={() => setMuted((m) => !m)}
          className="flex size-11 items-center justify-center rounded-full border border-white/20 bg-black/40 text-white/85 backdrop-blur-md hover:border-white/40"
          aria-label={muted ? "Unmute" : "Mute"}
        >
          {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
        </button>
        <button onClick={onDone} className="flex h-11 items-center gap-2 rounded-full border border-white/20 bg-black/40 px-5 text-[11.5px] font-medium uppercase tracking-[0.14em] text-white backdrop-blur-md hover:border-white/40">
          Skip intro <SkipForward className="size-4" />
        </button>
      </motion.div>
      <div className="absolute bottom-9 left-8 font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">You can turn the intro off in Settings</div>
    </motion.div>
  );
}

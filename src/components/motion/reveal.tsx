"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import { createContext, useContext, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** True once the splash has dissolved (or immediately if it was already seen this session). */
export const SplashReady = createContext(true);
export const useSplashReady = () => useContext(SplashReady);

type RevealProps = HTMLMotionProps<"div"> & {
  delay?: number;
  x?: number;
  y?: number;
  blur?: number;
  duration?: number;
};

const EASE = [0.22, 1, 0.36, 1] as const;

/** Blur-fade-from-left entrance used for every UI element on load. Waits for the splash. */
export function Reveal({ delay = 0, x = -28, y = 0, blur = 12, duration = 0.9, className, children, ...rest }: RevealProps) {
  const splashDone = useSplashReady();
  // Flip to "show" only after mount so a readiness change during hydration is never missed.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const ready = splashDone && mounted;
  return (
    <motion.div
      variants={{
        hide: { opacity: 0, x, y, filter: `blur(${blur}px)` },
        show: { opacity: 1, x: 0, y: 0, filter: "blur(0px)", transition: { delay, duration, ease: EASE } },
      }}
      initial="hide"
      animate={ready ? "show" : "hide"}
      className={cn(className)}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/** Same entrance, but triggered when scrolled into view. */
export function RevealInView({ delay = 0, x = -28, y = 0, blur = 12, duration = 0.9, className, children, ...rest }: RevealProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x, y, filter: `blur(${blur}px)` }}
      whileInView={{ opacity: 1, x: 0, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ delay, duration, ease: EASE }}
      className={cn(className)}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";

/** A four-point star inside a spherical frame — StellarScope mark. */
export function LogoMark({ className, animated = false }: { className?: string; animated?: boolean }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={cn("size-6", className)} aria-hidden>
      <motion.circle
        cx="24"
        cy="24"
        r="21"
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="1"
        initial={animated ? { pathLength: 0 } : false}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
      />
      <motion.ellipse
        cx="24"
        cy="24"
        rx="21"
        ry="7.5"
        stroke="currentColor"
        strokeOpacity="0.28"
        strokeWidth="1"
        initial={animated ? { pathLength: 0 } : false}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
      />
      <motion.path
        d="M24 9.5 C25 19 29 23 38.5 24 C29 25 25 29 24 38.5 C23 29 19 25 9.5 24 C19 23 23 19 24 9.5 Z"
        fill="currentColor"
        initial={animated ? { scale: 0.4, opacity: 0, rotate: -45 } : false}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        style={{ transformOrigin: "24px 24px" }}
        transition={{ duration: 1.2, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
      />
    </svg>
  );
}

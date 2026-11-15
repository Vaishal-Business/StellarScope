"use client";

import { useEffect, useRef } from "react";
import type { SkyEngine, SkyEngineOptions } from "@/sky/engine";
import { cn } from "@/lib/utils";

/**
 * Mounts the framework-independent SkyEngine. React never re-renders per frame:
 * the engine owns its own rAF loop and talks back through events.
 */
export function SkyCanvas({
  options,
  onEngine,
  className,
}: {
  options?: SkyEngineOptions;
  onEngine?: (engine: SkyEngine | null) => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const optsRef = useRef(options);
  const cbRef = useRef(onEngine);
  cbRef.current = onEngine;

  useEffect(() => {
    let engine: SkyEngine | null = null;
    let cancelled = false;
    import("@/sky/engine").then(({ SkyEngine }) => {
      if (cancelled || !ref.current) return;
      engine = new SkyEngine(ref.current, optsRef.current);
      (window as unknown as { __sky?: SkyEngine }).__sky = engine;
      cbRef.current?.(engine);
    });
    return () => {
      cancelled = true;
      cbRef.current?.(null);
      engine?.dispose();
    };
  }, []);

  return <div ref={ref} className={cn("relative h-full w-full overflow-hidden bg-[#020306]", className)} />;
}

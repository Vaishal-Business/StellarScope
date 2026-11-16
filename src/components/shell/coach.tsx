"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, GraduationCap, Play, X } from "lucide-react";
import { readCoach, stopWorkflow, workflowById, type CoachState } from "@/lib/workflows";
import { sendChrono } from "@/components/chronolens/chronolens";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    __chronoReady?: boolean;
  }
}

/** Floating step-by-step coach for guided workflows. Persists across pages for the tab. */
export function Coach() {
  const router = useRouter();
  const path = usePathname();
  const [st, setSt] = useState<CoachState | null>(null);
  const wf = st ? workflowById(st.id) : null;

  const run = useCallback(
    (s: CoachState) => {
      const w = workflowById(s.id);
      const step = w?.steps[s.step];
      if (!step) return;
      sessionStorage.setItem("spx-coach", JSON.stringify(s));
      setSt(s);
      const target = step.path?.split(/[?#]/)[0];
      const navigating = !!step.path && (target !== window.location.pathname || step.path.startsWith("/at"));
      if (navigating) router.push(step.path!);
      let tries = 0;
      const tick = () => {
        tries++;
        const el = step.anchor ? document.getElementById(step.anchor) : null;
        const ready = (!step.anchor || el) && (!step.chrono || window.__chronoReady);
        if (!ready && tries < 40) return void setTimeout(tick, 400);
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
        if (step.chrono) sendChrono(step.chrono);
      };
      setTimeout(tick, navigating ? 900 : 100);
    },
    [router],
  );

  useEffect(() => {
    setSt(readCoach());
    const h = (e: Event) => {
      const d = (e as CustomEvent<CoachState | null>).detail;
      if (d) run(d);
      else setSt(null);
    };
    window.addEventListener("coach", h);
    return () => window.removeEventListener("coach", h);
  }, [run]);

  if (!st || !wf) return null;
  const step = wf.steps[st.step];
  const last = st.step === wf.steps.length - 1;
  return (
    <div className="fixed bottom-5 left-5 z-[60] w-[340px] max-w-[calc(100vw-2.5rem)] rounded-[20px] border border-white/10 bg-[#0b0e14]/95 p-4 shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-signal">
          <GraduationCap className="size-3.5" /> {wf.title}
        </div>
        <button onClick={stopWorkflow} className="text-white/40 hover:text-white" aria-label="Close guide"><X className="size-4" /></button>
      </div>
      <div className="mt-3 flex gap-1">
        {wf.steps.map((_, i) => <span key={i} className={cn("h-1 flex-1 rounded-full", i <= st.step ? "bg-signal" : "bg-white/10")} />)}
      </div>
      <div className="mt-3 text-[11px] text-white/40">Step {st.step + 1} of {wf.steps.length}</div>
      <div className="mt-1 text-[15px] text-white">{step.title}</div>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-white/65">{step.body}</p>
      <div className="mt-4 flex items-center justify-between">
        <button disabled={st.step === 0} onClick={() => run({ id: st.id, step: st.step - 1 })} className="flex items-center gap-1 text-[12px] text-white/50 hover:text-white disabled:opacity-30"><ChevronLeft className="size-3.5" /> Back</button>
        <button onClick={() => run({ id: st.id, step: st.step })} className="flex items-center gap-1 text-[12px] text-white/50 hover:text-white" title="Do this step for me"><Play className="size-3" /> Do it</button>
        {last ? (
          <button onClick={stopWorkflow} className="rounded-full bg-signal px-4 py-1.5 text-[12px] font-medium text-black">Finish</button>
        ) : (
          <button onClick={() => run({ id: st.id, step: st.step + 1 })} className="flex items-center gap-1 rounded-full bg-white px-4 py-1.5 text-[12px] font-medium text-black">Next <ChevronRight className="size-3.5" /></button>
        )}
      </div>
      <div className="mt-2 text-right font-mono text-[9.5px] text-white/25">{path}</div>
    </div>
  );
}

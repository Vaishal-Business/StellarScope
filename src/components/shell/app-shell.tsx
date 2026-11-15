"use client";

import { TopNav } from "./top-nav";
import { cn } from "@/lib/utils";

/** Framed cinematic canvas: a rounded "viewport" inset from the window, after the reference board. */
export function AppShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="relative min-h-screen p-2 md:p-3">
      <div className="relative min-h-[calc(100vh-1rem)] overflow-hidden rounded-[26px] border border-white/[0.07] bg-[oklch(0.115_0.004_260)] md:min-h-[calc(100vh-1.5rem)] md:rounded-[30px] grain">
        <Backdrop />
        <TopNav />
        <main className={cn("relative z-10", className)}>{children}</main>
        <footer className="relative z-10 mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.05] px-8 py-6 text-[11px] text-white/35">
          <span>Imagery & science data: NASA / Caltech-IPAC SPHEREx DR1 via IRSA. Catalogue overlay: d3-celestial (BSD-3).</span>
          <span>StellarScope · created by Vaishal Anil &amp; Parthiv — <a className="underline hover:text-white" href="https://www.spaceappschallenge.org/2026/find-a-team/the-abyss/" target="_blank" rel="noreferrer">Team The Abyss</a>, NASA Space Apps 2026</span>
          <span className="font-mono uppercase tracking-[0.14em]">AI: IFM K2 Horizon · NVIDIA Nemotron · Spectral Scout v2 (ONNX)</span>
        </footer>
      </div>
    </div>
  );
}

function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute -left-40 -top-40 size-[720px] rounded-full bg-[radial-gradient(circle,oklch(0.5_0.05_250/0.12),transparent_60%)]" />
      <div className="absolute -right-60 top-20 size-[900px] rounded-full bg-[radial-gradient(circle,oklch(0.6_0.04_160/0.06),transparent_62%)]" />
      <div
        className="absolute inset-0 opacity-[0.55]"
        style={{
          backgroundImage:
            "radial-gradient(1px 1px at 12% 18%, rgba(255,255,255,.55), transparent), radial-gradient(1px 1px at 72% 12%, rgba(255,255,255,.4), transparent), radial-gradient(1px 1px at 33% 64%, rgba(255,255,255,.35), transparent), radial-gradient(1.2px 1.2px at 86% 74%, rgba(255,255,255,.5), transparent), radial-gradient(1px 1px at 55% 38%, rgba(255,255,255,.3), transparent), radial-gradient(1px 1px at 22% 88%, rgba(255,255,255,.35), transparent), radial-gradient(1px 1px at 92% 42%, rgba(255,255,255,.3), transparent), radial-gradient(1px 1px at 6% 52%, rgba(255,255,255,.4), transparent)",
        }}
      />
    </div>
  );
}

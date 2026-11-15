"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Brain, Cpu, Globe2, Sparkles } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Reveal } from "@/components/motion/reveal";
import { AssistantChat } from "@/components/assistant/assistant";
import { Chip, Panel } from "@/components/ui/kit";

const TOOLS: [string, string, string][] = [
  ["resolve_object", "server", "CDS Sesame name resolver (SIMBAD/NED/VizieR)"],
  ["get_observations", "server", "IRSA SIAv2 — real SPHEREx L2 exposures"],
  ["describe_tile", "server", "HEALPix tile geometry & science cubes"],
  ["platform_stats", "server", "Live database counts"],
  ["fly_to · select_tile", "browser", "Drives the 3D sky"],
  ["set_wavelength · set_composite", "browser", "Switches SPHEREx channels"],
  ["toggle_layer", "browser", "Overlays & grids"],
  ["run_spectral_scout", "browser", "ONNX model on real cutouts"],
  ["navigate · open_settings", "browser", "Moves around the site"],
];

export function AiResearcher() {
  const [providers, setProviders] = useState<{ id: string; label: string; model: string; coolingDown: boolean }[]>([]);
  useEffect(() => {
    fetch("/api/assistant").then((r) => r.json()).then((j) => setProviders(j.providers ?? [])).catch(() => {});
  }, []);
  return (
    <AppShell>
      <div className="grid gap-6 px-5 md:px-8 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Reveal delay={0.1}>
          <Panel className="p-4 lg:sticky lg:top-6">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-full bg-signal/15">
                <Sparkles className="size-4 text-signal" />
              </span>
              <div>
                <div className="text-[13px] text-white">AI Researcher</div>
                <div className="text-[10.5px] text-white/40">Knows the site, the sky and the data</div>
              </div>
            </div>
            <div className="eyebrow mt-6 mb-2">Models</div>
            <div className="space-y-1.5">
              {providers.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-white/[0.06] px-2.5 py-1.5">
                  <span className="text-[11.5px] text-white/80">{p.label}</span>
                  <Chip tone={p.coolingDown ? "warn" : "signal"} dot>{p.coolingDown ? "cooling" : "ready"}</Chip>
                </div>
              ))}
              {!providers.length && <div className="text-[11px] text-white/40">Checking…</div>}
              <p className="text-[10.5px] text-white/35">Requests alternate between providers with automatic failover. Change the preference in <Link href="/settings" className="text-white/60 underline">Settings</Link>.</p>
            </div>
            <div className="eyebrow mt-6 mb-2">Tools it can use</div>
            <div className="space-y-1.5">
              {TOOLS.map(([t, where, d]) => (
                <div key={t} className="flex items-start gap-2">
                  {where === "server" ? <Globe2 className="mt-0.5 size-3 shrink-0 text-info" /> : <Cpu className="mt-0.5 size-3 shrink-0 text-signal" />}
                  <div className="min-w-0">
                    <div className="truncate font-mono text-[10.5px] text-white/80">{t}</div>
                    <div className="text-[10px] text-white/40">{d}</div>
                  </div>
                </div>
              ))}
            </div>
            <Link href="/ai/engine" className="mt-6 flex items-center gap-2 rounded-xl border border-white/[0.07] p-3 text-[12px] text-white/75 hover:border-white/20 hover:text-white">
              <Brain className="size-4 text-signal" /> Open the Spectral Scout model page
            </Link>
          </Panel>
        </Reveal>
        <Reveal delay={0.16}>
          <Panel className="h-[calc(100vh-9rem)] min-h-[560px] overflow-hidden p-0">
            <AssistantChat variant="page" />
          </Panel>
        </Reveal>
      </div>
    </AppShell>
  );
}

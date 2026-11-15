"use client";

import { useEffect, useState } from "react";
import { Bot, Film, LogIn, LogOut, MonitorPlay, RotateCcw, Sparkles, UserRound } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Reveal } from "@/components/motion/reveal";
import { Btn, Chip, Panel, PanelHeader, SectionTitle } from "@/components/ui/kit";
import { useSettings } from "@/lib/settings";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

function Toggle({ on, onChange, label, desc }: { on: boolean; onChange: (v: boolean) => void; label: string; desc: string }) {
  return (
    <button onClick={() => onChange(!on)} className="flex w-full items-center justify-between gap-6 border-b border-white/[0.05] py-4 text-left last:border-0">
      <span>
        <span className="block text-[13.5px] text-white">{label}</span>
        <span className="block text-[11.5px] text-white/45">{desc}</span>
      </span>
      <span role="switch" aria-checked={on} className={cn("relative h-6 w-11 shrink-0 rounded-full border transition", on ? "border-signal/50 bg-signal/30" : "border-white/15 bg-white/[0.05]")}>
        <span className={cn("absolute top-0.5 size-[18px] rounded-full transition-all duration-300", on ? "left-[22px] bg-signal" : "left-0.5 bg-white/60")} />
      </span>
    </button>
  );
}

export function SettingsView() {
  const [s, set] = useSettings();
  const { user, stats, signIn, signOut } = useSession();
  const [providers, setProviders] = useState<{ id: string; label: string; model: string; coolingDown: boolean }[]>([]);
  useEffect(() => {
    fetch("/api/assistant").then((r) => r.json()).then((j) => setProviders(j.providers ?? [])).catch(() => {});
  }, []);

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-5 md:px-8">
        <Reveal delay={0.1}>
          <SectionTitle eyebrow="Settings" title="Make the explorer yours" desc="Preferences are stored in this browser. Account data lives on the server." />
        </Reveal>

        <Reveal delay={0.16} className="mt-8">
          <Panel className="p-6">
            <PanelHeader title={<span className="flex items-center gap-2"><Film className="size-3.5" /> Intro & loading</span>} />
            <div className="mt-2">
              <Toggle on={s.introVideo} onChange={(v) => set({ introVideo: v })} label="Intro video on first load" desc="Play the SPHEREx intro film the first time the site opens. Turn off to go straight in." />
              <Toggle on={s.introAlways} onChange={(v) => set({ introAlways: v })} label="Play the intro every visit" desc="Show the film at the start of every new browser session (requires the intro to be on)." />
              <Toggle on={s.loadingSplash} onChange={(v) => set({ loadingSplash: v })} label="Loading splash" desc="The animated loading screen that warms the all-sky imagery once per session." />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Btn
                size="sm"
                variant="outline"
                onClick={() => {
                  localStorage.removeItem("spx-intro-seen");
                  sessionStorage.removeItem("spx-intro-session");
                  sessionStorage.removeItem("spx-splash");
                  set({ introVideo: true });
                  location.href = "/";
                }}
              >
                <MonitorPlay className="size-3.5" /> Replay intro now
              </Btn>
              <Btn size="sm" variant="ghost" onClick={() => localStorage.removeItem("spx-walkthrough")}>
                <RotateCcw className="size-3.5" /> Reset sky walkthrough
              </Btn>
            </div>
          </Panel>
        </Reveal>

        <Reveal delay={0.22} className="mt-4">
          <Panel className="p-6">
            <PanelHeader title={<span className="flex items-center gap-2"><Bot className="size-3.5" /> AI assistant</span>} />
            <div className="mt-2">
              <Toggle on={s.assistantDock} onChange={(v) => set({ assistantDock: v })} label="Floating assistant button" desc="Show the 'Ask AI' button on every page. The full assistant is always at /ai." />
            </div>
            <div className="mt-4">
              <div className="eyebrow mb-2">Model provider</div>
              <div className="grid gap-2 sm:grid-cols-3">
                {([
                  ["auto", "Automatic", "Round-robin across both with failover — keeps each under its rate limit."],
                  ["ifm", "IFM K2 Horizon", "MBZUAI Institute of Foundation Models (UAE). Falls back to NVIDIA if unavailable."],
                  ["nvidia", "NVIDIA Nemotron", "NVIDIA NIM. Falls back to IFM if unavailable."],
                ] as const).map(([id, label, desc]) => (
                  <button key={id} onClick={() => set({ aiProvider: id })} className={cn("rounded-xl border p-3 text-left transition", s.aiProvider === id ? "border-signal/40 bg-signal/[0.07]" : "border-white/[0.07] hover:border-white/20")}>
                    <div className="flex items-center gap-1.5 text-[12.5px] text-white">
                      <Sparkles className={cn("size-3.5", s.aiProvider === id ? "text-signal" : "text-white/40")} /> {label}
                    </div>
                    <div className="mt-1 text-[10.5px] leading-relaxed text-white/45">{desc}</div>
                  </button>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {providers.length === 0 && <span className="text-[11px] text-white/40">Checking provider status…</span>}
                {providers.map((p) => (
                  <Chip key={p.id} tone={p.coolingDown ? "warn" : "signal"} dot>
                    {p.label} · {p.model.split("/").pop()} {p.coolingDown ? "· cooling down" : "· ready"}
                  </Chip>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-white/40">API keys are stored only on the server and every request is rate-limited per visitor.</p>
            </div>
          </Panel>
        </Reveal>

        <Reveal delay={0.28} className="mt-4">
          <Panel className="p-6">
            <PanelHeader title={<span className="flex items-center gap-2"><UserRound className="size-3.5" /> Account</span>} />
            {user ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-[15px] text-white">{user.display_name}</div>
                  <div className="font-mono text-[11px] text-white/45">
                    @{user.username} · {stats?.rank} · {stats?.xp ?? 0} XP · joined {new Date(user.created_at).toLocaleDateString()}
                  </div>
                </div>
                <Btn size="sm" variant="outline" onClick={signOut}>
                  <LogOut className="size-3.5" /> Sign out
                </Btn>
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                <p className="text-[12.5px] text-white/55">Sign in to submit findings, review others&apos; work, claim tiles and keep your model runs.</p>
                <div className="flex gap-2">
                  <Btn size="sm" variant="primary" onClick={() => signIn("login")}>
                    <LogIn className="size-3.5" /> Sign in
                  </Btn>
                  <Btn size="sm" variant="outline" onClick={() => signIn("register")}>
                    Create account
                  </Btn>
                </div>
              </div>
            )}
          </Panel>
        </Reveal>
      </div>
    </AppShell>
  );
}

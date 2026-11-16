"use client";

import { AnimatePresence, motion } from "motion/react";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { ArrowUpRight, Bot, Cpu, Loader2, MessageCircle, RotateCcw, Send, Sparkles, User, X } from "lucide-react";
import type { ClientAction } from "@/lib/assistant-tools";
import { startWorkflow } from "@/lib/workflows";
import { sendChrono, type ChronoCommand } from "@/components/chronolens/chronolens";
import { dispatchSky, skyAvailable } from "@/lib/sky-bus";
import { readSettings, useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

export interface AMsg {
  id: number;
  role: "user" | "assistant";
  content: string;
  actions?: ClientAction[];
  trace?: { tool: string; args: Record<string, unknown>; ok: boolean }[];
  provider?: string;
  error?: boolean;
}

interface Ctx {
  msgs: AMsg[];
  busy: boolean;
  open: boolean;
  setOpen: (v: boolean) => void;
  ask: (q: string) => Promise<void>;
  reset: () => void;
}
const AssistantCtx = createContext<Ctx | null>(null);
export const useAssistant = () => useContext(AssistantCtx)!;

/** Live context the browser shares with the assistant (set by the sky viewer and pages). */
export function setAssistantContext(patch: Record<string, unknown>) {
  const w = window as unknown as { __spxCtx?: Record<string, unknown> };
  w.__spxCtx = { ...(w.__spxCtx ?? {}), ...patch };
}
function getContext(path: string) {
  const w = window as unknown as { __spxCtx?: Record<string, unknown> };
  return { path, ...(w.__spxCtx ?? {}) };
}

const SKY_ACTIONS = new Set(["fly_to", "select_tile", "set_wavelength", "set_composite", "toggle_layer", "run_spectral_scout"]);

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const [msgs, setMsgs] = useState<AMsg[]>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const idRef = useRef(1);
  // read lazily (no usePathname here: this provider wraps every route, including dynamic ones)
  const pathRef = { get current() { return typeof window === "undefined" ? "/" : window.location.pathname; } };

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem("spx-assistant") ?? "[]") as AMsg[];
      if (saved.length) {
        setMsgs(saved);
        idRef.current = Math.max(...saved.map((m) => m.id)) + 1;
      }
    } catch {}
  }, []);
  useEffect(() => {
    sessionStorage.setItem("spx-assistant", JSON.stringify(msgs.slice(-30)));
  }, [msgs]);

  const execute = useCallback(
    (actions: ClientAction[]) => {
      let needExplore = false;
      for (const a of actions) {
        if (a.name === "navigate") {
          const p = String(a.args.path ?? "/");
          if (p.startsWith("/") && !p.startsWith("//")) router.push(p);
        } else if (a.name === "open_settings") router.push("/settings");
        else if (a.name === "teach_workflow") startWorkflow(String(a.args.workflow), Number(a.args.step ?? 0) || 0);
        else if (a.name === "start_mission") router.push(`/missions/${String(a.args.slug).replace(/[^a-z0-9-]/g, "")}`);
        else if (a.name === "chronolens") {
          const { ra, dec, action, ...rest } = a.args as { ra?: number; dec?: number; action: ChronoCommand["action"] };
          const cmd = { action, ...rest } as ChronoCommand;
          const fire = () => {
            let n = 0;
            const t = () => (window.__chronoReady ? sendChrono(cmd) : ++n < 40 && setTimeout(t, 400));
            t();
          };
          if (Number.isFinite(ra) && Number.isFinite(dec)) {
            router.push(`/at?ra=${ra}&dec=${dec}`);
            setTimeout(fire, 1500);
          } else fire();
        }
        else if (SKY_ACTIONS.has(a.name)) {
          const handled = dispatchSky(a);
          if (!handled && !skyAvailable()) needExplore = true;
        }
      }
      if (needExplore && !pathRef.current.startsWith("/explore")) router.push("/explore");
    },
    [router],
  );

  const ask = useCallback(
    async (q: string) => {
      const text = q.trim();
      if (!text || busy) return;
      const um: AMsg = { id: idRef.current++, role: "user", content: text };
      const history = [...msgs, um];
      setMsgs(history);
      setBusy(true);
      try {
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content })), context: getContext(pathRef.current), prefer: readSettings().aiProvider }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
        setMsgs((m) => [...m, { id: idRef.current++, role: "assistant", content: j.reply, actions: j.actions, trace: j.trace, provider: `${j.provider} · ${j.model}` }]);
        if (j.actions?.length) execute(j.actions);
      } catch (e) {
        setMsgs((m) => [...m, { id: idRef.current++, role: "assistant", content: (e as Error).message, error: true }]);
      } finally {
        setBusy(false);
      }
    },
    [busy, msgs, execute],
  );

  return <AssistantCtx.Provider value={{ msgs, busy, open, setOpen, ask, reset: () => setMsgs([]) }}>{children}</AssistantCtx.Provider>;
}

/* ------------------------------------------------------------------ rendering */

function Markdownish({ text }: { text: string }) {
  // minimal, safe rendering: paragraphs, bullets, **bold**, `code`
  const lines = text.split(/\n/);
  const out: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      out.push(
        <ul key={out.length} className="my-1.5 list-disc space-y-0.5 pl-4">
          {list.map((l, i) => (
            <li key={i}>{inline(l)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  const inline = (s: string) =>
    s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) =>
      part.startsWith("**") ? <b key={i} className="font-medium text-white">{part.slice(2, -2)}</b> : part.startsWith("`") ? <code key={i} className="rounded bg-white/10 px-1 font-mono text-[11px]">{part.slice(1, -1)}</code> : part,
    );
  for (const l of lines) {
    const m = /^\s*[-*•]\s+(.*)/.exec(l);
    if (m) list.push(m[1]);
    else {
      flush();
      if (l.trim()) out.push(<p key={out.length} className="my-1">{inline(l.replace(/^#+\s*/, ""))}</p>);
    }
  }
  flush();
  return <>{out}</>;
}

const SUGGESTIONS = [
  "What can I do on this site?",
  "Take me to the Orion Nebula and show it at 3.3 µm",
  "How many SPHEREx exposures cover Barnard's Star?",
  "Run Spectral Scout on the selected tile",
  "Turn on the ecliptic and galactic equator",
  "Explain what NHITS means",
];

export function AssistantChat({ variant }: { variant: "dock" | "page" }) {
  const { msgs, busy, ask, reset } = useAssistant();
  const [input, setInput] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [msgs, busy]);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scroller} className={cn("scroll-thin flex-1 space-y-4 overflow-y-auto", variant === "page" ? "p-6" : "p-4")}>
        {msgs.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <span className="flex size-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.03]">
              <Sparkles className="size-5 text-signal" />
            </span>
            <div className={cn("display mt-4 font-extralight text-white", variant === "page" ? "text-[28px]" : "text-[18px]")}>Ask, explore, or let me drive</div>
            <p className="mt-1.5 max-w-sm text-[12px] text-white/45">I can fly the sky, switch wavelengths, query real SPHEREx observations, run the Spectral Scout model and explain anything on the site.</p>
            <div className={cn("mt-5 grid w-full gap-1.5", variant === "page" ? "max-w-xl grid-cols-2" : "")}>
              {SUGGESTIONS.slice(0, variant === "page" ? 6 : 4).map((s) => (
                <button key={s} onClick={() => ask(s)} className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-left text-[12px] text-white/70 transition hover:border-white/20 hover:text-white">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        <AnimatePresence initial={false}>
          {msgs.map((m) => (
            <motion.div key={m.id} initial={{ opacity: 0, x: m.role === "user" ? 14 : -14, filter: "blur(6px)" }} animate={{ opacity: 1, x: 0, filter: "blur(0px)" }} className={cn("flex gap-2.5", m.role === "user" && "flex-row-reverse")}>
              <span className={cn("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full", m.role === "user" ? "bg-white/10" : "bg-signal/15")}>
                {m.role === "user" ? <User className="size-3.5 text-white/70" /> : <Bot className="size-3.5 text-signal" />}
              </span>
              <div className={cn("max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[12.5px] leading-relaxed", m.role === "user" ? "bg-white text-black" : m.error ? "border border-destructive/30 bg-destructive/10 text-destructive" : "border border-white/[0.07] bg-white/[0.03] text-white/80")}>
                {m.trace && m.trace.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1">
                    {m.trace.map((t, i) => (
                      <span key={i} className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[9.5px]", t.ok ? "border-signal/20 bg-signal/[0.06] text-signal/90" : "border-destructive/30 text-destructive")}>
                        <Cpu className="size-2.5" /> {t.tool}
                      </span>
                    ))}
                  </div>
                )}
                {m.role === "assistant" ? <Markdownish text={m.content} /> : m.content}
                {m.provider && <div className="mt-2 font-mono text-[9px] uppercase tracking-wider text-white/25">{m.provider}</div>}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {busy && (
          <div className="flex items-center gap-2 pl-9 text-[11px] text-white/45">
            <Loader2 className="size-3 animate-spin" /> thinking with tools…
          </div>
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
          setInput("");
        }}
        className="border-t border-white/[0.06] p-3"
      >
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/30 pl-4 pr-1.5">
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask anything about the sky or the site…" className="h-10 flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-white/30" />
          {msgs.length > 0 && (
            <button type="button" onClick={reset} className="flex size-8 items-center justify-center rounded-full text-white/40 hover:text-white" aria-label="New conversation">
              <RotateCcw className="size-3.5" />
            </button>
          )}
          <button disabled={busy} className="flex size-8 items-center justify-center rounded-full bg-white text-black disabled:opacity-40" aria-label="Send">
            <Send className="size-3.5" />
          </button>
        </div>
        <p className="mt-1.5 px-2 text-[9.5px] text-white/25">Powered by IFM K2 Horizon and NVIDIA Nemotron via a server proxy. Keys never leave the server.</p>
      </form>
    </div>
  );
}

export function AssistantDock() {
  const { open, setOpen, busy } = useAssistant();
  const path = usePathname();
  const [settings] = useSettings();
  if (!settings.assistantDock || path.startsWith("/ai")) return null;
  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98, filter: "blur(10px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="glass-strong fixed bottom-20 right-5 z-[80] flex h-[min(620px,calc(100vh-7rem))] w-[min(400px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-[24px]"
          >
            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-full bg-signal/15">
                  <Bot className="size-4 text-signal" />
                </span>
                <div>
                  <div className="text-[12.5px] text-white">StellarScope SI</div>
                  <div className="text-[10px] text-white/40">Guides you and controls the sky</div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <a href="/ai" className="flex size-8 items-center justify-center rounded-full text-white/50 hover:text-white" aria-label="Open full page">
                  <ArrowUpRight className="size-4" />
                </a>
                <button onClick={() => setOpen(false)} className="flex size-8 items-center justify-center rounded-full text-white/50 hover:text-white" aria-label="Close assistant">
                  <X className="size-4" />
                </button>
              </div>
            </div>
            <AssistantChat variant="dock" />
          </motion.div>
        )}
      </AnimatePresence>
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-5 right-5 z-[80] flex h-12 items-center gap-2 rounded-full border border-white/15 bg-[oklch(0.16_0.004_260/0.85)] pl-3.5 pr-4 text-[12.5px] text-white shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl transition hover:border-white/30"
        aria-label="Open assistant"
      >
        {busy ? <Loader2 className="size-4 animate-spin text-signal" /> : open ? <X className="size-4" /> : <MessageCircle className="size-4 text-signal" />}
        <span className="hidden sm:inline">{open ? "Close" : "Ask SI"}</span>
      </button>
    </>
  );
}

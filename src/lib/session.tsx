"use client";

import { AnimatePresence, motion } from "motion/react";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";

export interface User {
  id: number;
  username: string;
  display_name: string;
  created_at: number;
}
export interface Stats {
  posts: number;
  replies: number;
  reviews: number;
  submissions: number;
  verified: number;
  scouts: number;
  xp: number;
  rank: string;
  nextRank: string | null;
  nextXp: number | null;
}

interface Ctx {
  user: User | null;
  stats: Stats | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signIn: (mode?: "login" | "register") => void;
  signOut: () => Promise<void>;
}

const SessionCtx = createContext<Ctx>({ user: null, stats: null, loading: true, refresh: async () => {}, signIn: () => {}, signOut: async () => {} });
export const useSession = () => useContext(SessionCtx);

export async function api<T = Record<string, unknown>>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    method: init?.method ?? (init?.json !== undefined ? "POST" : "GET"),
    headers: init?.json !== undefined ? { "Content-Type": "application/json" } : init?.headers,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error ?? `HTTP ${res.status}`);
  return j as T;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<null | "login" | "register">(null);

  const refresh = useCallback(async () => {
    try {
      const r = await api<{ user: User | null; stats: Stats | null }>("/api/auth");
      setUser(r.user);
      setStats(r.stats);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const signOut = async () => {
    await api("/api/auth", { json: { action: "logout" } });
    setUser(null);
    setStats(null);
  };

  return (
    <SessionCtx.Provider value={{ user, stats, loading, refresh, signIn: (m = "login") => setDialog(m), signOut }}>
      {children}
      <AnimatePresence>{dialog && <AuthDialog mode={dialog} setMode={setDialog} onDone={refresh} />}</AnimatePresence>
    </SessionCtx.Provider>
  );
}

function AuthDialog({ mode, setMode, onDone }: { mode: "login" | "register"; setMode: (m: null | "login" | "register") => void; onDone: () => Promise<void> }) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api("/api/auth", { json: { action: mode, username, password, displayName: displayName || username } });
      await onDone();
      setMode(null);
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const input = "h-11 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-[13.5px] text-white outline-none placeholder:text-white/30 focus:border-white/30";
  return (
    <motion.div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMode(null)}>
      <motion.form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 12, filter: "blur(10px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={{ opacity: 0, y: 8 }}
        className="glass-strong w-full max-w-sm rounded-[24px] p-6"
      >
        <div className="flex items-center justify-between">
          <div className="eyebrow text-signal/80">{mode === "login" ? "Welcome back" : "Join the survey"}</div>
          <button type="button" onClick={() => setMode(null)} className="text-white/40 hover:text-white" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        <h2 className="display mt-2 text-[24px] font-light text-white">{mode === "login" ? "Sign in" : "Create account"}</h2>
        <p className="mt-1 text-[12px] text-white/45">Accounts record your submissions, reviews and model runs so others can verify them.</p>
        <div className="mt-5 space-y-3">
          <input className={input} placeholder="Username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
          {mode === "register" && <input className={input} placeholder="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />}
          <input className={input} placeholder="Password (8+ characters)" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {err && <p className="mt-3 text-[12px] text-destructive">{err}</p>}
        <button disabled={busy} className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-white text-[11.5px] font-medium uppercase tracking-[0.12em] text-black disabled:opacity-50">
          {busy && <Loader2 className="size-4 animate-spin" />} {mode === "login" ? "Sign in" : "Create account"}
        </button>
        <button type="button" onClick={() => setMode(mode === "login" ? "register" : "login")} className="mt-3 w-full text-center text-[12px] text-white/50 hover:text-white">
          {mode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>
      </motion.form>
    </motion.div>
  );
}

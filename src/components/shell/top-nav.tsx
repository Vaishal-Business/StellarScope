"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { ChevronDown, LogIn, Menu, Search, Settings } from "lucide-react";
import { LogoMark } from "./logo";
import { Reveal } from "@/components/motion/reveal";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/session";
import { useCommand } from "./command";
import { NAV, isActive } from "./nav";

export function TopNav({ floating = false }: { floating?: boolean }) {
  const path = usePathname();
  const { open } = useCommand();
  const [menu, setMenu] = useState(false);
  const [acct, setAcct] = useState(false);
  const { user, stats, signIn, signOut } = useSession();
  return (
    <header className={cn("relative z-40 flex items-center justify-between gap-4 px-5 py-4 md:px-8", floating && "pointer-events-none absolute inset-x-0 top-0")}>
      <Reveal delay={0.05} className="pointer-events-auto">
        <Link href="/" className="group flex items-center gap-3">
          <LogoMark className="size-7 text-white transition-transform duration-700 group-hover:rotate-45" />
          <span className="display hidden text-[13px] font-light tracking-[0.45em] text-white sm:inline">STELLARSCOPE</span>
        </Link>
      </Reveal>

      <Reveal delay={0.12} className="pointer-events-auto relative xl:hidden">
        <button onClick={() => setMenu((m) => !m)} className="glass flex h-10 items-center gap-2 rounded-full px-4 text-[12.5px] text-white/80">
          <Menu className="size-4" /> {NAV.find((n) => isActive(path, n.href))?.label ?? "Menu"}
        </button>
        <AnimatePresence>
          {menu && (
            <motion.div
              initial={{ opacity: 0, y: -6, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -6 }}
              className="glass-strong absolute left-1/2 top-12 z-50 w-56 -translate-x-1/2 rounded-2xl p-1.5"
            >
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} onClick={() => setMenu(false)} className={cn("block rounded-xl px-3 py-2 text-[13px]", isActive(path, n.href) ? "bg-white/[0.08] text-white" : "text-white/60 hover:text-white")}>
                  {n.label}
                </Link>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </Reveal>

      <Reveal delay={0.12} className="pointer-events-auto hidden xl:block">
        <nav className="glass flex items-center gap-0.5 whitespace-nowrap rounded-full p-1">
          {NAV.map((n) => {
            const active = isActive(path, n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn("relative rounded-full px-3.5 py-1.5 text-[12.5px] transition-colors duration-300 xl:px-4", active ? "text-white" : "text-white/55 hover:text-white")}
              >
                {active && (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-full border border-white/10 bg-white/[0.09] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <span className="relative">{n.label}</span>
              </Link>
            );
          })}
        </nav>
      </Reveal>

      <Reveal delay={0.18} className="pointer-events-auto flex items-center gap-2">
        <button onClick={open} className="glass flex h-10 items-center gap-2 rounded-full pl-3.5 pr-2 text-white/60 transition hover:text-white" aria-label="Search">
          <Search className="size-4" />
          <span className="hidden text-[12px] md:inline">Search sky</span>
          <kbd className="hidden rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-white/50 md:inline">⌘K</kbd>
        </button>
        <Link href="/settings" className="glass relative flex size-10 items-center justify-center rounded-full text-white/70 hover:text-white" aria-label="Settings">
          <Settings className="size-4" />
        </Link>
        {user ? (
          <div className="relative">
            <button onClick={() => setAcct((v) => !v)} className="glass flex h-10 items-center gap-2 rounded-full pl-1 pr-2.5" aria-label="Account">
              <span className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-white/30 to-white/5 text-[11px] font-medium uppercase text-white">
                {user.display_name.split(/\s+/).map((s) => s[0]).join("").slice(0, 2)}
              </span>
              <ChevronDown className="size-3.5 text-white/50" />
            </button>
            <AnimatePresence>
              {acct && (
                <motion.div initial={{ opacity: 0, y: -6, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -6 }} className="glass-strong absolute right-0 top-12 z-50 w-60 rounded-2xl p-2">
                  <div className="px-3 py-2">
                    <div className="text-[13px] text-white">{user.display_name}</div>
                    <div className="font-mono text-[10.5px] text-white/45">{stats?.rank} · {stats?.xp ?? 0} XP</div>
                  </div>
                  <Link href="/lab" onClick={() => setAcct(false)} className="block rounded-xl px-3 py-2 text-[12.5px] text-white/70 hover:bg-white/[0.06] hover:text-white">My Lab</Link>
                  <Link href="/settings" onClick={() => setAcct(false)} className="block rounded-xl px-3 py-2 text-[12.5px] text-white/70 hover:bg-white/[0.06] hover:text-white">Settings</Link>
                  <button onClick={() => { setAcct(false); signOut(); }} className="block w-full rounded-xl px-3 py-2 text-left text-[12.5px] text-white/70 hover:bg-white/[0.06] hover:text-white">Sign out</button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <button onClick={() => signIn("login")} className="glass flex h-10 items-center gap-2 rounded-full px-4 text-[12px] text-white/85 hover:text-white">
            <LogIn className="size-4" /> Sign in
          </button>
        )}
      </Reveal>
    </header>
  );
}

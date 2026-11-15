"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Compass, Crosshair, Grid3x3, Search, Sparkles, Star } from "lucide-react";
import { OBJECTS } from "@/lib/objects";
import { ang2pix, pix2ang } from "@/sky/healpix";
import { formatDec, formatRA } from "@/sky/coords";
import { NAV } from "./nav";

type Ctx = { open: () => void };
const CommandCtx = createContext<Ctx>({ open: () => {} });
export const useCommand = () => useContext(CommandCtx);

type Result = { id: string; icon: React.ReactNode; title: string; sub: string; href: string };

import { parseQuery } from "@/lib/parse";

export function CommandProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const open = useCallback(() => setOpen(true), []);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  useEffect(() => {
    if (isOpen) {
      setQ("");
      setSel(0);
      setTimeout(() => input.current?.focus(), 30);
    }
  }, [isOpen]);

  const results = useMemo<Result[]>(() => {
    const out: Result[] = [];
    const parsed = parseQuery(q);
    if (parsed && "ra" in parsed) {
      const ipix = ang2pix(5, parsed.ra, parsed.dec);
      out.push({ id: "coord", icon: <Crosshair className="size-4" />, title: `Go to ${formatRA(parsed.ra, true)}  ${formatDec(parsed.dec, true)}`, sub: `ICRS ${parsed.ra.toFixed(4)}°, ${parsed.dec.toFixed(4)}° · tile SPX-5-${ipix}`, href: `/explore?ra=${parsed.ra.toFixed(5)}&dec=${parsed.dec.toFixed(5)}&fov=3` });
    }
    if (parsed && "order" in parsed) {
      const c = pix2ang(parsed.order, parsed.ipix);
      out.push({ id: "tile", icon: <Grid3x3 className="size-4" />, title: `HEALPix tile order ${parsed.order} · ${parsed.ipix}`, sub: `Centre ${formatRA(c.ra)} ${formatDec(c.dec)}`, href: `/explore?tile=${parsed.order}/${parsed.ipix}` });
    }
    const ql = q.toLowerCase();
    for (const o of OBJECTS) {
      if (!ql || o.name.toLowerCase().includes(ql) || o.ids.some((i) => i.toLowerCase().includes(ql)) || o.type.toLowerCase().includes(ql)) {
        out.push({ id: o.slug, icon: <Star className="size-4" />, title: o.name, sub: `${o.ids.join(" · ")} — ${o.type}`, href: `/discoveries/${o.slug}` });
      }
    }
    for (const n of NAV) {
      if (ql && n.label.toLowerCase().includes(ql)) out.push({ id: n.href, icon: <Compass className="size-4" />, title: n.label, sub: "Navigate", href: n.href });
    }
    if (!ql) out.unshift({ id: "ai", icon: <Sparkles className="size-4" />, title: "Ask the SI Researcher", sub: "Natural-language questions about the sky", href: "/ai" });
    return out.slice(0, 9);
  }, [q]);

  const go = (r: Result) => {
    setOpen(false);
    router.push(r.href);
  };

  return (
    <CommandCtx.Provider value={{ open }}>
      {children}
      <AnimatePresence>
        {isOpen && (
          <motion.div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/50 px-4 pt-[14vh] backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)}>
            <motion.div
              className="glass-strong w-full max-w-xl overflow-hidden rounded-[22px]"
              initial={{ opacity: 0, y: -10, scale: 0.98, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 border-b border-white/[0.07] px-5">
                <Search className="size-4 text-white/40" />
                <input
                  ref={input}
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setSel(0);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") setSel((s) => Math.min(results.length - 1, s + 1));
                    if (e.key === "ArrowUp") setSel((s) => Math.max(0, s - 1));
                    if (e.key === "Enter" && results[sel]) go(results[sel]);
                  }}
                  placeholder="Object, RA/Dec (83.82 -5.39 or 05h35m17s -05°23′28″), or tile (SPX-5-445)"
                  className="h-14 flex-1 bg-transparent text-[14px] text-white outline-none placeholder:text-white/30"
                />
                <kbd className="rounded-md border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white/40">ESC</kbd>
              </div>
              <div className="scroll-thin max-h-[52vh] overflow-y-auto p-2">
                {results.length === 0 && <div className="px-4 py-8 text-center text-sm text-white/40">No matches. Try coordinates or a tile ID.</div>}
                {results.map((r, i) => (
                  <button
                    key={r.id}
                    onMouseEnter={() => setSel(i)}
                    onClick={() => go(r)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${i === sel ? "bg-white/[0.07]" : ""}`}
                  >
                    <span className={`flex size-8 items-center justify-center rounded-lg border border-white/10 ${i === sel ? "text-signal" : "text-white/60"}`}>{r.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] text-white">{r.title}</span>
                      <span className="block truncate text-[11.5px] text-white/45">{r.sub}</span>
                    </span>
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </CommandCtx.Provider>
  );
}

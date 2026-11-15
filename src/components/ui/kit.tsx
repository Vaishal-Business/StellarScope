import Link from "next/link";
import { cn } from "@/lib/utils";

/* Small set of cinematic primitives shared by every screen. */

export function Panel({ className, children, strong, ...rest }: React.HTMLAttributes<HTMLDivElement> & { strong?: boolean }) {
  return (
    <div className={cn(strong ? "glass-strong" : "glass", "relative rounded-[22px]", className)} {...rest}>
      {children}
    </div>
  );
}

export function PanelHeader({ title, meta, className }: { title: React.ReactNode; meta?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <span className="eyebrow text-white/70">{title}</span>
      {meta && <span className="eyebrow">{meta}</span>}
    </div>
  );
}

type Tone = "neutral" | "signal" | "warn" | "info" | "danger" | "violet";
const toneCls: Record<Tone, string> = {
  neutral: "border-white/10 bg-white/[0.04] text-white/70",
  signal: "border-signal/25 bg-signal/10 text-signal",
  warn: "border-warn/25 bg-warn/10 text-warn",
  info: "border-info/25 bg-info/10 text-info",
  danger: "border-destructive/25 bg-destructive/10 text-destructive",
  violet: "border-violet-300/25 bg-violet-300/10 text-violet-200",
};

export function Chip({ tone = "neutral", dot, className, children }: { tone?: Tone; dot?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] font-mono text-[10px] uppercase tracking-[0.14em]", toneCls[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current animate-pulse-dot" />}
      {children}
    </span>
  );
}

export function Stat({ label, value, sub, className }: { label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="eyebrow truncate">{label}</div>
      <div className="mt-1.5 truncate text-[22px] font-light tabular-nums tracking-tight text-white">{value}</div>
      {sub && <div className="mt-0.5 truncate text-xs text-white/45">{sub}</div>}
    </div>
  );
}

export function KV({ k, v, mono = true }: { k: React.ReactNode; v: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-white/[0.05] py-2 last:border-0">
      <span className="text-[12px] text-white/45">{k}</span>
      <span className={cn("truncate text-right text-[12.5px] text-white/90", mono && "font-mono tabular-nums")}>{v}</span>
    </div>
  );
}

type BtnVariant = "primary" | "ghost" | "outline" | "signal";
const btnCls: Record<BtnVariant, string> = {
  primary: "bg-white text-black hover:bg-white/90 shadow-[0_10px_40px_-10px_rgba(255,255,255,0.45)]",
  ghost: "text-white/75 hover:text-white hover:bg-white/[0.06]",
  outline: "border border-white/15 bg-white/[0.02] text-white hover:border-white/30 hover:bg-white/[0.06]",
  signal: "bg-signal text-black hover:brightness-105 shadow-[0_10px_40px_-12px_oklch(0.89_0.11_155/0.6)]",
};

export function Btn({
  variant = "outline",
  size = "md",
  href,
  className,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md" | "lg"; href?: string }) {
  const cls = cn(
    "inline-flex select-none items-center justify-center gap-2 rounded-full font-medium uppercase tracking-[0.12em] transition-all duration-300 ease-[var(--ease-cine)] disabled:pointer-events-none disabled:opacity-40",
    size === "sm" && "h-8 px-3.5 text-[10.5px]",
    size === "md" && "h-10 px-5 text-[11px]",
    size === "lg" && "h-12 px-7 text-[11.5px]",
    btnCls[variant],
    className,
  );
  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button className={cls} {...rest}>
      {children}
    </button>
  );
}

export function IconBtn({ className, active, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-full border transition-all duration-300",
        active ? "border-signal/40 bg-signal/15 text-signal" : "border-white/10 bg-white/[0.03] text-white/70 hover:border-white/25 hover:text-white",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function SectionTitle({ eyebrow, title, desc, className, right }: { eyebrow?: string; title: React.ReactNode; desc?: React.ReactNode; className?: string; right?: React.ReactNode }) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-6", className)}>
      <div className="max-w-2xl">
        {eyebrow && <div className="eyebrow mb-3 text-signal/80">{eyebrow}</div>}
        <h2 className="display text-balance text-[28px] font-light leading-[1.1] text-white md:text-[34px]">{title}</h2>
        {desc && <p className="mt-3 text-[14px] leading-relaxed text-white/55">{desc}</p>}
      </div>
      {right}
    </div>
  );
}

export function Progress({ value, className, tone = "signal" }: { value: number; className?: string; tone?: "signal" | "white" }) {
  return (
    <div className={cn("h-[3px] w-full overflow-hidden rounded-full bg-white/[0.07]", className)}>
      <div
        className={cn("h-full rounded-full transition-[width] duration-700 ease-[var(--ease-cine)]", tone === "signal" ? "bg-gradient-to-r from-signal/60 to-signal" : "bg-white/80")}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

/** Small honesty label used wherever content is illustrative rather than live data. */
export function SampleTag({ children = "Sample data", className }: { children?: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border border-dashed border-white/15 px-1.5 py-[1px] font-mono text-[9.5px] uppercase tracking-[0.14em] text-white/40", className)}>
      {children}
    </span>
  );
}

export function LiveTag({ children = "Live · IRSA DR1", className }: { children?: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md border border-signal/20 bg-signal/[0.06] px-1.5 py-[1px] font-mono text-[9.5px] uppercase tracking-[0.14em] text-signal/90", className)}>
      <span className="size-1 rounded-full bg-signal animate-pulse-dot" />
      {children}
    </span>
  );
}

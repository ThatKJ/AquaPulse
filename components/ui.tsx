"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { animate } from "motion";
import { useReducedMotion } from "motion/react";
import type { Provenance } from "@/lib/schemas/domain";

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
export const fmt = (n: number) => nf.format(Math.round(n));
export const fmt1 = (n: number) => n.toFixed(1);
export const pct = (unit: number) => `${Math.round(unit * 100)}%`;
export const clock = (tMin: number) => `T+${Math.round(tMin)}m`;
export const horizonLabel = (h: number) => (h === 0 ? "NOW" : `+${h}`);
/** "flash_flood" -> "Flash flood" */
export const human = (s: string) => {
  const t = s.replace(/_/g, " ").toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export function Label({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`text-[11px] uppercase tracking-[0.06em] text-muted ${className}`}>{children}</div>;
}

export function Tag({ children, className = "", title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center gap-1 text-[10.5px] font-medium uppercase leading-none tracking-[0.08em] text-faint ${className}`}
    >
      {children}
    </span>
  );
}

const PROV: Record<Provenance, [string, string]> = {
  LIVE: ["LIVE", "Received live"],
  STATIC_REAL: ["REAL", "Real static data"],
  SIMULATED: ["SIM", "Simulated for the demo, not municipal data"],
  DERIVED: ["DERIVED", "Computed by the AquaPulse engine"],
};
export function ProvTag({ p }: { p: Provenance }) {
  return <Tag title={PROV[p][1]}>{PROV[p][0]}</Tag>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-2 text-[13px] leading-snug text-faint">{children}</p>;
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2 py-1" aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="h-3 bg-panel-raised" style={{ width: `${90 - i * 18}%` }} />
      ))}
    </div>
  );
}

export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-hairline px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <Label>{title}</Label>
        {aside}
      </div>
      {children}
    </section>
  );
}

const BTN =
  "inline-flex h-8 items-center justify-center gap-1.5 px-3 text-[11px] font-medium uppercase tracking-[0.06em] transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40";
export const btnPrimary = `${BTN} bg-ink text-surface hover:bg-white`;
export const btnSecondary = `${BTN} border border-hairline text-ink hover:bg-panel-raised`;
export const iconBtn =
  "inline-flex h-7 w-7 shrink-0 items-center justify-center border border-hairline text-muted transition-colors duration-150 hover:bg-panel-raised hover:text-ink disabled:cursor-not-allowed disabled:opacity-40";

/** Counts from the previous value to the new one. The only text writer is the animation, so React never fights it. */
export function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(value);
  const [first] = useState(value);
  const reduce = useReducedMotion();
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const from = prev.current;
    prev.current = value;
    if (reduce || from === value) {
      node.textContent = fmt(value);
      return;
    }
    const controls = animate(from, value, {
      duration: 0.7,
      ease: "easeOut",
      onUpdate: (v) => {
        node.textContent = fmt(v);
      },
    });
    return () => controls.stop();
  }, [value, reduce]);
  return (
    <span ref={ref} className={className} aria-label={fmt(value)}>
      {fmt(first)}
    </span>
  );
}

/** Segmented control with radio semantics: arrows move, the selection follows focus. */
export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  vertical = false,
  className = "",
}: {
  label: string;
  value: T;
  vertical?: boolean;
  options: { value: T; label: ReactNode; sub?: ReactNode }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  const move = (e: React.KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = (i + d + options.length) % options.length;
    onChange(options[next].value);
    (e.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} className={`flex ${vertical ? "flex-col" : "border border-hairline"} ${className}`}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => move(e, i)}
            className={`flex min-w-0 flex-1 gap-0.5 transition-colors duration-150 focus-visible:z-10 ${
              vertical
                ? `items-center justify-between border-l-2 px-3 py-1.5 text-[13px] ${on ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`
                : `flex-col items-center justify-center border-l border-hairline px-2 py-1.5 text-[11px] uppercase tracking-[0.06em] first:border-l-0 ${on ? "bg-panel-raised text-ink" : "text-muted hover:text-ink"}`
            }`}
          >
            <span className="tabular font-medium">{o.label}</span>
            {o.sub != null && <span className="tabular text-[11px] normal-case tracking-normal text-faint">{o.sub}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Small line chart: one or two series over evenly spaced points, 0..max on the y axis. */
export function Sparkline({
  series,
  labels,
  max = 100,
  width = 340,
  height = 64,
  activeIndex,
  title,
}: {
  series: { values: number[]; className: string; dashed?: boolean }[];
  labels: string[];
  max?: number;
  width?: number;
  height?: number;
  activeIndex?: number;
  title: string;
}) {
  const pad = { l: 6, r: 6, t: 6, b: 16 };
  const n = labels.length;
  const x = (i: number) => pad.l + (i * (width - pad.l - pad.r)) / Math.max(1, n - 1);
  const y = (v: number) => pad.t + (1 - Math.min(1, Math.max(0, v / (max || 1)))) * (height - pad.t - pad.b);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block w-full" role="img" aria-label={title}>
      <line x1={pad.l} x2={width - pad.r} y1={y(0)} y2={y(0)} className="stroke-hairline" />
      {activeIndex != null && (
        <line x1={x(activeIndex)} x2={x(activeIndex)} y1={pad.t} y2={y(0)} className="stroke-faint" strokeDasharray="2 3" />
      )}
      {series.map((s, k) => (
        <g key={k} className={s.className}>
          <polyline
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeDasharray={s.dashed ? "4 3" : undefined}
            points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
          />
          {s.values.map((v, i) => (
            <circle key={i} cx={x(i)} cy={y(v)} r={i === activeIndex ? 3 : 2} fill="currentColor" />
          ))}
        </g>
      ))}
      {labels.map((l, i) => (
        <text
          key={l}
          x={x(i)}
          y={height - 3}
          textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
          className="tabular fill-faint text-[11px]"
        >
          {l}
        </text>
      ))}
    </svg>
  );
}

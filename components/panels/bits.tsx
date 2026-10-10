import type { ComponentType, ReactNode } from "react";
import { bandCss, riskBand, type RiskDomain } from "../risk";
import { fmt } from "../ui";

export const DRAWER = "panel-in absolute bottom-0 right-0 top-12 z-10 flex w-[380px] flex-col border-l border-hairline bg-panel";

/** "+1,200", "−95", "0": the sign is always written, so direction never depends on colour. */
export const signed = (n: number, digits = 0) => {
  const r = digits ? Number(n.toFixed(digits)) : Math.round(n);
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${digits ? Math.abs(r).toFixed(digits) : fmt(Math.abs(r))}`;
};

/** Risk band as glyph + label; the glyph carries the band colour, the label stays readable ink. */
export function Band({ risk, domain }: { risk: number; domain: RiskDomain }) {
  const b = riskBand(risk);
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.06em] text-ink">
      <span aria-hidden style={{ color: bandCss(risk, domain) }}>
        {b.glyph}
      </span>
      {b.label}
    </span>
  );
}

/** Icon + short uppercase label: a state, never colour alone. */
export function State({ icon: Icon, tone, children }: { icon: ComponentType<{ size?: number; "aria-hidden"?: boolean }>; tone: string; children: ReactNode }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 text-[11px] font-medium uppercase tracking-[0.06em] ${tone}`}>
      <Icon size={12} aria-hidden />
      {children}
    </span>
  );
}

/** One fact per row inside a `<dl className={ROWS}>`: label left, tabular value right. */
export const ROWS = "divide-y divide-hairline";
export function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-[13px]">
      <dt className="text-muted">{label}</dt>
      <dd className="tabular min-w-0 text-right text-ink">{children}</dd>
    </div>
  );
}

/** Thin horizontal bar, `value` in 0..1. */
export function Meter({ value, tone = "bg-muted", className = "" }: { value: number; tone?: string; className?: string }) {
  return (
    <div aria-hidden className={`h-1 bg-hairline ${className}`}>
      <div className={`h-full transition-[width] duration-200 ease-out ${tone}`} style={{ width: `${Math.min(1, Math.max(0, value)) * 100}%` }} />
    </div>
  );
}

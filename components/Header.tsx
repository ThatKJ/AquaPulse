"use client";

import { useEffect, useRef, useState } from "react";
import { CircleCheck, CircleDashed, CircleX, CloudOff, CornerDownLeft, Droplets, TriangleAlert, type LucideIcon } from "lucide-react";
import { AskRequestSchema, AskResponseSchema, HealthResponseSchema, type AskResponse, type HealthResponse } from "@/lib/schemas/api";
import { Skeleton, Tag } from "./ui";

type Health = { status: "loading" } | { status: "offline"; detail: string } | { status: "ok"; data: HealthResponse };

function useHealth(): Health {
  const [h, setH] = useState<Health>({ status: "loading" });
  useEffect(() => {
    const abort = new AbortController();
    fetch("/api/health", { signal: abort.signal, cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`/api/health returned ${r.status}`);
        const parsed = HealthResponseSchema.safeParse(await r.json());
        if (!parsed.success) throw new Error("/api/health returned an unexpected shape");
        setH({ status: "ok", data: parsed.data });
      })
      .catch((e: unknown) => {
        if (!abort.signal.aborted) setH({ status: "offline", detail: e instanceof Error ? e.message : "fetch failed" });
      });
    return () => abort.abort();
  }, []);
  return h;
}

function AwsIndicator({ health }: { health: Health }) {
  let text = "AWS CHECKING";
  let Icon: LucideIcon = CircleDashed;
  let tone = "text-muted";
  let title = "Checking /api/health";
  if (health.status === "offline") {
    [text, Icon, title] = ["AWS OFFLINE", CloudOff, health.detail];
  } else if (health.status === "ok") {
    const { state, detail, region } = health.data.aws;
    title = [region, detail].filter(Boolean).join(" · ") || state;
    if (state === "PASS") [text, Icon, tone] = ["AWS CONNECTED", CircleCheck, "text-verified"];
    else if (state === "UNVERIFIED") [text, Icon] = ["AWS UNVERIFIED", CircleDashed];
    else if (state === "NOT_CONFIGURED") [text, Icon] = ["AWS NOT CONFIGURED", TriangleAlert];
    else [text, Icon, tone] = ["AWS FAILED", CircleX, "text-flood-high"];
  }
  return (
    <Tag title={title} className={`h-6 ${tone}`}>
      <Icon size={12} aria-hidden />
      {text}
    </Tag>
  );
}

const SUGGESTIONS = [
  "Why is this area critical?",
  "What happens in 30 minutes?",
  "Which action protects the most people?",
  "Why did AquaPulse choose Drain D104?",
  "Where should Tanker T02 go?",
  "What infrastructure should Bengaluru fix first?",
];

type Ask = { status: "idle" } | { status: "loading" } | { status: "error"; message: string } | { status: "done"; data: AskResponse };

function AskAquaPulse({ getContext }: { getContext: () => Record<string, unknown> }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [ask, setAsk] = useState<Ask>({ status: "idle" });
  const root = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  async function submit(question: string) {
    setQ(question);
    setOpen(true);
    const req = AskRequestSchema.safeParse({ question: question.trim(), context: getContext() });
    if (!req.success) return setAsk({ status: "error", message: "Ask a question of 3 to 400 characters." });
    const mine = ++seq.current;
    setAsk({ status: "loading" });
    try {
      const r = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(req.data) });
      if (!r.ok) throw new Error(`/api/ask returned ${r.status}`);
      const parsed = AskResponseSchema.safeParse(await r.json());
      if (!parsed.success) throw new Error("/api/ask returned an unexpected shape");
      if (mine === seq.current) setAsk({ status: "done", data: parsed.data });
    } catch (e) {
      if (mine === seq.current) setAsk({ status: "error", message: e instanceof Error ? e.message : "request failed" });
    }
  }

  return (
    <div
      ref={root}
      className="relative w-[380px]"
      onBlur={(e) => {
        if (!root.current?.contains(e.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <form
        role="search"
        className="flex h-8 items-center border border-hairline bg-surface focus-within:border-faint"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(q);
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          maxLength={400}
          placeholder="Ask AquaPulse about the city right now"
          aria-label="Ask AquaPulse"
          className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-[13px] text-ink outline-none placeholder:text-faint"
        />
        <button type="submit" aria-label="Send question" className="flex h-full w-8 items-center justify-center text-muted hover:text-ink">
          <CornerDownLeft size={14} aria-hidden />
        </button>
      </form>
      {open && (
        <div id="ask-panel" className="absolute left-0 top-10 z-30 w-[460px] border border-hairline bg-panel p-3">
          <div aria-live="polite">
            {ask.status === "loading" && <Skeleton lines={3} />}
            {ask.status === "error" && (
              <p role="alert" className="flex items-start gap-1.5 text-[13px] text-ink">
                <TriangleAlert size={14} aria-hidden className="mt-0.5 shrink-0 text-flood-mid" />
                <span>Ask AquaPulse: {ask.message}. No answer was generated.</span>
              </p>
            )}
            {ask.status === "done" && (
              <div>
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{ask.data.answer}</p>
                <div className="mt-2 flex items-center gap-2">
                  <Tag title={ask.data.modelId}>{ask.data.source === "bedrock" ? "Bedrock" : "Template answer from simulation data"}</Tag>
                  <span className="text-[11px] text-faint">{ask.data.source === "bedrock" ? "Explains engine output; numbers come from the engine." : "Not AI-generated."}</span>
                </div>
              </div>
            )}
          </div>
          <div className={`flex flex-wrap gap-1.5 ${ask.status === "idle" ? "" : "mt-3 border-t border-hairline pt-3"}`}>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => void submit(s)}
                className="border border-hairline px-2 py-1 text-left text-[13px] text-muted transition-colors duration-150 hover:bg-panel-raised hover:text-ink"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function Header({
  getContext,
  demoOpen,
  onToggleDemo,
}: {
  getContext: () => Record<string, unknown>;
  demoOpen: boolean;
  onToggleDemo: () => void;
}) {
  const health = useHealth();
  return (
    <header className="absolute inset-x-0 top-0 z-20 flex h-12 items-center gap-4 border-b border-hairline bg-panel px-4">
      <div className="flex items-center gap-2">
        <Droplets size={16} aria-hidden className="text-flood-low" />
        <h1 className="text-[15px] font-semibold tracking-tight text-ink">AquaPulse</h1>
      </div>
      <p className="hidden truncate text-[13px] text-muted xl:block">AI Decision Engine for a Safer, Water-Resilient Bengaluru</p>
      <div className="flex items-center gap-1.5">
        <Tag>Bengaluru</Tag>
        {/* The city feed is a seeded simulation, so it is not labelled LIVE. */}
        <Tag>Simulated feed</Tag>
      </div>
      <div className="flex-1" />
      <AskAquaPulse getContext={getContext} />
      {health.status === "ok" && (
        <span className="tabular text-[11px] uppercase tracking-[0.06em] text-faint" title={health.data.ai.modelId ?? health.data.ai.detail}>
          AI {health.data.ai.observer} · DB {health.data.db.adapter}
        </span>
      )}
      <AwsIndicator health={health} />
      <button
        type="button"
        onClick={onToggleDemo}
        aria-pressed={demoOpen}
        className={`h-6 border px-2 text-[11px] font-medium uppercase tracking-[0.06em] transition-colors duration-150 ${
          demoOpen ? "border-ink bg-ink text-surface" : "border-hairline text-muted hover:text-ink"
        }`}
      >
        Demo
      </button>
    </header>
  );
}

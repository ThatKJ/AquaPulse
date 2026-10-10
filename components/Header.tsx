"use client";

import { useEffect, useRef, useState } from "react";
import { Brain, ChevronRight, CircleCheck, CircleDashed, CircleX, CloudOff, CornerDownLeft, Database, Droplets, FlaskConical, TriangleAlert, type LucideIcon, MessageSquare, Workflow } from "lucide-react";
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

/** One "LABEL value" status chip: icon and text carry the state, colour only repeats it. */
function Chip({ label, value, title, tone = "text-ink" }: { icon?: LucideIcon; label: string; value: string; title?: string; tone?: string }) {
  return (
    <span title={title} className="flex shrink-0 items-baseline gap-1.5 whitespace-nowrap text-[11px]">
      <span className="uppercase tracking-[0.08em] text-faint">{label}</span>
      <span className={`capitalize ${tone}`}>{value}</span>
    </span>
  );
}

function StatusChips({ health }: { health: Health }) {
  // The city feed is the seeded demo world, so the mode is never called live.
  const mode = <Chip icon={FlaskConical} label="Mode" value="Simulation" title="Seeded demo world: infrastructure, demographics and history are simulated" />;
  if (health.status === "loading") {
    return (
      <>
        {mode}
        <Chip icon={CircleDashed} label="AWS" value="Checking" tone="text-muted" />
      </>
    );
  }
  if (health.status === "offline") {
    return (
      <>
        {mode}
        <Chip icon={CloudOff} label="AWS" value="Unavailable" tone="text-muted" title={`AWS UNAVAILABLE · deterministic demo engine active (${health.detail})`} />
        <span className="hidden whitespace-nowrap text-[11px] text-faint xl:inline">deterministic demo engine active</span>
      </>
    );
  }
  const { aws, ai, db } = health.data;
  const awsChip: [LucideIcon, string, string] =
    aws.state === "PASS"
      ? [CircleCheck, "Connected", "text-verified"]
      : aws.state === "UNVERIFIED"
        ? [CircleDashed, "Unverified", "text-muted"]
        : aws.state === "NOT_CONFIGURED"
          ? [TriangleAlert, "Not configured", "text-muted"]
          : [CircleX, "Unavailable", "text-muted"];
  return (
    <>
      {mode}
      <Chip icon={awsChip[0]} label="AWS" value={awsChip[1]} tone={awsChip[2]} title={[aws.region, aws.state === "FAIL" ? "deterministic demo engine active" : null].filter(Boolean).join(" · ") || aws.state} />
      <Chip icon={Brain} label="Vision" value={ai.observer} tone={ai.observer === "none" ? "text-muted" : "text-ink"} title={ai.modelId ?? `Evidence observer: ${ai.observer} (${ai.state})`} />
      <Chip icon={Database} label="DB" value={db.adapter} title={db.adapter === "memory" ? "Running in memory mode" : `Supabase (${db.state})`} />
{/* Orchestration and comms only fit beside the command line on wide screens. */}
      <span className="hidden items-center gap-1.5 min-[1600px]:flex">
        <Chip icon={Workflow} label="Flow" value={health.data.n8n?.state === "UNVERIFIED" ? "n8n set" : "none"} tone={health.data.n8n?.state === "UNVERIFIED" ? "text-ink" : "text-muted"} title={health.data.n8n?.detail ?? "No n8n instance configured."} />
      <Chip icon={MessageSquare} label="Comm" value={health.data.twilio.state === "NOT_CONFIGURED" ? "demo" : `Twilio ${health.data.twilio.mode ?? "demo"}`} tone={health.data.twilio.state === "NOT_CONFIGURED" ? "text-muted" : "text-ink"} title={health.data.twilio.detail} />
      </span>
    </>
  );
}

const SUGGESTIONS = [
  "Why is this area critical?",
  "What happens in 30 minutes?",
  "Why did this intervention win?",
  "Which infrastructure should we fix first?",
  "Where should Tanker T02 go?",
];

/** Which kinds of engine output a question draws on, by question type. */
function sourceTags(question: string, bedrock: boolean): string[] {
  const q = question.toLowerCase();
  return [
    "Simulation",
    ...(/critical|evidence|report|verif|confirm/.test(q) ? ["Evidence"] : []),
    ...(/fix|infrastructure|drain|pipe|tanker|upgrade|intervention|asset/.test(q) ? ["Infrastructure"] : []),
    ...(bedrock ? ["AWS"] : []),
  ];
}

type Ask = { status: "idle" } | { status: "loading" } | { status: "error"; message: string } | { status: "done"; question: string; data: AskResponse };

function AskAquaPulse({ getContext, hasIncident }: { getContext: () => Record<string, unknown>; hasIncident: boolean }) {
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
      if (mine === seq.current) setAsk({ status: "done", question, data: parsed.data });
    } catch (e) {
      if (mine === seq.current) setAsk({ status: "error", message: e instanceof Error ? e.message : "request failed" });
    }
  }

  return (
    <div
      ref={root}
      className="relative min-w-0 max-w-[340px] flex-1"
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
        <ChevronRight size={14} aria-hidden className="ml-1.5 shrink-0 text-faint" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          maxLength={400}
          placeholder={hasIncident ? "Ask AquaPulse about this incident…" : "Ask AquaPulse about the city…"}
          aria-label="Ask AquaPulse"
          className="tabular h-full min-w-0 flex-1 bg-transparent px-1.5 text-[13px] text-ink outline-none placeholder:font-sans placeholder:text-faint"
        />
        <button type="submit" aria-label="Send question" className="flex h-full w-8 items-center justify-center text-muted hover:text-ink">
          <CornerDownLeft size={14} aria-hidden />
        </button>
      </form>
      {open && (
        <div id="ask-panel" className="absolute right-0 top-10 z-30 w-[460px] border border-hairline bg-panel p-3">
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
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] uppercase tracking-[0.06em] text-faint">Sources</span>
                  {sourceTags(ask.question, ask.data.source === "bedrock").map((t) => (
                    <Tag key={t}>{t}</Tag>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-faint" title={ask.data.modelId}>
                  {ask.data.source === "bedrock" ? "Bedrock explains engine output; every number comes from the engine." : "Grounded system response: assembled from engine output by template. Not an LLM."}
                </p>
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
  hasIncident,
  demoOpen,
  onToggleDemo,
}: {
  getContext: () => Record<string, unknown>;
  hasIncident: boolean;
  demoOpen: boolean;
  onToggleDemo: () => void;
}) {
  const health = useHealth();
  return (
    <header className="absolute inset-x-0 top-0 z-20 flex h-12 items-center gap-3 border-b border-hairline bg-panel px-4">
      <div className="flex shrink-0 items-center gap-2">
        <Droplets size={16} aria-hidden className="text-flood-low" />
        <h1 className="text-[15px] font-semibold tracking-tight text-ink">AquaPulse</h1>
        <p className="hidden whitespace-nowrap text-[13px] text-muted lg:block">Bengaluru Water Intelligence</p>
      </div>
      <p className="hidden whitespace-nowrap border-l border-hairline pl-3 text-[13px] text-faint min-[1700px]:block">
        AI Decision Engine for a Safer, Water-Resilient Bengaluru
      </p>
      <div className="min-w-0 flex-1" />
      <AskAquaPulse getContext={getContext} hasIncident={hasIncident} />
      <div className="flex shrink-0 items-center gap-4 border-l border-hairline pl-4" role="group" aria-label="System status">
        <StatusChips health={health} />
      </div>
      <button
        type="button"
        onClick={onToggleDemo}
        aria-pressed={demoOpen}
        title="Show or hide the demo controls"
        className={`h-6 shrink-0 border px-2 text-[11px] font-medium uppercase tracking-[0.06em] transition-colors duration-150 ${
          demoOpen ? "border-ink bg-ink text-surface" : "border-hairline text-muted hover:text-ink"
        }`}
      >
        Demo
      </button>
    </header>
  );
}

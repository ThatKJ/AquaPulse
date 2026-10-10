"use client";

import { useEffect, useRef, useState, type Dispatch } from "react";
import { Radio, X } from "lucide-react";
import type { EvidenceAnalysis } from "@/lib/schemas/evidence";
import type { EvidenceEvent, WorldState } from "@/lib/schemas/domain";
import type { Action } from "./state";
import { Tag, iconBtn, pct } from "./ui";

type LiveReport = { id: string; channel: EvidenceEvent["channel"]; text: string; receivedAt: string; lat?: number; lng?: number; analysis?: EvidenceAnalysis };
type Official = { corroborationStatus: "CORROBORATED" | "PARTIALLY_CORROBORATED" | "NO_OFFICIAL_SIGNAL" | "CONFLICTING"; confidenceDelta: number; reason: string };
type Notice = { report: LiveReport; evidenceId: string; placed: boolean; official?: Official };
const OFFICIAL_LABEL: Record<Official["corroborationStatus"], string> = { CORROBORATED: "Corroborated by official data", PARTIALLY_CORROBORATED: "Partly corroborated by official data", NO_OFFICIAL_SIGNAL: "No official signal", CONFLICTING: "Conflicts with official data" };

const POLL_MS = 5000;
// A report can gain a location (a pin sent after the photo) or an analysis after it is first seen, so each state is tracked.
const key = (r: LiveReport) => `${r.id}:${r.lat != null ? "placed" : "unplaced"}:${r.analysis ? "analysed" : "raw"}`;
const OBSERVER: Record<EvidenceAnalysis["source"], string> = { rekognition: "AWS Rekognition · live AWS", bedrock: "Amazon Bedrock · live AWS", fixture: "Recorded analysis" };

/**
 * Polls the server for reports that arrived through the webhooks (WhatsApp, SMS, n8n) and feeds each new one
 * to the engine's normal fusion. Reports that existed before the console opened are the baseline and are not replayed.
 * A report without a location is announced but never placed: coordinates are not invented.
 * ponytail: 5 s polling; switch to Supabase Realtime if latency ever matters.
 */
export function LiveReports({ world, dispatch }: { world: WorldState; dispatch: Dispatch<Action> }) {
  const seen = useRef<Set<string> | null>(null);
  const tMin = useRef(world.tMin);
  const [notices, setNotices] = useState<Notice[]>([]);
  useEffect(() => {
    tMin.current = world.tMin;
  }, [world.tMin]);

  useEffect(() => {
    let stop = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/reports", { cache: "no-store" });
        if (!res.ok) return;
        const { reports } = (await res.json()) as { reports: LiveReport[] };
        if (stop) return;
        if (!seen.current) {
          seen.current = new Set(reports.map((r) => key(r)));
          return;
        }
        const fresh = reports.filter((r) => !seen.current!.has(key(r))).reverse();
        for (const r of fresh) {
          seen.current.add(key(r));
          const evidenceId = `L-${r.id.slice(0, 6)}`;
          const placed = r.lat != null && r.lng != null;
          if (placed)
            dispatch({
              type: "FUSE",
              event: {
                id: evidenceId, tMin: tMin.current, channel: r.channel, reporterId: `live-${r.id.slice(0, 8)}`,
                reporterTrust: 0.5, text: r.text, location: { lng: r.lng!, lat: r.lat! }, analysis: r.analysis, provenance: "LIVE",
              },
            });
          setNotices((n) => [...n.filter((x) => x.report.id !== r.id).slice(-2), { report: r, evidenceId, placed }]);
          // Deterministic comparison with official conditions for the same district. Advisory: it does not change the score.
          if (placed) {
            const kind = r.analysis && /dry|leak|burst/.test(r.analysis.incidentType) ? "scarcity" : "flood";
            fetch(`/api/corroborate?lat=${r.lat}&lng=${r.lng}&kind=${kind}`, { cache: "no-store" })
              .then((res) => (res.ok ? res.json() : null))
              .then((official: Official | null) => {
                if (official && !stop) setNotices((n) => n.map((x) => (x.report.id === r.id ? { ...x, official } : x)));
              })
              .catch(() => {});
          }
        }
      } catch {
        // Offline or the feed is down: the console keeps running on the engine.
      }
    };
    poll();
    const t = setInterval(poll, POLL_MS);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [dispatch]);

  if (notices.length === 0) return null;
  return (
    <div className="absolute left-[296px] top-[60px] z-20 flex w-[348px] flex-col gap-2" aria-live="polite">
      {notices.map(({ report: r, evidenceId, placed, official }) => {
        const incident = world.incidents.find((i) => i.evidenceIds.includes(evidenceId));
        return (
          <section key={r.id} className="border border-hairline bg-panel px-3 py-2.5 text-[13px] motion-safe:animate-[fadein_.25s_ease-out]">
            <div className="flex items-center gap-2">
              <Radio size={14} aria-hidden className="text-verified" />
              <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink">New citizen evidence</span>
              <span className="flex-1" />
              <Tag>{r.channel}</Tag>
              <Tag className="text-verified">Live report</Tag>
              <button type="button" className={iconBtn} aria-label="Dismiss" onClick={() => setNotices((n) => n.filter((x) => x.report.id !== r.id))}>
                <X size={13} aria-hidden />
              </button>
            </div>
            {r.text && <p className="mt-2 line-clamp-2 text-ink">“{r.text}”</p>}
            <p className="tabular mt-1.5 text-[11px] uppercase tracking-[0.06em] text-muted">
              {r.analysis ? `${OBSERVER[r.analysis.source]} · confidence ${pct(r.analysis.confidence)} · ${r.analysis.validHazard ? "hazard indicated" : "no hazard found"}` : "No image analysed"}
            </p>
            <p className="mt-1.5 text-muted">
              {!placed
                ? "No location shared, so it is not placed on the map. Ask the sender for a location pin."
                : incident
                  ? `Fused into ${incident.id} by the normal rules · confidence ${Math.round(incident.evidenceScore?.total ?? 0)}/100.`
                  : "Outside the demo district or not fusable; stored only."}
            </p>
            {official && (
              <p className="mt-1.5 border-t border-hairline pt-1.5 text-muted">
                <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink">{OFFICIAL_LABEL[official.corroborationStatus]}</span>
                {official.confidenceDelta !== 0 && <span className="tabular text-[11px]"> · suggested {official.confidenceDelta > 0 ? "+" : ""}{official.confidenceDelta} confidence</span>}
                <span className="block">{official.reason}</span>
              </p>
            )}
            {incident && (
              <button type="button" className="mt-2 text-[11px] font-medium uppercase tracking-[0.06em] text-ink underline underline-offset-2" onClick={() => dispatch({ type: "SELECT_INCIDENT", id: incident.id })}>
                Open {incident.id}
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}

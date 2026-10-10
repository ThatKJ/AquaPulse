import Image from "next/image";
import Link from "next/link";
import type { NationalSnapshot } from "@/lib/national/store";
import { Reveal } from "./Reveal";

const ist = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false, day: "2-digit", month: "short" }).format(new Date(iso)) + " IST" : null;

function Shot({ src, alt, priority = false, sizes = "(min-width: 1024px) 60vw, 100vw" }: { src: string; alt: string; priority?: boolean; sizes?: string }) {
  return <Image src={`/landing/${src}.jpg`} alt={alt} width={1600} height={900} priority={priority} sizes={sizes} className="block h-auto w-full border border-hairline" />;
}

function Chapter({ step, title, children, shot, alt, flip = false }: { step: string; title: string; children: React.ReactNode; shot: string; alt: string; flip?: boolean }) {
  return (
    <section className="border-t border-hairline">
      <Reveal className="mx-auto grid max-w-[1400px] gap-8 px-5 py-16 lg:grid-cols-12 lg:gap-12 lg:px-10 lg:py-24">
        <div className={`lg:col-span-4 ${flip ? "lg:order-2" : ""}`}>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">{step}</p>
          <h2 className="mt-4 text-[28px] font-medium leading-[1.15] tracking-tight text-ink lg:text-[36px]">{title}</h2>
          <div className="mt-5 space-y-4 text-[15px] leading-relaxed text-muted">{children}</div>
        </div>
        <div className={`lg:col-span-8 ${flip ? "lg:order-1" : ""}`}>
          <Shot src={shot} alt={alt} />
        </div>
      </Reveal>
    </section>
  );
}

/** Public landing page. Server-rendered; every figure is read from the national snapshot or is tested engine output. */
export function Landing({ snapshot }: { snapshot: NationalSnapshot | null }) {
  const s = snapshot?.summary;
  const fresh = snapshot?.sources.every((x) => x.freshness === "CURRENT" || x.freshness === "DELAYED") ?? false;
  const updated = ist(snapshot?.source.lastSuccessAt);
  return (
    <div className="h-full overflow-y-auto scroll-smooth bg-surface text-ink">
      <header className="mx-auto flex max-w-[1400px] items-center justify-between px-5 py-5 lg:px-10">
        <p className="text-[15px] font-semibold tracking-tight">AquaPulse</p>
        <nav className="flex items-center gap-6 text-[13px] text-muted">
          <a href="#how" className="hidden hover:text-ink sm:block">How it works</a>
          <a href="#real" className="hidden hover:text-ink sm:block">What is real</a>
          <Link href="/live" className="text-ink underline underline-offset-4">Open live map</Link>
        </nav>
      </header>

      <section className="mx-auto grid max-w-[1400px] gap-10 px-5 pb-16 pt-6 lg:grid-cols-12 lg:gap-12 lg:px-10 lg:pb-24 lg:pt-14">
        <div className="lg:col-span-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Water intelligence for India</p>
          <h1 className="mt-5 text-[40px] font-medium leading-[1.04] tracking-tight lg:text-[60px]">
            See where water risk is rising.
            <span className="block text-muted">Understand what happens next.</span>
            <span className="block text-muted">Act before impact.</span>
          </h1>
          <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4 text-[15px]">
            <Link href="/live" className="bg-ink px-5 py-3 font-medium text-surface hover:bg-white">Open live map</Link>
            <a href="#how" className="text-muted underline underline-offset-4 hover:text-ink">How it works</a>
          </div>
          {s && (
            <div className="mt-12 border-t border-hairline pt-6">
              <p className="flex items-baseline gap-3">
                <span className="tabular text-[44px] font-medium leading-none tracking-tight">{s.districtsUnderWaterAlert}</span>
                <span className="text-[15px] text-muted">districts need attention {fresh ? "right now" : "at the last update"}</span>
              </p>
              <p className="mt-3 text-[13px] text-muted">
                {s.floodAlerts} flood and river alerts · {s.statesWithAlerts} states and UTs
              </p>
              <p className="mt-2 text-[11px] leading-snug text-faint">
                {fresh ? "Official alerts" : "Data delayed. Official alerts"} from NDMA SACHET and IMD{updated ? `, last synced ${updated}` : ""}. The same figures the live map shows.
              </p>
            </div>
          )}
        </div>
        <div className="lg:col-span-7">
          <Shot src="02-india-live" alt="AquaPulse live map of India: districts with an active official water alert are highlighted" priority />
          <p className="mt-3 text-[11px] text-faint">The live map. Highlighted districts hold an active official flood, river or rain alert.</p>
        </div>
      </section>

      <section id="how" className="border-t border-hairline">
        <Reveal className="mx-auto max-w-[1400px] px-5 py-16 lg:px-10 lg:py-24">
          <p className="max-w-[920px] text-[28px] font-medium leading-[1.2] tracking-tight lg:text-[44px]">
            Most systems tell you what happened. <span className="text-muted">AquaPulse shows where the problem is, why, what happens next, and what to do about it.</span>
          </p>
          <ol className="mt-12 grid gap-6 text-[13px] text-muted sm:grid-cols-5">
            {[
              ["Observe", "Official alerts across India"],
              ["Verify", "Reports from people on the ground"],
              ["Predict", "A local forecast, 60 minutes ahead"],
              ["Act", "The response that protects most"],
              ["Learn", "What to repair for good"],
            ].map(([k, v], i) => (
              <li key={k} className="border-t border-hairline pt-3">
                <span className="mono text-[11px] text-faint">0{i + 1}</span>
                <span className="mt-2 block text-[15px] font-medium text-ink">{k}</span>
                <span className="mt-1 block leading-snug">{v}</span>
              </li>
            ))}
          </ol>
        </Reveal>
      </section>

      <Chapter step="01 · Observe" title="Official signals, mapped by district." shot="04-district-risk" alt="A district selected on the map of Bihar, with its official flood alert and the reason for its risk level">
        <p>AquaPulse reads India’s national alert feed and IMD nowcasts. Every district shows its risk, the alert behind it and when it was issued.</p>
        <p>Inputs that are not connected are shown as unknown, never as zero.</p>
      </Chapter>

      <section className="border-t border-hairline">
        <Reveal className="mx-auto max-w-[1400px] px-5 py-16 lg:px-10 lg:py-24">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">National to local</p>
          <h2 className="mt-4 max-w-[760px] text-[28px] font-medium leading-[1.15] tracking-tight lg:text-[36px]">One map, from the country down to a street-level forecast.</h2>
          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            {[
              ["02-india-live", "India", "Where is the problem?"],
              ["03-state-drilldown", "State and district", "Why is it happening?"],
              ["06-local-hydrotwin", "Local forecast · Bengaluru", "What happens next?"],
            ].map(([src, level, q]) => (
              <figure key={src}>
                <Shot src={src} alt={`${level} view of AquaPulse`} sizes="(min-width: 1024px) 30vw, 100vw" />
                <figcaption className="mt-3 text-[13px] text-muted">
                  <span className="text-ink">{level}</span> · {q}
                </figcaption>
              </figure>
            ))}
          </div>
        </Reveal>
      </section>

      <Chapter step="02 · Verify" title="Reports are evidence, not pins." shot="05-citizen-evidence" alt="Three citizen reports fused into one confirmed incident, with the confidence history 52, 64, 68, 76" flip>
        <p>A report arrives, a photo is checked by Amazon Rekognition, and nearby reports are combined into one incident with a confidence you can inspect.</p>
        <p>One unsupported message stays unverified. In our test it scores 14 out of 100 and nothing escalates.</p>
      </Chapter>

      <Chapter step="03 · Predict" title="In thirty minutes the water reaches the hospital." shot="07-hospital-risk" alt="Local forecast for Bengaluru: flood risk turning critical, with a hospital marked at risk">
        <p>Where a local model exists, AquaPulse forecasts cell by cell for the next hour. The first covers south-east Bengaluru; its city data is a labelled simulation, so the scenario is repeatable.</p>
      </Chapter>

      <section className="border-t border-hairline">
        <Reveal className="mx-auto max-w-[1400px] px-5 py-16 lg:px-10 lg:py-24">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">04 · Act</p>
          <div className="mt-6 grid gap-10 lg:grid-cols-12 lg:gap-12">
            <div className="lg:col-span-5">
              <p className="tabular flex flex-wrap items-baseline gap-x-5 text-[56px] font-medium leading-none tracking-tight lg:text-[84px]">
                <span className="text-muted">3,822</span>
                <span aria-hidden className="text-[36px] text-faint lg:text-[48px]">→</span>
                <span>190</span>
              </p>
              <p className="mt-4 text-[15px] text-muted">estimated people exposed, before and after the best response</p>
              <p className="mt-8 flex flex-wrap items-baseline gap-x-4 text-[20px] font-medium lg:text-[24px]">
                <span className="text-flood-mid">Hospital at risk</span>
                <span aria-hidden className="text-faint">→</span>
                <span className="text-verified">Protected</span>
              </p>
              <p className="mt-8 text-[15px] leading-relaxed text-muted">Twenty feasible actions are simulated and ranked. Clearing one drain and deploying one pump wins, and the ranking shows why: people protected, facilities, equity, cost and response time.</p>
            </div>
            <div className="lg:col-span-7">
              <Shot src="08-response-options" alt="Response options ranked for the incident; the best one cuts estimated exposure from 3,822 to 190 and protects the hospital" />
            </div>
          </div>
        </Reveal>
      </section>

      <Chapter step="05 · Learn" title="What should the city repair for good?" shot="10-priority-repairs" alt="Priority repairs: infrastructure ranked by repeat failure, with drain D104 first" flip>
        <p>Each response is checked against its forecast, and each failure is remembered. The result is a ranked list of permanent repairs, not just today’s fix.</p>
        <p>The same engine handles shortage: when a trunk main fails in a heat spell, tankers are allocated by need, hospital first.</p>
      </Chapter>

      <section id="real" className="border-t border-hairline">
        <Reveal className="mx-auto grid max-w-[1400px] gap-10 px-5 py-16 lg:grid-cols-12 lg:px-10 lg:py-24">
          <div className="lg:col-span-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">What is real</p>
            <h2 className="mt-4 text-[28px] font-medium leading-[1.15] tracking-tight lg:text-[36px]">Everything is labelled.</h2>
            <p className="mt-5 text-[15px] leading-relaxed text-muted">Official data and citizen reports come in. AWS checks the evidence. PostGIS stores it. The engine forecasts and ranks responses.</p>
          </div>
          <div className="grid gap-10 text-[15px] leading-relaxed sm:grid-cols-3 lg:col-span-8">
            <div>
              <h3 className="border-b border-hairline pb-2 text-[11px] uppercase tracking-[0.12em] text-ink">Live</h3>
              <ul className="mt-3 space-y-2 text-muted">
                <li>Official alerts: NDMA SACHET, IMD nowcasts</li>
                <li>Photo checks: AWS Lambda and Amazon Rekognition, logged in CloudWatch</li>
                <li>Storage: Supabase Postgres with PostGIS</li>
                <li>Incoming reports appear on the map within seconds</li>
              </ul>
            </div>
            <div>
              <h3 className="border-b border-hairline pb-2 text-[11px] uppercase tracking-[0.12em] text-ink">Simulated, and labelled</h3>
              <ul className="mt-3 space-y-2 text-muted">
                <li>Bengaluru infrastructure, populations and failure history</li>
                <li>The flood, shortage and false-report scenarios</li>
                <li>Observed results of a response</li>
              </ul>
            </div>
            <div>
              <h3 className="border-b border-hairline pb-2 text-[11px] uppercase tracking-[0.12em] text-ink">Not connected yet</h3>
              <ul className="mt-3 space-y-2 text-muted">
                <li>Measured rainfall, river gauges and heat</li>
                <li>WhatsApp from a real phone, and n8n</li>
                <li>Amazon Bedrock: answers are built from engine output, not a language model</li>
              </ul>
            </div>
          </div>
        </Reveal>
      </section>

      <section className="border-t border-hairline">
        <div className="mx-auto flex max-w-[1400px] flex-col items-start gap-8 px-5 py-20 lg:flex-row lg:items-end lg:justify-between lg:px-10 lg:py-28">
          <p className="max-w-[760px] text-[32px] font-medium leading-[1.1] tracking-tight lg:text-[52px]">National observation. Local forecast. A response you can check.</p>
          <div className="flex flex-col gap-3 text-[15px]">
            <Link href="/live" className="bg-ink px-5 py-3 text-center font-medium text-surface hover:bg-white">Open live map</Link>
            <Link href="/?demo=1&scenario=flood" className="text-muted underline underline-offset-4 hover:text-ink">Explore the Bengaluru forecast</Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-hairline">
        <p className="mx-auto max-w-[1400px] px-5 py-8 text-[11px] leading-relaxed text-faint lg:px-10">
          Alerts: NDMA SACHET (Common Alerting Protocol). Nowcasts: India Meteorological Department. National outline: Survey of India depiction via DataMeet (CC BY 4.0). Districts and states: geoBoundaries (ODbL 1.0, CC BY 2.5 IN). Basemap: OpenFreeMap, OpenMapTiles, OpenStreetMap contributors. AquaPulse is a hackathon project and is not affiliated with or endorsed by NDMA, IMD, CWC or any government body. The water risk score is AquaPulse’s own derived estimate.
        </p>
      </footer>
    </div>
  );
}

import Image from "next/image";
import Link from "next/link";
import type { NationalSnapshot } from "@/lib/national/store";

const ist = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false, day: "2-digit", month: "short" }).format(new Date(iso)) + " IST" : null;

function Shot({ src, alt, priority = false }: { src: string; alt: string; priority?: boolean }) {
  return <Image src={`/landing/${src}.jpg`} alt={alt} width={1600} height={900} priority={priority} sizes="(min-width: 1024px) 60vw, 100vw" className="block h-auto w-full border border-hairline" />;
}

function Chapter({ n, kicker, title, children, shot, alt, flip = false }: { n: string; kicker: string; title: string; children: React.ReactNode; shot: string; alt: string; flip?: boolean }) {
  return (
    <section className="border-t border-hairline">
      <div className={`mx-auto grid max-w-[1400px] gap-8 px-5 py-16 lg:grid-cols-12 lg:gap-12 lg:px-10 lg:py-24`}>
        <div className={`lg:col-span-4 ${flip ? "lg:order-2" : ""}`}>
          <p className="mono text-[11px] text-faint">{n}</p>
          <p className="mt-6 text-[11px] uppercase tracking-[0.12em] text-muted">{kicker}</p>
          <h2 className="mt-3 text-[28px] font-medium leading-[1.15] tracking-tight text-ink lg:text-[36px]">{title}</h2>
          <div className="mt-5 space-y-4 text-[15px] leading-relaxed text-muted">{children}</div>
        </div>
        <div className={`lg:col-span-8 ${flip ? "lg:order-1" : ""}`}>
          <Shot src={shot} alt={alt} />
        </div>
      </div>
    </section>
  );
}

/** Public landing page. Server-rendered; every figure is read from the live national snapshot or the engine's tested output. */
export function Landing({ snapshot }: { snapshot: NationalSnapshot | null }) {
  const s = snapshot?.summary;
  const updated = ist(snapshot?.source.lastSuccessAt);
  return (
    <div className="h-full overflow-y-auto bg-surface text-ink">
      <header className="mx-auto flex max-w-[1400px] items-center justify-between px-5 py-5 lg:px-10">
        <p className="text-[15px] font-semibold tracking-tight">AquaPulse</p>
        <nav className="flex items-center gap-6 text-[13px] text-muted">
          <a href="#how" className="hidden hover:text-ink sm:block">How it works</a>
          <a href="#real" className="hidden hover:text-ink sm:block">What is real</a>
          <Link href="/live" className="text-ink underline underline-offset-4">Open live command center</Link>
        </nav>
      </header>

      <section className="mx-auto grid max-w-[1400px] gap-10 px-5 pb-16 pt-8 lg:grid-cols-12 lg:gap-12 lg:px-10 lg:pb-24 lg:pt-16">
        <div className="lg:col-span-5">
          <h1 className="text-[44px] font-medium leading-[1.02] tracking-tight lg:text-[72px]">India’s water intelligence layer.</h1>
          <p className="mt-8 text-[20px] leading-snug text-muted lg:text-[24px]">
            See where risk is rising.
            <br />
            Understand what happens next.
            <br />
            Act before impact.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4 text-[15px]">
            <Link href="/live" className="bg-ink px-5 py-3 font-medium text-surface hover:bg-white">Open live command center</Link>
            <a href="#how" className="text-muted underline underline-offset-4 hover:text-ink">Explore how it works</a>
          </div>
          {s && (
            <dl className="mt-14 grid grid-cols-3 gap-6 border-t border-hairline pt-6">
              <div>
                <dt className="text-[11px] uppercase tracking-[0.1em] text-faint">Districts under a water-related alert</dt>
                <dd className="tabular mt-2 text-[32px] font-medium leading-none">{s.districtsUnderWaterAlert}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-[0.1em] text-faint">Flood and river alerts</dt>
                <dd className="tabular mt-2 text-[32px] font-medium leading-none">{s.floodAlerts}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-[0.1em] text-faint">States with active alerts</dt>
                <dd className="tabular mt-2 text-[32px] font-medium leading-none">{s.statesWithAlerts}</dd>
              </div>
              <p className="col-span-3 text-[11px] leading-snug text-faint">
                Official alerts from NDMA SACHET{updated ? `, last synced ${updated}` : ""}. Read from the same database as the command center.
              </p>
            </dl>
          )}
        </div>
        <div className="lg:col-span-7">
          <Shot src="01-india" alt="AquaPulse national view: a district map of India with districts under official flood alerts highlighted" priority />
          <p className="mt-3 text-[11px] text-faint">The live national view. Coloured districts hold an active water-related official alert.</p>
        </div>
      </section>

      <section id="how" className="border-t border-hairline">
        <div className="mx-auto max-w-[1400px] px-5 py-16 lg:px-10 lg:py-24">
          <p className="max-w-[900px] text-[28px] font-medium leading-[1.2] tracking-tight lg:text-[44px]">
            Most systems tell you what happened. <span className="text-muted">AquaPulse asks what happens next, who is affected, and which action changes the outcome.</span>
          </p>
        </div>
      </section>

      <Chapter n="01" kicker="National awareness" title="Official alerts, on one district map." shot="02-district" alt="District panel for Muzaffarpur showing an official CWC flood alert, the derived risk score, and inputs that are unknown">
        <p>AquaPulse ingests India’s national alert feed, NDMA SACHET, which carries warnings issued by IMD offices, the Central Water Commission and state authorities.</p>
        <p>Each district shows a derived risk score and exactly what it rests on. Inputs that are not connected are shown as unknown, never as zero.</p>
      </Chapter>

      <Chapter n="02" kicker="Ground truth" title="Reports are evidence, not pins." shot="03-evidence" alt="Evidence panel: three citizen reports fused into one incident with a score history of 52, 64, 68, 76" flip>
        <p>Citizen reports are fused into one incident and scored on eight named components: independent confirmations, location and time consistency, weather, infrastructure history and more.</p>
        <p>A photo goes through AWS Lambda to Amazon Rekognition. A single unsupported report stays unverified; in our test it scores 14 out of 100 and nothing escalates.</p>
      </Chapter>

      <Chapter n="03" kicker="Prediction" title="Thirty minutes ahead, the water reaches the hospital." shot="04-critical-flood" alt="Local HydroTwin of Bengaluru: flood risk cells turning critical with a hospital flagged at risk">
        <p>Where a local HydroTwin exists, AquaPulse predicts cell by cell: now, +15, +30 and +60 minutes, with confidence that falls as the horizon grows.</p>
        <p>The first HydroTwin covers south-east Bengaluru. Its city data is a labelled simulation, so the scenario is reproducible.</p>
      </Chapter>

      <Chapter n="04" kicker="Decision" title="3,822 people exposed. Or 190." shot="05-intervention" alt="Intervention simulator ranking three action bundles; the winner cuts estimated exposure from 3,822 to 190 and protects the hospital" flip>
        <p>Twenty feasible action bundles are simulated and ranked on people protected, critical facilities, equity, cost and response time.</p>
        <p>Clearing drain D104 and deploying one pump cuts estimated exposure by 95% and moves the hospital from at risk to protected. The map changes as you compare options, and the ranking shows its arithmetic.</p>
      </Chapter>

      <Chapter n="05" kicker="Both sides of water" title="Too much, and too little." shot="06-scarcity" alt="Scarcity view: a supply deficit of 3.7 megalitres per day with tanker routes allocated to a hospital first">
        <p>The same engine handles shortage. A trunk main fails in a heat spell; the deficit grows to 3.7 megalitres a day; tankers are allocated by equity-weighted need, hospital first.</p>
      </Chapter>

      <Chapter n="06" kicker="Learning" title="What should the city fix for good?" shot="07-fix-this-first" alt="Fix This First: infrastructure ranked by repeat failure, with drain D104 as priority one" flip>
        <p>Every intervention is checked against its prediction, and every failure is added to the asset’s memory. The result is a ranked list of what to repair permanently, not just today.</p>
      </Chapter>

      <section id="real" className="border-t border-hairline">
        <div className="mx-auto grid max-w-[1400px] gap-10 px-5 py-16 lg:grid-cols-12 lg:px-10 lg:py-24">
          <div className="lg:col-span-4">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted">What is real</p>
            <h2 className="mt-3 text-[28px] font-medium leading-[1.15] tracking-tight lg:text-[36px]">We label everything.</h2>
          </div>
          <div className="grid gap-10 text-[15px] leading-relaxed sm:grid-cols-3 lg:col-span-8">
            <div>
              <h3 className="border-b border-hairline pb-2 text-[11px] uppercase tracking-[0.12em] text-ink">Live</h3>
              <ul className="mt-3 space-y-2 text-muted">
                <li>Official alerts: NDMA SACHET</li>
                <li>Photo analysis: AWS Lambda and Amazon Rekognition, logged in CloudWatch</li>
                <li>Storage: Supabase Postgres with PostGIS</li>
                <li>Inbound reports reach the dashboard within seconds</li>
              </ul>
            </div>
            <div>
              <h3 className="border-b border-hairline pb-2 text-[11px] uppercase tracking-[0.12em] text-ink">Simulated, and labelled</h3>
              <ul className="mt-3 space-y-2 text-muted">
                <li>Bengaluru infrastructure, populations and failure history</li>
                <li>The flood, scarcity and false-report scenarios</li>
                <li>Observed intervention outcomes</li>
              </ul>
            </div>
            <div>
              <h3 className="border-b border-hairline pb-2 text-[11px] uppercase tracking-[0.12em] text-ink">Not connected yet</h3>
              <ul className="mt-3 space-y-2 text-muted">
                <li>Rainfall, river gauge and heat feeds</li>
                <li>WhatsApp through Twilio, and n8n orchestration</li>
                <li>Amazon Bedrock: answers are grounded templates, not a language model</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-hairline">
        <div className="mx-auto flex max-w-[1400px] flex-col items-start gap-8 px-5 py-20 lg:flex-row lg:items-end lg:justify-between lg:px-10 lg:py-28">
          <p className="max-w-[760px] text-[32px] font-medium leading-[1.1] tracking-tight lg:text-[52px]">National observation. Local intelligence. Decisions you can check.</p>
          <div className="flex flex-col gap-3 text-[15px]">
            <Link href="/live" className="bg-ink px-5 py-3 text-center font-medium text-surface hover:bg-white">Open live command center</Link>
            <Link href="/?demo=1&scenario=flood" className="text-muted underline underline-offset-4 hover:text-ink">Play the Bengaluru flood scenario</Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-hairline">
        <p className="mx-auto max-w-[1400px] px-5 py-8 text-[11px] leading-relaxed text-faint lg:px-10">
          Alerts: NDMA SACHET (Common Alerting Protocol). Boundaries: geoBoundaries (ODbL 1.0, CC BY 2.5 IN). Basemap: OpenFreeMap, OpenMapTiles, OpenStreetMap contributors. AquaPulse is a hackathon project and is not affiliated with or endorsed by NDMA, IMD, CWC or any government body. The AquaPulse water risk score is our own derived estimate.
        </p>
      </footer>
    </div>
  );
}

import { Suspense } from "react";
import { connection } from "next/server";
import { App } from "@/components/App";
import { Landing } from "@/components/Landing";
import { nationalSnapshot } from "@/lib/national/store";

// `/` is the landing page. Links that carry ?demo, ?scenario or ?view keep opening the command center directly,
// so existing demo URLs still work. The live command center itself is at /live.
async function Entry({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  await connection(); // request-time: depends on the query string and on live national figures
  const q = await searchParams;
  if (q.demo || q.scenario || q.view) return <App />;
  const snapshot = await nationalSnapshot().catch(() => null);
  return <Landing snapshot={snapshot} />;
}

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <Suspense fallback={<div className="h-full bg-surface" />}>
      <Entry searchParams={searchParams} />
    </Suspense>
  );
}

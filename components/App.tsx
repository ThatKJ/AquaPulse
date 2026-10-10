"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import { Shell } from "./Shell";

const NationalView = dynamic(() => import("./national/NationalView").then((m) => m.NationalView), { ssr: false });

const subscribe = (cb: () => void) => {
  window.addEventListener("popstate", cb);
  return () => window.removeEventListener("popstate", cb);
};
/** `/` opens national conditions. The local HydroTwin and its demo scenarios live behind ?view=local, ?demo=1 or ?scenario=. */
const isLocal = () => {
  const q = new URLSearchParams(window.location.search);
  return q.get("view") === "local" || q.get("demo") === "1" || q.has("scenario");
};

export function App() {
  const local = useSyncExternalStore(subscribe, isLocal, () => false);
  if (local) return <Shell />;
  return (
    <NationalView
      onOpenLocal={() => {
        window.history.pushState(null, "", "/?view=local");
        window.dispatchEvent(new PopStateEvent("popstate"));
      }}
    />
  );
}

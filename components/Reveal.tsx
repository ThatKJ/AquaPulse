"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Fades a block in once, when it first scrolls into view. Content is fully visible without JavaScript or with reduced motion. */
export function Reveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"static" | "waiting" | "shown">("static");
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    // Only hide what is still below the fold, so nothing already on screen blinks.
    if (el.getBoundingClientRect().top < window.innerHeight * 0.9) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setState("shown");
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    const raf = requestAnimationFrame(() => {
      setState("waiting");
      io.observe(el);
    });
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, []);
  return (
    <div ref={ref} className={`${className} transition-[opacity,transform] duration-[600ms] ease-out ${state === "waiting" ? "translate-y-3 opacity-0" : "translate-y-0 opacity-100"}`}>
      {children}
    </div>
  );
}

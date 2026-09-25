/**
 * E2E fixture — NOT shipped. A dev-only page served by Vite at /e2e.html and driven
 * by Playwright (packages/react/e2e/*.spec.ts). It mounts exactly ONE @entviz/react
 * component, fully specified by URL query params, and exposes the event firehose on
 * `window.__evz` so specs assert on the real emitted stream instead of scraping DOM.
 * Mirrors the calibrate.html dev-harness precedent.
 *
 * Determinism: a seeded `rng` (query `seed=`) is honored ONLY because the Vite dev
 * server is not a production build (rng-guard §5.4); the shipped package's prod gate
 * is untouched, and this fixture never ships. StrictMode is deliberately OMITTED so
 * effect-driven events (voice.start, etc.) fire once, not twice.
 *
 * Query params: component (pill|entviz|compare|walk|voice), value, reference, mode,
 * fontSizePt, note, label, typeSignal, corner, locale, targetAr, posture, seed, maxWidth
 * (a CSS length for the pill), textOverflow (ellipsis|clip), locate (flag: pass an onLocate hook).
 */
import { createRoot } from "react-dom/client";
import {
  Entviz,
  EntvizPill,
  EntvizCompare,
  EntvizWalk,
  EntvizVoiceCompare,
  type EntvizEvent,
} from "@entviz/react";
import type { CornerToken, TrustAssumption } from "@entviz/core";

const q = new URLSearchParams(location.search);
const has = (k: string) => q.has(k);
const str = (k: string, d = "") => q.get(k) ?? d;
const numOpt = (k: string): number | undefined => (has(k) ? Number(q.get(k)) : undefined);
const num = (k: string, d: number): number => numOpt(k) ?? d;

// Seeded LCG (same recurrence as the Vitest `rngFrom` helper) — reproducible check
// order for the rare order-specific spec; undefined ⇒ the component's own CSPRNG.
function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
const rng = has("seed") ? seededRng(num("seed", 1)) : undefined;

declare global {
  interface Window {
    __evz: { events: EntvizEvent[]; counts: Record<string, number> };
  }
}
window.__evz = { events: [], counts: {} };
const onEvent = (e: EntvizEvent) => {
  window.__evz.events.push(e);
  window.__evz.counts[e.type] = (window.__evz.counts[e.type] ?? 0) + 1;
};

const value = str("value", "550e8400-e29b-41d4-a716-446655440000");
const component = str("component", "pill");
const fontSizePt = num("fontSizePt", 12);
const note = has("note") ? str("note") : null;
const locale = has("locale") ? str("locale") : undefined;
const targetAr = numOpt("targetAr");
const trust: TrustAssumption | undefined =
  str("posture") === "corpus" ? { posture: "corpus", mnemonic: true, autoColor: true, icon: true } : undefined;

function Fixture() {
  switch (component) {
    case "entviz":
      return (
        <Entviz
          value={value}
          fontSizePt={fontSizePt}
          note={note}
          targetAr={targetAr}
          controls={has("controls")}
          onEvent={onEvent}
        />
      );
    case "compare":
      return (
        <EntvizCompare
          value={value}
          fontSizePt={fontSizePt}
          note={note}
          targetAr={targetAr}
          reference={has("reference") ? { kind: "text", data: str("reference") } : undefined}
          rng={rng}
          onEvent={onEvent}
        />
      );
    case "walk":
      return (
        <EntvizWalk
          value={value}
          reference={str("reference", value)}
          mode={str("mode", "spot-check") as "spot-check" | "complete"}
          fontSizePt={fontSizePt}
          rng={rng}
          onEvent={onEvent}
        />
      );
    case "voice":
      return (
        <EntvizVoiceCompare
          value={value}
          mode={str("mode", "voice-only") as "voice-only" | "paste-bind"}
          rng={rng}
          onEvent={onEvent}
        />
      );
    case "pill":
    default:
      return (
        <EntvizPill
          value={value}
          label={has("label") ? str("label") : undefined}
          typeSignal={str("typeSignal", "autoCombo") as "none" | "icon" | "text" | "autoCombo"}
          corner={has("corner") ? (str("corner") as CornerToken) : undefined}
          fontSizePt={fontSizePt}
          note={note}
          locale={locale}
          trust={trust}
          maxWidth={has("maxWidth") ? str("maxWidth") : undefined}
          textOverflow={has("textOverflow") ? (str("textOverflow") as "ellipsis" | "clip") : undefined}
          onLocate={has("locate") ? () => {} : undefined}
          onCompare={() => {}}
          onEvent={onEvent}
        />
      );
  }
}

// `diag`: a hover diagnostic for the pill's label marquee. Counts animation starts and
// hover enter/leave, then samples the label every ~50ms for 8s after the first hover and
// writes it all to a textarea the tester can copy. Dev-only, like the rest of this page.
if (has("diag")) {
  const log: string[] = [];
  let starts = 0, enters = 0, leaves = 0, t0 = 0;
  const realAnimate = HTMLElement.prototype.animate;
  HTMLElement.prototype.animate = function (...a: Parameters<typeof realAnimate>) {
    starts++;
    log.push(`${(performance.now() - t0).toFixed(0)}ms animate() #${starts} ${JSON.stringify(a[0])}`);
    return realAnimate.apply(this, a);
  };
  const out = document.createElement("textarea");
  out.style.cssText = "width:95vw;height:60vh;font:11px monospace;margin-top:16px";
  document.body.appendChild(out);
  document.addEventListener("mouseover", (e) => {
    const wrap = (e.target as Element).closest?.(".entviz-pill__wrap");
    if (!wrap || t0) return;
    t0 = performance.now();
    const el = document.querySelector<HTMLElement>(".entviz-pill__label")!;
    wrap.addEventListener("mouseenter", () => { enters++; log.push(`${(performance.now() - t0).toFixed(0)}ms mouseenter`); });
    wrap.addEventListener("mouseleave", () => { leaves++; log.push(`${(performance.now() - t0).toFixed(0)}ms mouseleave`); });
    new ResizeObserver(() => log.push(`${(performance.now() - t0).toFixed(0)}ms resize sw=${el.scrollWidth} cw=${el.clientWidth}`)).observe(el);
    const cs = getComputedStyle(el);
    log.unshift(`UA ${navigator.userAgent}`, `dpr ${devicePixelRatio} reduce=${matchMedia("(prefers-reduced-motion: reduce)").matches} sw=${el.scrollWidth} cw=${el.clientWidth} ta=${cs.textAlign} dir=${cs.direction} disp=${cs.display}`);
    const tick = () => {
      const t = performance.now() - t0;
      const r = document.createRange(); r.selectNodeContents(el);
      const x = r.getBoundingClientRect().left - el.getBoundingClientRect().left;
      const inner = el.querySelector<HTMLElement>(".entviz-pill__label-text");
      const anims = el.getAnimations({ subtree: true });
      const an = anims[0];
      log.push(`${t.toFixed(0)}ms transform=${inner ? getComputedStyle(inner).transform : "-"} textX=${x.toFixed(1)} anims=${anims.length} ct=${an ? Number(an.currentTime).toFixed(0) : "-"} state=${an?.playState ?? "-"}`);
      if (t < 8000) setTimeout(tick, 50);
      else out.value = [`starts=${starts} enters=${enters} leaves=${leaves}`, ...log].join("\n");
    };
    tick();
  });
}

createRoot(document.getElementById("root")!).render(
  <div
    data-testid="evz-fixture"
    data-component={component}
    style={{ padding: 24, fontFamily: "system-ui, -apple-system, sans-serif", color: "#111", background: "#fff" }}
  >
    <Fixture />
  </div>,
);

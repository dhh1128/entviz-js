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
 * fontSizePt, note, label, typeSignal, corner, locale, targetAr, posture, seed.
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
          onCompare={() => {}}
          onEvent={onEvent}
        />
      );
  }
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

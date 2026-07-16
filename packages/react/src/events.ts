/**
 * The `@entviz/react` event surface — a single typed firehose (`onEvent`) that
 * every component can emit, mirroring the disclosure lifecycle (Cite · Visualize ·
 * Compare) and the comparison journey (acquisition · fetch · medium · verdict ·
 * walk · voice · display). Design: reviews/integration-surface/proposal-2026-07-02-v2.md.
 *
 * THREAT-MODEL FRAMING (../entviz/docs/threat-model.md): the primary asset is the
 * user's belief that two values are equal; confidentiality of the value is OUT of
 * scope (values are public). So payloads MAY carry content — the guards live in the
 * verdict machine + the rendering surface (see the design docs / EntvizCompare), not
 * here. Two structural rules ARE encoded in the types, though:
 *   • only `fetch.start` is advisory-cancelable (carries `preventDefault`); every
 *     verdict/verification event is notify-only, so a host handler cannot forge or
 *     suppress a verdict;
 *   • there is deliberately NO `voice.step` — the live authenticator-selected cell
 *     order must never leave the endpoint (comparison-design §15.7/§15.9). `walk.step`
 *     (single-user machine walk only) carries a feature KIND + index, never glyphs.
 */
import { useCallback, useLayoutEffect, useRef } from "react";
import type { CopyKind } from "./copy-actions.ts";

export type EntvizSource = "entviz" | "pill" | "compare" | "walk" | "voice";
/** A host-side ROUTING HINT (does this event touch the network / carry content) — NOT a
 *  security boundary. Value confidentiality is out of scope. */
export type EntvizSensitivity = "plain" | "network" | "content";

export type DisclosureState = "pill" | "visualize" | "compare";
export type Provenance = "pasted" | "file" | "url" | "dropped" | "provided";
export type Medium = "text" | "svg" | "raster" | "ambiguous";
export type VerdictState = "pending" | "different" | "no-difference" | "identical" | "unknown";
// Event-surface status vocabularies. These mirror @entviz/core's WalkStatus /
// CeremonyStatus, except core's "pending" (a walk/ceremony frozen by an early
// "Done" before a verdict was reached) is surfaced as the self-documenting
// "pending-done" — a completion event carrying a bare "pending" reads as a
// contradiction. The emit sites map "pending" -> "pending-done" (EntvizWalk.ts,
// EntvizCompare.ts, EntvizVoiceCompare.ts).
export type WalkStatus = "no-difference" | "different" | "inconclusive" | "pending-done";
export type CeremonyStatus = "no-difference" | "different" | "pending-done";

interface EntvizEventBase {
  /** Monotonic within a component instance. */
  seq: number;
  /** `Date.now()` at emit. */
  ts: number;
  source: EntvizSource;
  sensitivity: EntvizSensitivity;
}

/** The variant bodies (discriminated by `type`). `EntvizEvent` = base + one of these. */
export type EntvizEventPayload =
  // ---- lifecycle (Entviz / Pill) ----
  | { type: "render.error"; message: string }
  | { type: "disclosure.change"; state: DisclosureState; prev: DisclosureState }
  | { type: "copy"; kind: CopyKind; ok: boolean }
  // The host was asked to LOCATE this value's other occurrences in its own corpus
  // (recognition, never verification — no equality is asserted). Notify-only.
  | { type: "locate" }
  // ---- display ----
  | { type: "display.resize"; fontSizePt: number }
  | { type: "display.reshape"; targetAr: number; cols: number; rows: number }
  | { type: "display.tab"; tab: "reference" | "voice" }
  // ---- acquisition (Compare) ----
  | { type: "reference.acquired"; provenance: Provenance; medium: Medium | null; byteLength: number; origin?: string; content?: string }
  | { type: "reference.cleared" }
  | { type: "reference.mediumDetected"; medium: Medium; isUrl: boolean }
  | { type: "reference.readError"; reason: string }
  | { type: "secret.detected"; where: "value" | "reference" | "both" }
  // ---- fetch (Compare, network) ----
  | { type: "fetch.start"; origin: string; url?: string; preventDefault: () => void }
  | { type: "fetch.success"; origin: string; status: number; byteLength: number; durationMs: number }
  | { type: "fetch.error"; origin: string; message: string }
  // ---- outcome (Compare) — load-bearing, notify-only ----
  | { type: "verdict.change"; verdict: VerdictState; medium: string | null; provenance: Provenance | null; coverageBits?: number; complete?: boolean }
  // ---- verification (Walk / Voice, forwarded up through Compare) ----
  | { type: "walk.start"; mode: "spot-check" | "complete" }
  | { type: "walk.step"; feature: string | null; index: number }
  | { type: "walk.complete"; status: WalkStatus }
  | { type: "voice.start"; mode: "voice-only" | "paste-bind" }
  | { type: "voice.complete"; status: CeremonyStatus };
// NOTE: no `voice.step` — see the module doc.

export type EntvizEvent = EntvizEventBase & EntvizEventPayload;
/** What a component passes to `emitEvent` — the payload plus an optional sensitivity
 *  override (defaults to "plain"); seq/ts/source are stamped by the emitter. */
export type EntvizEventInit = EntvizEventPayload & { sensitivity?: EntvizSensitivity };

/**
 * Stamp seq/ts/source onto an event body and hand it to the host's `onEvent`, wrapped
 * so a THROWING host handler can never wedge the component into a state that skips a
 * safety. `seqRef` is a mutable ref (`useRef(0)`) so `seq` is monotonic per instance.
 */
export function emitEvent(
  onEvent: ((e: EntvizEvent) => void) | undefined,
  source: EntvizSource,
  seqRef: { current: number },
  init: EntvizEventInit,
): void {
  if (!onEvent) return;
  const e = { seq: seqRef.current++, ts: Date.now(), source, sensitivity: "plain" as EntvizSensitivity, ...init } as EntvizEvent;
  try {
    onEvent(e);
  } catch {
    /* a host handler bug must not break rendering or skip a safety */
  }
}

/**
 * Hook wrapper around {@link emitEvent} that returns a STABLE `emit` bound to the
 * host's LATEST `onEvent`. The returned function's identity is constant for the
 * component's life (deps `[source]`, and `source` is fixed per instance), so it
 * can sit in `useEffect` dependency arrays without either re-running effects every
 * render or capturing a stale `onEvent`. A late async callback — e.g. an
 * image-decode that resolves after the host swapped `onEvent` — reaches the
 * current handler, not the one captured when the effect was set up. `seq` stays
 * monotonic per instance via an internal ref. Every component uses this instead of
 * a per-render `const emit = (init) => emitEvent(onEvent, …)` closure.
 */
export function useEmit(
  onEvent: ((e: EntvizEvent) => void) | undefined,
  source: EntvizSource,
): (init: EntvizEventInit) => void {
  const seqRef = useRef(0);
  const onEventRef = useRef(onEvent);
  // Keep the ref pointing at the latest handler, synchronously after commit so an
  // async callback firing before the next paint still sees the current onEvent.
  useLayoutEffect(() => {
    onEventRef.current = onEvent;
  });
  return useCallback((init: EntvizEventInit) => emitEvent(onEventRef.current, source, seqRef, init), [source]);
}

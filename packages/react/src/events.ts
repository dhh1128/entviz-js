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
import type { CopyKind } from "./copy-actions.ts";

export type EntvizSource = "entviz" | "pill" | "compare" | "walk" | "voice";
/** A host-side ROUTING HINT (does this event touch the network / carry content) — NOT a
 *  security boundary. Value confidentiality is out of scope. */
export type EntvizSensitivity = "plain" | "network" | "content";

export type DisclosureState = "pill" | "visualize" | "compare";
export type Provenance = "pasted" | "file" | "url" | "dropped" | "provided";
export type Medium = "text" | "svg" | "raster" | "ambiguous";
export type VerdictState = "pending" | "different" | "no-difference" | "identical" | "unknown";
export type WalkStatus = "no-difference" | "different" | "inconclusive" | "pending-done";
export type CeremonyStatus = "no-difference" | "different";

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

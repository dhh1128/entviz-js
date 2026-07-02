/**
 * <EntvizVoiceCompare /> — the remote two-party voice ceremony UI (M3), driving
 * the core read-back model (@entviz/core: buildReadbackPlan + the
 * startCeremony/respond reducer). Pinned by comparison-design.md §15.
 *
 * ONE-WAY authentication on a SINGLE device: the person running this tool is the
 * *authenticator*; the other party only reads glyphs off their own artifact aloud
 * over a voice/video call the authenticator trusts. There is no software peer and
 * no data channel — the ceremony is a guided read-back the authenticator drives.
 *
 * Flow: an authentication-affirmation gate first (§15.1 — the tool asserts the
 * requirement, the human affirms it; the tool never claims the channel is
 * authenticated), then the authenticator is prompted, one cell at a time, to have
 * the reader read the highlighted cell aloud and report Matches / Doesn't-match. A
 * focus ring is drawn AROUND our own cell (geometry from the render model, never
 * baked into the SVG). A `differ` gets a re-look prompt before the terminal
 * verdict. The ceremony reaches "no difference found", never `identical` (§3), and
 * every verdict carries the §15.1 conditional. Authored with React.createElement.
 */
import {
  createElement as h,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  buildReadbackPlan,
  ceremonyCoverage as coverage,
  describeChannels,
  ceremonyRespond as respond,
  startCeremony,
  type CeremonyMode,
  type CeremonyState,
  type ChannelDescription,
  type CeremonyStatus,
  type RenderOptions,
  type WalkStep,
} from "@entviz/core";
import { Entviz } from "./Entviz.ts";
import { ringOverlay, figureBox, type EntvizLayout } from "./EntvizWalk.ts";
import { emitEvent, type EntvizEvent, type EntvizEventInit } from "./events.ts";
import { safeRng } from "./rng-guard.ts";

export interface EntvizVoiceCompareProps {
  value: string;
  targetAr?: number;
  fontSizePt?: number;
  note?: string | null;
  /** `voice-only` (default) — the reader has only a picture / a voice call, so the
   *  value crosses voice. `paste-bind` — a value was pasted and machine-compared,
   *  and this ceremony only binds a cell or two to the live person (§15.6). */
  mode?: CeremonyMode;
  layout?: EntvizLayout;
  /** When true, DON'T render our figure — the host draws it and overlays the ring
   *  itself (the comparator reuses its static figure). Reports the current cell via
   *  onStep as a text WalkStep so the host can ring it. */
  externalFigures?: boolean;
  onStep?: (step: WalkStep | null) => void;
  onComplete?: (status: CeremonyStatus) => void;
  /** The typed event firehose (see events.ts). Notify-only: voice.start (past the
   *  §15.1 gate) and voice.complete only — there is deliberately NO voice.step, so
   *  the live authenticator-chosen cell order never leaves the endpoint. */
  onEvent?: (e: EntvizEvent) => void;
  /** A [0,1) source standing in for the authenticator's live, unpredictable choice
   *  of cells — the platform CSPRNG by default; a seeded source in tests. PROD GATE
   *  (§5.4): compiled out of production via `safeRng` — a prod bundle always uses
   *  the platform CSPRNG regardless of an injected `rng`, so a predictable live
   *  order can't be shipped to defeat the ceremony's selection-unpredictability. */
  rng?: () => number;
  className?: string;
  style?: CSSProperties;
}

// English copy (the shared localization framework follows once the surface
// settles — same status as the M2 walk; full localization is issue #23).
const M = {
  title: "Compare by voice",
  // The channel-authentication affirmation (§15.1): the tool asserts the
  // requirement; it cannot verify it, so the human affirms it explicitly. This is
  // an expectation-setter, NOT an identity affirmation (§15.10): the ceremony proves
  // value-equality over the voice channel, not who the other party is.
  affirmPrompt:
    "Comparing by voice checks one thing: whether the person on your call is looking at the same value as you. It can't tell you who they are — that's for you to judge — and it can only rule out a man-in-the-middle if your voice channel itself has integrity.",
  affirmYes: "Proceed",
  // Per-strategy instruction for what to ask the reader to read (§15.5).
  hintAllCells: "Have them read each highlighted cell aloud, one at a time.",
  hintFingerprint:
    "Have them read the highlighted middle cells aloud — those summarize the whole value.",
  hintBind:
    "The pasted value already matched by machine. Now have them read these cells aloud to confirm it's really theirs.",
  homoglyphNote: "One extra cell was added because this alphabet has look-alike characters.",
  match: "Matches",
  differ: "Doesn't match",
  relook: "Are you sure? Have them read it once more.",
  relookYes: "Yes, different",
  relookNo: "No, my mistake",
  // final verdicts (§15.7 — cap at no-difference; the §15.10 conditional is about
  // voice-channel integrity, NOT the reader's identity)
  noDifferenceVoice:
    "No difference found across what they read — they're looking at the same value as you, as long as your voice channel wasn't tampered with. This says nothing about who they are. Only a machine seeing both values in full can certify an exact match.",
  noDifferenceBind:
    "Confirmed — the pasted value machine-matched yours, and they read it back as their own. They're looking at the same value as you, as long as your voice channel wasn't tampered with.",
  different: "Different — what they read does not match your value.",
  recognitionNote: "A match means they hold the same value; it does not tell you who they are.",
  again: "Start over",
};

// The instruction line for a plan's read-back strategy.
const HINT: Record<string, string> = {
  "all-cells": M.hintAllCells,
  consecutive: M.hintAllCells, // the ring walks the run's cells one at a time, by address
  "fingerprint-cells": M.hintFingerprint,
  bind: M.hintBind,
};

function safeDescribe(value: string, opts: RenderOptions): ChannelDescription | null {
  try {
    return describeChannels(value, opts);
  } catch {
    return null;
  }
}

export function EntvizVoiceCompare(props: EntvizVoiceCompareProps): ReactNode {
  const {
    value, targetAr, fontSizePt, note, mode = "voice-only", layout = "side-by-side",
    externalFigures = false, onStep, onComplete, onEvent, rng, className, style,
  } = props;
  const opts = useMemo(() => ({ targetAr, fontSizePt, note }), [targetAr, fontSizePt, note]);
  // The [0,1) source for the live cell order, PROD-GATED: an injected `rng` is
  // honored in dev/test and IGNORED in production (always the platform CSPRNG — §5.4).
  const rand = safeRng(rng);

  // The event firehose: a monotonic seq per instance, and a bound `emit` that
  // stamps source="voice" and swallows a throwing host handler (events.ts). Only
  // voice.start / voice.complete — never a per-cell step (the live check-order
  // must never leave the endpoint — events.ts module doc).
  const seqRef = useRef(0);
  const emit = (init: EntvizEventInit) => emitEvent(onEvent, "voice", seqRef, init);
  const model = useMemo(() => safeDescribe(value, opts), [value, opts]);

  const [state, setState] = useState<CeremonyState | null>(null);
  const [relook, setRelook] = useState(false);

  // The cell currently under the ring, as a text WalkStep (so a host with
  // externalFigures can ring it on its own figure). Cleared off-ceremony/on end.
  const step: WalkStep | null =
    state && !state.ended && state.index < state.plan.cells.length
      ? { kind: "text", cellIndex: state.plan.cells[state.index] }
      : null;
  useEffect(() => {
    onStep?.(step);
  }, [onStep, step]);
  useEffect(() => () => onStep?.(null), [onStep]);

  const begin = () => {
    // voice.start: the ceremony proceeds past the §15.1 affirmation gate. `mode` is
    // the ceremony's CeremonyMode ("voice-only" | "paste-bind").
    emit({ type: "voice.start", mode });
    setState(startCeremony(buildReadbackPlan(value, opts, mode, rand)));
  };
  const restart = () => {
    setState(null);
    setRelook(false);
  };
  const apply = (compute: (s: CeremonyState) => CeremonyState) => {
    setState((s) => {
      if (!s) return s;
      const next = compute(s);
      if (next.ended && !s.ended) {
        onComplete?.(next.status);
        emit({ type: "voice.complete", status: next.status });
      }
      return next;
    });
    setRelook(false);
  };

  // --- affirmation gate (§15.1) ---
  if (!state) {
    return h(
      "div",
      { className, style: { display: "flex", flexDirection: "column", gap: 10, font: "inherit", maxWidth: 460, ...style } },
      h("strong", null, M.title),
      h("span", { style: hint }, M.affirmPrompt),
      h("button", { type: "button", style: btn, onClick: begin }, M.affirmYes),
    );
  }

  // --- ended: the verdict (no-difference or different — the ceremony runs the whole
  // plan; there is no early "Done", so PENDING is never a final state) ---
  if (state.ended) {
    const msg =
      state.status === "no-difference"
        ? state.plan.mode === "paste-bind" ? M.noDifferenceBind : M.noDifferenceVoice
        : M.different;
    const tone = state.status === "no-difference" ? "#1a7f37" : "#c4314b";
    return h(
      "div",
      { className, role: "status", style: { display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start", font: "inherit", ...style } },
      h("strong", { style: { color: tone } }, msg),
      h("span", { style: hint }, M.recognitionNote),
      h("button", { type: "button", style: btn, onClick: restart }, M.again),
    );
  }

  // --- reading, one cell at a time. In the reading state `step`/`model` are
  // guaranteed non-null (a built plan means the value rendered). We name the cell by
  // its 1-based grid address so the authenticator can point the reader at it (§15.5). ---
  const cell = model!.cells[step!.cellIndex];
  const address = `row ${cell.row + 1}, column ${cell.col + 1}`;
  const readOf = `${state.index + 1} / ${state.plan.cells.length}`;
  return h(
    "div",
    { className, style: { display: "flex", flexDirection: "column", gap: 10, font: "inherit", ...style } },
    h("strong", null, M.title),
    h("span", { style: hint }, HINT[state.plan.kind]),
    state.plan.homoglyphExtra > 0 ? h("span", { style: { ...hint, color: "#9a6700" } }, M.homoglyphNote) : null,
    meter(state),
    // our figure with the ring (suppressed when the host draws it)
    externalFigures
      ? null
      : h(
          "div",
          { style: { display: "flex" }, "data-entviz-layout": layout },
          h(
            "div",
            { style: figureBox },
            h(Entviz, { value, ...opts, style: { display: "block" } }),
            step ? ringOverlay(model, step, "yours") : null,
          ),
        ),
    h("span", { style: { fontSize: "0.85em", opacity: 0.7 } }, readOf),
    // name the exact cell so the authenticator can direct the remote reader to it
    h("span", { "aria-live": "polite", style: { fontSize: "0.9em" } }, `Have them read ${address} aloud. Does it match what you see?`),
    relook
      ? h(
          "div",
          { style: { display: "flex", gap: 8, alignItems: "center" } },
          h("span", { style: { fontSize: "0.85em" } }, M.relook),
          h("button", { type: "button", style: btnBad, onClick: () => apply((s) => respond(s, "differ")) }, M.relookYes),
          h("button", { type: "button", style: btn, onClick: () => setRelook(false) }, M.relookNo),
        )
      : h(
          "div",
          { style: { display: "flex", gap: 8, flexWrap: "wrap" } },
          h("button", { type: "button", style: btn, onClick: () => apply((s) => respond(s, "match")) }, M.match),
          h("button", { type: "button", style: btnBad, onClick: () => setRelook(true) }, M.differ),
        ),
  );
}

// A plain progress bar (fraction of the planned cells read) — read-back progress,
// not a probability; the ceremony's target is the whole chosen set (§15.5).
function meter(state: CeremonyState): ReactNode {
  const cov = coverage(state);
  return h(
    "div",
    { style: meterTrack, role: "progressbar", "aria-valuenow": Math.round(cov * 100), "aria-valuemin": 0, "aria-valuemax": 100 },
    h("div", { style: { ...meterFill, width: `${cov * 100}%` } }),
  );
}

const hint: CSSProperties = { fontSize: "0.8em", opacity: 0.75, maxWidth: 460 };
const btn: CSSProperties = {
  font: "inherit", fontSize: "0.9em", padding: "6px 12px", borderRadius: 8, cursor: "pointer",
  border: "1px solid var(--entviz-walk-btn, #d0d7de)", background: "var(--entviz-walk-btn-bg, #fff)",
};
const btnBad: CSSProperties = { ...btn, borderColor: "#c4314b", color: "#c4314b" };
const btnGhost: CSSProperties = { ...btn, border: "1px solid transparent", background: "none", opacity: 0.75 };
const meterTrack: CSSProperties = { height: 6, borderRadius: 999, background: "var(--entviz-walk-track, #eaeef2)", overflow: "hidden" };
const meterFill: CSSProperties = { height: "100%", background: "var(--entviz-walk-meter, #1a7f37)", transition: "width .15s" };

export default EntvizVoiceCompare;

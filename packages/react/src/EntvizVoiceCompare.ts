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
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  buildReadbackPlan,
  describeChannels,
  ceremonyRespond as respond,
  ceremonyCoverage as coverage,
  ceremonyFinish as finish,
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
import { useEmit, type EntvizEvent } from "./events.ts";
import { safeRng } from "./rng-guard.ts";
import { TEXT } from "./text-scale.ts";

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
  // Per-strategy CONTEXT shown alongside the read-back (§15.5) — the "why these
  // cells" that the per-cell address prompt below doesn't convey. The plain
  // read-every-cell case carries no such note (it would only restate the prompt).
  hintFingerprint: "These highlighted middle cells summarize the whole value.",
  hintBind:
    "The pasted value already matched by machine — now confirm it's really theirs by voice.",
  homoglyphNote: "One extra cell was added because this alphabet has look-alike characters.",
  match: "Matches",
  differ: "Doesn't match",
  // The read-back is not fixed-length: the sound sample is the milestone, and the
  // authenticator may keep going for more coverage or stop when satisfied (§14.4).
  goodTick: "Enough",
  done: "Done — that's enough",
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
  // Done pressed before the sound-sample milestone: nothing was disproven, but the
  // check didn't reach the coverage that warrants an affirmative — a sanity look, not
  // a verification. Neutral, not a "different" (§14.6 PENDING).
  stoppedEarly: "Stopped early — a sanity look so far, not enough to affirm. Read the highlighted cells to reach a result.",
  recognitionNote: "A match means they hold the same value; it does not tell you who they are.",
  again: "Start over",
};

// The optional context note for a plan's read-back strategy. Only kinds where the
// note adds something beyond the per-cell address prompt appear here; the plain
// all-cells / consecutive walk has none (its note would just restate the prompt).
const CONTEXT: Record<string, string | undefined> = {
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
  const emit = useEmit(onEvent, "voice");
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
        // Map core's "pending" (early Done, no verdict) to the event vocab's
        // "pending-done"; the other statuses pass straight through (cf. walk.complete).
        emit({ type: "voice.complete", status: next.status === "pending" ? "pending-done" : next.status });
      }
      return next;
    });
    setRelook(false);
  };
  // The "Done — that's enough" affordance: freeze the live verdict (NO-DIFFERENCE if
  // the sound-sample milestone was reached, else PENDING). The read-back is not
  // fixed-length — this is how the authenticator stops when satisfied (§14.4/§15.7).
  const onDone = () => apply(finish);

  // The shared stage FRAME: the "Yours" figure sits on the left BEFORE, DURING, and
  // AFTER the read-back (§15.8 — the tab shares the one figure), so the popover keeps a
  // near-constant height across stages — only the right column changes (the height
  // otherwise jumped short→tall→short as the figure appeared then vanished). The
  // coverage meter shows only while reading; the figure is ringed only on the current
  // cell. Capped to VOICE_MAX so the voice tab keeps the reference tab's width, with
  // the figure and right column top-aligned and wrapping to stacked on a narrow panel.
  const frame = (right: ReactNode, ringStep: WalkStep | null): ReactNode =>
    h(
      "div",
      // data-entviz-layout marks the figure-pair layout — only when WE draw the figure.
      { className, style: { display: "flex", flexDirection: "column", gap: 12, font: "inherit", maxWidth: VOICE_MAX, ...style }, "data-entviz-layout": externalFigures ? undefined : layout },
      state && !state.ended ? ceremonyMeter(state) : null,
      externalFigures
        ? right // the host draws its own figure (reusing the comparator's static one)
        : h(
            "div",
            { style: { display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" } },
            h(
              "div",
              { style: figureBox },
              h(Entviz, { value, ...opts, style: { display: "block" } }),
              ringStep ? ringOverlay(model, ringStep, "yours") : null,
            ),
            right,
          ),
    );

  // --- BEFORE: the §15.1 expectation-setter, placed in the right column — the same
  // spot the answer buttons occupy once the read-back begins. ---
  if (!state) {
    return frame(
      h(
        "div",
        { style: rightCol },
        h("span", { style: prompt }, M.affirmPrompt),
        h("div", { style: btnRow }, h("button", { type: "button", style: btn, onClick: begin }, M.affirmYes)),
      ),
      null,
    );
  }

  // --- AFTER: the verdict. Three terminal states (§14.6): NO-DIFFERENCE (affirmative,
  // green), a certain DIFFERENT (red), and PENDING — Done before the milestone (neutral
  // "stopped early", never dressed as a mismatch). Rendered in the right column beside
  // the same figure, so the height barely changes from the reading stage. ---
  if (state.ended) {
    const msg =
      state.status === "no-difference"
        ? state.plan.mode === "paste-bind" ? M.noDifferenceBind : M.noDifferenceVoice
        : state.status === "pending" ? M.stoppedEarly
        : M.different;
    const tone = state.status === "no-difference" ? "#1a7f37" : state.status === "pending" ? "#57606a" : "#c4314b";
    return frame(
      h(
        "div",
        { style: rightCol, role: "status" },
        h("strong", { style: { color: tone } }, msg),
        // The "a match means same value, not who they are" caveat scopes an AFFIRMATIVE
        // result; on a non-match there's no match to scope, so it's noise — omit it.
        state.status === "no-difference" ? h("span", { style: hint }, M.recognitionNote) : null,
        h("div", { style: btnRow }, h("button", { type: "button", style: btn, onClick: restart }, M.again)),
      ),
      null,
    );
  }

  // --- DURING: reading one cell at a time. `step`/`model` are non-null here (a built
  // plan means the value rendered). Name the cell by its 1-based grid address so the
  // authenticator can point the reader at it (§15.5). ---
  const cell = model!.cells[step!.cellIndex];
  const address = `row ${cell.row + 1}, column ${cell.col + 1}`;
  const context = CONTEXT[state.plan.kind];
  const readout = h(
    "div",
    { style: rightCol },
    context ? h("span", { style: hint }, context) : null,
    state.plan.homoglyphExtra > 0 ? h("span", { style: { ...hint, color: "#9a6700" } }, M.homoglyphNote) : null,
    // name the exact cell so the authenticator can direct the remote reader to it
    h("span", { "aria-live": "polite" }, `Have the other party read ${address} aloud. Does it match what you see?`),
    relook
      ? h(
          "div",
          { style: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" } },
          h("span", { style: { fontSize: TEXT.small } }, M.relook),
          h("button", { type: "button", style: btnBad, onClick: () => apply((s) => respond(s, "differ")) }, M.relookYes),
          h("button", { type: "button", style: btn, onClick: () => setRelook(false) }, M.relookNo),
        )
      : h(
          "div",
          { style: btnRow },
          h("button", { type: "button", style: btn, onClick: () => apply((s) => respond(s, "match")) }, M.match),
          h("button", { type: "button", style: btnBad, onClick: () => setRelook(true) }, M.differ),
          h("button", { type: "button", style: btnGhost, onClick: onDone }, M.done),
        ),
  );
  return frame(readout, step);
}

// The voice tab is capped to roughly the side-by-side comparator width so it doesn't
// take on a width of its own: a long instruction/verdict wraps within this instead of
// stretching the shared popover out to its max. (Matches the two-figure reference tab
// at the default size; the figures share the same value + toolbar per §15.8.)
const VOICE_MAX = 560;

// The read-back coverage meter with the sound-sample milestone tick — the voice
// analog of the walk's coverageMeter (§14.4/§15.7). The bar fills across the full
// read (sample + optional extras); the "Enough" tick marks where the sound sample
// completes (crossing it turns the live verdict NO-DIFFERENCE).
function ceremonyMeter(state: CeremonyState): ReactNode {
  const cov = coverage(state);
  const total = state.plan.cells.length;
  const goodFrac = total ? state.plan.goodCells / total : 1;
  const reached = state.index >= state.plan.goodCells;
  return h(
    "div",
    { style: { position: "relative", paddingBottom: 14 } },
    h(
      "div",
      { style: meterTrack, role: "progressbar", "aria-label": "Read-back coverage", "aria-valuenow": Math.round(cov * 100), "aria-valuemin": 0, "aria-valuemax": 100 },
      h("div", { style: { ...meterFill, width: `${cov * 100}%`, transition: prefersReducedMotion() ? "none" : meterFill.transition } }),
    ),
    // The milestone tick, unless the sample IS the whole read (goodFrac === 1).
    goodFrac < 1
      ? h(
          "div",
          { style: { position: "absolute", left: `${goodFrac * 100}%`, top: 0, transform: "translateX(-50%)" } },
          h("div", { style: tickMark }),
          h("div", { style: { ...tickLabel, color: reached ? "var(--entviz-walk-meter, #1a7f37)" : tickLabel.color } }, M.goodTick),
        )
      : null,
  );
}

// Honor the host's reduced-motion preference; SSR-safe (no matchMedia → animate).
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Body-size prose (the affirmation prompt): matches the host's running text.
const prompt: CSSProperties = { fontSize: TEXT.body, maxWidth: VOICE_MAX, lineHeight: 1.5 };
// Secondary chrome (hints, the homoglyph note, re-look copy).
const hint: CSSProperties = { fontSize: TEXT.small, opacity: 0.75, maxWidth: 460 };
// The right column beside the figure — the same slot at every stage (prompt, then
// read-back controls, then verdict). basis 14em + min-width 0 so it takes the space
// left of the figure and wraps its text; drops below the figure on a narrow panel.
const rightCol: CSSProperties = { display: "flex", flexDirection: "column", gap: 8, minWidth: 0, flex: "1 1 14em" };
// A button cluster that hugs its content (left-aligned) inside the stretch column.
const btnRow: CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap" };
const btn: CSSProperties = {
  font: "inherit", color: "inherit", fontSize: TEXT.body, padding: "6px 12px", borderRadius: 8, cursor: "pointer",
  border: "1px solid var(--entviz-walk-btn, color-mix(in srgb, currentColor 28%, transparent))",
  background: "var(--entviz-walk-btn-bg, color-mix(in srgb, currentColor 8%, transparent))",
};
const btnBad: CSSProperties = { ...btn, borderColor: "#c4314b", color: "#c4314b" };
// The low-emphasis "Done" affordance — transparent so it reads as secondary to the
// per-cell Matches / Doesn't-match answers (mirrors the walk's Done button).
const btnGhost: CSSProperties = { ...btn, border: "1px solid transparent", background: "none", opacity: 0.75 };
// Coverage-bar styles, shared with the walk via the same --entviz-walk-* vars for a
// consistent look across the two comparison paths.
const meterTrack: CSSProperties = { height: 6, borderRadius: 999, background: "var(--entviz-walk-track, #eaeef2)", overflow: "hidden" };
const meterFill: CSSProperties = { height: "100%", background: "var(--entviz-walk-meter, #1a7f37)", transition: "width .15s" };
const tickMark: CSSProperties = { width: 2, height: 10, marginTop: -2, background: "var(--entviz-walk-tick, #9aa3af)" };
const tickLabel: CSSProperties = { fontSize: TEXT.fine, color: "#9aa3af", marginTop: 1, whiteSpace: "nowrap" };

export default EntvizVoiceCompare;

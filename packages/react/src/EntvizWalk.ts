/**
 * <EntvizWalk /> — the guided human walk UI (M2b), driving the core walk model
 * (@entviz/core: buildCheckPlan + the startWalk/respond reducer). Pinned by
 * comparison-design.md §14.
 *
 * The user declares a size-aware preset, then is walked one feature at a time:
 * a focus ring is drawn AROUND the feature on both figures (geometry from the core
 * render model, never baked into the SVG), and the user reports Matches / Differs. A
 * `differs` gets a re-look prompt before the terminal verdict (retract → the step
 * is re-queued). The transparent planted probe (large Complete) shows a
 * deliberately-altered cell and asks the user to catch it. A walk yields
 * "no difference found", never `identical` (§3). Authored with React.createElement.
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
  buildCheckPlan,
  coverage,
  describeChannels,
  featureRectsFromModel,
  finish,
  respond,
  startWalk,
  type ChannelDescription,
  type RenderOptions,
  type WalkMode,
  type WalkState,
  type WalkStep,
} from "@entviz/core";
import { Entviz } from "./Entviz.ts";
import { useEmit, type EntvizEvent } from "./events.ts";
import { safeRng } from "./rng-guard.ts";
import { TEXT } from "./text-scale.ts";

/** Panel arrangement shared by the comparator and the walk. */
export type EntvizLayout = "side-by-side" | "stacked" | "auto";

// side-by-side is the default (both figures at the same eye height, so a
// comparison is a saccade not a scroll); stacked is one-above-the-other; auto is
// side-by-side that wraps to stacked when the container is too narrow.
export function layoutStyle(layout: EntvizLayout): CSSProperties {
  if (layout === "stacked") return { display: "flex", flexDirection: "column", gap: 16 };
  if (layout === "auto") return { display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" };
  return { display: "flex", flexWrap: "nowrap", gap: 16, alignItems: "flex-start" };
}

export interface EntvizWalkProps {
  value: string;
  /** The reference, as a value we can render (M2b: value-vs-value). */
  reference: string;
  targetAr?: number;
  fontSizePt?: number;
  note?: string | null;
  /** Pre-select a mode (skips the picker); otherwise the user declares one. */
  mode?: WalkMode;
  /** Figure arrangement (default "side-by-side"). */
  layout?: EntvizLayout;
  /** When true, DON'T render the two figures — the host draws them and overlays
   *  the rings itself (the comparator reuses its static pair). The walk still
   *  renders its controls/probe/verdict and reports the current step via onStep. */
  externalFigures?: boolean;
  /** Reports the feature currently being checked (or null), so a host using
   *  `externalFigures` can ring it on its own figures. */
  onStep?: (step: WalkStep | null) => void;
  onComplete?: (status: WalkState["status"]) => void;
  /** The typed event firehose (see events.ts). Notify-only, in addition to
   *  onStep/onComplete (walk.start / walk.step / walk.complete). */
  onEvent?: (e: EntvizEvent) => void;
  /** A [0,1) source standing in for the walk's unpredictable check ORDER — the
   *  platform CSPRNG by default; a seeded source in tests/repro demos. PROD GATE
   *  (§5.4): compiled out of production via `safeRng` — a prod bundle always uses
   *  the platform CSPRNG regardless of an injected `rng`, so a predictable order
   *  can't be shipped to defeat the unpredictable-sampling defense. */
  rng?: () => number;
  className?: string;
  style?: CSSProperties;
}

// The focus ring + scrim are FIXED literals, NOT host-themeable vars: the spotlight is a
// load-bearing verification cue (the walk asks "do the HIGHLIGHTED characters match?"), so
// ambient/host CSS (threat-model T2) must not be able to set them transparent and erase it,
// which would let a user answer "same" on a cell they never actually examined.
const RING = "#39ff14"; // bright focus ring around the spotlight (§7.1)
const SCRIM = "#000"; // everything OUTSIDE the focus is dimmed

// The focus overlay: a semi-transparent scrim over the whole figure with a hole
// punched out where the feature is (via an SVG mask — white shows the scrim,
// black hides it), so attention is directed by *darkening the surroundings*
// rather than a thin line lost in the busy figure beneath. A crisp bright ring
// is drawn around the hole for definition. Both scrim and ring live in the
// tool's own overlay SVG, never baked into the entviz (§7.1 closed profile).
//
// Geometry comes from the core render MODEL (`featureRectsFromModel`), not from
// parsing the rendered SVG — and the model is computed once per (value, opts) by
// the caller, so stepping through a walk maps each step cheaply. The overlay
// shares the entviz's viewBox AND occupies the exact same rendered rectangle (the
// figure renders at its intrinsic size, 1 user unit = 1px, and the overlay fills
// that same box at scale 1.0).
export function ringOverlay(model: ChannelDescription | null, step: WalkStep, idPrefix: string): ReactNode {
  if (!model) return null;
  const { viewBox, rects } = featureRectsFromModel(model, step);
  if (!rects.length) return null;
  const [vx, vy, vw, vh] = viewBox.split(/\s+/).map(Number);
  const pad = 2;
  const maskId = `entviz-walk-spot-${idPrefix.replace(/[^a-z0-9]/gi, "")}`;
  const holes = rects.map((r) => ({ x: r.x - pad, y: r.y - pad, w: r.w + 2 * pad, h: r.h + 2 * pad }));
  return h(
    "svg",
    { viewBox, preserveAspectRatio: "none", "aria-hidden": true, style: overlayStyle },
    h(
      "defs",
      null,
      h(
        "mask",
        { id: maskId },
        h("rect", { x: vx, y: vy, width: vw, height: vh, fill: "#fff" }),
        holes.map((r, i) => h("rect", { key: i, x: r.x, y: r.y, width: r.w, height: r.h, rx: 2, fill: "#000" })),
      ),
    ),
    h("rect", { x: vx, y: vy, width: vw, height: vh, fill: SCRIM, opacity: 0.5, mask: `url(#${maskId})` }),
    holes.map((r, i) =>
      h("rect", {
        key: i,
        x: r.x, y: r.y, width: r.w, height: r.h, rx: 2,
        fill: "none", stroke: RING, strokeWidth: 3,
      }),
    ),
  );
}

// A panel = the entviz (rendered at its intrinsic size by <Entviz>) with the
// focus overlay on top. The container hugs the figure (inline-block + zeroed
// line box to kill the inline-svg descender gap) so the absolutely-positioned
// overlay covers exactly the figure's box.
function panel(label: string, value: string, opts: RenderOptions, model: ChannelDescription | null, step: WalkStep | null): ReactNode {
  return h(
    "div",
    { style: panelStyle },
    h("span", { style: panelLabel }, label),
    h(
      "div",
      { style: figureBox },
      h(Entviz, { value, ...opts, style: { display: "block" } }),
      step ? ringOverlay(model, step, label) : null,
    ),
  );
}

// English walk copy (localization framework to follow once the surface settles).
const M = {
  title: "Verify by walking the cells",
  pickPrompt: "How do you want to check? (you decide — there's no default)",
  spotCheck: "Spot-check — sample features in a surprising order; stop when satisfied",
  complete: "Complete — read every cell",
  completeSmall: "Complete — read every cell (small enough to verify fully)",
  quickTick: "Quick",
  goodTick: "Good",
  completeTick: "Complete",
  // Universal answer labels — the focused feature may be singular (one
  // background, one oval) or plural (the highlighted characters), so avoid
  // "they": "Looks the same / different" reads naturally for every prompt.
  match: "Looks the same",
  differ: "Looks different",
  done: "Done — that's enough",
  relook: "Look again — is it really different?",
  relookYes: "Yes, different",
  relookNo: "No, my mistake",
  probeNotice: "Planted check: we deliberately changed one character here. Spot the difference.",
  // live verdict shown while the walk is in progress
  belowGood: "A sanity look so far — keep going to reach a verification.",
  pastGood: "No difference so far — keep going for more coverage, or stop.",
  // final verdicts
  noDiffSpot:
    "No difference found — a good indicator of equivalence, but a spot-check is less than complete and should not be relied on when stakes are high.",
  noDiffCompleteSmall:
    "No difference found — you read every cell, a full visual check. Only a machine can certify an exact match.",
  noDiffCompleteLarge:
    "No difference found across every displayed cell — a strong check, though a value this large keeps some detail summarized rather than read in full. Only a machine can certify an exact match.",
  different: "Different — these are not the same value.",
  pendingDone: "Stopped early — a sanity look, not a verification.",
  inconclusive: "Inconclusive — a planted check was missed. Try again with full attention.",
  recognitionNote: "A match means equal to this reference; it does not vouch for the reference.",
  walkAgain: "Walk again",
};

const PROMPTS: Record<string, string> = {
  text: "Do the highlighted characters match?",
  background: "Is the background color the same?",
  "colorbar-pattern": "Same colored bands, same order, same ratios?",
  "colorbar-markers": "Are the two dots in the same spots on the bar?",
  ellipse: "Does the oval match — same tilt, shape, and size?",
  "blank-pattern": "Are the empty cells in the same places?",
  "blank-map": "Do the plus and dot point to the same cells?",
  "quartile-marks": "Are the corner triangles on the same cells?",
};

const promptFor = (step: WalkStep): string =>
  step.kind === "text" ? PROMPTS.text : step.kind === "gestalt" ? PROMPTS[step.dimension] : M.probeNotice;

// One-character mutation of a cell's text, for the transparent probe.
export function mutate(text: string): string {
  if (!text) return "0";
  const i = text.length - 1;
  const c = text[i];
  const next = c === "0" ? "1" : c === "z" ? "y" : c === "9" ? "8" : c === "f" ? "e" : "0";
  return text.slice(0, i) + next;
}

export function EntvizWalk(props: EntvizWalkProps): ReactNode {
  const { value, reference, targetAr, fontSizePt, note, mode, layout = "side-by-side", externalFigures = false, onStep, onComplete, onEvent, rng, className, style } = props;
  const opts = useMemo(() => ({ targetAr, fontSizePt, note }), [targetAr, fontSizePt, note]);
  // The [0,1) source for the check order, PROD-GATED: an injected `rng` is honored
  // in dev/test and IGNORED in production (always the platform CSPRNG — §5.4).
  const rand = safeRng(rng);

  // The event firehose: a monotonic seq per instance, and a bound `emit` that
  // stamps source="walk" and swallows a throwing host handler (events.ts). A
  // monotonic step index, reset at each walk.start (single-user walk → walk.step
  // is allowed, carrying a feature KIND + index, never glyph text — events.ts doc).
  const emit = useEmit(onEvent, "walk");
  const walkStepIndexRef = useRef(0);

  // Describe each value ONCE per (value, opts) — the focus rings, the size class,
  // and the probe cell all read this, instead of rebuilding the model per render
  // as we step through the walk.
  const oursModel = useMemo(() => safeDescribe(value, opts), [value, opts]);
  const refModel = useMemo(() => safeDescribe(reference, opts), [reference, opts]);

  // size class drives the preset menu (§14.4)
  const small = useMemo(
    () => Boolean(oursModel) && !oursModel!.truncated && oursModel!.cells.filter((c) => !c.blank).length <= 6,
    [oursModel],
  );

  const [state, setState] = useState<WalkState | null>(
    mode ? () => startWalk(buildCheckPlan(value, opts, mode, rand)) : null,
  );
  const [relook, setRelook] = useState(false);
  const [probeText, setProbeText] = useState<string | null>(null);

  // The current step (the feature under the ring), or null off-walk/at the end.
  const currentStep: WalkStep | null =
    state && !state.ended && state.index < state.plan.steps.length ? state.plan.steps[state.index] : null;

  // Report the feature currently being checked so a host using externalFigures can
  // ring it on its own figures; clear it when the walk ends / in the picker / on
  // unmount. (The walk stays active past the Good milestone, so gate on `ended`.)
  useEffect(() => {
    onStep?.(currentStep);
  }, [currentStep, onStep]);
  useEffect(() => () => onStep?.(null), [onStep]);

  // walk.start (notify-only): a new plan object means a walk just began (picker,
  // restart, or the mode-prop initial launch). Reset the walk.step index here.
  const prevPlanRef = useRef<WalkState["plan"] | null>(null);
  useEffect(() => {
    if (state && state.plan !== prevPlanRef.current) {
      walkStepIndexRef.current = 0;
      emit({ type: "walk.start", mode: state.plan.mode });
    }
    prevPlanRef.current = state ? state.plan : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // walk.step (notify-only): fire on each distinct feature the walk presents,
  // carrying the feature KIND (never glyph text) and a monotonic index per walk.
  const prevStepRef = useRef<WalkStep | null>(null);
  useEffect(() => {
    if (currentStep && currentStep !== prevStepRef.current) {
      emit({ type: "walk.step", feature: currentStep.kind, index: walkStepIndexRef.current++ });
    }
    prevStepRef.current = currentStep;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep]);

  const begin = (m: WalkMode) => setState(startWalk(buildCheckPlan(value, opts, m, rand)));

  // After a verdict, start over for another round (a different mode, or a fresh
  // unpredictable plan at the same one). With a fixed mode prop we rebuild that
  // walk; otherwise we return to the picker.
  const restart = () => {
    setState(mode ? startWalk(buildCheckPlan(value, opts, mode, rand)) : null);
    setRelook(false);
    setProbeText(null);
  };

  // Apply a state transition (respond / finish), firing onComplete when the walk
  // ends, and clearing the transient relook/probe UI.
  const apply = (compute: (s: WalkState) => WalkState) => {
    setState((s) => {
      if (!s) return s;
      const next = compute(s);
      if (next.ended && !s.ended) {
        onComplete?.(next.status);
        // The core walk status "pending" (a Done at a sub-Good peek) maps to the
        // event union's "pending-done"; the other three pass straight through.
        emit({ type: "walk.complete", status: next.status === "pending" ? "pending-done" : next.status });
      }
      return next;
    });
    setRelook(false);
    setProbeText(null);
  };
  const advance = (r: "match" | "differ") => apply((s) => respond(s, r));
  const onDone = () => apply(finish);

  // --- mode picker (binary; Quick/Good are milestones inside spot-check) ---
  if (!state) {
    return h(
      "div",
      { className, style: { display: "flex", flexDirection: "column", gap: 8, font: "inherit", ...style } },
      h("strong", null, M.title),
      h("span", { style: hint }, M.pickPrompt),
      h(
        "div",
        { style: { display: "flex", gap: 8, flexWrap: "wrap" } },
        small
          ? h("button", { type: "button", style: btn, onClick: () => begin("complete") }, M.completeSmall)
          : [
              h("button", { key: "s", type: "button", style: btn, onClick: () => begin("spot-check") }, M.spotCheck),
              h("button", { key: "c", type: "button", style: btn, onClick: () => begin("complete") }, M.complete),
            ],
      ),
    );
  }

  // --- ended: the final verdict ---
  if (state.ended) {
    const noDiffMsg =
      state.plan.mode === "complete"
        ? state.plan.sizeClass === "small" ? M.noDiffCompleteSmall : M.noDiffCompleteLarge
        : M.noDiffSpot;
    const msg =
      state.status === "no-difference" ? noDiffMsg
      : state.status === "different" ? M.different
      : state.status === "inconclusive" ? M.inconclusive
      : M.pendingDone;
    const tone = state.status === "no-difference" ? "#1a7f37" : state.status === "different" ? "#c4314b" : "#57606a";
    return h(
      "div",
      { className, role: "status", style: { display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start", font: "inherit", ...style } },
      h("strong", { style: { color: tone } }, msg),
      h("span", { style: hint }, M.recognitionNote),
      h("button", { type: "button", style: btn, onClick: restart }, M.walkAgain),
    );
  }

  // --- walking ---
  const step = state.plan.steps[state.index];
  const past = state.status === "no-difference"; // crossed the Good milestone
  const onDiffer = () => {
    if (step.kind === "probe") { advance("differ"); return; } // catching the probe is the right answer
    setRelook(true);
  };
  const onProbeReveal = () => setProbeText((t) => t ?? pickCellText(oursModel));

  return h(
    "div",
    { className, style: { display: "flex", flexDirection: "column", gap: 10, font: "inherit", ...style } },
    h("strong", null, M.title),
    // coverage meter, with Quick/Good milestone ticks for a spot-check
    coverageMeter(state),
    // live verdict so the user sees where they stand on the scale
    h("span", { "aria-live": "polite", style: { fontSize: TEXT.small, color: past ? "#1a7f37" : "#57606a" } }, past ? M.pastGood : M.belowGood),
    // the step — figures are suppressed when the host draws them (externalFigures)
    step.kind === "probe"
      ? probePanel(oursModel, probeText, onProbeReveal)
      : externalFigures
        ? null
        : h(
            "div",
            { style: layoutStyle(layout), "data-entviz-layout": layout },
            panel("Yours", value, opts, oursModel, step),
            panel("Reference", reference, opts, refModel, step),
          ),
    h("span", { "aria-live": "polite", style: { fontSize: TEXT.body } }, promptFor(step)),
    // controls
    relook
      ? h(
          "div",
          { style: { display: "flex", gap: 8, alignItems: "center" } },
          h("span", { style: { fontSize: TEXT.small } }, M.relook),
          h("button", { type: "button", style: btnBad, onClick: () => advance("differ") }, M.relookYes),
          h("button", { type: "button", style: btn, onClick: () => setRelook(false) }, M.relookNo),
        )
      : h(
          "div",
          { style: { display: "flex", gap: 8, flexWrap: "wrap" } },
          h("button", { type: "button", style: btn, onClick: () => advance("match") }, M.match),
          h("button", { type: "button", style: btnBad, onClick: onDiffer }, M.differ),
          h("button", { type: "button", style: btnGhost, onClick: onDone }, M.done),
        ),
  );
}

// The coverage bar: a fill plus, for a spot-check, labeled Quick/Good ticks so
// the user watches themselves cross the milestones (the continuous scale, §14.4).
function coverageMeter(state: WalkState): ReactNode {
  const { plan } = state;
  const cov = coverage(state);
  const pct = (bits: number) => `${Math.min(100, (bits / plan.totalBits) * 100)}%`;
  const tick = (bits: number, label: string): ReactNode =>
    h(
      "div",
      { key: label, style: { position: "absolute", left: pct(bits), top: 0, transform: "translateX(-50%)" } },
      h("div", { style: tickMark }),
      h("div", { style: tickLabel }, label),
    );
  return h(
    "div",
    { style: { position: "relative", paddingBottom: 14 } },
    h(
      "div",
      { style: meterTrack, role: "progressbar", "aria-label": "Walk coverage", "aria-valuenow": Math.round(cov * 100), "aria-valuemin": 0, "aria-valuemax": 100 },
      h("div", { style: { ...meterFill, width: `${cov * 100}%`, transition: prefersReducedMotion() ? "none" : meterFill.transition } }),
    ),
    plan.mode === "spot-check" ? tick(plan.quickBits, M.quickTick) : null,
    plan.mode === "spot-check" ? tick(plan.goodBits, M.goodTick) : null,
  );
}

// the probe's own two-cell display (original vs deliberately altered)
function probePanel(model: ChannelDescription | null, shown: string | null, reveal: () => void): ReactNode {
  const text = shown ?? pickCellText(model);
  return h(
    "div",
    { style: { display: "flex", flexDirection: "column", gap: 6 } },
    h("span", { style: { ...hint, color: "#9a6700" } }, M.probeNotice),
    h(
      "div",
      { style: { display: "flex", gap: 16, fontFamily: "ui-monospace, monospace", fontSize: 18 } },
      h("span", { onMouseEnter: reveal }, text),
      h("span", null, mutate(text)),
    ),
  );
}

// The first filled cell's text, from the already-built model (probe step only).
function pickCellText(model: ChannelDescription | null): string {
  return model?.cells.find((x) => !x.blank)?.text ?? "0000";
}

// Honor the host's reduced-motion preference (vestibular sensitivity): true when
// the user asked for reduced motion. Guarded for SSR / environments without
// matchMedia — those default to allowing the animation.
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Build the render model, tolerating an unrenderable value (returns null).
function safeDescribe(value: string, opts: RenderOptions): ChannelDescription | null {
  try {
    return describeChannels(value, opts);
  } catch {
    return null;
  }
}

const overlayStyle: CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" };
// hugs the intrinsic-size figure; zeroed line box removes the inline-svg gap so
// the overlay aligns to the figure pixel-for-pixel.
export const figureBox: CSSProperties = { position: "relative", display: "inline-block", lineHeight: 0, fontSize: 0 };
const panelStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 6 };
const panelLabel: CSSProperties = { fontSize: TEXT.small, opacity: 0.7 };
const hint: CSSProperties = { fontSize: TEXT.small, opacity: 0.7, maxWidth: 420 };
const btn: CSSProperties = {
  // color:inherit + currentColor-derived surfaces so the buttons read on a dark host
  // too (a bare <button> otherwise uses the UA's dark default text).
  font: "inherit", color: "inherit", fontSize: TEXT.body, padding: "6px 12px", borderRadius: 8, cursor: "pointer",
  border: "1px solid var(--entviz-walk-btn, color-mix(in srgb, currentColor 28%, transparent))",
  background: "var(--entviz-walk-btn-bg, color-mix(in srgb, currentColor 8%, transparent))",
};
const btnBad: CSSProperties = { ...btn, borderColor: "#c4314b", color: "#c4314b" };
const btnGhost: CSSProperties = { ...btn, border: "1px solid transparent", background: "none", opacity: 0.75 };
const meterTrack: CSSProperties = { height: 6, borderRadius: 999, background: "var(--entviz-walk-track, #eaeef2)", overflow: "hidden" };
const meterFill: CSSProperties = { height: "100%", background: "var(--entviz-walk-meter, #1a7f37)", transition: "width .15s" };
// Quick/Good milestone marks on the coverage bar.
const tickMark: CSSProperties = { width: 2, height: 10, marginTop: -2, background: "var(--entviz-walk-tick, #9aa3af)" };
const tickLabel: CSSProperties = { fontSize: TEXT.fine, color: "#9aa3af", marginTop: 1, whiteSpace: "nowrap" };

export default EntvizWalk;

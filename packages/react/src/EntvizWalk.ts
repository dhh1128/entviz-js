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
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  buildCheckPlan,
  coverage,
  describeChannels,
  featureRects,
  respond,
  startWalk,
  type RenderOptions,
  type WalkPreset,
  type WalkState,
  type WalkStep,
} from "@entviz/core";
import { Entviz } from "./Entviz.ts";

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
  /** Pre-select a preset (skips the picker); otherwise the user declares one. */
  preset?: WalkPreset;
  /** Figure arrangement (default "side-by-side"). */
  layout?: EntvizLayout;
  onComplete?: (status: WalkState["status"]) => void;
  className?: string;
  style?: CSSProperties;
}

const RING = "var(--entviz-walk-ring, #39ff14)"; // bright focus ring around the spotlight (§7.1)
const SCRIM = "var(--entviz-walk-scrim, #000)"; // everything OUTSIDE the focus is dimmed

// The focus overlay: a semi-transparent scrim over the whole figure with a hole
// punched out where the feature is (via an SVG mask — white shows the scrim,
// black hides it), so attention is directed by *darkening the surroundings*
// rather than a thin line lost in the busy figure beneath. A crisp bright ring
// is drawn around the hole for definition. Both scrim and ring live in the
// tool's own overlay SVG, never baked into the entviz (§7.1 closed profile).
//
// Geometry comes from the core render model (`featureRects`), not from parsing
// the rendered SVG — and the overlay shares the entviz's viewBox AND occupies the
// exact same rendered rectangle (the figure renders at its intrinsic size, 1 user
// unit = 1px, and the overlay fills that same box at scale 1.0). Earlier the
// figure was forced to 200px while the overlay re-fit the viewBox with `meet`, so
// the layers shared a viewBox but sat at different scales — the misaligned-ring bug.
function ringOverlay(value: string, opts: RenderOptions, step: WalkStep, idPrefix: string): ReactNode {
  const { viewBox, rects } = featureRects(value, opts, step);
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
        fill: "none", stroke: RING, "stroke-width": 3,
      }),
    ),
  );
}

// A panel = the entviz (rendered at its intrinsic size by <Entviz>) with the
// focus overlay on top. The container hugs the figure (inline-block + zeroed
// line box to kill the inline-svg descender gap) so the absolutely-positioned
// overlay covers exactly the figure's box.
function panel(label: string, value: string, opts: RenderOptions, step: WalkStep | null): ReactNode {
  return h(
    "div",
    { style: panelStyle },
    h("span", { style: panelLabel }, label),
    h(
      "div",
      { style: figureBox },
      h(Entviz, { value, ...opts, style: { display: "block" } }),
      step ? ringOverlay(value, opts, step, label) : null,
    ),
  );
}

// English walk copy (localization framework to follow once the surface settles).
const M = {
  title: "Verify by walking the cells",
  pickPrompt: "How thorough do you want to be? (you decide — there's no default)",
  quick: "Quick — a sanity peek (proves nothing)",
  good: "Good — a strong spot-check",
  complete: "Complete — verify in full",
  completeSmall: "Complete — read every cell (small enough to verify fully)",
  // Universal answer labels — the focused feature may be singular (one
  // background, one oval) or plural (the highlighted characters), so avoid
  // "they": "Looks the same / different" reads naturally for every prompt.
  match: "Looks the same",
  differ: "Looks different",
  relook: "Look again — is it really different?",
  relookYes: "Yes, different",
  relookNo: "No, my mistake",
  probeNotice: "Planted check: we deliberately changed one character here. Spot the difference.",
  noDiffSpot:
    "No difference found — a good indicator of equivalence, but spot checks are less than complete and should not be relied on when stakes are high.",
  noDiffCompleteSmall:
    "No difference found — you read every cell, a full visual check. Only a machine can certify an exact match.",
  noDiffCompleteLarge:
    "No difference found across every displayed cell — a strong check, though a value this large keeps some detail summarized rather than read in full. Only a machine can certify an exact match.",
  different: "Different — these are not the same value.",
  pendingDone: "Sanity peek done. This was not a verification.",
  inconclusive: "Inconclusive — a planted check was missed. Try again with full attention.",
  recognitionNote: "A match means equal to this reference; it does not vouch for the reference.",
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

const isDone = (s: WalkState): boolean => s.status !== "pending" || s.index >= s.plan.steps.length;

export function EntvizWalk(props: EntvizWalkProps): ReactNode {
  const { value, reference, targetAr, fontSizePt, note, preset, layout = "side-by-side", onComplete, className, style } = props;
  const opts = useMemo(() => ({ targetAr, fontSizePt, note }), [targetAr, fontSizePt, note]);

  // size class drives the preset menu (§14.4)
  const small = useMemo(() => {
    try {
      const d = describeChannels(value, opts);
      return !d.truncated && d.cells.filter((c) => !c.blank).length <= 6;
    } catch {
      return false;
    }
  }, [value, opts]);

  const [state, setState] = useState<WalkState | null>(
    preset ? () => startWalk(buildCheckPlan(value, opts, preset, csprng)) : null,
  );
  const [relook, setRelook] = useState(false);
  const [probeText, setProbeText] = useState<string | null>(null);

  const begin = (p: WalkPreset) => setState(startWalk(buildCheckPlan(value, opts, p, csprng)));

  const advance = (r: "match" | "differ") => {
    setState((s) => {
      if (!s) return s;
      const next = respond(s, r);
      if (isDone(next)) onComplete?.(next.status);
      return next;
    });
    setRelook(false);
    setProbeText(null);
  };

  // --- preset picker ---
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
              h("button", { key: "q", type: "button", style: btn, onClick: () => begin("quick") }, M.quick),
              h("button", { key: "g", type: "button", style: btn, onClick: () => begin("good") }, M.good),
              h("button", { key: "c", type: "button", style: btn, onClick: () => begin("complete") }, M.complete),
            ],
      ),
    );
  }

  // --- done ---
  if (isDone(state)) {
    const noDiffMsg =
      state.plan.preset === "complete"
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
      { className, role: "status", style: { display: "flex", flexDirection: "column", gap: 8, font: "inherit", ...style } },
      h("strong", { style: { color: tone } }, msg),
      h("span", { style: hint }, M.recognitionNote),
    );
  }

  // --- walking ---
  const step = state.plan.steps[state.index];
  const onDiffer = () => {
    if (step.kind === "probe") { advance("differ"); return; } // catching the probe is the right answer
    setRelook(true);
  };
  const onProbeReveal = () => setProbeText((t) => t ?? pickCellText(value, opts));

  return h(
    "div",
    { className, style: { display: "flex", flexDirection: "column", gap: 10, font: "inherit", ...style } },
    h("strong", null, M.title),
    // coverage meter
    h(
      "div",
      { style: meterTrack, role: "progressbar", "aria-valuenow": Math.round(coverage(state) * 100), "aria-valuemin": 0, "aria-valuemax": 100 },
      h("div", { style: { ...meterFill, width: `${coverage(state) * 100}%` } }),
    ),
    // the step
    step.kind === "probe"
      ? probePanel(value, opts, probeText, onProbeReveal)
      : h(
          "div",
          { style: layoutStyle(layout), "data-entviz-layout": layout },
          panel("Yours", value, opts, step),
          panel("Reference", reference, opts, step),
        ),
    h("span", { "aria-live": "polite", style: { fontSize: "0.9em" } }, promptFor(step)),
    // controls
    relook
      ? h(
          "div",
          { style: { display: "flex", gap: 8, alignItems: "center" } },
          h("span", { style: { fontSize: "0.85em" } }, M.relook),
          h("button", { type: "button", style: btnBad, onClick: () => advance("differ") }, M.relookYes),
          h("button", { type: "button", style: btn, onClick: () => setRelook(false) }, M.relookNo),
        )
      : h(
          "div",
          { style: { display: "flex", gap: 8 } },
          h("button", { type: "button", style: btn, onClick: () => advance("match") }, M.match),
          h("button", { type: "button", style: btnBad, onClick: onDiffer }, M.differ),
        ),
  );
}

// the probe's own two-cell display (original vs deliberately altered)
function probePanel(value: string, opts: RenderOptions, shown: string | null, reveal: () => void): ReactNode {
  const text = shown ?? pickCellText(value, opts);
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

// Only called on a probe step of a valid large-value walk, so the value renders.
function pickCellText(value: string, opts: RenderOptions): string {
  return describeChannels(value, opts).cells.find((x) => !x.blank)?.text ?? "0000";
}

// CSPRNG [0,1) source for the single-user walk.
function csprng(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}

const overlayStyle: CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" };
// hugs the intrinsic-size figure; zeroed line box removes the inline-svg gap so
// the overlay aligns to the figure pixel-for-pixel.
const figureBox: CSSProperties = { position: "relative", display: "inline-block", lineHeight: 0, fontSize: 0 };
const panelStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 6 };
const panelLabel: CSSProperties = { fontSize: "0.8em", opacity: 0.7 };
const hint: CSSProperties = { fontSize: "0.8em", opacity: 0.7, maxWidth: 420 };
const btn: CSSProperties = {
  font: "inherit", fontSize: "0.9em", padding: "6px 12px", borderRadius: 8, cursor: "pointer",
  border: "1px solid var(--entviz-walk-btn, #d0d7de)", background: "var(--entviz-walk-btn-bg, #fff)",
};
const btnBad: CSSProperties = { ...btn, borderColor: "#c4314b", color: "#c4314b" };
const meterTrack: CSSProperties = { height: 6, borderRadius: 999, background: "var(--entviz-walk-track, #eaeef2)", overflow: "hidden" };
const meterFill: CSSProperties = { height: "100%", background: "var(--entviz-walk-meter, #1a7f37)", transition: "width .15s" };

export default EntvizWalk;

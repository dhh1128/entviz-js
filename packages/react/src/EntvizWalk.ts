/**
 * <EntvizWalk /> — the guided human walk UI (M2b), driving the core walk model
 * (@entviz/core: buildCheckPlan + the startWalk/respond reducer). Pinned by
 * comparison-design.md §14.
 *
 * The user declares a size-aware preset, then is walked one feature at a time:
 * a focus ring is drawn AROUND the feature on both figures (computed from our own
 * rendered SVG, never baked into it), and the user reports Matches / Differs. A
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
  render,
  respond,
  startWalk,
  type RenderOptions,
  type WalkPreset,
  type WalkState,
  type WalkStep,
} from "@entviz/core";
import { Entviz } from "./Entviz.ts";

export interface EntvizWalkProps {
  value: string;
  /** The reference, as a value we can render (M2b: value-vs-value). */
  reference: string;
  targetAr?: number;
  fontSizePt?: number;
  note?: string | null;
  /** Pre-select a preset (skips the picker); otherwise the user declares one. */
  preset?: WalkPreset;
  onComplete?: (status: WalkState["status"]) => void;
  className?: string;
  style?: CSSProperties;
}

interface Rect { x: number; y: number; w: number; h: number; }

const num = (el: Element | null, a: string): number => Number(el?.getAttribute(a) ?? 0);

export function rectOf(el: Element): Rect | null {
  switch (el.tagName.toLowerCase()) {
    case "rect":
      return { x: num(el, "x"), y: num(el, "y"), w: num(el, "width"), h: num(el, "height") };
    case "ellipse": {
      const cx = num(el, "cx"), cy = num(el, "cy"), rx = num(el, "rx"), ry = num(el, "ry");
      return { x: cx - rx, y: cy - ry, w: 2 * rx, h: 2 * ry };
    }
    case "circle": {
      const cx = num(el, "cx"), cy = num(el, "cy"), r = num(el, "r");
      return { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r };
    }
    default:
      return null;
  }
}

const union = (rects: Rect[]): Rect[] => {
  if (rects.length <= 1) return rects;
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const x2 = Math.max(...rects.map((r) => r.x + r.w));
  const y2 = Math.max(...rects.map((r) => r.y + r.h));
  return [{ x, y, w: x2 - x, h: y2 - y }];
};

/**
 * Pure: parse our own rendered SVG and return the viewBox + the bounding rects to
 * ring for a given walk feature. (No DOM layout needed — coordinates come straight
 * from the SVG's own user units, so the ring scales with the figure.)
 */
export function featureRects(svg: string, step: WalkStep): { viewBox: string; rects: Rect[] } {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = doc.querySelector("svg");
  const viewBox = root?.getAttribute("viewBox") ?? "0 0 0 0";
  const sel = (q: string) => [...doc.querySelectorAll(q)];
  let els: Element[] = [];
  let merge = false;

  if (step.kind === "text") {
    els = sel(`[data-cell-index="${step.cellIndex}"] rect`).slice(0, 1);
  } else if (step.kind === "gestalt") {
    switch (step.dimension) {
      case "background": els = sel('[data-channel="grid"] > rect').slice(0, 1); break;
      case "ellipse": els = sel('[data-channel="ellipse"] ellipse'); break;
      case "colorbar-pattern": els = sel('[data-channel="color-bar"] rect'); merge = true; break;
      case "colorbar-markers": els = sel("[data-bar-marker]"); break;
      case "blank-pattern": els = sel('[data-cell-blank="true"] rect'); break;
      case "quartile-marks": els = sel("[data-cell-quartile] rect"); break;
      case "blank-map": {
        const cell = doc.querySelector("[data-blank-map-min]")?.closest("[data-cell-index]");
        els = cell ? [...cell.querySelectorAll("rect")].slice(0, 1) : [];
        break;
      }
    }
  }
  // probe: no figure rect (it shows a planted cell of its own — §14.7)
  const rects = els.map(rectOf).filter((r): r is Rect => r !== null);
  return { viewBox, rects: merge ? union(rects) : rects };
}

const RING = "var(--entviz-walk-ring, #39ff14)"; // bright lime focus ring (§7.1)

function ringOverlay(svg: string, step: WalkStep): ReactNode {
  const { viewBox, rects } = featureRects(svg, step);
  if (!rects.length) return null;
  const pad = 2;
  return h(
    "svg",
    { viewBox, preserveAspectRatio: "xMidYMid meet", "aria-hidden": true, style: overlayStyle },
    rects.map((r, i) =>
      h("rect", {
        key: i,
        x: r.x - pad, y: r.y - pad, width: r.w + 2 * pad, height: r.h + 2 * pad,
        fill: "none", stroke: RING, "stroke-width": 2, rx: 2,
      }),
    ),
  );
}

// A panel = the entviz re-rendered through our own font, with the focus ring
// overlaid (never baked into the entviz SVG).
function panel(label: string, value: string, opts: RenderOptions, svg: string, step: WalkStep | null): ReactNode {
  return h(
    "div",
    { style: panelStyle },
    h("span", { style: panelLabel }, label),
    h(
      "div",
      { style: { position: "relative", width: 200 } },
      h(Entviz, { value, ...opts, style: { width: 200, display: "block" } }),
      step ? ringOverlay(svg, step) : null,
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
  match: "They match",
  differ: "They differ",
  relook: "Look again — is it really different?",
  relookYes: "Yes, different",
  relookNo: "No, my mistake",
  probeNotice: "Planted check: we deliberately changed one character here. Spot the difference.",
  noDifference: "No difference found across what you checked — strong, but not the machine's certainty.",
  different: "Different — these are not the same value.",
  pendingDone: "Sanity peek done. This was not a verification.",
  inconclusive: "Inconclusive — a planted check was missed. Try again with full attention.",
  recognitionNote: "A match means equal to this reference; it does not vouch for the reference.",
};

const PROMPTS: Record<string, string> = {
  text: "Do the highlighted characters match?",
  background: "Is the background colour the same?",
  "colorbar-pattern": "Same coloured bands, in the same order?",
  "colorbar-markers": "Are the two bar dots at the same heights?",
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
  const { value, reference, targetAr, fontSizePt, note, preset, onComplete, className, style } = props;
  const opts = useMemo(() => ({ targetAr, fontSizePt, note }), [targetAr, fontSizePt, note]);
  const ourSvg = useMemo(() => safeRender(value, opts), [value, opts]);
  const refSvg = useMemo(() => safeRender(reference, opts), [reference, opts]);

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
    const msg =
      state.status === "no-difference" ? M.noDifference
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
          { style: { display: "flex", gap: 16, flexWrap: "wrap" } },
          panel("Yours", value, opts, ourSvg, step),
          panel("Reference", reference, opts, refSvg, step),
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

function safeRender(value: string, opts: RenderOptions): string {
  try {
    return render(value, opts);
  } catch {
    return '<svg viewBox="0 0 1 1"></svg>';
  }
}

// CSPRNG [0,1) source for the single-user walk.
function csprng(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}

const overlayStyle: CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" };
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

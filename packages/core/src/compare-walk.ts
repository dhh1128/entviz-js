/**
 * compare-walk — the guided human walk (M2), pinned by comparison-design.md §14.
 *
 * Two pure, isomorphic pieces (the React layer renders the focus rings and drives
 * them): `buildCheckPlan` produces an unpredictable, ordered, *mixed* plan of
 * features to check (text cells + gestalt dimensions), sized to the preset and the
 * value's size; the walk reducer (`startWalk` / `respond`) turns the user's
 * match/differ responses into a verdict per the §14.6 state machine.
 *
 * Discipline: a human walk reaches `no-difference` (coverage), NEVER `identical`
 * (that is machine-only). One `differs` is certain `different`. Text cells are the
 * lossless backstop; gestalt dimensions add whole-value-CRC coverage. The plan's
 * unpredictability is the anti-habituation; the transparent planted probe is the
 * only added safeguard, and only for Complete on a large value.
 */
import { describeChannels, type Rect } from "./describe.ts";
import type { RenderOptions } from "./entviz.ts";

export type { Rect };

export type WalkPreset = "quick" | "good" | "complete";

export type GestaltDimension =
  | "background"
  | "colorbar-pattern"
  | "colorbar-markers"
  | "ellipse"
  | "blank-pattern"
  | "blank-map"
  | "quartile-marks";

export type WalkStep =
  | { kind: "text"; cellIndex: number }
  | { kind: "gestalt"; dimension: GestaltDimension }
  | { kind: "probe" }; // a transparent planted difference (large Complete only)

export interface CheckPlan {
  preset: WalkPreset;
  steps: WalkStep[];
  /** false for Quick — it can never reach an affirmative verdict (§14.4). */
  affirmative: boolean;
  /** a transparent planted difference is present (§14.7). */
  hasProbe: boolean;
  /** value-size class that shaped the plan. */
  sizeClass: "small" | "large" | "huge";
}

// Tunable knobs (comparison-design.md §14.2/§14.4) — composition, not soundness.
const SMALL_MAX_CELLS = 6; // ≤ this many text cells ⇒ "small": Complete is the natural target
const PROBE_MIN_CELLS = 12; // Complete on more displayed cells than this gets the probe
const GOOD_TEXT = 3; // credited text cells in a Good plan (≥ 2 lossless backstop)
const GOOD_GESTALT = 2; // gestalt dimensions in a Good plan
const QUICK_TEXT = 1;
const QUICK_GESTALT = 1;

// Deterministic Fisher–Yates using the supplied [0,1) source, so a seeded walk
// (M3) and a CSPRNG walk (M2) share one code path and tests are reproducible.
function shuffle<T>(items: T[], rng: () => number): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function take<T>(items: T[], n: number, rng: () => number): T[] {
  return shuffle(items, rng).slice(0, Math.max(0, Math.min(n, items.length)));
}

// The gestalt dimensions actually present for this value (background, color bar,
// and ellipse are always there; blanks/quartiles depend on the layout).
function gestaltPool(d: ReturnType<typeof describeChannels>): GestaltDimension[] {
  const pool: GestaltDimension[] = ["background", "colorbar-pattern", "colorbar-markers", "ellipse"];
  if (d.markers.blankMap) pool.push("blank-pattern", "blank-map");
  if (d.quartiles.some((q) => q.cellIndex !== null)) pool.push("quartile-marks");
  return pool;
}

/**
 * The viewBox + bounding rects (in the entviz's own user-units) to ring for a
 * given walk step, taken straight from the core render model's geometry — so the
 * React layer never parses the rendered SVG to recover coordinates (and never
 * touches the closed-profile artifact). One feature may yield several rects
 * (every blank cell, every quartile cell, both color-bar markers); a probe step
 * has no figure rect (it shows a planted cell of its own — §14.7).
 */
export function featureRects(
  value: string,
  opts: RenderOptions,
  step: WalkStep,
): { viewBox: string; rects: Rect[] } {
  const d = describeChannels(value, opts);
  const g = d.geometry;
  const rects: Rect[] = [];

  if (step.kind === "text") {
    const r = g.cellRects[step.cellIndex];
    if (r) rects.push(r);
  } else if (step.kind === "gestalt") {
    switch (step.dimension) {
      case "background":
        rects.push(g.gridRect);
        break;
      case "ellipse":
        rects.push(g.ellipse);
        break;
      case "colorbar-pattern":
        rects.push(g.colorBar);
        break;
      case "colorbar-markers":
        rects.push(...g.colorBarMarkers);
        break;
      case "blank-pattern":
        for (const c of d.cells) if (c.blank) rects.push(g.cellRects[c.index]);
        break;
      case "quartile-marks":
        for (const q of d.quartiles) if (q.cellIndex !== null) rects.push(g.cellRects[q.cellIndex]);
        break;
      case "blank-map": {
        // the map is the lowest-indexed blank cell (render's mapCellIdx)
        const map = d.cells.find((c) => c.blank);
        if (map) rects.push(g.cellRects[map.index]);
        break;
      }
    }
  }
  // probe: no figure rect
  return { viewBox: g.viewBox, rects };
}

/**
 * Build a check plan. `rng` is a [0,1) source — the platform CSPRNG for a
 * single-user walk, the committed seed for a live one (M3).
 */
export function buildCheckPlan(
  value: string,
  opts: RenderOptions,
  preset: WalkPreset,
  rng: () => number,
): CheckPlan {
  const d = describeChannels(value, opts);
  const filled = d.cells.filter((c) => !c.blank);
  // Credited text: for >512-bit the un-steerable Crockford-middle is the anchor;
  // otherwise every filled cell is real entropy.
  const creditText = d.truncated
    ? filled.filter((c) => c.fingerprint).map((c) => c.index)
    : filled.map((c) => c.index);
  const allText = filled.map((c) => c.index);
  const gestalt = gestaltPool(d);
  const sizeClass: CheckPlan["sizeClass"] = d.truncated
    ? "huge"
    : allText.length <= SMALL_MAX_CELLS
      ? "small"
      : "large";

  const textStep = (i: number): WalkStep => ({ kind: "text", cellIndex: i });
  const gestaltStep = (g: GestaltDimension): WalkStep => ({ kind: "gestalt", dimension: g });

  if (preset === "quick") {
    const steps = [
      ...take(creditText, QUICK_TEXT, rng).map(textStep),
      ...take(gestalt, QUICK_GESTALT, rng).map(gestaltStep),
    ];
    return { preset, steps: shuffle(steps, rng), affirmative: false, hasProbe: false, sizeClass };
  }

  if (preset === "good") {
    const steps = [
      ...take(creditText, Math.min(GOOD_TEXT, creditText.length), rng).map(textStep),
      ...take(gestalt, GOOD_GESTALT, rng).map(gestaltStep),
    ];
    return { preset, steps: shuffle(steps, rng), affirmative: true, hasProbe: false, sizeClass };
  }

  // complete: read all text; small Complete is full lossless (no gestalt, no probe);
  // large/huge Complete adds the gestalt CRC and a transparent probe.
  const includeGestalt = sizeClass !== "small";
  const hasProbe = sizeClass !== "small" && allText.length > PROBE_MIN_CELLS;
  const body = shuffle(
    [...allText.map(textStep), ...(includeGestalt ? gestalt.map(gestaltStep) : [])],
    rng,
  );
  if (hasProbe) {
    const at = Math.floor(rng() * (body.length + 1));
    body.splice(at, 0, { kind: "probe" });
  }
  return { preset, steps: body, affirmative: true, hasProbe, sizeClass };
}

// --- the walk reducer (§14.6 state machine) -------------------------------

export type WalkStatus = "pending" | "no-difference" | "different" | "inconclusive";
export type WalkResponse = "match" | "differ";

export interface WalkState {
  plan: CheckPlan;
  index: number; // next step to present
  status: WalkStatus;
  probeResets: number; // failed transparent-probe count
}

export function startWalk(plan: CheckPlan): WalkState {
  return { plan, index: 0, status: "pending", probeResets: 0 };
}

/** Fraction of the plan completed (the coverage meter; never a probability). */
export function coverage(state: WalkState): number {
  return state.plan.steps.length ? state.index / state.plan.steps.length : 0;
}

/**
 * Apply a (UI-confirmed) response to the current step. The UI handles the
 * "re-look" prompt before reporting a confirmed `differ`, and re-queues a
 * retraction itself (it simply does not call this with `differ`).
 */
export function respond(state: WalkState, response: WalkResponse): WalkState {
  if (state.status !== "pending") return state; // terminal
  if (state.index >= state.plan.steps.length) return state; // already walked the whole plan
  const step = state.plan.steps[state.index];

  if (step.kind === "probe") {
    if (response === "differ") {
      // caught the planted difference → attention calibrated; advance past it
      return finishOrAdvance({ ...state, index: state.index + 1 });
    }
    // missed it → inattention: reset to the start; a second miss is inconclusive
    const probeResets = state.probeResets + 1;
    if (probeResets >= 2) return { ...state, status: "inconclusive", probeResets };
    return { ...state, index: 0, probeResets };
  }

  // a real text/gestalt feature
  if (response === "differ") return { ...state, status: "different" };
  return finishOrAdvance({ ...state, index: state.index + 1 });
}

function finishOrAdvance(state: WalkState): WalkState {
  if (state.index < state.plan.steps.length) return state; // more to check
  // plan complete with no `differs`: Quick stays PENDING (a peek), else NO-DIFFERENCE.
  return { ...state, status: state.plan.affirmative ? "no-difference" : "pending" };
}

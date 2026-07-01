/**
 * compare-walk — the guided human walk (M2), pinned by comparison-design.md §14.
 *
 * Two pure, isomorphic pieces (the React layer renders the focus rings and drives
 * them): `buildCheckPlan` produces an unpredictable, ordered, *mixed* sequence of
 * features (text cells + gestalt dimensions) for a MODE — a continuous spot-check
 * (with Quick/Good as milestones along the coverage scale) or a Complete read; the
 * walk reducer (`startWalk` / `respond` / `finish`) turns the user's match/differ
 * responses into a coverage-driven verdict per the §14.6 state machine.
 *
 * Discipline: a human walk reaches `no-difference` (coverage), NEVER `identical`
 * (that is machine-only). One `differs` is certain `different`. Text cells are the
 * lossless backstop; gestalt dimensions add whole-value-CRC coverage. The verdict
 * is coverage-driven (PENDING below the Good milestone, NO-DIFFERENCE at/above it);
 * the walk does not stop at Good — the user keeps checking until Done or the end.
 * Unpredictability is the anti-habituation; the transparent planted probe is the
 * only added safeguard, and only for Complete on a large value.
 */
import { describeChannels, type ChannelDescription, type Rect } from "./describe.ts";
import type { RenderOptions } from "./entviz.ts";

export type { Rect };

// The user declares one of two MODES (no default). Quick/Good are no longer
// modes — they are milestones along the spot-check scale (§14.4).
export type WalkMode = "spot-check" | "complete";

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
  mode: WalkMode;
  /** The full ordered sequence of checks — a spot-check is a continuous climb
   *  through it; the user stops anywhere (Done) or runs to the end. */
  steps: WalkStep[];
  /** Coverage-bit milestones along the meter. `quickBits` is a visual "sanity
   *  peek" mark (still PENDING); `goodBits` is the threshold at which the verdict
   *  turns NO-DIFFERENCE; `totalBits` is the meter's denominator (100% = all). */
  quickBits: number;
  goodBits: number;
  totalBits: number;
  /** a transparent planted difference is present (§14.7) — Complete on a large
   *  value only; spot-check never (its unpredictable order is the safeguard). */
  hasProbe: boolean;
  /** value-size class that shaped the plan. */
  sizeClass: "small" | "large" | "huge";
}

// Tunable knobs (comparison-design.md §14.2/§14.4) — composition, not soundness.
const SMALL_MAX_CELLS = 6; // ≤ this many text cells ⇒ "small": Complete is the natural target
const PROBE_MIN_CELLS = 12; // Complete on more displayed cells than this gets the probe
const GOOD_TEXT = 2; // ≥ 2 lossless text cells anchor the Good milestone (the backstop)
const QUICK_BITS = 28; // the "sanity peek" tick ≈ 1 text + ~1 gestalt (still PENDING)

// Gestalt dimensions are NOT equally discriminatory, so the walk must not pick
// them as if they were fungible. Each carries a weight = its effective
// discriminability under directed attention (comparison JNDs), grounded in
// *Measuring the Glance* §5–6: the local positional-CRC channels (quartiles,
// markers, blank-map) and the salient ellipse are where a directed check buys the
// most over the parallel glance; the background (4 values) is the weakest. Used
// both to BIAS selection (weighted-random, so high-value features are favoured but
// the order stays unpredictable) and to CREDIT coverage in bits. The channels are
// disjoint slices of the one SHA-512 digest (derivationally independent), so their
// bits sum; the additive total is a conservative upper bound (perceptual coupling
// — overlay tint, crowding, masking — can only lower the human's joint, and is
// unmeasured, §10). Modeled, not measured on people — tunable.
const GESTALT_WEIGHT: Record<GestaltDimension, number> = {
  ellipse: 7,
  "quartile-marks": 6,
  "colorbar-markers": 5,
  "blank-map": 5,
  "colorbar-pattern": 4,
  "blank-pattern": 3,
  background: 2,
};
const TEXT_BITS = 24; // a credited text cell's coverage (full hex/base64url token, §7.3)
const GOOD_GESTALT_BITS = 12; // Good adds weighted gestalt until it has ≥ this many bits

const stepWeight = (s: WalkStep): number =>
  s.kind === "text" ? TEXT_BITS : s.kind === "gestalt" ? GESTALT_WEIGHT[s.dimension] : 0;

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

// Pick gestalt dimensions WITHOUT replacement, each with probability ∝ its
// weight, until either `count` are chosen or their summed weight reaches
// `bitTarget` (whichever the caller sets). Weighted-random keeps the order
// unpredictable (anti-habituation) while favouring the more discriminatory
// channels — so the ellipse/positional-CRC are checked far more than the
// background, never uniformly.
function weightedGestalt(
  pool: GestaltDimension[],
  rng: () => number,
  limit: { count?: number; bitTarget?: number },
): GestaltDimension[] {
  const remaining = pool.slice();
  const out: GestaltDimension[] = [];
  let bits = 0;
  const more = () =>
    remaining.length > 0 &&
    (limit.count !== undefined ? out.length < limit.count : bits < (limit.bitTarget ?? 0));
  while (more()) {
    const total = remaining.reduce((s, d) => s + GESTALT_WEIGHT[d], 0);
    let r = rng() * total;
    let i = 0;
    while (i < remaining.length - 1 && (r -= GESTALT_WEIGHT[remaining[i]]) >= 0) i++;
    const [picked] = remaining.splice(i, 1);
    out.push(picked);
    bits += GESTALT_WEIGHT[picked];
  }
  return out;
}

// A full weighted-random permutation (no replacement): higher-weight items tend
// earlier, but the order stays unpredictable. Used to order the "keep going" tail
// of a spot-check so it climbs through the more discriminatory checks first.
function weightedOrder<T>(items: T[], weight: (t: T) => number, rng: () => number): T[] {
  const remaining = items.slice();
  const out: T[] = [];
  while (remaining.length) {
    const total = remaining.reduce((s, t) => s + weight(t), 0);
    let r = rng() * total;
    let i = 0;
    while (i < remaining.length - 1 && (r -= weight(remaining[i])) >= 0) i++;
    out.push(remaining.splice(i, 1)[0]);
  }
  return out;
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
 *
 * Takes a PRE-COMPUTED model so a caller stepping through a walk can describe the
 * value once and map every step cheaply (the per-step mapping is O(cells); the
 * model build + geometry is not repeated). `featureRects` is the value-level
 * convenience that builds the model for you.
 */
export function featureRectsFromModel(
  d: ChannelDescription,
  step: WalkStep,
): { viewBox: string; rects: Rect[] } {
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

/** Value-level convenience: build the model and map the step in one call. */
export function featureRects(
  value: string,
  opts: RenderOptions,
  step: WalkStep,
): { viewBox: string; rects: Rect[] } {
  return featureRectsFromModel(describeChannels(value, opts), step);
}

/**
 * Build a check plan for a MODE. `rng` is a [0,1) source — the platform CSPRNG
 * for a single-user walk, the committed seed for a live one (M3).
 *
 * A **spot-check** is the full continuous sequence: a Good "front" (≥2 lossless
 * text cells + weighted gestalt CRC, shuffled) that defines the `goodBits`
 * milestone, then the rest of the pool in weighted order so the user can keep
 * climbing toward a full read. **Complete** reads every cell (+ the planted probe
 * on a large value); it is the deliberate exhaustive chore. Either way the verdict
 * is coverage-driven (PENDING below `goodBits`, NO-DIFFERENCE at/above it with the
 * text floor met); the mode shapes the *sequence*, not the verdict rule.
 */
export function buildCheckPlan(
  value: string,
  opts: RenderOptions,
  mode: WalkMode,
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
  const bitsOf = (s: WalkStep[]) => s.reduce((b, st) => b + stepWeight(st), 0);

  if (mode === "spot-check") {
    // Good front: ≥2 lossless text cells + weighted gestalt CRC — guarantees the
    // Good milestone includes both the backstop and whole-value coverage.
    const floor = take(creditText, Math.min(GOOD_TEXT, creditText.length), rng);
    const frontGestalt = weightedGestalt(gestalt, rng, { bitTarget: GOOD_GESTALT_BITS });
    const front = shuffle([...floor.map(textStep), ...frontGestalt.map(gestaltStep)], rng);
    // The rest of the pool (remaining text + gestalt), weighted so the climb past
    // Good keeps hitting the more discriminatory checks first.
    const restText = creditText.filter((i) => !floor.includes(i));
    const restGestalt = gestalt.filter((g) => !frontGestalt.includes(g));
    const rest = weightedOrder(
      [...restText.map(textStep), ...restGestalt.map(gestaltStep)],
      stepWeight,
      rng,
    );
    const steps = [...front, ...rest];
    const goodBits = bitsOf(front);
    return {
      mode,
      steps,
      quickBits: Math.min(QUICK_BITS, goodBits),
      goodBits,
      totalBits: bitsOf(steps),
      hasProbe: false,
      sizeClass,
    };
  }

  // complete: read every cell. Gestalt is REDUNDANT at ≤512 bits — the text is
  // lossless there, so verifying all filled cells already determines the whole
  // value (blanks and every gestalt dimension follow by construction). It only
  // adds coverage for a >512-bit value, whose displayed text is not lossless. The
  // transparent probe still guards the long read (large or huge).
  const includeGestalt = d.truncated;
  const hasProbe = sizeClass !== "small" && allText.length > PROBE_MIN_CELLS;
  const body = shuffle(
    [...allText.map(textStep), ...(includeGestalt ? gestalt.map(gestaltStep) : [])],
    rng,
  );
  if (hasProbe) {
    const at = Math.floor(rng() * (body.length + 1));
    body.splice(at, 0, { kind: "probe" });
  }
  const totalBits = bitsOf(body);
  // The verdict turns NO-DIFFERENCE once the usual Good coverage is met; a full
  // Complete read sails past it. Clamp so a tiny value (whose total is below the
  // nominal target) still reaches NO-DIFFERENCE when fully read.
  const goodBits = Math.min(GOOD_TEXT * TEXT_BITS + GOOD_GESTALT_BITS, totalBits);
  return {
    mode,
    steps: body,
    quickBits: Math.min(QUICK_BITS, goodBits),
    goodBits,
    totalBits,
    hasProbe,
    sizeClass,
  };
}

// --- the walk reducer (§14.6 state machine) -------------------------------

export type WalkStatus = "pending" | "no-difference" | "different" | "inconclusive";
export type WalkResponse = "match" | "differ";

export interface WalkState {
  plan: CheckPlan;
  index: number; // next step to present
  status: WalkStatus; // the live (or final) verdict
  probeResets: number; // failed transparent-probe count
  /** true once the walk is over: a confirmed differ, a missed probe twice, the
   *  user pressed Done, or every check was completed. While false the user can
   *  keep checking past the Good milestone (the continuous-scale model, §14.4). */
  ended: boolean;
}

// Bits / text cells confirmed so far (completed steps before `index`).
const doneBits = (s: WalkState): number =>
  s.plan.steps.slice(0, s.index).reduce((b, st) => b + stepWeight(st), 0);
const doneTextCount = (s: WalkState): number =>
  s.plan.steps.slice(0, s.index).filter((st) => st.kind === "text").length;

// The coverage-driven affirmative: NO-DIFFERENCE once ≥2 lossless text cells AND
// the Good bit milestone are confirmed, else PENDING (a sub-Good peek).
const liveVerdict = (s: WalkState): WalkStatus =>
  doneTextCount(s) >= GOOD_TEXT && doneBits(s) >= s.plan.goodBits ? "no-difference" : "pending";

export function startWalk(plan: CheckPlan): WalkState {
  return { plan, index: 0, status: "pending", probeResets: 0, ended: false };
}

/**
 * Coverage meter: the fraction of the plan's *bits* confirmed so far — weighted
 * by each feature's discriminability (a confirmed ellipse advances it far more
 * than a confirmed background), never a probability. Reaches 1 when every check
 * is done. (A probe step carries 0 bits, so it doesn't move the meter.)
 */
export function coverage(state: WalkState): number {
  return state.plan.totalBits ? doneBits(state) / state.plan.totalBits : 0;
}

/**
 * Apply a (UI-confirmed) response to the current step. The UI handles the
 * "re-look" prompt before reporting a confirmed `differ`, and re-queues a
 * retraction itself (it simply does not call this with `differ`). A `match`
 * advances and recomputes the live verdict; the walk does NOT auto-stop at the
 * Good milestone — it ends only when every check is done (or via `finish`).
 */
export function respond(state: WalkState, response: WalkResponse): WalkState {
  if (state.ended) return state;
  if (state.index >= state.plan.steps.length) return state;
  const step = state.plan.steps[state.index];

  if (step.kind === "probe") {
    if (response === "differ") {
      // caught the planted difference → attention calibrated; advance past it
      return advance({ ...state, index: state.index + 1 });
    }
    // missed it → inattention: reset to the start; a second miss is inconclusive
    const probeResets = state.probeResets + 1;
    if (probeResets >= 2) return { ...state, status: "inconclusive", ended: true, probeResets };
    return { ...state, index: 0, probeResets };
  }

  // a real text/gestalt feature
  if (response === "differ") return { ...state, status: "different", ended: true };
  return advance({ ...state, index: state.index + 1 });
}

function advance(state: WalkState): WalkState {
  const status = liveVerdict(state);
  // ended only when there is nothing left to check; otherwise the user may keep going.
  return { ...state, status, ended: state.index >= state.plan.steps.length };
}

/** The user is done (the "Done" button): freeze the current live verdict. */
export function finish(state: WalkState): WalkState {
  if (state.ended) return state;
  return { ...state, status: liveVerdict(state), ended: true };
}

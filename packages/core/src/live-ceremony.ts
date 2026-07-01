/**
 * live-ceremony — the remote two-party voice ceremony (M3), pinned by
 * comparison-design.md §15.
 *
 * Pure and isomorphic (no DOM, no Node built-ins). The React layer renders the
 * ceremony chrome and drives it over a `LiveChannel`; this module is the whole
 * protocol, and it is deliberately small because the design re-derivation (§15)
 * dissolved most of §8's machinery:
 *
 *  - **No seed, no commit-reveal, no synthetic SAS.** Authentication is one-way and
 *    the authenticator (the party running our tool) selects the checks *live*, so
 *    there is no joint seed to steer and nothing to commit; a digest read aloud is
 *    impossible for a reader who only has a picture (§15.2).
 *  - The primitive is **authenticator-directed read-back of *visible* cells** — the
 *    reader reads glyphs off the artifact in front of them; the machine covers the
 *    rest when a paste is available (§15.3).
 *  - **Sampling a subset is sound only where a difference cannot hide** — a
 *    constrained value (differences are total) or the hash-derived fingerprint-middle
 *    (avalanche). A programmable value with no hash anchor is read in full (§15.4).
 *
 * `buildReadbackPlan` turns (value, mode) into the ordered cells to read; the
 * reducer (`startCeremony` / `respond` / `finish`) turns the authenticator's
 * match/differ reports into a verdict that **caps at NO-DIFFERENCE** — a
 * human-driven comparison never reaches IDENTICAL (§3), and one `differ` is a
 * certain DIFFERENT.
 */
import { describeChannels, type ChannelDescription } from "./describe.ts";
import { classifyInput, type RenderOptions } from "./entviz.ts";

/** Which channel the read-back crosses (§15.6). `paste-bind`: the reader could
 *  transmit their value digitally, the machine did the exhaustive compare, and the
 *  voice channel only binds a cell or two to the live person. `voice-only`: the
 *  value itself crosses voice, so the size×type read-back of §15.5 applies. */
export type CeremonyMode = "voice-only" | "paste-bind";

/** The shape of the read-back the plan chose (§15.5). */
export type ReadbackKind = "all-cells" | "consecutive" | "fingerprint-cells" | "bind";

export type SizeClass = "small" | "medium" | "big";

export interface ValueClass {
  sizeClass: SizeClass;
  /** false ⇒ attacker-authored arbitrary text (the txt→b64url fallback): a
   *  near-collision can be crafted cheaply, so sampling is unsound and the plan
   *  reads in full (§15.4). Conservative heuristic — the tool cannot observe
   *  *generation* (a recognized encoding is assumed constrained; only the
   *  no-parser-claimed fallback is treated as programmable), matching §7.3's
   *  "credit 0 for non-locally-generated" framing. */
  constrained: boolean;
  /** the alphabet is confusable-prone (base64 / base64url): §14.5 adds one extra
   *  read cell to a *sampled* plan to offset homoglyph erosion over voice. */
  homoglyphProne: boolean;
  /** count of filled (non-blank) cells. */
  filledCells: number;
}

export interface ReadbackPlan {
  mode: CeremonyMode;
  kind: ReadbackKind;
  cls: ValueClass;
  /** ordered filled-cell indices the authenticator asks the reader to read aloud.
   *  The UI names each by its grid address ("row 1, column 2") so the authenticator
   *  can point the remote reader at it. */
  cells: number[];
  /** how many of `cells` were appended purely for §14.5 homoglyph compensation. */
  homoglyphExtra: number;
}

// Tunable knobs (comparison-design.md §15.5) — composition, not soundness.
const SMALL_MAX_CELLS = 6; // ≤ this many filled cells ⇒ "small" (matches the walk, §14.4)
const BIND_CELLS = 2; // a paste-bind asks the reader for this many cells
const SAMPLE_CELLS = 4; // a medium-constrained read-back samples this many consecutive cells

// Deterministic Fisher–Yates over a [0,1) source, so a CSPRNG-driven ceremony (the
// UI) and a seeded one (tests) share one path. The authenticator's *live* choice is
// the anti-pre-forge mechanism (§15.2) — the rng models that free choice.
function shuffle<T>(items: T[], rng: () => number): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const sample = <T>(pool: T[], n: number, rng: () => number): T[] =>
  shuffle(pool, rng).slice(0, Math.max(0, Math.min(n, pool.length)));

function classify(model: ChannelDescription, alphabetName: string, typeName: string): ValueClass {
  const filledCells = model.cells.filter((c) => !c.blank).length;
  const sizeClass: SizeClass = model.truncated
    ? "big"
    : filledCells <= SMALL_MAX_CELLS
      ? "small"
      : "medium";
  // Programmable = the no-parser-claimed fallback (arbitrary text UTF-8→base64url).
  const constrained = !typeName.startsWith("txt(");
  const homoglyphProne = alphabetName === "base64" || alphabetName === "base64url";
  return { sizeClass, constrained, homoglyphProne, filledCells };
}

/** Classify a value for the ceremony (size × constrained × homoglyph). Exposed so
 *  the UI can pick copy / explain the read-back before the plan is built. */
export function classifyValue(value: string, opts: RenderOptions = {}): ValueClass {
  const model = describeChannels(value, opts);
  const { typeName, alphabet } = classifyInput(value.trim());
  return classify(model, alphabet.name, typeName);
}

/**
 * Build the authenticator's read-back plan for a value and mode (§15.5). `rng` is
 * a [0,1) source — the platform CSPRNG in the UI, a seeded LCG in tests — standing
 * in for the authenticator's live, unpredictable choice of which cells to ask for.
 *
 * The strategy is size × type × mode:
 *  - **big** (>512-bit): the hash-derived **fingerprint-middle** cells (avalanche,
 *    homoglyph-clean) — all of them voice-only, a couple to bind after a paste.
 *  - **small**, or **medium programmable**: **all cells** (no sound sample exists).
 *  - **medium constrained**: a run of **consecutive cells** from a random start (in
 *    reading order, so it may span rows) — robust where a single row is too narrow.
 *  - **paste-bind** on a constrained value: a couple of cells to bind the machine's
 *    exhaustive compare to the live reader (a fingerprint cell if big).
 *
 * A sampled plan (consecutive, bind) on a confusable alphabet gets **one extra
 * cell** for homoglyph compensation (§14.5); an all-cells or fingerprint plan does not.
 */
export function buildReadbackPlan(
  value: string,
  opts: RenderOptions,
  mode: CeremonyMode,
  rng: () => number,
): ReadbackPlan {
  const model = describeChannels(value, opts);
  const { typeName, alphabet } = classifyInput(value.trim());
  const cls = classify(model, alphabet.name, typeName);

  const filledIdx = model.cells.filter((c) => !c.blank).map((c) => c.index);
  const fingerprintIdx = model.cells.filter((c) => c.fingerprint).map((c) => c.index);

  let kind: ReadbackKind;
  let cells: number[];

  if (mode === "paste-bind") {
    // The machine already compared the whole pasted value; bind it to the live
    // reader with a couple of cells — hash-anchored if big, any cell if constrained.
    if (cls.sizeClass === "big") {
      kind = "bind";
      cells = sample(fingerprintIdx, BIND_CELLS, rng);
    } else if (cls.constrained) {
      kind = "bind";
      cells = sample(filledIdx, BIND_CELLS, rng);
    } else {
      // programmable, non-big: no sound sample and no hash anchor — the machine's
      // compare can't be safely bound by a few cells, so read the value in full.
      kind = "all-cells";
      cells = filledIdx;
    }
  } else if (cls.sizeClass === "big") {
    kind = "fingerprint-cells";
    cells = fingerprintIdx.slice();
  } else if (cls.sizeClass === "medium" && cls.constrained) {
    // A run of consecutive filled cells from an unpredictable start (§15.5). Medium
    // ⇒ > SMALL_MAX_CELLS filled, so there are always enough for a full run.
    kind = "consecutive";
    const n = Math.min(SAMPLE_CELLS, filledIdx.length);
    const start = Math.floor(rng() * (filledIdx.length - n + 1));
    cells = filledIdx.slice(start, start + n);
  } else {
    // small (any type), or medium programmable: read every cell (§15.5).
    kind = "all-cells";
    cells = filledIdx;
  }

  // §14.5 homoglyph compensation: only a *sampled* plan on a confusable alphabet
  // (an all-cells read already covers everything; the Crockford fingerprint is clean).
  let homoglyphExtra = 0;
  if (cls.homoglyphProne && (kind === "consecutive" || kind === "bind")) {
    const extra = sample(filledIdx.filter((i) => !cells.includes(i)), 1, rng);
    cells = [...cells, ...extra];
    homoglyphExtra = extra.length;
  }

  return { mode, kind, cls, cells, homoglyphExtra };
}

// --- the ceremony reducer (§15.7, reusing the §14.6 discipline) -----------

export type CeremonyStatus = "pending" | "no-difference" | "different";
export type CeremonyResponse = "match" | "differ";

export interface CeremonyState {
  plan: ReadbackPlan;
  /** the next cell (index into `plan.cells`) to have the reader read. */
  index: number;
  status: CeremonyStatus;
  /** true once a differ was confirmed or every planned cell was read. */
  ended: boolean;
}

// Affirmative once every planned cell has been confirmed (`index` past the end).
// The plan already encodes the right coverage per §15.5, so there is no separate
// bit threshold — reading the chosen set *is* the target. Caps at NO-DIFFERENCE,
// never IDENTICAL (§3); an empty plan can never affirm.
const affirmative = (plan: ReadbackPlan, index: number): boolean =>
  plan.cells.length > 0 && index >= plan.cells.length;

export function startCeremony(plan: ReadbackPlan): CeremonyState {
  return { plan, index: 0, status: "pending", ended: false };
}

/** Fraction of the planned cells confirmed so far (the read-back progress meter). */
export function coverage(state: CeremonyState): number {
  return state.plan.cells.length ? state.index / state.plan.cells.length : 0;
}

/**
 * Apply the authenticator's report for the current cell. The UI issues the
 * "re-look" prompt before reporting a confirmed `differ` and re-queues a retraction
 * itself (it simply does not call this with `differ`); one confirmed `differ` is a
 * certain DIFFERENT. A `match` advances and re-derives the verdict.
 */
export function respond(state: CeremonyState, response: CeremonyResponse): CeremonyState {
  if (state.ended || state.index >= state.plan.cells.length) return state;
  if (response === "differ") return { ...state, status: "different", ended: true };
  const index = state.index + 1;
  const ended = index >= state.plan.cells.length;
  return { ...state, index, status: affirmative(state.plan, index) ? "no-difference" : "pending", ended };
}

/** The authenticator stops early (a "Done" affordance): freeze the live verdict —
 *  NO-DIFFERENCE only if every planned cell was already read, else PENDING. */
export function finish(state: CeremonyState): CeremonyState {
  if (state.ended) return state;
  return { ...state, status: affirmative(state.plan, state.index) ? "no-difference" : "pending", ended: true };
}

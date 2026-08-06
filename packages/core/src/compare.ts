/**
 * compare — the machine-comparison engines for <EntvizCompare>.
 *
 * Decides whether the user's value matches a reference, by medium. The text
 * engine is here (definitive value-level compare); the SVG and raster engines
 * land in follow-on milestones. All of this is pure + isomorphic (no DOM): the
 * security-bearing logic stays unit-testable, mirroring describe.ts.
 *
 * Verdict discipline (comparison-design.md §3): an affirmative `identical` is
 * reachable ONLY when the machine compared both sides in full (this text engine,
 * or a self-consistent ≤512-bit SVG). "couldn't read the reference" is `unknown`,
 * kept DISTINCT from `different` so a degraded/inconsistent reference can never be
 * spun into a false "they differ" (§6.3). A single mismatch is `different` with
 * certainty.
 */
import {
  classifyInput,
  computeGeometry,
  gridAspectRatio,
  render,
  type RenderOptions,
} from "./entviz.ts";
import { comparisonText, describeChannels } from "./describe.ts";
import {
  extractEntvizChannels,
  parseXml,
  recoverGeometry,
  treeEqual,
  validateEntvizProfile,
  type EntvizChannels,
  type XmlNode,
} from "./svg-profile.ts";

export type Verdict =
  | { state: "identical" }
  | { state: "different" }
  // `similar` marks the specific raster case where the images matched pixel-wise
  // but an image can't prove value equality (vs a couldn't-read/align unknown) —
  // so the UI can say "look similar, couldn't check text" rather than a failure.
  | { state: "unknown"; reason: string; similar?: boolean }
  | { state: "pending" };

export type Medium = "text" | "svg" | "raster" | "ambiguous";

// The tuple that fully determines a value's *identity* (the rendered entviz,
// independent of display geometry/note): the normalized core, its alphabet, and
// the bound semantic prefix. Two raw inputs with the same key render byte-for-byte
// identically — and the spec's per-format normalization (case-folding, the URN
// NID lowercase, the DID/CESR prefix-fold) is already baked in by classifyInput,
// so this is exactly the spec's equivalence (e.g. `ABCD`≡`abcd` for hex,
// `URN:ISBN:x`≡`urn:isbn:x`).
function identityKey(value: string): string {
  const c = classifyInput(value.trim());
  // A prefix bears identity ONLY when it is bound into the fingerprint, i.e.
  // prefixSemantic (a DID method / URN NID); render's fingerprintCore folds in
  // `prefix ‖ core` exactly then. A PRESENTATION prefix (prefixSemantic false —
  // "0x" hex notation, a multibase selector, SSH/PEM framing) is normalized away:
  // it shows only in the label and enters neither the cells nor the fingerprint
  // (spec.md §presentation), so it must NOT distinguish identity — otherwise two
  // inputs that render the same entviz would compare `different`.
  const idPrefix = c.prefixSemantic ? c.prefix : null;
  return JSON.stringify([c.core, c.alphabet.name, idPrefix]);
}

/**
 * Text engine (§6.1): compare two values at the value level. Definitive for
 * inputs that classify — `identical` iff they normalize to the same identity
 * (⇒ identical entvizes), else `different`. An input `classifyInput` REJECTS
 * (a mid-edit string, or e.g. an ETH address whose EIP-55 case checksum is
 * broken) is `unknown` — couldn't read it — never an exception: a thrown
 * classification error in the React render path blanks the whole page, and a
 * fail-closed `unknown` is also the right verdict (don't manufacture a false
 * `different` for something we couldn't even parse — §3/§6.3).
 */
export function compareValues(a: string, b: string): Verdict {
  let ka: string;
  try {
    ka = identityKey(a);
  } catch {
    return { state: "unknown", reason: "could not read your value" };
  }
  let kb: string;
  try {
    kb = identityKey(b);
  } catch {
    return { state: "unknown", reason: "could not read the reference value" };
  }
  return ka === kb ? { state: "identical" } : { state: "different" };
}

// Collapse runs of whitespace so a read-aloud transcription's spacing doesn't
// matter; the cell glyphs themselves stay case-exact.
const normalizeText = (s: string): string => s.trim().replace(/\s+/g, " ");

/**
 * Compare a reference *comparison-text* (the read-aloud readout) against the
 * value's own comparison text. A match on a ≤512-bit input is lossless ⇒
 * `identical`; on a >512-bit (truncated) input the text is head + fingerprint
 * middle + tail, so a match is strong but not a full identity proof ⇒ `unknown`
 * (route to the human walk), never `identical`. Any mismatch ⇒ `different`.
 *
 * This compares the FULL comparison text — the bracketed label and the cell
 * readout — by calling {@link comparisonText} rather than re-deriving the cells
 * here. It used to compare the cells alone, which was the same defect from two
 * directions: the cells carry the core, while the engine's own identity
 * definition (`identityKey`) also includes the folded prefix. So
 * `did:good:AbCd…` and `did:evil:AbCd…` — different values by `compareValues`,
 * resolving to different documents and different keys — produced byte-identical
 * readouts and reached the strongest affirmative verdict the library has.
 */
export function compareComparisonText(
  referenceText: string,
  value: string,
  opts: Parameters<typeof describeChannels>[1] = {},
): Verdict {
  const ref = normalizeText(referenceText);
  const ch = describeChannels(value, opts);
  const mine = normalizeText(comparisonText(value, opts));
  if (ref !== mine) {
    // A label-less reference whose CELLS match ours is the one case worth
    // separating: a hand-typed or pre-label readout of what may well be the same
    // value. It cannot prove identity — it is missing exactly the channel a
    // folded prefix travels in — so `unknown` routes it to the human walk.
    // Saying `different` there would assert a difference we did not observe.
    // Any other mismatch is a plain mismatch, which keeps the caller's
    // value-then-comparison-text fallback intact for a pasted differing value.
    const cellsOnly = ch.cells.map((c) => (c.blank ? "·" : (c.text as string))).join(" ");
    if (!ref.startsWith("[") && ref === normalizeText(cellsOnly)) {
      return {
        state: "unknown",
        reason: "the reference readout has no label, so it cannot identify the value",
      };
    }
    return { state: "different" };
  }
  return ch.truncated
    ? { state: "unknown", reason: "comparison-text match on a >512-bit input is not a full identity proof" }
    : { state: "identical" };
}

/**
 * Fail-closed medium auto-detect (§5). Routes pasted/dropped data to an engine,
 * but NEVER upgrades an ambiguous artifact onto the `identical` path: anything
 * markup-shaped that isn't a recognized entviz SVG, a bare URL (fetch-vs-value is
 * the user's call), or an unrecognized data URL returns `ambiguous` for the caller
 * to reject or route to the least-authoritative (raster) engine.
 */
export function detectMedium(data: string): Medium {
  const s = data.trim();
  if (!s) return "ambiguous";
  if (
    /^<svg[\s>]/i.test(s) ||
    /^<\?xml[\s\S]{0,200}?<svg[\s>]/i.test(s) ||
    /^data:image\/svg\+xml[;,]/i.test(s)
  ) {
    return "svg";
  }
  if (/^data:image\/(png|jpe?g|gif|webp|bmp|avif)[;,]/i.test(s)) return "raster";
  if (/^</.test(s)) return "ambiguous"; // markup-ish but not a recognized entviz SVG
  if (/^https?:\/\//i.test(s)) return "ambiguous"; // a URL: fetch or treat-as-value is the user's call
  if (/^data:/i.test(s)) return "ambiguous"; // some other data URL
  return "text";
}

// ---------------------------------------------------------------------------
// SVG engine (§6.2): a pasted SVG is attacker-authorable and there is no golden
// raster, so its declared <text>/data-* channels are worthless UNLESS they are
// provably the ones painted. The gauntlet, in order:
//
//   1. a cheap raw prescan (below) rejects the markup-level ways to repaint a
//      diagram — foreign tags, event handlers, inline CSS, @font-face, external
//      href/url(), comments/CDATA/DOCTYPE;
//   2. a strict parse + the entviz GRAMMAR (svg-profile.ts) rejects everything
//      outside the exact shape a conformant renderer emits, so extra, hidden,
//      duplicated or displaced ink has nowhere legal to live;
//   3. the declared text channel is compared at the value level — a mismatch is
//      the one certain verdict, `different`;
//   4. the fingerprint-driven gestalt (per-token surround bits + colour-bar
//      letters, RECOMPUTED with describeChannels — declared data-* is never
//      trusted) must be self-consistent with that value;
//   5. and no affirmative verdict is reached until the value has been RE-RENDERED
//      through this library's own renderer, at the geometry the reference itself
//      declares, and the result matches the reference tree. That is what ties
//      declared to painted: a reference that passes IS our drawing of the value.
//
// A >512-bit reference is never `identical` (the text channel is not lossless
// there — a full re-render match is reported as `similar`, walk to confirm).
// Any failure short of a text mismatch is `unknown` — route to the human walk,
// never a manufactured `different` (§6.3).
// ---------------------------------------------------------------------------

// The ONLY element types a conformant entviz may contain (spec.md "Closed
// profile"); non-rendering metadata is also allowed. Anything else ⇒ reject.
const CLOSED_PROFILE_TAGS = new Set([
  "svg", "defs", "clipPath", "g", "rect", "path", "text", "tspan",
  "polygon", "circle", "ellipse", "line", "title", "desc", "metadata",
]);

/**
 * Cheap raw-markup prescan: the markup-level ways to repaint an entviz that can
 * be seen without structure. Returns false on any element outside the entviz
 * vocabulary, any event handler, inline `style=`, a hiding presentation
 * attribute, `@font-face`/`@import`, or any `href`/`url()` that isn't a local
 * `#fragment`. Conservative by design (it fails closed).
 *
 * This is a filter, not the gate — {@link validateClosedProfile} runs it and
 * then the structural grammar, which is what actually binds declared to painted.
 */
function rawPrescan(svg: string): boolean {
  // Scan the RAW markup with only linear (non-backtracking) patterns — this runs
  // on attacker-controlled input. A conformant entviz contains no comments/CDATA/
  // DOCTYPE, so we REJECT them outright rather than strip-then-rescan (which is
  // both ReDoS-prone and a classic incomplete-sanitization footgun: a comment can
  // split a forbidden element).
  if (svg.includes("<!")) return false; // comments, CDATA, DOCTYPE + entity subsets
  for (const m of svg.matchAll(/<\/?([a-zA-Z][\w:-]*)/g)) {
    if (!CLOSED_PROFILE_TAGS.has(m[1])) return false;
  }
  if (/\son[a-z]+\s*=/i.test(svg)) return false; // event handlers (onload=, …)
  if (/\sstyle\s*=/i.test(svg)) return false; // inline CSS (entviz never uses it)
  // Presentation attributes that hide painted content. entviz emits NONE of
  // these anywhere, so they can be rejected outright here; the ones it does emit
  // in exactly one place (`transform`, `clip-path`, `fill-opacity` and
  // `stroke-opacity`, all on the ellipse overlay) are pinned to that position by
  // the structural grammar instead.
  if (/\s(?:opacity|display|visibility|mask|filter)\s*=/i.test(svg)) return false;
  if (/@font-face|@import/i.test(svg)) return false;
  if (/(?:xlink:)?href\s*=\s*["'](?!#)/i.test(svg)) return false; // href to anything but a local #fragment
  if (/url\(\s*(?!["']?#)/i.test(svg)) return false; // url() to anything but a local #fragment
  return true;
}

/**
 * Strict closed-profile validation (spec.md:185, comparison-design.md §6.2 item
 * 1): the prescan above, then a strict parse and the entviz grammar. `true` only
 * for the exact document shape a conformant renderer emits.
 *
 * A flat tag whitelist is NOT enough and was the substance of security finding
 * F1: every element of an opaque cover, a duplicate cell, a `<defs>`-hidden cell
 * group or a second glyph inside a cell is inside the vocabulary. What rejects
 * them is the structure — see svg-profile.ts.
 */
export function validateClosedProfile(svg: string): boolean {
  return parseEntviz(svg) !== null;
}

/** The gauntlet's steps 1–2: prescan, parse, grammar. `null` ⇒ not an entviz. */
function parseEntviz(svg: string): XmlNode | null {
  if (!rawPrescan(svg)) return null;
  const root = parseXml(svg);
  return root && validateEntvizProfile(root) ? root : null;
}

/**
 * The recompute-and-re-render check (§6.2 items 2–4), and the ONLY door to an
 * affirmative verdict: render `value` through this library's own renderer at the
 * geometry the reference declares, and require the two documents to be the same
 * drawing. A reference that passes is not merely consistent with the value — it
 * IS our rendering of it, so what it declares is necessarily what it paints.
 *
 * Fails closed on anything it cannot reproduce (an unrecoverable size, a note it
 * cannot round-trip, a reference from a build that draws differently): the
 * caller degrades to `unknown` and routes to the human walk.
 */
function referenceIsOurRendering(root: XmlNode, value: string): boolean {
  const geom = recoverGeometry(root);
  if (!geom) return false;
  // The grid's own aspect ratio is the targetAr that re-selects it (chooseGrid).
  const targetAr = gridAspectRatio(geom.cols, geom.rows);
  // boundingW is affine in fontSizePt, so invert it through the renderer's own
  // geometry rather than restating its constants here.
  const grid = { cols: geom.cols, rows: geom.rows, tokenCount: 0 };
  const w0 = computeGeometry(0, grid, false).boundingW;
  const w1 = computeGeometry(1, grid, false).boundingW;
  const pt = (geom.boundingW - w0) / (w1 - w0);
  // `width` is serialized to three decimals, so the inversion lands near — not
  // on — the original point size; try the nearby round values it may have been.
  const sizes = [...new Set([pt, Math.round(pt * 100) / 100, Math.round(pt * 4) / 4, Math.round(pt)])];
  for (const fontSizePt of sizes) {
    if (!(fontSizePt >= 6 && fontSizePt <= 30)) continue;
    let mine: XmlNode | null;
    try {
      mine = parseXml(render(value, { targetAr, fontSizePt, note: geom.note }));
    } catch {
      return false; // the value itself doesn't render — nothing to compare
    }
    if (mine && treeEqual(mine, root)) return true;
  }
  return false;
}

/**
 * SVG engine: compare a pasted reference entviz against the user's `value`.
 * `different` on a text-channel mismatch; `identical` only for a ≤512-bit value
 * whose reference this library re-renders exactly; `unknown` for everything else
 * — a reference that isn't a closed-profile entviz, one we can't read, one whose
 * declared channels we can't prove are the painted ones, or a >512-bit value
 * (whose exact re-render is reported as `similar`, walk to confirm).
 */
// Any real entviz SVG is a few KB (a >512-bit one well under this); a larger
// paste is pathological, so cap it (anti-DoS on untrusted input) → unknown.
const MAX_SVG_CHARS = 1_000_000;

export function compareSvg(referenceSvg: string, value: string, opts: RenderOptions = {}): Verdict {
  if (referenceSvg.length > MAX_SVG_CHARS) {
    return { state: "unknown", reason: "the reference is too large to read safely" };
  }
  const root = parseEntviz(referenceSvg);
  if (!root) {
    return { state: "unknown", reason: "the reference is not a closed-profile entviz" };
  }
  const ref: EntvizChannels | null = extractEntvizChannels(root);
  if (!ref) return { state: "unknown", reason: "could not read the reference entviz" };

  const me = describeChannels(value, opts);
  const myFilled = me.cells.filter((c) => !c.blank);

  const refText = ref.filled.map((f) => f.text).join(" ");
  const myText = myFilled.map((c) => c.text as string).join(" ");
  if (refText !== myText) return { state: "different" };

  // The text channels agree. The fingerprint-driven gestalt (per-token surround
  // bits + color-bar letters) is a hash of the WHOLE value, so it discriminates
  // values a >512-bit input's non-lossless text cannot. Recompute ours (don't trust
  // the SVG's data-*) and require the geometry-independent channels to match.
  const surroundOk =
    ref.filled.length === myFilled.length &&
    ref.filled.every((f, i) => f.surroundBits === myFilled[i].surroundBits);
  const barsOk = ref.colorBarLetters.join("") === me.colorBarLetters.join("");
  if (!(surroundOk && barsOk)) {
    // An untrusted reference must never be spun into a false `different` (§6.3).
    return { state: "unknown", reason: "the reference's pattern is inconsistent with its text" };
  }

  // Every DECLARED channel agrees. That is still only a claim about the markup;
  // it becomes a claim about the PICTURE only once we have re-rendered the value
  // ourselves and found the reference to be that same drawing (F1/F2).
  if (!referenceIsOurRendering(root, value)) {
    return {
      state: "unknown",
      reason: "we could not confirm the reference draws what it says it draws",
    };
  }

  // A >512-bit input (either side) can't be machine-CERTIFIED identical: the text
  // channel isn't lossless, and section 3 reserves `identical` for a full compare.
  // Two values sharing a head, a tail and a fingerprint would draw the same
  // picture, so forging this takes a hash collision -- an honest match "to the
  // precision of the hash": report `similar` (walk to confirm).
  if (ref.truncated || me.truncated) {
    return {
      state: "unknown",
      similar: true,
      reason:
        "the text and pattern match to the precision of the hash -- a value this large can't be fully machine-verified from an SVG",
    };
  }

  // <=512-bit: the text channel is lossless AND the reference is our own drawing
  // of this value, so declared and painted coincide. A full identity proof.
  return { state: "identical" };
}

// ---------------------------------------------------------------------------
// Raster: the decoded-image type. The raster COMPARISON engine (§6.3) lives in
// raster-compare.ts (geometry-anchored predict-and-sample); this interface is the
// RGBA hand-off the React layer produces via a canvas. (The earlier crude
// whole-image pixel-diff `rasterDisprove` was removed — see §6.3.)
// ---------------------------------------------------------------------------

export interface Raster {
  rgba: Uint8ClampedArray;
  w: number;
  h: number;
}

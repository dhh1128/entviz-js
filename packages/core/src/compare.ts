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
import { classifyInput, type RenderOptions } from "./entviz.ts";
import { describeChannels } from "./describe.ts";

export type Verdict =
  | { state: "identical" }
  | { state: "different" }
  | { state: "unknown"; reason: string }
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
  return JSON.stringify([c.core, c.alphabet.name, c.prefix, c.prefixSemantic]);
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
 * Compare a reference *comparison-text* (the read-aloud cell readout) against the
 * value's own comparison text. A match on a ≤512-bit input is lossless ⇒
 * `identical`; on a >512-bit (truncated) input the text is head + fingerprint
 * middle + tail, so a match is strong but not a full identity proof ⇒ `unknown`
 * (route to the human walk), never `identical`. Any mismatch ⇒ `different`.
 */
export function compareComparisonText(
  referenceText: string,
  value: string,
  opts: Parameters<typeof describeChannels>[1] = {},
): Verdict {
  const ch = describeChannels(value, opts);
  const mine = ch.cells.map((c) => (c.blank ? "·" : (c.text as string))).join(" ");
  if (normalizeText(referenceText) !== normalizeText(mine)) return { state: "different" };
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
// raster, so trusting its declared <text>/data-* is unsafe. We (1) reject any SVG
// that is not a strict closed-profile entviz — which is what makes its declared
// cell text trustworthy (no <style>/@font-face/foreignObject/event handlers/
// external refs can repaint the glyphs), then (2) compare at the value level via
// the lossless ≤512-bit text channel, and (3) require the reference's
// fingerprint-driven gestalt (per-token surround bits + colour-bar letters,
// recomputed with describeChannels — declared data-* is NOT trusted) to be
// self-consistent with that value. A >512-bit reference, or any inconsistency,
// is `unknown` (route to the human walk), never `identical`.
// ---------------------------------------------------------------------------

// The ONLY element types a conformant entviz may contain (spec.md "Closed
// profile"); non-rendering metadata is also allowed. Anything else ⇒ reject.
const CLOSED_PROFILE_TAGS = new Set([
  "svg", "defs", "clipPath", "g", "rect", "path", "text", "tspan",
  "polygon", "circle", "ellipse", "line", "title", "desc", "metadata",
]);

/**
 * Strict closed-profile validation (spec.md:185). Returns false on any element
 * outside the entviz vocabulary, any event handler, inline `style=`, `@font-face`/
 * `@import`, or any `href`/`url()` that isn't a local `#fragment` — i.e. anything
 * that could repaint the diagram or alter glyph rendering. Conservative by design
 * (it fails closed): a false reject only routes the reference to the human walk.
 */
export function validateClosedProfile(svg: string): boolean {
  // Scan the RAW markup with only linear (non-backtracking) patterns — this runs
  // on attacker-controlled input. A conformant entviz contains no comments/CDATA,
  // so we REJECT them outright rather than strip-then-rescan (which is both
  // ReDoS-prone and a classic incomplete-sanitization footgun: a comment can split
  // a forbidden element). Every element tag must be in the whitelist; reject
  // anything that could repaint the diagram or alter glyph rendering.
  if (svg.includes("<!--") || svg.includes("<![CDATA[")) return false;
  for (const m of svg.matchAll(/<\/?([a-zA-Z][\w:-]*)/g)) {
    if (!CLOSED_PROFILE_TAGS.has(m[1])) return false;
  }
  if (/\son[a-z]+\s*=/i.test(svg)) return false; // event handlers (onload=, …)
  if (/\sstyle\s*=/i.test(svg)) return false; // inline CSS (entviz never uses it)
  if (/@font-face|@import/i.test(svg)) return false;
  if (/(?:xlink:)?href\s*=\s*["'](?!#)/i.test(svg)) return false; // href to anything but a local #fragment
  if (/url\(\s*(?!["']?#)/i.test(svg)) return false; // url() to anything but a local #fragment
  return true;
}

interface ParsedSvg {
  truncated: boolean;
  /** Filled cells in cell-index (= token) reading order. */
  filled: { text: string; surroundBits: number }[];
  colorBarLetters: string[];
}

// Linear extraction of a cell's token text: the central-baseline <text>'s content
// (no backtracking regex — this parses untrusted input). Returns null if absent.
function cellText(body: string): string | null {
  const marker = body.indexOf('dominant-baseline="central"');
  if (marker < 0) return null;
  const tagEnd = body.indexOf(">", marker);
  if (tagEnd < 0) return null;
  const textEnd = body.indexOf("<", tagEnd + 1);
  return textEnd < 0 ? null : body.slice(tagEnd + 1, textEnd);
}

// Extract the declared text + surround + colour-bar channels from a (validated)
// entviz SVG. Returns null if it has no entviz cells. Mirrors the extraction in
// describe-consistency.test.ts; fed only post-validation, and any extraction slip
// is caught by the gestalt self-consistency check below (it would not match).
function parseEntvizSvg(svg: string): ParsedSvg | null {
  const chunks = svg.split('<g data-channel="cell"');
  if (chunks.length < 2) return null;
  const cells = chunks.slice(1).map((chunk) => {
    const body = chunk.split("data-channel=")[0];
    const tag = body.slice(0, body.indexOf(">"));
    const idx = tag.match(/data-cell-index="(\d+)"/);
    const blank = /data-cell-blank="true"/.test(tag);
    const surround = tag.match(/data-surround-bits="0x([0-9a-f]+)"/);
    return {
      index: idx ? Number(idx[1]) : -1,
      blank,
      text: cellText(body),
      surroundBits: surround ? parseInt(surround[1], 16) : 0,
    };
  });
  if (cells.some((c) => c.index < 0)) return null;
  const filled = cells
    .filter((c) => !c.blank && c.text !== null)
    .sort((a, b) => a.index - b.index)
    .map((c) => ({ text: c.text as string, surroundBits: c.surroundBits }));
  if (!filled.length) return null;
  const colorBarLetters = [...svg.matchAll(/data-color-bar-band="([WGRBK])"/g)].map((m) =>
    m[1].toLowerCase(),
  );
  return { truncated: /data-truncated="true"/.test(svg), filled, colorBarLetters };
}

/**
 * SVG engine: compare a pasted reference entviz against the user's `value`.
 * `unknown` if the reference isn't a closed-profile entviz, is unreadable, or is
 * >512-bit; `different` on any text-channel mismatch; `identical` only when the
 * lossless text channel AND the recomputed gestalt (surround bits + colour-bar
 * letters) both agree.
 */
// Any real entviz SVG is a few KB (a >512-bit one well under this); a larger
// paste is pathological, so cap it (anti-DoS on untrusted input) → unknown.
const MAX_SVG_CHARS = 1_000_000;

export function compareSvg(referenceSvg: string, value: string, opts: RenderOptions = {}): Verdict {
  if (referenceSvg.length > MAX_SVG_CHARS) {
    return { state: "unknown", reason: "the reference is too large to read safely" };
  }
  if (!validateClosedProfile(referenceSvg)) {
    return { state: "unknown", reason: "the reference is not a closed-profile entviz" };
  }
  const ref = parseEntvizSvg(referenceSvg);
  if (!ref) return { state: "unknown", reason: "could not read the reference entviz" };

  const me = describeChannels(value, opts);
  const myFilled = me.cells.filter((c) => !c.blank);

  const refText = ref.filled.map((f) => f.text).join(" ");
  const myText = myFilled.map((c) => c.text as string).join(" ");
  if (refText !== myText) return { state: "different" };

  // The text channels agree. It is only lossless ≤512 bits, so a >512-bit input
  // (either side) cannot be machine-certified identical from text — route to walk.
  if (ref.truncated || me.truncated) {
    return { state: "unknown", reason: ">512-bit input: the text channel is not lossless" };
  }

  // Same value ⇒ same fingerprint-driven gestalt. Recompute it (don't trust the
  // SVG's data-*) and require the geometry-independent channels to match.
  const surroundOk =
    ref.filled.length === myFilled.length &&
    ref.filled.every((f, i) => f.surroundBits === myFilled[i].surroundBits);
  const barsOk = ref.colorBarLetters.join("") === me.colorBarLetters.join("");
  return surroundOk && barsOk
    ? { state: "identical" }
    : { state: "unknown", reason: "the reference's pattern is inconsistent with its text" };
}

// ---------------------------------------------------------------------------
// Raster engine (§6.3): a raster (screenshot/photo/exported PNG) can NEVER reach
// `identical` — colour and text are unbound in an attacker-authored image and we
// do not OCR. It is disprove-only: a clear pixel difference between the reference
// image and our own render of the value is `different`; a degraded/misaligned
// image, or a look-alike match (which authenticates nothing), is `unknown`. A
// passed fidelity probe licenses disproof, not authentication. Takes already-
// decoded RGBA so core stays isomorphic (the canvas decode is the caller's job).
// ---------------------------------------------------------------------------

export interface Raster {
  rgba: Uint8ClampedArray;
  w: number;
  h: number;
}

const nearColor = (r: number, g: number, b: number, t: number, tol: number): boolean =>
  Math.abs(r - t) <= tol && Math.abs(g - t) <= tol && Math.abs(b - t) <= tol;

// A clean entviz raster's outer ring is the #808080 border over a #ffffff ground
// (or white export margin). If the edge ring isn't predominantly that frame
// colour, the image is a photo / crop / screenshot we can't trust to disprove on.
export function rasterFidelityProbe(rgba: Uint8ClampedArray, w: number, h: number): boolean {
  if (w < 2 || h < 2) return false;
  const isFrame = (x: number, y: number): boolean => {
    const i = (y * w + x) * 4;
    const [r, g, b] = [rgba[i], rgba[i + 1], rgba[i + 2]];
    return nearColor(r, g, b, 0x80, 40) || nearColor(r, g, b, 0xff, 24);
  };
  const step = Math.max(1, Math.floor(Math.min(w, h) / 16));
  let frame = 0;
  let total = 0;
  for (let x = 0; x < w; x += step) {
    for (const y of [0, h - 1]) { total++; if (isFrame(x, y)) frame++; }
  }
  for (let y = 0; y < h; y += step) {
    for (const x of [0, w - 1]) { total++; if (isFrame(x, y)) frame++; }
  }
  return frame / total >= 0.6;
}

// Fraction of pixels differing beyond a per-channel tolerance (absorbs
// anti-aliasing / mild compression without masking a real visual difference).
function pixelDiffFraction(a: Uint8ClampedArray, b: Uint8ClampedArray, n: number): number {
  let diff = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (
      Math.abs(a[o] - b[o]) > 40 ||
      Math.abs(a[o + 1] - b[o + 1]) > 40 ||
      Math.abs(a[o + 2] - b[o + 2]) > 40
    ) {
      diff++;
    }
  }
  return diff / n;
}

/**
 * Raster engine: compare a decoded reference image against OUR own render of the
 * value (the caller rasterizes `render(value)` at the reference's pixel size).
 * `different` on a clear pixel difference; `unknown` on a size mismatch, a
 * degraded/misaligned image, or a look-alike — NEVER `identical`.
 */
export function rasterDisprove(reference: Raster, ours: Raster): Verdict {
  if (reference.w !== ours.w || reference.h !== ours.h) {
    return { state: "unknown", reason: "the reference image is a different size — cannot align it for comparison" };
  }
  if (!rasterFidelityProbe(reference.rgba, reference.w, reference.h)) {
    return { state: "unknown", reason: "the reference image is degraded or not a clean entviz raster" };
  }
  const frac = pixelDiffFraction(reference.rgba, ours.rgba, reference.w * reference.h);
  return frac > 0.02
    ? { state: "different" }
    : { state: "unknown", reason: "the images look alike, but an image cannot prove two values are equal" };
}

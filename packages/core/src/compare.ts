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
import { classifyInput } from "./entviz.ts";
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
 * Text engine (§6.1): compare two values at the value level. Definitive —
 * `identical` iff they normalize to the same identity (⇒ identical entvizes),
 * else `different`.
 */
export function compareValues(a: string, b: string): Verdict {
  return identityKey(a) === identityKey(b) ? { state: "identical" } : { state: "different" };
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

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compareValues,
  compareComparisonText,
  compareSvg,
  validateClosedProfile,
  detectMedium,
} from "../../src/compare.ts";
import { comparisonText } from "../../src/describe.ts";
import { render } from "../../src/entviz.ts";

const UUID = "550e8400-e29b-41d4-a716-446655440000";
const BIG = "0123456789abcdef".repeat(16); // >512 bits → truncated

// --- compareValues (text engine) ------------------------------------------

test("compareValues: identical values verdict `identical`", () => {
  assert.deepEqual(compareValues(UUID, UUID), { state: "identical" });
  assert.deepEqual(compareValues("0123456789abcdef", "0123456789abcdef"), { state: "identical" });
});

test("compareValues: spec normalization makes case/prefix variants identical", () => {
  // hex is case-folded
  assert.equal(compareValues("ABCDEF", "abcdef").state, "identical");
  // URN scheme + NID are case-insensitive (lowercased); NSS preserved
  assert.equal(compareValues("URN:ISBN:0451450523", "urn:isbn:0451450523").state, "identical");
});

test("compareValues: different values verdict `different`", () => {
  assert.deepEqual(compareValues(UUID, "0123456789abcdef"), { state: "different" });
  assert.equal(compareValues("urn:isbn:0451450523", "urn:issn:0451450523").state, "different");
  // NSS case IS significant (preserved), so these differ
  assert.equal(compareValues("urn:isbn:abc", "urn:isbn:ABC").state, "different");
});

test("compareValues: a presentation prefix (0x) is normalized away → identical", () => {
  // spec.md §presentation (:215/:220): "0x" is hex *notation* — it shows only in
  // the label and enters NEITHER the cells NOR the fingerprint (prefixSemantic
  // false). So 0x-prefixed and bare hex of the same value render the same entviz
  // IDENTITY and must compare identical (matching compareSvg, which never reads
  // the label). Regression: the text engine used to keep the 0x in identityKey
  // and report `different`.
  const bare = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdeF";
  assert.equal(compareValues(bare, "0x" + bare).state, "identical");
  assert.equal(compareValues("0x" + bare, bare).state, "identical");
});

test("compareValues: a SEMANTIC prefix still distinguishes identity", () => {
  // A bound prefix (DID method / URN NID — prefixSemantic true) IS folded into
  // the fingerprint, so it is a genuinely different entviz and must stay distinct.
  // (Guards the fix above from over-reaching.)
  const uuid = "550e8400-e29b-41d4-a716-446655440000";
  assert.equal(compareValues(uuid, "urn:uuid:" + uuid).state, "different");
  assert.equal(compareValues("did:key:z6Mksample", "did:web:z6Mksample").state, "different");
});

test("compareValues: UUID delimiter/brace/case variants are identical (normalized core)", () => {
  // Hyphens and {} are punctuation, normalized away in classifyInput — every
  // form folds to the same core, so all compare identical. (Lock-in: a future
  // normalization change must not silently split these.)
  const canonical = "550e8400-e29b-41d4-a716-446655440000";
  for (const v of [
    "550e8400e29b41d4a716446655440000", // no hyphens (32 hex)
    "{550e8400-e29b-41d4-a716-446655440000}", // braced
    "{550e8400e29b41d4a716446655440000}", // braced, no hyphens
    "550E8400-E29B-41D4-A716-446655440000", // uppercase
  ]) {
    assert.equal(compareValues(canonical, v).state, "identical", v);
  }
});

test("compareValues: an unclassifiable input fails closed to `unknown`, never throws", () => {
  // Regression: editing a reference into a value classifyInput rejects (e.g. an
  // ETH address whose EIP-55 case checksum breaks when a hex digit's case is
  // flipped) must NOT throw — a thrown classification error in the React render
  // path blanked the whole page. It is `unknown` (couldn't read it), distinct
  // from `different`, per the fail-closed verdict discipline (§3/§6.3).
  const ETH = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed"; // valid EIP-55
  const ETH_BAD = "0x5Aaeb6053F3E94C9b9A09f33669435E7Ef1BeAed"; // case-flipped → bad checksum
  assert.doesNotThrow(() => compareValues(UUID, ETH_BAD));
  assert.equal(compareValues(UUID, ETH_BAD).state, "unknown");
  assert.equal(compareValues(ETH_BAD, UUID).state, "unknown"); // either side
  assert.equal(compareValues(UUID, ETH).state, "different"); // the valid address still classifies
});

// --- compareComparisonText ------------------------------------------------

test("compareComparisonText: a matching ≤512-bit readout is `identical`", () => {
  const ref = comparisonText(UUID);
  assert.deepEqual(compareComparisonText(ref, UUID), { state: "identical" });
  // whitespace in the transcription is normalised away
  assert.deepEqual(compareComparisonText(`  ${ref.replace(/ /g, "   ")}  `, UUID), { state: "identical" });
});

test("compareComparisonText: a mismatch is `different`", () => {
  assert.deepEqual(compareComparisonText("000000 111111", UUID), { state: "different" });
});

test("compareComparisonText: a matching >512-bit readout is `unknown` (not a full proof)", () => {
  const ref = comparisonText(BIG);
  const v = compareComparisonText(ref, BIG);
  assert.equal(v.state, "unknown");
});

// --- detectMedium (fail-closed) -------------------------------------------

test("detectMedium: SVG forms", () => {
  assert.equal(detectMedium('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), "svg");
  assert.equal(detectMedium('<?xml version="1.0"?><svg></svg>'), "svg");
  assert.equal(detectMedium("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="), "svg");
});

test("detectMedium: raster data URLs", () => {
  assert.equal(detectMedium("data:image/png;base64,iVBORw0KGgo="), "raster");
  assert.equal(detectMedium("data:image/jpeg;base64,/9j/4AAQ"), "raster");
});

test("detectMedium: plain values are `text`", () => {
  assert.equal(detectMedium("550e8400-e29b-41d4-a716-446655440000"), "text");
  assert.equal(detectMedium("0123456789abcdef"), "text");
});

test("detectMedium: fails closed on ambiguity", () => {
  assert.equal(detectMedium("   "), "ambiguous"); // empty
  assert.equal(detectMedium("<html><body>nope</body></html>"), "ambiguous"); // markup, not entviz svg
  assert.equal(detectMedium("https://example.com/key.svg"), "ambiguous"); // a URL
  assert.equal(detectMedium("data:text/plain,hello"), "ambiguous"); // some other data URL
});

// --- validateClosedProfile ------------------------------------------------

test("validateClosedProfile: accepts a real entviz, rejects anything that could repaint it", () => {
  assert.equal(validateClosedProfile(render(UUID)), true);
  const base = render(UUID);
  assert.equal(validateClosedProfile(base.replace("</svg>", "<script>x()</script></svg>")), false);
  assert.equal(validateClosedProfile(base.replace("<rect", '<rect onload="x()"')), false);
  assert.equal(validateClosedProfile(base.replace("<rect", '<rect style="fill:url(http://e/x)"')), false);
  assert.equal(validateClosedProfile(base.replace("</svg>", "<image href='http://e/x.png'/></svg>")), false);
  assert.equal(validateClosedProfile(base.replace("</defs>", "<style>@font-face{}</style></defs>")), false);
  // comments/CDATA aren't in a conformant entviz → fail closed (no strip-and-rescan)
  assert.equal(validateClosedProfile(base.replace("<rect", "<!-- hi --><rect")), false);
  assert.equal(validateClosedProfile(base.replace("<rect", "<![CDATA[x]]><rect")), false);
  // a local url(#fragment) clip is fine (and is what the entviz itself uses)
  assert.ok(/url\(#/.test(base));
});

// --- compareSvg (SVG engine) ----------------------------------------------

test("compareSvg: a faithful entviz of the same value is `identical`", () => {
  assert.deepEqual(compareSvg(render(UUID), UUID), { state: "identical" });
  // a value whose grid has blank cells (exercises blank-cell parsing)
  assert.deepEqual(compareSvg(render("012345"), "012345"), { state: "identical" });
});

test("compareSvg: an oversized reference is `unknown` (anti-DoS)", () => {
  assert.equal(compareSvg("<svg>" + " ".repeat(1_000_001) + "</svg>", UUID).state, "unknown");
});

test("compareSvg: identity is geometry-independent (different ar/font still identical)", () => {
  const ref = render(UUID, { targetAr: 2.0, fontSizePt: 20 });
  assert.deepEqual(compareSvg(ref, UUID, {}), { state: "identical" });
});

test("compareSvg: an entviz of a different value is `different`", () => {
  assert.deepEqual(compareSvg(render(UUID), "0123456789abcdef"), { state: "different" });
});

test("compareSvg: a non-closed-profile reference is `unknown` (not different)", () => {
  const tampered = render(UUID).replace("</svg>", "<script/></svg>");
  assert.equal(compareSvg(tampered, UUID).state, "unknown");
});

test("compareSvg: a non-entviz SVG is `unknown`", () => {
  assert.equal(compareSvg("<svg></svg>", UUID).state, "unknown");
});

test("compareSvg: a >512-bit reference can never be `identical`", () => {
  assert.equal(compareSvg(render(BIG), BIG).state, "unknown");
});

test("compareSvg: a >512-bit self-SVG (text + hash gestalt match) is a `similar` hash-precision match", () => {
  // Comparing a >512-bit value's own SVG to itself: not machine-`identical` (the
  // text channel isn't lossless past 512 bits), but text AND the hash-derived
  // gestalt (surround bits + color-bar letters) both match — forging that needs a
  // hash collision. So it's a `similar` (walk-to-confirm) verdict, not a flat
  // couldn't-confirm — the reason names the hash-precision limit.
  const v = compareSvg(render(BIG), BIG);
  assert.equal(v.state, "unknown");
  assert.equal(v.state === "unknown" && v.similar, true);
  assert.match((v as { reason: string }).reason, /hash/i);
});

test("compareSvg: a >512-bit reference whose text matches but gestalt differs is a plain `unknown` (not `similar`)", () => {
  // Tamper a surround-bits pattern on a >512-bit reference: text still matches, but
  // the hash gestalt no longer does → we must NOT claim a hash-precision match, and
  // must NOT manufacture `different` from an untrusted reference (§6.3).
  const forged = render(BIG).replace(/data-surround-bits="0x[0-9a-f]+"/, 'data-surround-bits="0x1"');
  const v = compareSvg(forged, BIG);
  assert.equal(v.state, "unknown");
  assert.equal(v.state === "unknown" && !!v.similar, false);
});

test("compareSvg: text matches but a forged gestalt is `unknown`, not identical", () => {
  // same text channel, but tamper a surround-bits pattern → self-consistency fails
  const forgedSurround = render(UUID).replace(/data-surround-bits="0x[0-9a-f]+"/, 'data-surround-bits="0x1"');
  assert.equal(compareSvg(forgedSurround, UUID).state, "unknown");
  // same text + surround, but tamper a color-bar band letter → still unknown
  const forgedBar = render(UUID).replace(/data-color-bar-band="(\w)"/, (_m, l) => `data-color-bar-band="${l === "W" ? "K" : "W"}"`);
  assert.equal(compareSvg(forgedBar, UUID).state, "unknown");
});

// (The raster engine's tests live in raster-compare.test.ts — §6.3.)

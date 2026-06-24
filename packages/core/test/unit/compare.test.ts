import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compareValues,
  compareComparisonText,
  detectMedium,
} from "../../src/compare.ts";
import { comparisonText } from "../../src/describe.ts";

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

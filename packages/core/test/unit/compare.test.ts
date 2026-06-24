import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compareValues,
  compareComparisonText,
  compareSvg,
  validateClosedProfile,
  detectMedium,
  rasterFidelityProbe,
  rasterDisprove,
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

test("compareSvg: text matches but a forged gestalt is `unknown`, not identical", () => {
  // same text channel, but tamper a surround-bits pattern → self-consistency fails
  const forgedSurround = render(UUID).replace(/data-surround-bits="0x[0-9a-f]+"/, 'data-surround-bits="0x1"');
  assert.equal(compareSvg(forgedSurround, UUID).state, "unknown");
  // same text + surround, but tamper a colour-bar band letter → still unknown
  const forgedBar = render(UUID).replace(/data-color-bar-band="(\w)"/, (_m, l) => `data-color-bar-band="${l === "W" ? "K" : "W"}"`);
  assert.equal(compareSvg(forgedBar, UUID).state, "unknown");
});

// --- raster engine --------------------------------------------------------

// Build a synthetic raster: an outer ring of `edge`, interior of `fill` (RGB).
function raster(w: number, h: number, edge: [number, number, number], fill: [number, number, number]) {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const onEdge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      const [r, g, b] = onEdge ? edge : fill;
      rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = 255;
    }
  }
  return { rgba, w, h };
}

const GRAY: [number, number, number] = [0x80, 0x80, 0x80];
const WHITE: [number, number, number] = [0xff, 0xff, 0xff];
const RED: [number, number, number] = [0xff, 0, 0];
const BLACK: [number, number, number] = [0, 0, 0];

test("rasterFidelityProbe: a clean #808080/#ffffff frame passes; a coloured edge fails", () => {
  assert.equal(rasterFidelityProbe(raster(20, 20, GRAY, WHITE).rgba, 20, 20), true);
  assert.equal(rasterFidelityProbe(raster(20, 20, WHITE, RED).rgba, 20, 20), true); // white margin
  assert.equal(rasterFidelityProbe(raster(20, 20, RED, WHITE).rgba, 20, 20), false); // photo-ish edge
  assert.equal(rasterFidelityProbe(new Uint8ClampedArray(4), 1, 1), false); // too small
});

test("rasterDisprove: never identical — different on a clear pixel difference", () => {
  const ref = raster(20, 20, GRAY, WHITE);
  const ours = raster(20, 20, GRAY, BLACK); // interiors differ everywhere
  assert.deepEqual(rasterDisprove(ref, ours), { state: "different" });
});

test("rasterDisprove: a look-alike is unknown (an image cannot authenticate)", () => {
  const a = raster(20, 20, GRAY, WHITE);
  const b = raster(20, 20, GRAY, WHITE);
  assert.equal(rasterDisprove(a, b).state, "unknown");
});

test("rasterDisprove: a size mismatch or a degraded image is unknown", () => {
  assert.equal(rasterDisprove(raster(20, 20, GRAY, WHITE), raster(24, 24, GRAY, WHITE)).state, "unknown");
  assert.equal(rasterDisprove(raster(20, 20, RED, WHITE), raster(20, 20, GRAY, WHITE)).state, "unknown");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  POSSIBLE_EDGE_COLORS,
  blankMapMarkerColors,
  oklabLightness,
  hexToRgb,
} from "../../src/entviz.ts";

// PSY-JS-F1: the palette and map-marker colors are tuned for color-vision-
// deficiency (CVD) discriminability (see the Python reference's
// test_v6_palette_lightness.py and docs/spec.md). There was no JS guard, so any
// palette edit could silently regress the spec's CVD guarantee. This pins the
// exact values (so a change is a deliberate, reviewed event) and asserts the
// lightness separations the design relies on. A full Machado CVD simulation is
// a follow-on; value-pinning + lightness is the regression floor.

const L = (hex: string) => oklabLightness(...(hexToRgb(hex) as [number, number, number]));

test("palette: the five edge/background colors are pinned to their CVD-tuned values", () => {
  assert.deepEqual(POSSIBLE_EDGE_COLORS, [
    "#ffffff", // white
    "#e7be00", // gold
    "#ff3f2f", // red
    "#2f3fbf", // blue
    "#000000", // black (edge-only; never the background)
  ]);
});

test("palette: lightness is monotone at the extremes (white lightest, black darkest)", () => {
  const lightness = POSSIBLE_EDGE_COLORS.map(L);
  assert.equal(Math.max(...lightness), L("#ffffff"));
  assert.equal(Math.min(...lightness), L("#000000"));
});

test("palette: the four background-eligible colors are mutually lightness-separated", () => {
  // White / gold / red / blue must not collapse to the same lightness, or they
  // become indistinguishable under achromatopsia (total color blindness).
  const bgEligible = POSSIBLE_EDGE_COLORS.slice(0, 4).map(L).sort((a, b) => a - b);
  for (let i = 1; i < bgEligible.length; i++) {
    assert.ok(
      bgEligible[i] - bgEligible[i - 1] > 0.05,
      `adjacent palette lightnesses too close: ${bgEligible[i - 1]} vs ${bgEligible[i]}`,
    );
  }
});

test("map markers: min/max colors are pinned and lightness-distinguishable", () => {
  const { minColor, maxColor } = blankMapMarkerColors(false, undefined);
  assert.equal(minColor, "#1d4ed8"); // blue dot (min)
  assert.equal(maxColor, "#d62828"); // red plus (max)
  // Shape carries the semantic (plus vs dot); color is the secondary cue. Guard
  // against the two markers drifting to the same lightness.
  assert.ok(Math.abs(L(minColor) - L(maxColor)) > 0.03);
});

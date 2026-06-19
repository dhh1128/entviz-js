import { test } from "node:test";
import assert from "node:assert/strict";
import {
  oklabLightness,
  nucleusColors,
  hexToRgb,
  weightedRgbDistance,
  closestPaletteColor,
  selectVisualStyle,
  POSSIBLE_EDGE_COLORS,
  type Token,
} from "../../src/entviz.ts";

test("oklabLightness: black ~0, white ~1, monotone", () => {
  assert.ok(oklabLightness(0, 0, 0) < 0.01);
  assert.ok(oklabLightness(255, 255, 255) > 0.99);
  assert.ok(oklabLightness(200, 200, 200) > oklabLightness(50, 50, 50));
});

test("nucleusColors: CSS RGB byte order + Oklab fg pick (both sides)", () => {
  const [bg, fg] = nucleusColors(0x452301); // r=01 g=23 b=45
  assert.equal(bg, "#012345");
  assert.equal(fg, "#ffffff"); // dark bg -> white text
  const [bg2, fg2] = nucleusColors(0xffffff);
  assert.equal(bg2, "#ffffff");
  assert.equal(fg2, "#000000"); // light bg -> black text
});

test("hexToRgb parses #rrggbb", () => {
  assert.deepEqual(hexToRgb("#0a141e"), [10, 20, 30]);
});

test("weightedRgbDistance: zero to self, weights green highest", () => {
  assert.equal(weightedRgbDistance("#000000", "#000000"), 0);
  const dg = weightedRgbDistance("#000000", "#00ff00"); // green weight 4
  const dr = weightedRgbDistance("#000000", "#ff0000"); // red weight 2
  const db = weightedRgbDistance("#000000", "#0000ff"); // blue weight 3
  assert.ok(dg > db && db > dr); // green > blue > red
});

test("closestPaletteColor returns the nearest palette entry", () => {
  const palette = ["#ffffff", "#000000"];
  assert.equal(closestPaletteColor("#101010", palette), "#000000");
  assert.equal(closestPaletteColor("#eeeeee", palette), "#ffffff");
});

const med = (quant: number): Token => ({ text: "x", index: 0, quant });

test("selectVisualStyle: low 2 bits pick the bg; the other 4 are edge palette", () => {
  for (let idx = 0; idx < 4; idx++) {
    const style = selectVisualStyle(med(idx));
    assert.equal(style.bgColor, POSSIBLE_EDGE_COLORS[idx]);
    assert.equal(style.edgeColors.length, 4);
    assert.ok(!style.edgeColors.includes(style.bgColor));
    // black (#000000) is never the bg, so it is always in the edge palette.
    assert.ok(style.edgeColors.includes("#000000"));
  }
});

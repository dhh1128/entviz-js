import { test } from "node:test";
import assert from "node:assert/strict";
import { locateFrame, near, pixelAt, type Raster } from "../../src/raster-compare.ts";

// --- a tiny synthetic rasterizer (test fixtures; real rasters come from the
// browser canvas in the React layer) -------------------------------------------
type RGB = [number, number, number];
const GRAY: RGB = [128, 128, 128];
const WHITE: RGB = [255, 255, 255];
const RED: RGB = [200, 40, 40];

function blank(w: number, h: number, rgb: RGB = WHITE): Raster {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = rgb[0]; rgba[i * 4 + 1] = rgb[1]; rgba[i * 4 + 2] = rgb[2]; rgba[i * 4 + 3] = 255;
  }
  return { rgba, w, h };
}
function setPx(r: Raster, x: number, y: number, rgb: RGB): void {
  if (x < 0 || y < 0 || x >= r.w || y >= r.h) return;
  const i = (y * r.w + x) * 4;
  r.rgba[i] = rgb[0]; r.rgba[i + 1] = rgb[1]; r.rgba[i + 2] = rgb[2]; r.rgba[i + 3] = 255;
}
function fillRect(r: Raster, x0: number, y0: number, x1: number, y1: number, rgb: RGB): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) setPx(r, x, y, rgb);
}
function hLine(r: Raster, x0: number, x1: number, y: number, rgb: RGB): void {
  for (let x = x0; x <= x1; x++) setPx(r, x, y, rgb);
}
function vLine(r: Raster, x: number, y0: number, y1: number, rgb: RGB): void {
  for (let y = y0; y <= y1; y++) setPx(r, x, y, rgb);
}
// A clean entviz-ish frame: white interior with a 1px gray border rectangle.
function framed(w: number, h: number, box: { x0: number; y0: number; x1: number; y1: number }, bg: RGB = WHITE): Raster {
  const r = blank(w, h, bg);
  fillRect(r, box.x0, box.y0, box.x1, box.y1, WHITE); // white interior (label strip incl.)
  hLine(r, box.x0, box.x1, box.y0, GRAY);
  hLine(r, box.x0, box.x1, box.y1, GRAY);
  vLine(r, box.x0, box.y0, box.y1, GRAY);
  vLine(r, box.x1, box.y0, box.y1, GRAY);
  return r;
}

// --- pixel primitives ----------------------------------------------------------

test("pixelAt clamps out-of-bounds coordinates into the image", () => {
  const r = blank(3, 3, RED);
  setPx(r, 0, 0, GRAY);
  assert.deepEqual(pixelAt(r, -5, -5), GRAY); // clamps to (0,0)
  assert.deepEqual(pixelAt(r, 99, 99), RED); // clamps to (2,2)
});

test("near: per-channel tolerance", () => {
  assert.equal(near([128, 128, 128], [128, 128, 128], 0), true);
  assert.equal(near([150, 110, 128], [128, 128, 128], 40), true);
  assert.equal(near([128, 128, 200], [128, 128, 128], 40), false);
});

// --- locateFrame ---------------------------------------------------------------

test("finds a clean frame at its exact pixel coordinates", () => {
  const box = { x0: 10, y0: 8, x1: 180, y1: 130 };
  assert.deepEqual(locateFrame(framed(200, 150, box)), box);
});

test("finds an entviz embedded in a screenshot (non-white surroundings)", () => {
  const box = { x0: 40, y0: 30, x1: 210, y1: 170 };
  assert.deepEqual(locateFrame(framed(300, 220, box, RED)), box);
});

test("skips a stray gray line above the real frame", () => {
  const box = { x0: 20, y0: 40, x1: 180, y1: 140 };
  const r = framed(220, 170, box);
  hLine(r, 10, 200, 6, GRAY); // a full-width 1px gray line — not a rectangle
  assert.deepEqual(locateFrame(r), box);
});

test("no frame → null (nothing gray)", () => {
  assert.equal(locateFrame(blank(120, 90, RED)), null);
});

test("an image smaller than the minimum frame → null", () => {
  assert.equal(locateFrame(blank(10, 10)), null);
});

test("a gray blob narrower than the minimum is not a frame", () => {
  const r = blank(120, 90);
  fillRect(r, 55, 20, 62, 70, GRAY); // ~8px wide → below MIN_FRAME_PX
  assert.equal(locateFrame(r), null);
});

test("a rectangle whose bottom edge is missing is rejected", () => {
  const box = { x0: 20, y0: 20, x1: 160, y1: 120 };
  const r = blank(200, 150);
  hLine(r, box.x0, box.x1, box.y0, GRAY); // top
  vLine(r, box.x0, box.y0, box.y1, GRAY); // left
  vLine(r, box.x1, box.y0, box.y1, GRAY); // right — but NO bottom
  assert.equal(locateFrame(r), null);
});

test("mismatched side heights (not a clean rectangle) are rejected", () => {
  const r = blank(200, 160);
  const x0 = 20, x1 = 170, top = 20;
  hLine(r, x0, x1, top, GRAY);
  vLine(r, x0, top, 140, GRAY); // left edge tall
  vLine(r, x1, top, 60, GRAY); // right edge short (Δ ≫ 2)
  assert.equal(locateFrame(r), null);
});

test("a gray rectangle with a dark interior (no white strip) is rejected", () => {
  const box = { x0: 20, y0: 20, x1: 170, y1: 130 };
  const r = blank(200, 160);
  fillRect(r, box.x0, box.y0, box.x1, box.y1, [10, 10, 10]); // dark interior
  hLine(r, box.x0, box.x1, box.y0, GRAY);
  hLine(r, box.x0, box.x1, box.y1, GRAY);
  vLine(r, box.x0, box.y0, box.y1, GRAY);
  vLine(r, box.x1, box.y0, box.y1, GRAY);
  assert.equal(locateFrame(r), null);
});

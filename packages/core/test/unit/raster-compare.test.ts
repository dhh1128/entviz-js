import { test } from "node:test";
import assert from "node:assert/strict";
import { locateFrame, near, pixelAt, rasterCompare, type Raster } from "../../src/raster-compare.ts";
import { describeChannels, hexToRgb, type RenderOptions } from "../../src/entviz.ts";

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

// --- rasterCompare: a faithful synthetic entviz painted from the render model ---
// (real browser rasters, with anti-aliasing, are exercised by the calibration
// slice; this proves the locate→scale→map→sample→verdict chain deterministically.)
function paintEntviz(value: string, opts: RenderOptions, scale: number, pad: number): Raster {
  const model = describeChannels(value, opts);
  const [, , bw, bh] = model.geometry.viewBox.split(/\s+/).map(Number);
  const fx0 = pad, fy0 = pad;
  const fx1 = pad + Math.round((bw - 1) * scale);
  const fy1 = pad + Math.round((bh - 1) * scale);
  const r = blank(fx1 + pad + 1, fy1 + pad + 1, WHITE);
  const px = (vx: number) => Math.round(fx0 + (vx - 0.5) * scale);
  const py = (vy: number) => Math.round(fy0 + (vy - 0.5) * scale);
  // grid background (leaves the top label strip + left gutter white)
  const g = model.geometry.gridRect;
  fillRect(r, px(g.x), py(g.y), px(g.x + g.w), py(g.y + g.h), hexToRgb(model.bgColor) as RGB);
  // nuclei at their true colors
  for (const c of model.cells) {
    if (c.blank) continue;
    const rect = model.geometry.cellRects[c.index];
    fillRect(r, px(rect.x), py(rect.y), px(rect.x + rect.w), py(rect.y + rect.h), hexToRgb(c.nucleusColor as string) as RGB);
  }
  // the #808080 frame, painted last so its edges stay crisp
  hLine(r, fx0, fx1, fy0, GRAY); hLine(r, fx0, fx1, fy1, GRAY);
  vLine(r, fx0, fy0, fy1, GRAY); vLine(r, fx1, fy0, fy1, GRAY);
  return r;
}

const UUID_A = "550e8400-e29b-41d4-a716-446655440000";
const UUID_B = "ffffffff-ffff-4fff-afff-ffffffffffff"; // same shape, wholly different content

test("rasterCompare: a faithful raster of the same value → no visible difference (never identical)", () => {
  const v = rasterCompare(paintEntviz(UUID_A, {}, 3, 20), UUID_A);
  assert.equal(v.state, "unknown");
  assert.equal((v as { similar?: boolean }).similar, true);
});

test("rasterCompare: a different value of the same shape → different", () => {
  assert.deepEqual(rasterCompare(paintEntviz(UUID_A, {}, 3, 20), UUID_B), { state: "different" });
});

test("rasterCompare: a reference that differs only by a note still matches (note excluded)", () => {
  const withNote = paintEntviz(UUID_A, { note: "git" }, 3, 20); // taller: a bottom strip
  const v = rasterCompare(withNote, UUID_A); // our model has no note
  assert.equal(v.state, "unknown");
  assert.equal((v as { similar?: boolean }).similar, true);
});

test("rasterCompare: a different grid shape → unknown (phase-1 same-shape requirement)", () => {
  const v = rasterCompare(paintEntviz(UUID_A, { targetAr: 2.5 }, 3, 20), UUID_A, { targetAr: 0.4 });
  assert.equal(v.state, "unknown");
  assert.match((v as { reason: string }).reason, /different shape/);
});

test("rasterCompare: too small to sample reliably → unknown", () => {
  const v = rasterCompare(paintEntviz(UUID_A, {}, 0.25, 20), UUID_A);
  assert.equal(v.state, "unknown");
  assert.match((v as { reason: string }).reason, /too small/);
});

test("rasterCompare: no entviz in the image → unknown", () => {
  const v = rasterCompare(blank(120, 90, RED), UUID_A);
  assert.equal(v.state, "unknown");
  assert.match((v as { reason: string }).reason, /couldn't find/);
});

test("rasterCompare: a frame is found but our value won't render → unknown", () => {
  // a valid frame, but an over-cap value makes describeChannels throw
  const framedRaster = framed(200, 150, { x0: 10, y0: 8, x1: 180, y1: 130 });
  const v = rasterCompare(framedRaster, "!".repeat(65537));
  assert.equal(v.state, "unknown");
  assert.match((v as { reason: string }).reason, /couldn't render/);
});

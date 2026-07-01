/**
 * raster-compare — the geometry-anchored raster comparison engine (M3),
 * pinned by comparison-design.md §6.3.
 *
 * Pure and isomorphic: it operates on already-decoded RGBA (the React layer does
 * the canvas decode) plus the render model from describeChannels. It NEVER
 * rasterizes our own SVG; instead it locates the entviz in the (possibly
 * screenshot) image, maps the model's predicted geometry onto the image pixels,
 * and samples each feature's expected color. Disprove-only: it can reach
 * `different` (a predicted color is wrong) or `unknown` (couldn't analyze / no
 * visible difference — text unread), NEVER `identical` (§6.3 / S10).
 *
 * This module is built in slices; slice 1 is the frame locator (this file).
 */
import { type Raster } from "./compare.ts";

export type { Raster };

// The entviz's outer frame is a thin #808080 line over a white bounding fill; the
// top label strip just inside the top edge is white. Tolerances absorb mild
// anti-aliasing / compression (to be tightened by the §6.3 calibration test).
const FRAME_RGB: RGB = [0x80, 0x80, 0x80];
const WHITE_RGB: RGB = [0xff, 0xff, 0xff];
const GRAY_TOL = 40;
const WHITE_TOL = 24;
// A candidate rectangle smaller than this (px, either axis) is noise, not an
// entviz frame — the real minimum-size gate (calibrated) lives in a later stage.
const MIN_FRAME_PX = 16;
// Fraction of an edge's pixels that must read as frame-gray for it to count as a
// border (absorbs a few AA/lossy pixels without accepting a broken rectangle).
const EDGE_FRAME_MIN = 0.8;
// Fraction of the band just below the top border that must be white (the label
// strip), sampled clear of the left-aligned type text.
const STRIP_WHITE_MIN = 0.6;

type RGB = [number, number, number];

/** RGB of the pixel at (x, y), clamped to the image bounds. */
export function pixelAt(r: Raster, x: number, y: number): RGB {
  const cx = x < 0 ? 0 : x >= r.w ? r.w - 1 : x;
  const cy = y < 0 ? 0 : y >= r.h ? r.h - 1 : y;
  const i = (cy * r.w + cx) * 4;
  return [r.rgba[i], r.rgba[i + 1], r.rgba[i + 2]];
}

/** True if `rgb` is within per-channel `tol` of the target color. */
export function near(rgb: RGB, target: RGB, tol: number): boolean {
  return (
    Math.abs(rgb[0] - target[0]) <= tol &&
    Math.abs(rgb[1] - target[1]) <= tol &&
    Math.abs(rgb[2] - target[2]) <= tol
  );
}

const isFrame = (r: Raster, x: number, y: number): boolean => near(pixelAt(r, x, y), FRAME_RGB, GRAY_TOL);
const isWhite = (r: Raster, x: number, y: number): boolean => near(pixelAt(r, x, y), WHITE_RGB, WHITE_TOL);

/** The located outer frame, in image pixel coordinates (inclusive edges). */
export interface FrameBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// Fraction of a horizontal (y fixed) or vertical (x fixed) edge that is frame-gray.
function edgeFrac(r: Raster, a: number, b: number, fixed: number, horizontal: boolean): number {
  let hit = 0;
  const n = b - a + 1;
  for (let t = a; t <= b; t++) {
    if (horizontal ? isFrame(r, t, fixed) : isFrame(r, fixed, t)) hit++;
  }
  return n > 0 ? hit / n : 0;
}

// Given a frame-gray pixel at (px, topY) taken to be on the top border, recover
// and validate the full rectangle: the top border's horizontal span, the two side
// borders down to a shared bottom, all four edges predominantly gray, and a white
// label strip just inside the top edge. Returns the box or null.
function tryRect(r: Raster, px: number, topY: number): FrameBox | null {
  let x0 = px;
  while (x0 > 0 && isFrame(r, x0 - 1, topY)) x0--;
  let x1 = px;
  while (x1 < r.w - 1 && isFrame(r, x1 + 1, topY)) x1++;
  if (x1 - x0 < MIN_FRAME_PX) return null;

  // Left edge sets the bottom; the right edge must reach the same row (± a pixel).
  let y1 = topY;
  while (y1 < r.h - 1 && isFrame(r, x0, y1 + 1)) y1++;
  if (y1 - topY < MIN_FRAME_PX) return null;
  let yr = topY;
  while (yr < r.h - 1 && isFrame(r, x1, yr + 1)) yr++;
  if (Math.abs(yr - y1) > 2) return null;

  // All four edges predominantly gray (a real rectangle, not a stray line/corner).
  if (
    edgeFrac(r, x0, x1, topY, true) < EDGE_FRAME_MIN ||
    edgeFrac(r, x0, x1, y1, true) < EDGE_FRAME_MIN ||
    edgeFrac(r, topY, y1, x0, false) < EDGE_FRAME_MIN ||
    edgeFrac(r, topY, y1, x1, false) < EDGE_FRAME_MIN
  ) {
    return null;
  }

  // White label strip just below the top border — sampled over the right ~half so
  // the left-aligned type text can't fail it.
  let white = 0;
  let n = 0;
  const y = Math.min(topY + 2, y1);
  for (let x = Math.round((x0 + x1) / 2); x <= x1 - 1; x++, n++) if (isWhite(r, x, y)) white++;
  if (n === 0 || white / n < STRIP_WHITE_MIN) return null;

  return { x0, y0: topY, x1, y1 };
}

/**
 * Best-effort: locate the entviz's outer #808080 frame in an arbitrary image
 * (§6.3 stage 1). Probes three vertical scan-lines (x = 25% / 50% / 75% of the
 * width); at each, it descends to every frame-gray run and tries to validate a
 * rectangle there, skipping runs that aren't a real frame (so surrounding
 * screenshot chrome is tolerated). Returns the first validated frame, or null if
 * none is found (→ the caller reports `unknown` and lets the human eye decide).
 */
export function locateFrame(r: Raster): FrameBox | null {
  if (r.w < MIN_FRAME_PX || r.h < MIN_FRAME_PX) return null;
  const probes = [0.25, 0.5, 0.75].map((f) => Math.min(r.w - 1, Math.max(0, Math.round(f * r.w))));
  for (const px of probes) {
    let y = 0;
    while (y < r.h) {
      while (y < r.h && !isFrame(r, px, y)) y++;
      if (y >= r.h) break;
      const box = tryRect(r, px, y);
      if (box) return box;
      while (y < r.h && isFrame(r, px, y)) y++; // skip this run, keep descending
    }
  }
  return null;
}

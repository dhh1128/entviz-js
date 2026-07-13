/**
 * raster-text — a crude, NO-OCR corroboration for the raster comparison path.
 *
 * The core `rasterCompare` engine (comparison-design §6.3) samples each nucleus's
 * FILL color and can reach `different`/`unknown·similar`, never `identical`. This
 * module adds a second, positive-only signal: does the glyph INK inside each
 * nucleus land in the same 2-D pattern as OUR render's? It is deliberately weak —
 * it can only STRENGTHEN a look-alike verdict's wording, never create `different`.
 *
 * Method (calibrated in apps/playground/src/calibrate-text.ts): inside each
 * nucleus there are only two colors — the fill and the glyph ink. Sample a fine
 * ink grid, coarsen to a soft 8×4 ink-FRACTION grid, NORMALIZE it to unit sum
 * (dividing out overall ink amount — the font-variable, non-discriminating part),
 * and L1-compare it to the same grid from our own SVG. The calibration finding:
 *   • typical high-entropy values: same-token ≤ ~0.43, different-token ≥ ~0.54
 *     across mono/serif/sans and 200–840px — a clean, FONT-ROBUST gap.
 *   • a degenerate low-diversity value (all-repeated glyphs) under a foreign font
 *     can push a SAME score up to ~0.60, overlapping different-token. BUT no
 *     different-token case ever scored below ~0.54.
 * So a LOW distance reliably means "same token" (zero false-positives in the
 * sweep), while a HIGH distance is ambiguous (different token OR degenerate+foreign
 * font). Hence: below the threshold ⇒ corroborate; otherwise ⇒ stay silent. We
 * never flip a verdict to `different` on this — that would false-flag the
 * degenerate matching case.
 *
 * This lives in @entviz/react (not core) because it needs a canvas to rasterize
 * OUR SVG; core stays isomorphic/pure. Ports that want it can port the algorithm.
 */
import { describeChannels, locateFrame, render, type Raster, type RenderOptions } from "@entviz/core";

type RGB = [number, number, number];
const hexRgb = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const near = (a: RGB, b: RGB, tol: number) => Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol && Math.abs(a[2] - b[2]) <= tol;
const pixel = (r: Raster, x: number, y: number): RGB => {
  const cx = x < 0 ? 0 : x >= r.w ? r.w - 1 : x | 0, cy = y < 0 ? 0 : y >= r.h ? r.h - 1 : y | 0;
  const i = (cy * r.w + cx) * 4;
  return [r.rgba[i], r.rgba[i + 1], r.rgba[i + 2]];
};

// Calibrated constants (calibrate-text.ts). INK_TOL: distance from the fill that
// counts as ink. GX×GY: fine sampling grid; BX×BY: the coarse ink-fraction grid we
// actually compare. TEXT_AGREE_MAX: the L1 threshold — comfortably below the ~0.54
// different-token floor, so a pass means "same token" with margin.
const INK_TOL = 60;
const GX = 24, GY = 12, BX = 8, BY = 4;
export const TEXT_AGREE_MAX = 0.45;

/** A cell's soft, unit-normalized 8×4 ink-fraction grid, sampled from `r` using an
 *  affine map (px,py) from the model's viewBox units to this raster's pixels. */
function inkVector(r: Raster, rect: { x: number; y: number; w: number; h: number }, fill: RGB, toPx: (v: number) => number, toPy: (v: number) => number): number[] {
  // Sample the central text band (clear of the nucleus border AA and corner marks).
  const x0 = rect.x + rect.w * 0.12, x1 = rect.x + rect.w * 0.88;
  const y0 = rect.y + rect.h * 0.22, y1 = rect.y + rect.h * 0.78;
  const fine: number[] = [];
  for (let gy = 0; gy < GY; gy++) for (let gx = 0; gx < GX; gx++) {
    const vx = x0 + ((gx + 0.5) / GX) * (x1 - x0), vy = y0 + ((gy + 0.5) / GY) * (y1 - y0);
    fine.push(near(pixel(r, toPx(vx), toPy(vy)), fill, INK_TOL) ? 0 : 1);
  }
  const grid: number[] = [];
  for (let by = 0; by < BY; by++) for (let bx = 0; bx < BX; bx++) {
    let sum = 0, n = 0;
    for (let y = (by * GY / BY) | 0; y < ((by + 1) * GY / BY) | 0; y++)
      for (let x = (bx * GX / BX) | 0; x < ((bx + 1) * GX / BX) | 0; x++) { sum += fine[y * GX + x]; n++; }
    grid.push(n ? sum / n : 0);
  }
  const total = grid.reduce((a, b) => a + b, 0) || 1;
  return grid.map((v) => v / total);
}

/** Rasterize an SVG string to RGBA on a white canvas (SSR/no-canvas → null). */
function svgToRaster(svg: string, targetW: number): Promise<Raster | null> {
  if (typeof document === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onerror = () => resolve(null);
    img.onload = () => {
      const w = targetW, h = Math.max(1, Math.round(targetW * ((img.naturalHeight || 1) / (img.naturalWidth || 1))));
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const ctx = c.getContext("2d");
      if (!ctx) return resolve(null);
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
      resolve({ rgba: ctx.getImageData(0, 0, w, h).data, w, h });
    };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
}

/**
 * Positive-only text corroboration for a raster look-alike. Given the decoded
 * reference raster (the one the color engine just called `unknown·similar`), our
 * value, and the shared render opts, returns true iff the crude per-nucleus ink
 * pattern also agrees (mean L1 < TEXT_AGREE_MAX). Any failure (no frame, no canvas,
 * decode error) resolves false — this only ever ADDS confidence, never removes it.
 */
export async function rasterTextConfirms(referenceRaster: Raster, value: string, opts: RenderOptions = {}): Promise<boolean> {
  const frame = locateFrame(referenceRaster);
  if (!frame) return false;
  let model;
  try { model = describeChannels(value, { ...opts, note: null }); } catch { return false; }
  const filled = model.cells.filter((c) => !c.blank);
  if (!filled.length) return false;
  const [, , boundingW] = model.geometry.viewBox.split(/\s+/).map(Number);

  // OUR render, rasterized clean: the viewBox maps linearly onto the canvas.
  const ours = await svgToRaster(render(value, { ...opts, note: null }), 480);
  if (!ours) return false;
  const oursScale = ours.w / boundingW;
  const oPx = (v: number) => v * oursScale, oPy = (v: number) => v * oursScale;

  // The REFERENCE maps through the located frame, mirroring rasterCompare's anchor.
  const refScale = (frame.x1 - frame.x0) / (boundingW - 1);
  const rPx = (v: number) => frame.x0 + (v - 0.5) * refScale, rPy = (v: number) => frame.y0 + (v - 0.5) * refScale;

  let sum = 0;
  for (const c of filled) {
    const rect = model.geometry.cellRects[c.index];
    const fill = hexRgb(c.nucleusColor as string);
    const ov = inkVector(ours, rect, fill, oPx, oPy);
    const rv = inkVector(referenceRaster, rect, fill, rPx, rPy);
    let l1 = 0; for (let i = 0; i < ov.length; i++) l1 += Math.abs(ov[i] - rv[i]);
    sum += l1;
  }
  return sum / filled.length < TEXT_AGREE_MAX;
}

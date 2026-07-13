import { describe, expect, test } from "vitest";
import type { Raster } from "@entviz/core";
import { rasterTextConfirms, TEXT_AGREE_MAX } from "../src/raster-text.ts";

// The crude, no-OCR text corroboration (raster-text.ts) is a POSITIVE-ONLY signal:
// it can only strengthen a raster look-alike's wording, never create a `different`.
// Its algorithm (soft normalized ink grid) is validated against REAL browser pixels
// by apps/playground/src/calibrate-text.ts — jsdom can't rasterize fonts, so here we
// pin the security-relevant contract: it FAILS CLOSED (resolves false) whenever it
// can't do an honest check, so a paste can never gain unearned confidence.

const solid = (w: number, h: number, rgb: [number, number, number]): Raster => {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { rgba[i * 4] = rgb[0]; rgba[i * 4 + 1] = rgb[1]; rgba[i * 4 + 2] = rgb[2]; rgba[i * 4 + 3] = 255; }
  return { rgba, w, h };
};

describe("rasterTextConfirms — fail-closed contract", () => {
  test("the threshold sits below the different-token floor (a real gap)", () => {
    // Calibration: different-token distances never dropped below ~0.54; a pass must
    // stay comfortably under that so it means "same token" with margin.
    expect(TEXT_AGREE_MAX).toBeGreaterThan(0);
    expect(TEXT_AGREE_MAX).toBeLessThan(0.5);
  });

  test("no locatable entviz frame in the image → false (never confirms blind)", async () => {
    // A blank white image has no #808080 frame; locateFrame returns null before any
    // canvas work, so the corroboration declines rather than assuming a match.
    await expect(rasterTextConfirms(solid(200, 160, [255, 255, 255]), "0123456789abcdef")).resolves.toBe(false);
  });

  test("an image too small to hold a frame → false", async () => {
    await expect(rasterTextConfirms(solid(8, 8, [128, 128, 128]), "0123456789abcdef")).resolves.toBe(false);
  });
});

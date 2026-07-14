import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Raster } from "@entviz/core";

// raster-text.ts is a POSITIVE-ONLY, fail-closed corroboration. Its ink-grid
// ALGORITHM is calibrated against real browser pixels in
// apps/playground/src/calibrate-text.ts (jsdom can't rasterize fonts). Here we
// pin the module's own control flow: every fail-closed return, plus the happy
// path where the ink math actually runs. We mock the three @entviz/core entry
// points so each branch is reachable deterministically; the real svgToRaster +
// inkVector still execute against a canvas context we supply below.
const core = vi.hoisted(() => ({
  locateFrame: vi.fn(),
  describeChannels: vi.fn(),
  render: vi.fn(() => "<svg xmlns='http://www.w3.org/2000/svg'/>"),
}));
vi.mock("@entviz/core", () => core);

import { rasterTextConfirms, TEXT_AGREE_MAX } from "../src/raster-text.ts";

const raster = (w: number, h: number, v = 255): Raster => ({
  rgba: new Uint8ClampedArray(w * h * 4).fill(v),
  w,
  h,
});

const FRAME = { x0: 1, y0: 1, x1: 479, y1: 479 };

type Cell = { index: number; blank: boolean; nucleusColor?: string };
const model = (cells: Cell[]) => ({
  cells,
  geometry: {
    viewBox: "0 0 100 100",
    // rects sit in the interior (clear of the frame border) so the ink samples
    // land on the white field of both rasters.
    cellRects: cells.map((c) => ({ x: 20 + (c.index % 3) * 20, y: 40, w: 16, h: 16 })),
  },
});

// A gray (#808080) 1px ring over a white interior — the shape svgToRaster's
// canvas produces in a real browser. The test/setup.ts stub lacks fillRect
// (svgToRaster needs it), so we install a complete 2d context here.
const grayRing = (_x: number, _y: number, w: number, h: number) => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const v = x === 0 || y === 0 || x === w - 1 || y === h - 1 ? 0x80 : 0xff;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  return { data, width: w, height: h };
};

let restoreCtx: () => void;
beforeEach(() => {
  const gc = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    fillStyle: "",
    fillRect: vi.fn(),
    scale: vi.fn(),
    drawImage: vi.fn(),
    getImageData: grayRing,
  })) as unknown as typeof gc;
  restoreCtx = () => {
    HTMLCanvasElement.prototype.getContext = gc;
  };
});
afterEach(() => {
  restoreCtx();
  vi.clearAllMocks();
  core.render.mockReturnValue("<svg xmlns='http://www.w3.org/2000/svg'/>");
});

describe("rasterTextConfirms — fail-closed branches + happy path", () => {
  test("the threshold sits in a usable band (0, 0.5)", () => {
    expect(TEXT_AGREE_MAX).toBeGreaterThan(0);
    expect(TEXT_AGREE_MAX).toBeLessThan(0.5);
  });

  test("no locatable frame → false (never confirms blind)", async () => {
    core.locateFrame.mockReturnValue(null);
    await expect(rasterTextConfirms(raster(200, 200), "abcd")).resolves.toBe(false);
    expect(core.describeChannels).not.toHaveBeenCalled();
  });

  test("an unparseable value (describeChannels throws) → false", async () => {
    core.locateFrame.mockReturnValue(FRAME);
    core.describeChannels.mockImplementation(() => {
      throw new Error("cannot characterize");
    });
    await expect(rasterTextConfirms(raster(200, 200), "??")).resolves.toBe(false);
  });

  test("a model with no filled cells → false", async () => {
    core.locateFrame.mockReturnValue(FRAME);
    core.describeChannels.mockReturnValue(model([{ index: 0, blank: true }]));
    await expect(rasterTextConfirms(raster(200, 200), "    ")).resolves.toBe(false);
  });

  test("SSR / no document → svgToRaster yields null → false", async () => {
    core.locateFrame.mockReturnValue(FRAME);
    core.describeChannels.mockReturnValue(model([{ index: 0, blank: false, nucleusColor: "#ffffff" }]));
    const doc = globalThis.document;
    // @ts-expect-error force the SSR guard inside svgToRaster
    delete globalThis.document;
    try {
      await expect(rasterTextConfirms(raster(200, 200), "abcd")).resolves.toBe(false);
    } finally {
      globalThis.document = doc;
    }
  });

  test("an image that fails to decode → svgToRaster null → false", async () => {
    core.locateFrame.mockReturnValue(FRAME);
    core.describeChannels.mockReturnValue(model([{ index: 0, blank: false, nucleusColor: "#ffffff" }]));
    const RealImage = globalThis.Image;
    class ErrImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 1;
      naturalHeight = 1;
      set src(_v: string) {
        Promise.resolve().then(() => this.onerror?.());
      }
    }
    (globalThis as unknown as { Image: unknown }).Image = ErrImage;
    try {
      await expect(rasterTextConfirms(raster(200, 200), "abcd")).resolves.toBe(false);
    } finally {
      (globalThis as unknown as { Image: unknown }).Image = RealImage;
    }
  });

  test("no 2d canvas context → svgToRaster null → false", async () => {
    core.locateFrame.mockReturnValue(FRAME);
    core.describeChannels.mockReturnValue(model([{ index: 0, blank: false, nucleusColor: "#ffffff" }]));
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    await expect(rasterTextConfirms(raster(200, 200), "abcd")).resolves.toBe(false);
  });

  test("full path: matching white ink fields → mean L1 == 0 → confirms (true)", async () => {
    core.locateFrame.mockReturnValue(FRAME);
    core.describeChannels.mockReturnValue(
      model([
        { index: 0, blank: false, nucleusColor: "#ffffff" },
        { index: 1, blank: true },
        { index: 2, blank: false, nucleusColor: "#ffffff" },
      ]),
    );
    // ours = the gray-ring-over-white canvas raster; reference = solid white.
    // Interior samples find no ink in either → both normalized grids are all
    // zero → L1 == 0 < TEXT_AGREE_MAX.
    await expect(rasterTextConfirms(raster(480, 480, 255), "abcd")).resolves.toBe(true);
  });

  test("full path over a tiny reference raster (out-of-bounds samples clamp) → boolean", async () => {
    core.locateFrame.mockReturnValue(FRAME);
    core.describeChannels.mockReturnValue(model([{ index: 0, blank: false, nucleusColor: "#ffffff" }]));
    // A 12x12 reference forces the frame-mapped sample coordinates past the edge,
    // exercising pixel()'s clamp branches; the result is still a well-formed bool.
    const r = await rasterTextConfirms(raster(12, 12, 255), "abcd");
    expect(typeof r).toBe("boolean");
  });
});

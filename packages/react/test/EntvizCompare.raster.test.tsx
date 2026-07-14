import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";

// The raster color engine (rasterCompare) is exercised in core's own suite; here
// we force it to a look-alike verdict so the compare UI runs its raster effect all
// the way through the positive-only text corroboration (rasterTextConfirms) — the
// branch that wires the no-OCR ink check into the component. Everything else in
// @entviz/core stays real.
const rasterCompare = vi.hoisted(() =>
  vi.fn(() => ({ state: "unknown", similar: true, reason: "" })),
);
vi.mock("@entviz/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@entviz/core")>();
  return { ...actual, rasterCompare };
});

import { EntvizCompare } from "../src/index.ts";

const HEX = "0123456789abcdef0123456789abcdef";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  rasterCompare.mockReturnValue({ state: "unknown", similar: true, reason: "" });
});

describe("EntvizCompare: a raster look-alike consults the text corroboration", () => {
  test("uploading an image reference drives the raster effect through rasterTextConfirms", async () => {
    // svgToRaster (inside rasterTextConfirms) calls ctx.fillRect, which the shared
    // canvas stub in setup.ts lacks; supply a complete 2d context so the async
    // effect settles cleanly instead of hanging on an unresolved decode.
    const gc = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      fillStyle: "",
      fillRect: vi.fn(),
      scale: vi.fn(),
      drawImage: vi.fn(),
      getImageData: (_x: number, _y: number, w: number, h: number) => ({
        data: new Uint8ClampedArray(w * h * 4).fill(255),
        width: w,
        height: h,
      }),
    })) as unknown as typeof gc;
    try {
      const { container } = render(<EntvizCompare value={HEX} />);
      const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
      const png = new File([new Uint8Array([1, 2, 3])], "ref.png", { type: "image/png" });
      fireEvent.change(fileInput, { target: { files: [png] } });
      // FileReader → data URI → decode → imageToRaster → rasterCompare (mocked
      // look-alike) → rasterTextConfirms. Reaching rasterCompare guarantees the
      // `unknown·similar` branch — and the rasterTextConfirms call — executed.
      await waitFor(() => expect(rasterCompare).toHaveBeenCalled());
    } finally {
      HTMLCanvasElement.prototype.getContext = gc;
    }
  });
});

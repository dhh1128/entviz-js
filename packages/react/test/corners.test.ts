import { describe, expect, test } from "vitest";
import { CORNER_TOKENS } from "@entviz/core";
import { cornerStyle } from "../src/corners.ts";

// React-layer presentation half of the corner channel (this.i gk37dm5n): map a
// curated CornerToken to the CSS that shapes the pill body. round/sharp/leaf are
// border-radius only (border stays intact); bevel is a clip-path chamfer.

describe("cornerStyle", () => {
  test("`round` uses the themeable pill-radius var (unchanged default)", () => {
    expect(cornerStyle("round")).toEqual({ borderRadius: "var(--entviz-pill-radius, 0.5em)" });
  });

  test("`sharp` is fully square", () => {
    expect(cornerStyle("sharp")).toEqual({ borderRadius: "0" });
  });

  test("`leaf` rounds the TL+BR diagonal (border-radius shorthand)", () => {
    expect(cornerStyle("leaf")).toEqual({ borderRadius: "0.5em 0 0.5em 0" });
  });

  test("`bevel` is a clip-path chamfer on the TR+BL diagonal, base square", () => {
    const s = cornerStyle("bevel");
    expect(s.borderRadius).toBe("0");
    expect(s.clipPath).toContain("polygon");
    // chamfers TR (top edge stops before the corner, resumes down the right edge)…
    expect(s.clipPath).toContain("calc(100% - 0.5em) 0");
    expect(s.clipPath).toContain("100% 0.5em");
    // …and BL (bottom edge stops before the corner, resumes up the left edge)
    expect(s.clipPath).toContain("0.5em 100%");
    expect(s.clipPath).toContain("0 calc(100% - 0.5em)");
  });

  test("`notch` and `arrow` are clip-path treatments of the leading edge", () => {
    const notch = cornerStyle("notch");
    expect(notch.borderRadius).toBe("0");
    expect(notch.clipPath).toContain("polygon");
    expect(notch.clipPath).toContain("0.5em 50%"); // the inward point of the bite

    const arrow = cornerStyle("arrow");
    expect(arrow.borderRadius).toBe("0");
    expect(arrow.clipPath).toContain("polygon");
    expect(arrow.clipPath).toContain("0 50%"); // the leftward chevron tip
  });

  test("the clip-path tokens are exactly bevel/notch/arrow; the rest are border-radius only", () => {
    const clipTokens = new Set(["bevel", "notch", "arrow"]);
    for (const token of CORNER_TOKENS) {
      const s = cornerStyle(token);
      if (clipTokens.has(token)) expect(s.clipPath).toBeTruthy();
      else expect(s.clipPath).toBeUndefined();
    }
  });

  test("every token in the curated vocabulary yields a non-empty style", () => {
    for (const token of CORNER_TOKENS) {
      expect(Object.keys(cornerStyle(token)).length).toBeGreaterThan(0);
    }
  });
});

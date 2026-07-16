import { describe, expect, test } from "vitest";
import { CORNER_TOKENS } from "@entviz/core";
import { cornerStyle } from "../src/corners.ts";

// React-layer presentation half of the corner style (this.i gk37dm5n): map a CornerToken
// to a border-radius. Three treatments, border-radius only (border stays intact).

describe("cornerStyle", () => {
  test("`round` is a capsule (large radius) via the themeable pill-radius var", () => {
    expect(cornerStyle("round")).toEqual({ borderRadius: "var(--entviz-pill-radius, 999px)" });
  });

  test("`sharp` is fully square", () => {
    expect(cornerStyle("sharp")).toEqual({ borderRadius: "0" });
  });

  test("`leaf` rounds the TL+BR diagonal", () => {
    expect(cornerStyle("leaf")).toEqual({ borderRadius: "0.5em 0 0.5em 0" });
  });

  test("every token in the vocabulary yields a non-empty border-radius", () => {
    for (const token of CORNER_TOKENS) {
      const r = cornerStyle(token).borderRadius as string;
      expect(typeof r).toBe("string");
      expect(r.length).toBeGreaterThan(0);
    }
  });
});

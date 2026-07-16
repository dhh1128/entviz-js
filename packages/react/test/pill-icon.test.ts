import { describe, expect, test } from "vitest";
import { colorbarIconGeometry } from "../src/pill-icon.ts";

// wn3r6aex (this.i): the corpus-only value-derived pill icon is a MINI of the entviz
// colorbar — its bands (count-proportional widths) + its two gutter markers, laid out
// horizontally. `colorbarIconGeometry` is the pure layout: channel colorbar data →
// normalized [0,1] band rects + marker positions. The SVG render is a thin wrapper.

describe("colorbarIconGeometry", () => {
  test("band lengths mirror the viz's count⁴ dominance; pos is cumulative", () => {
    const g = colorbarIconGeometry(
      [{ color: "#e7be00", count: 3 }, { color: "#2f3fbf", count: 1 }],
      { slots: 8, left: 2, right: 6 },
    );
    // 3⁴=81, 1⁴=1 → the count-3 band takes 81/82 of the bar (dominance), not 3/4.
    expect(g.bands.map((b) => b.color)).toEqual(["#e7be00", "#2f3fbf"]);
    expect(g.bands[0].pos).toBeCloseTo(0);
    expect(g.bands[0].len).toBeCloseTo(81 / 82);
    expect(g.bands[1].pos).toBeCloseTo(81 / 82);
    expect(g.bands[1].len).toBeCloseTo(1 / 82);
    expect(g.bands.reduce((s, b) => s + b.len, 0)).toBeCloseTo(1);
  });

  test("marks are slot-centered fractions in [0,1]", () => {
    const g = colorbarIconGeometry([{ color: "#000000", count: 1 }], { slots: 8, left: 0, right: 7 });
    expect(g.marks[0]).toBeCloseTo(0.5 / 8);
    expect(g.marks[1]).toBeCloseTo(7.5 / 8);
    for (const m of g.marks) {
      expect(m).toBeGreaterThanOrEqual(0);
      expect(m).toBeLessThanOrEqual(1);
    }
  });

  test("degenerate input (no bands / zero slots) stays finite — no NaN", () => {
    const g = colorbarIconGeometry([], { slots: 0, left: 0, right: 0 });
    expect(g.bands).toEqual([]);
    expect(g.marks[0]).toBeCloseTo(0.5);
    expect(g.marks[1]).toBeCloseTo(0.5);
  });
});

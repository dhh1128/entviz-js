import { describe, expect, test } from "vitest";
import { AUTO_COLOR_PALETTE, autoColorIndex } from "@entviz/core";
import { autoTint } from "../src/auto-color.ts";

// React presentation half of the auto-color channel (tgowi7go): a value → a subtle,
// theme-composable background tint. A transparent color-mix over a palette hue keeps
// text contrast (the theme background shows through ~82%) while the hue still reads,
// so it adapts to light AND dark without a per-theme palette.

describe("autoTint", () => {
  test("is a transparent color-mix over the value's palette hue", () => {
    const v = "DKxy2sgzfplyr_tgwIxS19f2OchFHtLwPWD3v4oYimBx";
    const bg = autoTint(v);
    expect(bg).toContain("color-mix");
    expect(bg).toContain("transparent");
    expect(bg).toContain(AUTO_COLOR_PALETTE[autoColorIndex(v)]);
  });

  test("is deterministic for a value", () => {
    const v = "550e8400-e29b-41d4-a716-446655440000";
    expect(autoTint(v)).toBe(autoTint(v));
  });
});

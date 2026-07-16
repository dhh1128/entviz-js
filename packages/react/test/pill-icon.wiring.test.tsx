import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { EntvizPill } from "../src/index.ts";
import type { TrustAssumption } from "@entviz/core";

// The colorbar icon wired into the pill (wn3r6aex), GATED by the trust posture. It
// REPLACES the constant 2×2 badge only under a corpus posture with icon:true; wild
// always keeps the constant zero-identity badge. showIcon:false hides both.

const CESR = "DKxy2sgzfplyr_tgwIxS19f2OchFHtLwPWD3v4oYimBx";
const corpusIcon: TrustAssumption = { posture: "corpus", icon: true };

afterEach(cleanup);

const iconSvg = (c: HTMLElement) => c.querySelector('svg[data-evz-pill-icon="colorbar"]');
// The constant badge is a 2×2 grid of solid swatches — detect it by its grid span.
const constBadge = (c: HTMLElement) =>
  [...c.querySelectorAll("span")].find((s) => s.style.display === "inline-grid");

describe("EntvizPill colorbar icon channel", () => {
  test("wild default shows the constant 2×2 badge, not the colorbar icon", () => {
    const { container } = render(<EntvizPill value={CESR} />);
    expect(iconSvg(container)).toBeNull();
    expect(constBadge(container)).toBeTruthy();
  });

  test("wild posture keeps the constant badge even with icon:true", () => {
    const wild: TrustAssumption = { posture: "wild", icon: true };
    const { container } = render(<EntvizPill value={CESR} trust={wild} />);
    expect(iconSvg(container)).toBeNull();
    expect(constBadge(container)).toBeTruthy();
  });

  test("corpus posture with icon opted-in swaps in the colorbar icon", () => {
    const { container } = render(<EntvizPill value={CESR} trust={corpusIcon} />);
    expect(iconSvg(container)).toBeTruthy();
    expect(constBadge(container)).toBeUndefined(); // the 2×2 is gone
  });

  test("corpus posture WITHOUT the icon flag keeps the constant badge", () => {
    const { container } = render(<EntvizPill value={CESR} trust={{ posture: "corpus" }} />);
    expect(iconSvg(container)).toBeNull();
    expect(constBadge(container)).toBeTruthy();
  });

  test("showIcon:false hides both the badge and the colorbar icon", () => {
    const { container } = render(<EntvizPill value={CESR} trust={corpusIcon} showIcon={false} />);
    expect(iconSvg(container)).toBeNull();
    expect(constBadge(container)).toBeUndefined();
  });

  test("an unrenderable pill (error) falls back to the constant badge", () => {
    const { container } = render(<EntvizPill value={CESR} note="toolongnote" trust={corpusIcon} />);
    expect(iconSvg(container)).toBeNull();
    expect(constBadge(container)).toBeTruthy();
  });
});

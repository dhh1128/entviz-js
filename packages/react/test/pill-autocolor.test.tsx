import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { EntvizPill } from "../src/index.ts";
import type { TrustAssumption } from "@entviz/core";

// Auto-color wired into the pill (tgowi7go), GATED by the trust posture. The tint
// paints the pill background only under a corpus posture that opted the channel in;
// the wild default keeps the neutral themeable background (the `--entviz-pill-bg`
// var). jsdom normalizes the hsl() palette hue to rgb(), so we discriminate on the
// var's presence + the 18% tint mix (vs the default 6% currentColor mix).

const CESR = "DKxy2sgzfplyr_tgwIxS19f2OchFHtLwPWD3v4oYimBx";
const corpus: TrustAssumption = { posture: "corpus", autoColor: true };

afterEach(cleanup);

const pillBody = (c: HTMLElement) =>
  c.querySelector('button[aria-expanded]')!.parentElement! as HTMLElement;
const bg = (c: HTMLElement) => pillBody(c).style.background;

describe("EntvizPill auto-color channel", () => {
  test("no trust (wild default) keeps the neutral themeable background", () => {
    const { container } = render(<EntvizPill value={CESR} />);
    expect(bg(container)).toContain("--entviz-pill-bg");
  });

  test("wild posture keeps the tint off even if the flag is set", () => {
    const wild: TrustAssumption = { posture: "wild", autoColor: true };
    const { container } = render(<EntvizPill value={CESR} trust={wild} />);
    expect(bg(container)).toContain("--entviz-pill-bg");
  });

  test("corpus posture with autoColor opted-in paints the value's tint", () => {
    const { container } = render(<EntvizPill value={CESR} trust={corpus} />);
    expect(bg(container)).not.toContain("--entviz-pill-bg"); // the var is replaced
    expect(bg(container)).toContain("color-mix");
    expect(bg(container)).toContain("18%"); // the tint mix (vs the default 6%)
  });

  test("corpus posture WITHOUT the autoColor flag keeps the neutral background", () => {
    const { container } = render(<EntvizPill value={CESR} trust={{ posture: "corpus" }} />);
    expect(bg(container)).toContain("--entviz-pill-bg");
  });

  test("an unrenderable pill (error) skips the tint", () => {
    const { container } = render(<EntvizPill value={CESR} note="toolongnote" trust={corpus} />);
    expect(bg(container)).toContain("--entviz-pill-bg");
  });
});

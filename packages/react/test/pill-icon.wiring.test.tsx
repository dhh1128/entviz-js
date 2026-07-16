import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { EntvizPill } from "../src/index.ts";
import type { TrustAssumption } from "@entviz/core";

// The pill's two icons after the layout change (no more constant 2×2 badge):
//  - LEADING cap = the value-derived colorbar (wn3r6aex) — corpus + icon:true only,
//    absolutely positioned; empty otherwise.
//  - TRAILING role glyph — the value's semantic type, shown in every posture (un-gated),
//    shown when `typeSignal === "icon"` (the default).

const CESR = "DKxy2sgzfplyr_tgwIxS19f2OchFHtLwPWD3v4oYimBx"; // role "key"
const corpusIcon: TrustAssumption = { posture: "corpus", icon: true };

afterEach(cleanup);

const colorbar = (c: HTMLElement) => c.querySelector('svg[data-evz-pill-icon="colorbar"]');
const roleGlyph = (c: HTMLElement) => c.querySelector("svg[data-evz-role-icon]");

describe("EntvizPill leading colorbar cap", () => {
  test("wild default shows no colorbar cap", () => {
    const { container } = render(<EntvizPill value={CESR} />);
    expect(colorbar(container)).toBeNull();
  });

  test("wild posture shows no colorbar even with icon:true", () => {
    const wild: TrustAssumption = { posture: "wild", icon: true };
    const { container } = render(<EntvizPill value={CESR} trust={wild} />);
    expect(colorbar(container)).toBeNull();
  });

  test("corpus + icon opted-in shows the colorbar cap", () => {
    const { container } = render(<EntvizPill value={CESR} trust={corpusIcon} />);
    expect(colorbar(container)).toBeTruthy();
  });

  test("corpus WITHOUT the icon flag shows no colorbar", () => {
    const { container } = render(<EntvizPill value={CESR} trust={{ posture: "corpus" }} />);
    expect(colorbar(container)).toBeNull();
  });

  test("an unrenderable pill (error) shows no colorbar", () => {
    const { container } = render(<EntvizPill value={CESR} note="toolongnote" trust={corpusIcon} />);
    expect(colorbar(container)).toBeNull();
  });
});

describe("EntvizPill trailing role glyph", () => {
  test("shows the value's role glyph in the wild posture (un-gated)", () => {
    const { container } = render(<EntvizPill value={CESR} />);
    expect(roleGlyph(container)!.getAttribute("data-evz-role-icon")).toBe("key");
  });

  test("shows the role glyph in the corpus posture too", () => {
    const { container } = render(<EntvizPill value={CESR} trust={corpusIcon} />);
    expect(roleGlyph(container)!.getAttribute("data-evz-role-icon")).toBe("key");
  });

  test("a null-role value gets the \"raw\" glyph", () => {
    const { container } = render(<EntvizPill value="0123456789abcdef" />);
    expect(roleGlyph(container)!.getAttribute("data-evz-role-icon")).toBe("raw");
  });

  test("typeSignal other than \"icon\" hides the role glyph", () => {
    const text = render(<EntvizPill value={CESR} typeSignal="text" />);
    expect(roleGlyph(text.container)).toBeNull();
    cleanup();
    const none = render(<EntvizPill value={CESR} typeSignal="none" />);
    expect(roleGlyph(none.container)).toBeNull();
  });

  test("the colorbar cap and the role glyph coexist (different sides)", () => {
    const { container } = render(<EntvizPill value={CESR} trust={corpusIcon} />);
    expect(colorbar(container)).toBeTruthy();
    expect(roleGlyph(container)).toBeTruthy();
  });
});

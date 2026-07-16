import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { EntvizPill } from "../src/index.ts";
import type { TrustAssumption } from "@entviz/core";

const CESR = "DKxy2sgzfplyr_tgwIxS19f2OchFHtLwPWD3v4oYimBx"; // 44 chars
const LONG = "M".repeat(200);
const corpus: TrustAssumption = { posture: "corpus" };
const PREVIEW_CAP = 100;

afterEach(cleanup);

const pillBtn = (c: HTMLElement) => c.querySelector('button[aria-expanded]') as HTMLElement;
const pillBody = (c: HTMLElement) => pillBtn(c).parentElement as HTMLElement;
const hiddenValue = (c: HTMLElement, v: string) =>
  [...c.querySelectorAll("span")].find(
    (s) => s.textContent === v && s.getAttribute("aria-hidden") === "true",
  );

// E — the hover tooltip previews the value (BOTH postures). The old "View
// visualization" hint is gone; the pointer cursor signals clickability. A 50–75 char
// preview is not the §3.3 grinding vector: it's the full value for essentially every
// identifier, and far too long to grind a prefix collision on.
describe("hover tooltip (E)", () => {
  test("wild: the tooltip previews the value in full (no 'View visualization')", () => {
    const { container } = render(<EntvizPill value={CESR} />);
    expect(pillBtn(container).getAttribute("title")).toBe(CESR);
  });

  test("corpus: the tooltip previews the value too (un-gated)", () => {
    const { container } = render(<EntvizPill value={CESR} trust={corpus} />);
    expect(pillBtn(container).getAttribute("title")).toBe(CESR);
  });

  test("a long value is truncated with an ellipsis (tidiness only)", () => {
    const { container } = render(<EntvizPill value={LONG} />);
    const t = pillBtn(container).getAttribute("title")!;
    expect(t.length).toBe(PREVIEW_CAP + 1); // cap chars + the ellipsis
    expect(t.endsWith("…")).toBe(true);
    expect(LONG.startsWith(t.slice(0, PREVIEW_CAP))).toBe(true);
  });
});

// D — a text selection sweeping the paragraph copies the VALUE. The visible chrome is
// non-selectable; a hidden selectable span carries the raw value. (The real copy
// behaviour is browser-driven and verified by hand; here we assert the DOM contract.)
describe("copy value on selection (D)", () => {
  test("the visible pill chrome is not selectable", () => {
    const { container } = render(<EntvizPill value={CESR} />);
    expect(pillBody(container).style.userSelect).toBe("none");
  });

  test("a hidden, aria-hidden, selectable span carries the raw value", () => {
    const { container } = render(<EntvizPill value={CESR} />);
    const span = hiddenValue(container, CESR);
    expect(span).toBeTruthy();
    expect(span!.style.userSelect).toBe("text");
  });

  test("the selectable value is present in BOTH postures (copy isn't gated)", () => {
    const wild = render(<EntvizPill value={CESR} />);
    expect(hiddenValue(wild.container, CESR)).toBeTruthy();
    cleanup();
    const corp = render(<EntvizPill value={CESR} trust={corpus} />);
    expect(hiddenValue(corp.container, CESR)).toBeTruthy();
  });
});

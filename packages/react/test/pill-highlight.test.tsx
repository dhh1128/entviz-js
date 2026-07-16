import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { EntvizPill } from "../src/index.ts";

const HEX = "0123456789abcdef";

afterEach(cleanup);

const pillBody = (c: HTMLElement) =>
  c.querySelector('button[aria-expanded]')!.parentElement! as HTMLElement;

describe("EntvizPill role glyph is clickable", () => {
  test("clicking the trailing role icon expands the pill (same as clicking the body)", () => {
    const onExpand = vi.fn();
    const { container } = render(<EntvizPill value={HEX} onExpand={onExpand} />);
    const glyphSpan = container.querySelector("svg[data-evz-role-icon]")!.parentElement!;
    expect(glyphSpan.style.cursor).toBe("pointer");
    fireEvent.click(glyphSpan);
    expect(onExpand).toHaveBeenCalled();
  });
});

describe("EntvizPill highlight ring", () => {
  test("`highlight` adds a host-colorable box-shadow ring; unset has none", () => {
    const on = render(<EntvizPill value={HEX} highlight />);
    expect(pillBody(on.container).style.boxShadow).toContain("--entviz-pill-highlight");
    cleanup();
    const off = render(<EntvizPill value={HEX} />);
    expect(pillBody(off.container).style.boxShadow).toBe("");
  });
});

describe("EntvizPill baseline anchor", () => {
  test("a pill with no visible text keeps a zero-width baseline anchor", () => {
    // typeSignal="none" + no label → no type text, no glyph text; the textBlock still
    // renders a zero-width space so the pill has a baseline and doesn't drop below the line.
    const { container } = render(<EntvizPill value={HEX} typeSignal="none" />);
    const btn = container.querySelector('button[aria-expanded]')!;
    expect(btn.textContent).toBe("​");
  });
});

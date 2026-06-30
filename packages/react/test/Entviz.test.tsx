import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { Entviz } from "../src/index.ts";

// Migrated from node:test + react-dom/server to Vitest + Testing Library + jsdom:
// the component now mounts into a real (simulated) DOM, so we assert on actual
// nodes (the <span role="img"> and the injected <svg>) instead of a markup
// string. Covers the success path, the accessible labels, prop pass-through, and
// the error/fallback path (with and without onError).

const HEX = "0123456789abcdef0123456789abcdef";

afterEach(cleanup);

const img = (c: HTMLElement) => c.querySelector('span[role="img"]') as HTMLElement;

describe("Entviz", () => {
  test("renders the entviz SVG inline with a default aria-label", () => {
    const { container } = render(<Entviz value={HEX} />);
    const span = img(container);
    expect(span).toBeTruthy();
    expect(span.getAttribute("aria-label")).toBe("entviz visualization");
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(svg!.getAttribute("data-entviz-version")).toBe("v11");
  });

  test("a custom title overrides the aria-label; className/style pass through", () => {
    const { container } = render(
      <Entviz value={HEX} title="my key" className="fp" style={{ width: 64 }} />,
    );
    const span = img(container);
    expect(span.getAttribute("aria-label")).toBe("my key");
    expect(span.classList.contains("fp")).toBe(true);
    expect(span.style.width).toBe("64px");
  });

  test("the default aria-label folds in the user note (PSY-JS-F3)", () => {
    const { container } = render(<Entviz value={HEX} note="git" />);
    expect(img(container).getAttribute("aria-label")).toBe("entviz visualization, note git");
  });

  test("a render error calls onError and renders the fallback span (no svg)", () => {
    const onError = vi.fn();
    const { container } = render(
      <Entviz value={HEX} note="toolongnote" onError={onError} />,
    );
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toMatch(/note/i);
    expect(container.querySelector("svg")).toBeNull();
    expect(img(container).getAttribute("aria-label")).toBe("entviz (render error)");
  });

  test("an error without an onError handler still renders the fallback safely", () => {
    const { container } = render(<Entviz value={HEX} note="toolongnote" title="labelled" />);
    expect(container.querySelector("svg")).toBeNull();
    // The custom title labels the fallback too.
    expect(img(container).getAttribute("aria-label")).toBe("labelled");
  });
});

// --- opt-in controls (size ladder + reshape picker) ------------------------

const MULTI = "0123456789abcdef".repeat(4); // ~11 cells → several grid shapes
const SINGLE = "0123456789abcdef01234567"; // 4 tokens → exactly one shape (2x2)

const btn = (c: HTMLElement, name: string) =>
  c.querySelector(`[aria-label="${name}"]`) as HTMLButtonElement;
const figW = (c: HTMLElement) => (c.querySelector("svg") as SVGElement).getAttribute("width");

describe("Entviz controls", () => {
  test("off by default: a single span, no control strip", () => {
    const { container } = render(<Entviz value={MULTI} />);
    expect(container.querySelector('[aria-label="size"]')).toBeNull();
    expect(container.firstChild).toBe(img(container)); // the span IS the root
  });

  test("size: + / − step the font ladder (uncontrolled); 0 resets via keyboard", () => {
    const { container } = render(<Entviz value={MULTI} controls fontSizePt={12} />);
    expect(container.textContent).toContain("12pt");
    fireEvent.click(btn(container, "larger"));
    expect(container.textContent).toContain("14pt");
    fireEvent.click(btn(container, "smaller"));
    expect(container.textContent).toContain("12pt");
    fireEvent.click(btn(container, "larger")); // → 14pt, then reset
    const wrap = container.querySelector('div[tabindex="0"]') as HTMLElement;
    fireEvent.keyDown(wrap, { key: "0" });
    expect(container.textContent).toContain("12pt");
  });

  test("size: ladder clamps at both ends (buttons disable), within the spec [6,30]", () => {
    const lo = render(<Entviz value={MULTI} controls fontSizePt={6} />);
    expect(btn(lo.container, "smaller").disabled).toBe(true);
    expect(btn(lo.container, "larger").disabled).toBe(false);
    const hi = render(<Entviz value={MULTI} controls fontSizePt={30} />);
    expect(btn(hi.container, "larger").disabled).toBe(true);
  });

  test("size: keyboard +/- step; an unrelated key is ignored", () => {
    const { container } = render(<Entviz value={MULTI} controls fontSizePt={12} />);
    const wrap = container.querySelector('div[tabindex="0"]') as HTMLElement;
    fireEvent.keyDown(wrap, { key: "+" });
    expect(container.textContent).toContain("14pt");
    fireEvent.keyDown(wrap, { key: "-" });
    expect(container.textContent).toContain("12pt");
    fireEvent.keyDown(wrap, { key: "x" }); // ignored
    expect(container.textContent).toContain("12pt");
  });

  test("size: controlled — onResize fires, the prop still drives the figure", () => {
    const onResize = vi.fn();
    const { container } = render(<Entviz value={MULTI} controls fontSizePt={12} onResize={onResize} />);
    fireEvent.click(btn(container, "larger"));
    expect(onResize).toHaveBeenCalledWith(14);
    expect(container.textContent).toContain("12pt"); // controlled: unchanged until the prop updates
  });

  test("reshape: offers the achievable shapes; one is active; picking re-shapes (uncontrolled)", () => {
    const { container } = render(<Entviz value={MULTI} controls fontSizePt={12} />);
    const shapes = [...container.querySelectorAll('[aria-label="shape"] button')] as HTMLButtonElement[];
    expect(shapes.length).toBeGreaterThan(1);
    expect(shapes.filter((b) => b.getAttribute("aria-pressed") === "true").length).toBe(1);
    const before = figW(container);
    const other = shapes.find((b) => b.getAttribute("aria-pressed") !== "true")!;
    fireEvent.click(other);
    expect(other.getAttribute("aria-pressed")).toBe("true"); // now active
    expect(figW(container)).not.toBe(before); // figure re-shaped
  });

  test("reshape: controlled — onReshape fires with the shape's targetAr", () => {
    const onReshape = vi.fn();
    const { container } = render(<Entviz value={MULTI} controls fontSizePt={12} onReshape={onReshape} />);
    const other = [...container.querySelectorAll('[aria-label="shape"] button')].find(
      (b) => b.getAttribute("aria-pressed") !== "true",
    ) as HTMLButtonElement;
    fireEvent.click(other);
    expect(onReshape).toHaveBeenCalledTimes(1);
    expect(typeof onReshape.mock.calls[0][0]).toBe("number");
  });

  test("reshape: suppressed when reshapable=false, or when only one shape exists", () => {
    const off = render(<Entviz value={MULTI} controls reshapable={false} />);
    expect(off.container.querySelector('[aria-label="shape"]')).toBeNull();
    expect(off.container.querySelector('[aria-label="size"]')).toBeTruthy(); // size still there
    const single = render(<Entviz value={SINGLE} controls />);
    expect(single.container.querySelector('[aria-label="shape"]')).toBeNull(); // only one arrangement
  });
});

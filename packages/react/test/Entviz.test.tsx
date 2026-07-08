import { afterEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    expect(svg!.getAttribute("data-entviz-version")).toBe("v12");
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

  const shapeBtn = (c: HTMLElement) => c.querySelector('button[aria-label="shape"]') as HTMLButtonElement;
  const shapeOptions = (c: HTMLElement) =>
    [...c.querySelectorAll('[role="menu"][aria-label="shape"] [role="menuitem"]')] as HTMLButtonElement[];

  test("reshape: a single dropdown button opens a menu of the achievable shapes; one is active", () => {
    const { container } = render(<Entviz value={MULTI} controls fontSizePt={12} />);
    const b = shapeBtn(container);
    expect(b).toBeTruthy();
    expect(b.getAttribute("aria-expanded")).toBe("false");
    expect(shapeOptions(container).length).toBe(0); // closed
    fireEvent.click(b);
    expect(b.getAttribute("aria-expanded")).toBe("true");
    const options = shapeOptions(container);
    expect(options.length).toBeGreaterThan(1);
    expect(options.filter((o) => o.getAttribute("aria-pressed") === "true").length).toBe(1);
    fireEvent.click(b); // toggle closed
    expect(shapeOptions(container).length).toBe(0);
    fireEvent.keyDown(b, { key: "ArrowDown" }); // arrow also opens
    expect(shapeOptions(container).length).toBeGreaterThan(1);
  });

  test("reshape: picking a shape re-shapes the figure and closes the menu (uncontrolled)", () => {
    const { container } = render(<Entviz value={MULTI} controls fontSizePt={12} />);
    fireEvent.click(shapeBtn(container));
    const before = figW(container);
    const other = shapeOptions(container).find((o) => o.getAttribute("aria-pressed") !== "true")!;
    fireEvent.click(other);
    expect(shapeOptions(container).length).toBe(0); // menu closed after a pick
    expect(figW(container)).not.toBe(before); // figure re-shaped
  });

  test("reshape: controlled — onReshape fires with the shape's targetAr", () => {
    const onReshape = vi.fn();
    const { container } = render(<Entviz value={MULTI} controls fontSizePt={12} onReshape={onReshape} />);
    fireEvent.click(shapeBtn(container));
    const other = shapeOptions(container).find((o) => o.getAttribute("aria-pressed") !== "true") as HTMLButtonElement;
    fireEvent.click(other);
    expect(onReshape).toHaveBeenCalledTimes(1);
    expect(typeof onReshape.mock.calls[0][0]).toBe("number");
  });

  test("reshape: Escape closes the shape menu and refocuses the button", () => {
    const { container } = render(<Entviz value={MULTI} controls fontSizePt={12} />);
    const b = shapeBtn(container);
    fireEvent.click(b);
    expect(shapeOptions(container).length).toBeGreaterThan(1);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(shapeOptions(container).length).toBe(0);
    expect(document.activeElement).toBe(b);
  });

  test("reshape: opening the shape menu closes the copy menu (mutually exclusive)", () => {
    const { container } = render(<Entviz value={MULTI} controls fontSizePt={12} />);
    fireEvent.click(container.querySelector('button[aria-label="actions"]') as HTMLButtonElement);
    expect(container.querySelector('[role="menu"][aria-label="actions"]')).toBeTruthy();
    fireEvent.click(shapeBtn(container));
    expect(container.querySelector('[role="menu"][aria-label="actions"]')).toBeNull(); // copy closed
    expect(shapeOptions(container).length).toBeGreaterThan(1); // shape open
  });

  test("reshape: suppressed when reshapable=false, or when only one shape exists", () => {
    const off = render(<Entviz value={MULTI} controls reshapable={false} />);
    expect(off.container.querySelector('[aria-label="shape"]')).toBeNull();
    expect(off.container.querySelector('[aria-label="size"]')).toBeTruthy(); // size still there
    const single = render(<Entviz value={SINGLE} controls />);
    expect(single.container.querySelector('[aria-label="shape"]')).toBeNull(); // only one arrangement
  });
});

// --- copy/export menu (the toolbar kebab) ----------------------------------

const clip = () => navigator.clipboard as { writeText: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn> };
const kebab = (c: HTMLElement) => c.querySelector('button[aria-label="actions"]') as HTMLButtonElement;
const openMenu = (c: HTMLElement) => {
  fireEvent.click(kebab(c));
  return c.querySelector('[role="menu"]') as HTMLElement;
};

describe("Entviz controls — copy menu", () => {
  afterEach(() => { clip().writeText.mockClear(); clip().write.mockClear(); });

  test("the kebab is present with controls, toggles the menu, and opens on arrow keys", () => {
    const { container } = render(<Entviz value={MULTI} controls />);
    const k = kebab(container);
    expect(k).toBeTruthy();
    expect(container.querySelector('[role="menu"]')).toBeNull();
    fireEvent.click(k);
    expect(container.querySelector('[role="menu"]')).toBeTruthy();
    fireEvent.click(k); // toggle closed
    expect(container.querySelector('[role="menu"]')).toBeNull();
    fireEvent.keyDown(k, { key: "ArrowDown" });
    expect(container.querySelector('[role="menu"]')).toBeTruthy();
    fireEvent.keyDown(k, { key: "ArrowUp" }); // also opens (stays open)
    expect(container.querySelector('[role="menu"]')).toBeTruthy();
    fireEvent.keyDown(k, { key: "x" }); // unrelated key ignored
    expect(container.querySelector('[role="menu"]')).toBeTruthy();
  });

  test("each menu item copies the right representation and confirms with a toast", async () => {
    const { container } = render(<Entviz value={MULTI} controls />);

    openMenu(container);
    fireEvent.click(screen.getByRole("menuitem", { name: /copy value/i }));
    expect((await screen.findAllByText("Copied value")).length).toBeGreaterThan(0);
    expect(clip().writeText).toHaveBeenLastCalledWith(MULTI);

    openMenu(container);
    fireEvent.click(screen.getByRole("menuitem", { name: /copy comparison text/i }));
    expect((await screen.findAllByText("Copied comparison text")).length).toBeGreaterThan(0);

    openMenu(container);
    fireEvent.click(screen.getByRole("menuitem", { name: /copy svg/i }));
    expect((await screen.findAllByText("Copied SVG")).length).toBeGreaterThan(0);
    expect((clip().writeText.mock.calls.at(-1)![0] as string).startsWith("<svg")).toBe(true);

    openMenu(container);
    fireEvent.click(screen.getByRole("menuitem", { name: /copy image/i }));
    expect((await screen.findAllByText("Copied image")).length).toBeGreaterThan(0);
    expect(clip().write).toHaveBeenCalled();
  });

  test("a clipboard failure surfaces 'Copy failed'", async () => {
    clip().writeText.mockRejectedValueOnce(new Error("denied"));
    const { container } = render(<Entviz value={MULTI} controls />);
    openMenu(container);
    fireEvent.click(screen.getByRole("menuitem", { name: /copy value/i }));
    expect((await screen.findAllByText("Copy failed")).length).toBeGreaterThan(0);
  });

  test("Ctrl/⌘-C on the toolbar copies the value", async () => {
    const { container } = render(<Entviz value={MULTI} controls />);
    const wrap = container.querySelector('div[tabindex="0"]') as HTMLElement;
    fireEvent.keyDown(wrap, { key: "c", ctrlKey: true });
    expect((await screen.findAllByText("Copied value")).length).toBeGreaterThan(0);
    expect(clip().writeText).toHaveBeenLastCalledWith(MULTI);
  });

  test("menu keyboard: Arrow/Home/End move focus; Escape closes and refocuses the kebab", async () => {
    const { container } = render(<Entviz value={MULTI} controls />);
    const k = kebab(container);
    const menu = openMenu(container);
    const items = [...menu.querySelectorAll('[role="menuitem"]')] as HTMLElement[];
    // menu auto-focuses its first item when it opens
    await waitFor(() => expect(document.activeElement).toBe(items[0]));
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(menu, { key: "End" });
    expect(document.activeElement).toBe(items[items.length - 1]);
    fireEvent.keyDown(menu, { key: "Home" });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(menu, { key: "x" }); // ignored
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(k);
  });

  test("an outside click closes the menu", () => {
    const { container } = render(<Entviz value={MULTI} controls />);
    openMenu(container);
    expect(container.querySelector('[role="menu"]')).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(container.querySelector('[role="menu"]')).toBeNull();
  });

  test("the copy toast auto-dismisses after its timeout", async () => {
    vi.useFakeTimers();
    try {
      const { container } = render(<Entviz value={MULTI} controls />);
      openMenu(container);
      await act(async () => {
        fireEvent.click(screen.getByRole("menuitem", { name: /copy value/i }));
        await vi.advanceTimersByTimeAsync(1); // resolve the clipboard write + run flash()
      });
      expect(screen.getAllByText("Copied value").length).toBeGreaterThan(0);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2400); // fire the dismiss timer
      });
      expect(screen.queryByText("Copied value")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

// --- onEvent firehose ------------------------------------------------------

describe("Entviz onEvent firehose", () => {
  const of = (spy: ReturnType<typeof vi.fn>, type: string) =>
    spy.mock.calls.map((c) => c[0]).filter((e) => e.type === type);
  const last = (spy: ReturnType<typeof vi.fn>, type: string) => {
    const es = of(spy, type);
    return es[es.length - 1];
  };
  const shapeBtn = (c: HTMLElement) => c.querySelector('button[aria-label="shape"]') as HTMLButtonElement;
  const shapeOptions = (c: HTMLElement) =>
    [...c.querySelectorAll('[role="menu"][aria-label="shape"] [role="menuitem"]')] as HTMLButtonElement[];

  test("stamps seq/ts/source=entviz and increments seq monotonically", () => {
    const onEvent = vi.fn();
    const { container } = render(<Entviz value={MULTI} controls onEvent={onEvent} />);
    fireEvent.click(btn(container, "larger")); // display.resize
    fireEvent.click(shapeBtn(container));
    fireEvent.click(shapeOptions(container).find((o) => o.getAttribute("aria-pressed") !== "true")!); // display.reshape
    expect(onEvent).toHaveBeenCalled();
    const evs = onEvent.mock.calls.map((c) => c[0]);
    for (const e of evs) {
      expect(e.source).toBe("entviz");
      expect(typeof e.ts).toBe("number");
      expect(typeof e.seq).toBe("number");
    }
    const seqs = evs.map((e) => e.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(new Set(seqs).size).toBe(seqs.length);
  });

  test("a throwing host handler never breaks the figure", () => {
    const onEvent = vi.fn(() => { throw new Error("host bug"); });
    const { container } = render(<Entviz value={MULTI} controls onEvent={onEvent} />);
    expect(() => fireEvent.click(btn(container, "larger"))).not.toThrow();
    expect(container.querySelector("svg")).toBeTruthy(); // still rendering
  });

  test("render.error fires with the message on a render failure (once per distinct error)", () => {
    const onEvent = vi.fn();
    const { rerender } = render(<Entviz value={HEX} note="toolongnote" onEvent={onEvent} />);
    const e = last(onEvent, "render.error");
    expect(e).toBeTruthy();
    expect(e.message).toMatch(/note/i);
    // an unrelated re-render with the SAME error must not re-emit
    const before = of(onEvent, "render.error").length;
    rerender(<Entviz value={HEX} note="toolongnote" onEvent={onEvent} />);
    expect(of(onEvent, "render.error").length).toBe(before);
  });

  test("display.resize fires with the new fontSizePt on a ladder step", () => {
    const onEvent = vi.fn();
    const { container } = render(<Entviz value={MULTI} controls fontSizePt={12} onEvent={onEvent} />);
    fireEvent.click(btn(container, "larger"));
    expect(last(onEvent, "display.resize")).toMatchObject({ fontSizePt: 14 });
    fireEvent.click(btn(container, "smaller"));
    expect(last(onEvent, "display.resize")).toMatchObject({ fontSizePt: 12 });
  });

  test("display.reshape fires with targetAr + cols/rows on a shape pick", () => {
    const onEvent = vi.fn();
    const { container } = render(<Entviz value={MULTI} controls onEvent={onEvent} />);
    fireEvent.click(shapeBtn(container));
    fireEvent.click(shapeOptions(container).find((o) => o.getAttribute("aria-pressed") !== "true")!);
    const e = last(onEvent, "display.reshape");
    expect(e).toBeTruthy();
    expect(typeof e.targetAr).toBe("number");
    expect(e.cols).toBeGreaterThan(0);
    expect(e.rows).toBeGreaterThan(0);
  });

  test("copy fires {kind, ok:true} on success and {ok:false} on failure", async () => {
    const onEvent = vi.fn();
    const { container } = render(<Entviz value={MULTI} controls onEvent={onEvent} />);
    fireEvent.click(kebab(container));
    fireEvent.click(screen.getByRole("menuitem", { name: /copy value/i }));
    await waitFor(() => expect(of(onEvent, "copy").length).toBeGreaterThan(0));
    expect(last(onEvent, "copy")).toMatchObject({ kind: "value", ok: true });
    // a rejected clipboard write reports ok:false
    clip().writeText.mockRejectedValueOnce(new Error("denied"));
    fireEvent.click(kebab(container));
    fireEvent.click(screen.getByRole("menuitem", { name: /copy value/i }));
    await waitFor(() => expect(last(onEvent, "copy")).toMatchObject({ kind: "value", ok: false }));
  });
});

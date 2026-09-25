import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { characterize, describeChannels, mnemonic, type TrustAssumption } from "@entviz/core";
import { EntvizPill } from "../src/index.ts";
import { marqueeSeconds } from "../src/EntvizPill.ts";

// Long-label overflow (this.i k7pq2mzv) and the ⋮-menu locate entry (lc4ktz6n).
//
// jsdom has no layout, so this file fakes the one measurement the pill makes: a label
// element's scrollWidth (its natural text width) against its clientWidth (the room it
// got). Natural width is CHAR_W px per character, scaled by the element's own inline
// font-size (so the mnemonic's 85% step is visible to the fake); the room is ROOM px,
// which a test changes to simulate the container resizing.

const CHAR_W = 8;
let ROOM = 120;

const naturalWidth = (el: HTMLElement) => {
  const scale = el.style.fontSize.endsWith("%") ? parseFloat(el.style.fontSize) / 100 : 1;
  return Math.round((el.textContent ?? "").length * CHAR_W * scale);
};
const isLabel = (el: HTMLElement) => el.classList?.contains("entviz-pill__label");

const sw = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollWidth");
const cw = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
    configurable: true,
    get(this: HTMLElement) { return isLabel(this) ? naturalWidth(this) : 0; },
  });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get(this: HTMLElement) { return isLabel(this) ? Math.min(ROOM, naturalWidth(this)) : 0; },
  });
});
afterAll(() => {
  if (sw) Object.defineProperty(HTMLElement.prototype, "scrollWidth", sw);
  if (cw) Object.defineProperty(HTMLElement.prototype, "clientWidth", cw);
});
afterEach(() => {
  cleanup();
  ROOM = 120;
  vi.unstubAllGlobals();
});

const UUID = "550e8400-e29b-41d4-a716-446655440000";
const LONG = "rosa-iqbal-claims-adjuster-northgate-mutual"; // 43 chars → 344px natural
const SHORT = "rosa"; // 32px natural

const pillBtn = () => screen.getByRole("button", { name: /view visualization/i });
const labelEl = (c: HTMLElement) => c.querySelector(".entviz-pill__label") as HTMLElement | null;

describe("host label overflow", () => {
  test("a label that fits is not marked truncated and keeps the value-only tooltip", () => {
    const { container } = render(<EntvizPill value={UUID} label={SHORT} />);
    const el = labelEl(container)!;
    expect(el.textContent).toBe(SHORT);
    expect(el.hasAttribute("data-truncated")).toBe(false);
    expect(pillBtn().getAttribute("title")).toBe(UUID);
  });

  test("the label element truncates with an ellipsis, and only the label shrinks", () => {
    const { container } = render(<EntvizPill value={UUID} label={LONG} />);
    const el = labelEl(container)!;
    expect(el.style.textOverflow).toBe("ellipsis");
    expect(el.style.overflow).toBe("hidden");
    expect(el.style.minWidth).toBe("0px");
    // The kebab and the role glyph never shrink, so they survive any maxWidth.
    const kebab = container.querySelector(".entviz-pill__kebab") as HTMLElement;
    expect(kebab.style.flex).toMatch(/^0 0 auto/);
    const glyph = kebab.nextElementSibling as HTMLElement;
    expect(glyph.style.flex).toMatch(/^0 0 auto/);
    // The pill button (holding the label) is the flex item that yields.
    expect(pillBtn().style.minWidth).toBe("0px");
  });

  test("a truncated label is flagged, carries its scroll distance, and joins the tooltip", () => {
    const { container } = render(<EntvizPill value={UUID} label={LONG} />);
    const el = labelEl(container)!;
    expect(el.hasAttribute("data-truncated")).toBe(true);
    expect(el.style.getPropertyValue("--entviz-pill-label-overflow")).toBe(`${LONG.length * CHAR_W - ROOM}px`);
    expect(el.style.getPropertyValue("--entviz-pill-marquee-duration")).toBe(`${marqueeSeconds(LONG.length * CHAR_W - ROOM)}s`);
    // Reduced-motion users (and anyone who would rather hover) read the whole label here.
    expect(pillBtn().getAttribute("title")).toBe(`${LONG}\n${UUID}`);
  });

  test("the accessible name always carries the FULL label, never the truncated form", () => {
    render(<EntvizPill value={UUID} label={LONG} />);
    expect(pillBtn().getAttribute("aria-label")).toContain(LONG);
  });

  test("resizing the window re-measures: a label that now fits is no longer truncated", () => {
    const { container } = render(<EntvizPill value={UUID} label={LONG} />);
    expect(labelEl(container)!.hasAttribute("data-truncated")).toBe(true);
    ROOM = 1000;
    act(() => { window.dispatchEvent(new Event("resize")); });
    expect(labelEl(container)!.hasAttribute("data-truncated")).toBe(false);
    expect(pillBtn().getAttribute("title")).toBe(UUID);
  });

  test("a ResizeObserver on the label re-measures when its own box changes", () => {
    const observers: { cb: () => void; disconnect: ReturnType<typeof vi.fn> }[] = [];
    vi.stubGlobal("ResizeObserver", class {
      disconnect = vi.fn();
      constructor(public cb: () => void) { observers.push(this); }
      observe() {}
    });
    const { container, unmount } = render(<EntvizPill value={UUID} label={LONG} />);
    expect(observers.length).toBeGreaterThan(0);
    ROOM = 1000;
    act(() => { observers.forEach((o) => o.cb()); });
    expect(labelEl(container)!.hasAttribute("data-truncated")).toBe(false);
    unmount();
    expect(observers.every((o) => o.disconnect.mock.calls.length === 1)).toBe(true);
  });

  test("type text (typeSignal=text) yields before the label", () => {
    const { container } = render(<EntvizPill value={UUID} label={LONG} typeSignal="text" />);
    const type = container.querySelector(".entviz-pill__type") as HTMLElement;
    const label = labelEl(container)!;
    expect(Number(type.style.flexShrink)).toBeGreaterThan(Number(label.style.flexShrink));
    expect(type.style.textOverflow).toBe("ellipsis");
  });

  test("the injected CSS scrolls only a truncated label, on hover or focus, and not under reduced motion", () => {
    render(<EntvizPill value={UUID} label={LONG} />);
    const css = document.getElementById("entviz-pill-styles")!.textContent!;
    expect(css).toMatch(/\.entviz-pill--hover \.entviz-pill__label\[data-truncated\]/);
    expect(css).toMatch(/\.entviz-pill__wrap:focus-within \.entviz-pill__label\[data-truncated\]/);
    expect(css).toMatch(/@keyframes entviz-pill-marquee/);
    // Reduced motion: no animation; keyboard focus wraps the label in place instead.
    const reduced = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toMatch(/animation: none/);
    expect(reduced).toMatch(/white-space: normal/);
  });
});

describe("marqueeSeconds", () => {
  test("scales with the distance, with a floor so a short scroll is still readable", () => {
    expect(marqueeSeconds(8)).toBe(2);
    expect(marqueeSeconds(600)).toBeGreaterThan(marqueeSeconds(300));
    expect(marqueeSeconds(300)).toBeGreaterThan(2);
  });
});

describe("mnemonic fitting — never truncated, never scrolled", () => {
  const CESR = "DKxy2sgzfplyr_tgwIxS19f2OchFHtLwPWD3v4oYimBx";
  const corpus: TrustAssumption = { posture: "corpus", mnemonic: true };
  const MN = mnemonic(describeChannels(CESR).cells, characterize(CESR).sizeBits);
  const full = MN.length * CHAR_W;

  test("fits at full size: shown at 100%", () => {
    ROOM = full + 10;
    const { container } = render(<EntvizPill value={CESR} trust={corpus} />);
    const el = labelEl(container)!;
    expect(el.textContent).toBe(MN);
    expect(el.style.fontSize).toBe("");
    expect(el.hasAttribute("data-truncated")).toBe(false);
  });

  test("too wide at 100% but fits at 85%: shown smaller, whole", () => {
    ROOM = Math.round(full * 0.9);
    const { container } = render(<EntvizPill value={CESR} trust={corpus} />);
    const el = labelEl(container)!;
    expect(el.textContent).toBe(MN);
    expect(el.style.fontSize).toBe("85%");
    // never the ellipsis/marquee treatment a host label gets
    expect(el.style.textOverflow).not.toBe("ellipsis");
    expect(el.hasAttribute("data-truncated")).toBe(false);
  });

  test("too wide even at 85%: dropped, and the type text takes the slot", () => {
    ROOM = Math.round(full * 0.5);
    const { container } = render(<EntvizPill value={CESR} trust={corpus} />);
    const btn = container.querySelector("button[aria-expanded]") as HTMLElement;
    expect(btn.textContent).not.toContain(MN);
    expect(btn.textContent).toContain("cesr");
    // Nothing partial of the mnemonic is ever shown — including in the accessible name.
    expect(btn.getAttribute("aria-label")).not.toContain(MN);
  });

  test("more room later brings the mnemonic back", () => {
    ROOM = Math.round(full * 0.5);
    const { container } = render(<EntvizPill value={CESR} trust={corpus} />);
    expect(container.textContent).not.toContain(MN);
    ROOM = full + 10;
    act(() => { window.dispatchEvent(new Event("resize")); });
    expect(labelEl(container)!.textContent).toBe(MN);
    expect(labelEl(container)!.style.fontSize).toBe("");
  });

  describe("with a ResizeObserver", () => {
    let fire: () => void = () => {};
    const stubRO = () =>
      vi.stubGlobal("ResizeObserver", class {
        constructor(cb: () => void) { fire = () => act(() => cb()); }
        observe() {}
        disconnect() {}
      });
    const widen = (el: HTMLElement, width: number) =>
      vi.spyOn(el, "getBoundingClientRect").mockReturnValue({ width } as DOMRect);

    test("the mnemonic comes back when the container grows past where it stepped down", () => {
      stubRO();
      ROOM = Math.round(full * 0.5);
      const { container } = render(<EntvizPill value={CESR} trust={corpus} />);
      expect(container.textContent).not.toContain(MN);
      ROOM = full + 10;
      widen(container, 500); // setup.ts reports every rect as 100 wide
      fire();
      expect(labelEl(container)!.textContent).toBe(MN);
    });

    test("a callback without growth (e.g. its own resize after dropping) does not reset the fit", () => {
      stubRO();
      ROOM = Math.round(full * 0.5);
      const { container } = render(<EntvizPill value={CESR} trust={corpus} />);
      ROOM = full + 10; // even if the label would now fit, the parent did not grow
      fire();
      expect(container.textContent).not.toContain(MN);
    });
  });

  test("an explicit host label still wins over the mnemonic and uses the truncation path", () => {
    const { container } = render(<EntvizPill value={CESR} trust={corpus} label={LONG} />);
    expect(labelEl(container)!.textContent).toBe(LONG);
    expect(labelEl(container)!.hasAttribute("data-truncated")).toBe(true);
  });
});

describe("⋮ menu: Find other occurrences…", () => {
  const openMenu = () => fireEvent.click(screen.getByRole("button", { name: /actions/i }));
  const menuItems = () => screen.getAllByRole("menuitem").map((b) => b.textContent);

  test("absent without onLocate", () => {
    render(<EntvizPill value={UUID} />);
    openMenu();
    expect(menuItems()).not.toContain("Find other occurrences…");
  });

  test("present with onLocate, directly after View visualization", () => {
    render(<EntvizPill value={UUID} onLocate={vi.fn()} />);
    openMenu();
    expect(menuItems().slice(0, 2)).toEqual(["View visualization", "Find other occurrences…"]);
  });

  test("absent when showLocateAffordance is false", () => {
    render(<EntvizPill value={UUID} onLocate={vi.fn()} showLocateAffordance={false} />);
    openMenu();
    expect(menuItems()).not.toContain("Find other occurrences…");
  });

  test("fires the same hook and event as the popover button, closes the menu, opens no popover", () => {
    const onLocate = vi.fn();
    const onEvent = vi.fn();
    const onOpenChange = vi.fn();
    render(<EntvizPill value={UUID} onLocate={onLocate} onEvent={onEvent} onOpenChange={onOpenChange} />);
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Find other occurrences…" }));
    expect(onLocate).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls.filter(([e]) => e.type === "locate")).toHaveLength(1);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  test("uses a host messages override for the label", () => {
    render(<EntvizPill value={UUID} onLocate={vi.fn()} messages={{ locateAction: "Show all" }} />);
    openMenu();
    expect(menuItems()).toContain("Show all");
  });

  test("comparison is NOT offered in the menu, even when onCompare is set", () => {
    render(<EntvizPill value={UUID} onLocate={vi.fn()} onCompare={vi.fn()} />);
    openMenu();
    expect(menuItems().some((t) => /compare/i.test(t ?? ""))).toBe(false);
  });
});

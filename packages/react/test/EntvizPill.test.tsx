import { afterEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describeChannels } from "@entviz/core";
import { EntvizPill } from "../src/index.ts";
import { a11yDescription, copyUnit, placeFloater, prettyType } from "../src/EntvizPill.ts";
import {
  fmt,
  isRtlLocale,
  resolveMessages,
  SUPPORTED_LOCALES,
} from "../src/pill-messages.ts";

const HEX = "0123456789abcdef"; // → hex·64 (32 hex chars would be an undashed UUID)
const UUID = "550e8400-e29b-41d4-a716-446655440000";
const BIG = "0123456789abcdef".repeat(16); // >512 bits → truncated
const BAD = { value: HEX, note: "toolongnote" }; // note > 10 chars → render throws

const clip = () => navigator.clipboard as { writeText: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn> };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// --- pure helpers ---------------------------------------------------------

describe("pure helpers", () => {
  test("prettyType", () => {
    expect(prettyType("hex(64)")).toBe("hex·256");
    expect(prettyType("txt(43)")).toBe("text");
    expect(prettyType("ETH")).toBe("Ethereum");
    expect(prettyType("UUID")).toBe("UUID");
  });

  test("copyUnit", () => {
    expect(copyUnit("hex·128")).toBe("hex chars");
    expect(copyUnit("UUID")).toBe("chars");
    expect(copyUnit(null)).toBe("chars");
  });

  test("placeFloater: anchors below when there is room", () => {
    const r = placeFloater(
      { top: 20, bottom: 30, left: 10, right: 110 },
      { width: 50, height: 40 },
      { width: 1000, height: 1000 },
      false,
    );
    expect(r.top).toBe(36); // bottom + gap
    expect(r.left).toBe(10);
  });

  test("placeFloater: flips above when there is no room below", () => {
    const r = placeFloater(
      { top: 90, bottom: 98, left: 10, right: 110 },
      { width: 50, height: 50 },
      { width: 1000, height: 100 },
      false,
    );
    expect(r.top).toBe(34); // top - height - gap
  });

  test("placeFloater: RTL right-aligns, and clamps into the viewport", () => {
    const rtl = placeFloater(
      { top: 20, bottom: 30, left: 60, right: 110 },
      { width: 50, height: 20 },
      { width: 1000, height: 1000 },
      true,
    );
    expect(rtl.left).toBe(60); // right - width
    const clamped = placeFloater(
      { top: 20, bottom: 30, left: -100, right: 0 },
      { width: 50, height: 20 },
      { width: 1000, height: 1000 },
      false,
    );
    expect(clamped.left).toBe(8); // clamped to pad
  });

  test("a11yDescription names every channel from the model", () => {
    const m = resolveMessages("en").messages;
    const s = a11yDescription(describeChannels(UUID), m);
    expect(s).toContain("UUID");
    expect(s).toContain("550e84"); // first cell text
    expect(s).toMatch(/g r b k/); // color-bar letters
    const big = a11yDescription(describeChannels(BIG), m);
    expect(big).toContain("·"); // a blank separator appears in the cells readout
  });
});

// --- localization catalog -------------------------------------------------

describe("pill-messages", () => {
  test("every supported locale resolves to a full bundle", () => {
    for (const loc of SUPPORTED_LOCALES) {
      const { messages } = resolveMessages(loc);
      expect(messages.view.length).toBeGreaterThan(0);
      expect(messages.desc).toContain("{cells}");
      // lifecycle chrome keys are present & non-empty in every locale
      for (const k of ["stepCite", "stepVisualize", "stepCompare", "teachVisualize", "compareAction"] as const) {
        expect(messages[k].length).toBeGreaterThan(0);
      }
    }
  });

  test("locale resolution: script/region, primary subtag, and English fallback", () => {
    expect(resolveMessages("zh-TW").locale).toBe("zh-Hant");
    expect(resolveMessages("zh-Hant-HK").locale).toBe("zh-Hant");
    expect(resolveMessages("zh-CN").locale).toBe("zh-Hans");
    expect(resolveMessages("fr-CA").locale).toBe("fr"); // primary subtag
    expect(resolveMessages("xx-YY").locale).toBe("en"); // unmatched → fallback
    expect(resolveMessages().messages.view.length).toBeGreaterThan(0); // auto-detect
  });

  test("isRtlLocale + fmt", () => {
    expect(isRtlLocale("ar")).toBe(true);
    expect(isRtlLocale("he-IL")).toBe(true);
    expect(isRtlLocale("en")).toBe(false);
    expect(fmt("{a}/{b}", { a: 1, b: "x" })).toBe("1/x");
    expect(fmt("{missing}", {})).toBe("{missing}");
  });

  test("resolveMessages: navigator.language fallback, then English when no navigator", () => {
    const langs = Object.getOwnPropertyDescriptor(navigator, "languages");
    // navigator.languages undefined → falls back to navigator.language
    Object.defineProperty(navigator, "languages", { configurable: true, value: undefined });
    expect(resolveMessages().messages.view.length).toBeGreaterThan(0);
    if (langs) Object.defineProperty(navigator, "languages", langs);
    // no navigator at all (SSR) → ["en"]
    vi.stubGlobal("navigator", undefined);
    expect(resolveMessages().locale).toBe("en");
    vi.unstubAllGlobals();
  });
});

// --- rendering ------------------------------------------------------------

describe("EntvizPill rendering", () => {
  test("renders the pill with badge, type, tooltip, and aria-label", () => {
    render(<EntvizPill value={HEX} />);
    const pill = screen.getByRole("button", { name: /view visualization/i });
    expect(pill.getAttribute("title")).toBe("View visualization");
    expect(pill.getAttribute("aria-label")).toBe("view visualization, hex·64");
    expect(screen.getByText("hex·64")).toBeTruthy();
    // badge = a 2x2 grid of 4 constant color cells
    expect(pill.querySelectorAll('span[aria-hidden] > span').length).toBe(4);
  });

  test("showIcon=false hides the badge; showType=false + label shows only the label", () => {
    const { rerender } = render(<EntvizPill value={HEX} showIcon={false} />);
    expect(screen.getByRole("button", { name: /view visualization/i }).querySelector("span[aria-hidden]")).toBeNull();
    rerender(<EntvizPill value={HEX} showType={false} label="my key" />);
    expect(screen.queryByText("hex·64")).toBeNull();
    expect(screen.getByText("my key")).toBeTruthy();
  });

  test(">512-bit input shows the 'fingerprint of' truncation marker", () => {
    render(<EntvizPill value={BIG} />);
    const pill = screen.getByRole("button", { name: /view visualization/i });
    expect(pill.getAttribute("aria-label")).toContain("fingerprint of");
    expect(screen.getByText("fingerprint of")).toBeTruthy();
  });

  test("a render error fires onError; the pill still renders (unrenderable)", () => {
    const onError = vi.fn();
    render(<EntvizPill {...BAD} onError={onError} />);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toMatch(/note/i);
    expect(screen.getByRole("button", { name: /unrenderable/i })).toBeTruthy();
  });
});

// --- expand / dismiss -----------------------------------------------------

describe("EntvizPill expand + dismiss", () => {
  test("click expands to a popover with a STANDARD entviz + toolbar (copy actions in its kebab); click again collapses", () => {
    render(<EntvizPill value={HEX} onExpand={vi.fn()} />);
    const pill = screen.getByRole("button", { name: /view visualization/i });
    fireEvent.click(pill);
    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector("svg")).toBeTruthy();
    // §9 accessible description is referenced and present
    const descId = dialog.getAttribute("aria-describedby");
    expect(descId).toBeTruthy();
    expect(document.getElementById(descId!)?.textContent).toContain("012345"); // first cell text
    // the expanded view is a standard <Entviz controls>: size ladder + a copy
    // kebab, NOT a row of bespoke copy buttons.
    const dlg = within(dialog);
    expect(dlg.getByRole("button", { name: /smaller/i })).toBeTruthy();
    expect(dlg.getByRole("button", { name: /larger/i })).toBeTruthy();
    const kebab = dlg.getByRole("button", { name: /actions/i });
    fireEvent.click(kebab);
    expect(dlg.getByRole("menuitem", { name: /copy value/i })).toBeTruthy();
    expect(dlg.getByRole("menuitem", { name: /copy svg/i })).toBeTruthy();
    fireEvent.click(pill);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("Escape and outside-click dismiss the popover", () => {
    render(<EntvizPill value={HEX} />);
    const pill = screen.getByRole("button", { name: /view visualization/i });
    fireEvent.click(pill);
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(pill);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("an errored pill expands to show the error message (no describedby)", () => {
    render(<EntvizPill {...BAD} />);
    fireEvent.click(screen.getByRole("button", { name: /unrenderable/i }));
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-describedby")).toBeNull();
    expect(dialog.textContent).toMatch(/note/i);
  });
});

// --- menu -----------------------------------------------------------------

describe("EntvizPill kebab menu", () => {
  test("kebab opens a menu of 5 actions; arrow keys navigate; pill ArrowDown opens it", async () => {
    render(<EntvizPill value={HEX} />);
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    const items = screen.getAllByRole("menuitem");
    expect(items.length).toBe(5);
    // the ARIA menu pattern moves focus to the first item on open (via rAF)
    await waitFor(() => expect((document.activeElement as HTMLElement).getAttribute("role")).toBe("menuitem"));
    const menu = screen.getByRole("menu");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    fireEvent.keyDown(menu, { key: "Home" });
    fireEvent.keyDown(menu, { key: "End" });
    fireEvent.keyDown(menu, { key: "x" }); // no-op branch
    expect((document.activeElement as HTMLElement).getAttribute("role")).toBe("menuitem");
    // re-open via the pill's ArrowDown
    fireEvent.keyDown(screen.getByRole("button", { name: /view visualization/i }), { key: "ArrowDown" });
    expect(screen.getByRole("menu")).toBeTruthy();
    // kebab keyboard open (ArrowUp)
    fireEvent.keyDown(screen.getByRole("button", { name: "Actions" }), { key: "ArrowUp" });
    expect(screen.getByRole("menu")).toBeTruthy();
  });
});

// --- copy actions ---------------------------------------------------------

describe("EntvizPill copy actions", () => {
  const openMenuAndClick = (label: RegExp) => {
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: label }));
  };

  test("copy value writes the raw value and confirms with the char count", async () => {
    const onCopy = vi.fn();
    render(<EntvizPill value={HEX} onCopy={onCopy} />);
    openMenuAndClick(/copy value/i);
    await waitFor(() => expect(clip().writeText).toHaveBeenCalledWith(HEX));
    expect((await screen.findAllByText(`Copied value · ${HEX.length} hex chars`)).length).toBeGreaterThan(0);
    expect(onCopy).toHaveBeenCalledWith("value");
  });

  test("copy comparison text writes the comparison string and counts filled cells", async () => {
    render(<EntvizPill value={UUID} />);
    openMenuAndClick(/copy comparison text/i);
    await waitFor(() => expect(clip().writeText).toHaveBeenCalled());
    const written = clip().writeText.mock.calls[0][0] as string;
    expect(written).toContain("550e84");
    expect((await screen.findAllByText(/Copied comparison text · \d+ cells/)).length).toBeGreaterThan(0);
  });

  test("copy SVG writes the markup", async () => {
    render(<EntvizPill value={HEX} />);
    openMenuAndClick(/copy svg/i);
    await waitFor(() =>
      expect((clip().writeText.mock.calls[0][0] as string).startsWith("<svg")).toBe(true),
    );
    expect((await screen.findAllByText("Copied SVG")).length).toBeGreaterThan(0);
  });

  test("copy image rasterizes and writes a PNG ClipboardItem", async () => {
    render(<EntvizPill value={HEX} />);
    openMenuAndClick(/copy image/i);
    await waitFor(() => expect(clip().write).toHaveBeenCalled());
    expect((await screen.findAllByText("Copied image")).length).toBeGreaterThan(0);
  });

  test("a clipboard failure surfaces 'Copy failed'", async () => {
    render(<EntvizPill value={HEX} />);
    clip().writeText.mockRejectedValueOnce(new Error("denied"));
    openMenuAndClick(/copy value/i);
    expect((await screen.findAllByText("Copy failed")).length).toBeGreaterThan(0);
  });

  test("copy on an errored pill (no render) fails closed", async () => {
    render(<EntvizPill {...BAD} />);
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /copy comparison text/i }));
    expect((await screen.findAllByText("Copy failed")).length).toBeGreaterThan(0);
  });

  test("Ctrl/Cmd+C on the pill copies the value", async () => {
    render(<EntvizPill value={HEX} />);
    fireEvent.keyDown(screen.getByRole("button", { name: /view visualization/i }), { key: "c", ctrlKey: true });
    await waitFor(() => expect(clip().writeText).toHaveBeenCalledWith(HEX));
  });
});

// --- direction + localization ---------------------------------------------

describe("EntvizPill dir + locale", () => {
  test("dir prop controls chrome mirroring", () => {
    const { rerender, container } = render(<EntvizPill value={HEX} dir="rtl" />);
    expect(container.firstElementChild?.getAttribute("dir")).toBe("rtl");
    rerender(<EntvizPill value={HEX} dir="ltr" />);
    expect(container.firstElementChild?.getAttribute("dir")).toBe("ltr");
    rerender(<EntvizPill value={HEX} dir="auto" locale="ar" />);
    expect(container.firstElementChild?.getAttribute("dir")).toBe("rtl");
    rerender(<EntvizPill value={HEX} />);
    expect(container.firstElementChild?.getAttribute("dir")).toBeNull();
  });

  test("locale localizes chrome; messages override wins", () => {
    const { rerender } = render(<EntvizPill value={HEX} locale="fr" />);
    expect(screen.getByRole("button", { name: /voir la visualisation/i })).toBeTruthy();
    rerender(<EntvizPill value={HEX} locale="fr" messages={{ view: "Custom" }} />);
    // the aria-label stays French; the `view` override changes the tooltip
    expect(screen.getByRole("button", { name: /voir la visualisation/i }).getAttribute("title")).toBe("Custom");
  });
});

// --- coverage edges -------------------------------------------------------

describe("EntvizPill edges", () => {
  test("hover toggles the kebab-visibility class", () => {
    const { container } = render(<EntvizPill value={HEX} />);
    const wrap = container.firstElementChild as HTMLElement;
    fireEvent.mouseEnter(wrap);
    expect(wrap.classList.contains("entviz-pill--hover")).toBe(true);
    fireEvent.mouseLeave(wrap);
    expect(wrap.classList.contains("entviz-pill--hover")).toBe(false);
  });

  test("Cmd+C copies the value, and the toast positions for RTL", async () => {
    render(<EntvizPill value={HEX} dir="rtl" />);
    fireEvent.keyDown(screen.getByRole("button", { name: /view visualization/i }), { key: "C", metaKey: true });
    await waitFor(() => expect(clip().writeText).toHaveBeenCalledWith(HEX));
    expect((await screen.findAllByText(/Copied value/)).length).toBeGreaterThan(0);
  });

  test("copy SVG and copy image also fail closed on an errored pill", async () => {
    render(<EntvizPill {...BAD} />);
    for (const name of [/copy svg/i, /copy image/i]) {
      fireEvent.click(screen.getByRole("button", { name: "Actions" }));
      fireEvent.click(screen.getByRole("menuitem", { name }));
      expect((await screen.findAllByText("Copy failed")).length).toBeGreaterThan(0);
    }
  });

  test("the copy toast auto-dismisses after its timeout", async () => {
    vi.useFakeTimers();
    try {
      render(<EntvizPill value={HEX} />);
      const pill = screen.getByRole("button", { name: /view visualization/i });
      await act(async () => {
        fireEvent.keyDown(pill, { key: "c", ctrlKey: true });
        await vi.advanceTimersByTimeAsync(1); // resolve the clipboard write + run flash()
      });
      expect(screen.getAllByText(/Copied value/).length).toBeGreaterThan(0);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2400); // fire the dismiss timer
      });
      expect(screen.queryByText(/Copied value/)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  test("copy image surfaces failure when the SVG can't be decoded", async () => {
    const RealImage = globalThis.Image;
    class FailImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_v: string) { Promise.resolve().then(() => this.onerror?.()); }
    }
    (globalThis as unknown as { Image: unknown }).Image = FailImage;
    render(<EntvizPill value={HEX} />);
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /copy image/i }));
    expect((await screen.findAllByText("Copy failed")).length).toBeGreaterThan(0);
    (globalThis as unknown as { Image: unknown }).Image = RealImage;
  });
});

// --- disclosure lifecycle: Cite · Visualize · Compare ---------------------

describe("EntvizPill disclosure lifecycle", () => {
  const expand = () => fireEvent.click(screen.getByRole("button", { name: /view visualization/i }));

  test("expanded (no onCompare): rail shows Cite·Visualize, teaching header, no compare affordance", () => {
    render(<EntvizPill value={HEX} />);
    expand();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Cite")).toBeTruthy();
    expect(within(dialog).getByText("Visualize")).toBeTruthy();
    // teaching header (Seam 1)
    expect(within(dialog).getByText(/read the cells to check a value/i)).toBeTruthy();
    // recognition-only: no compare step, no compare button, no acquisition field
    expect(within(dialog).queryByText("Compare")).toBeNull();
    expect(screen.queryByRole("button", { name: /compare against a reference/i })).toBeNull();
    expect(within(dialog).queryByRole("textbox")).toBeNull();
    // grow-from-pill motion class is applied
    expect(dialog.classList.contains("entviz-pill__pop")).toBe(true);
  });

  test("onCompare opts in the compare affordance + the Compare rail step", () => {
    render(<EntvizPill value={HEX} onCompare={vi.fn()} />);
    expand();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Compare")).toBeTruthy();
    expect(screen.getByRole("button", { name: /compare against a reference/i })).toBeTruthy();
    // still recognition-only until the user chooses to verify
    expect(within(dialog).queryByRole("textbox")).toBeNull();
  });

  test("clicking the affordance enters compare: fires onCompare, renders the real <EntvizCompare> (a reference-requiring task, not a verdict)", () => {
    const onCompare = vi.fn();
    render(<EntvizPill value={UUID} onCompare={onCompare} />);
    expand();
    fireEvent.click(screen.getByRole("button", { name: /compare against a reference/i }));
    expect(onCompare).toHaveBeenCalledTimes(1);
    const dialog = screen.getByRole("dialog");
    // EntvizCompare's reference-acquisition field is now present (the gate)…
    expect(within(dialog).getByRole("textbox")).toBeTruthy();
    // …and no affirmative verdict is shown at entry (no green "=" chip yet).
    expect(within(dialog).queryByText("=")).toBeNull();
    // the visualize-state affordance/teaching are replaced, not duplicated
    expect(screen.queryByRole("button", { name: /compare against a reference/i })).toBeNull();
  });

  test("showCompareAffordance={false} keeps the hook but hides the built-in button", () => {
    render(<EntvizPill value={HEX} onCompare={vi.fn()} showCompareAffordance={false} />);
    expand();
    expect(screen.queryByRole("button", { name: /compare against a reference/i })).toBeNull();
    expect(within(screen.getByRole("dialog")).queryByText("Compare")).toBeNull();
  });

  test("collapsing resets to the visualize state (no back-slide into a stale compare)", () => {
    render(<EntvizPill value={HEX} onCompare={vi.fn()} />);
    expand();
    fireEvent.click(screen.getByRole("button", { name: /compare against a reference/i }));
    expect(within(screen.getByRole("dialog")).getByRole("textbox")).toBeTruthy();
    // click the pill again to collapse, then reopen
    fireEvent.click(screen.getByRole("button", { name: /view visualization/i }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expand();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByRole("textbox")).toBeNull(); // back at visualize
    expect(screen.getByRole("button", { name: /compare against a reference/i })).toBeTruthy();
  });

  test("lifecycle chrome is localized", () => {
    render(<EntvizPill value={HEX} locale="fr" onCompare={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /voir la visualisation/i }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Citer")).toBeTruthy();
    expect(within(dialog).getByText("Visualiser")).toBeTruthy();
    expect(screen.getByRole("button", { name: /comparer à une référence/i })).toBeTruthy();
  });
});

// --- onEvent firehose ------------------------------------------------------

describe("EntvizPill onEvent firehose", () => {
  const of = (spy: ReturnType<typeof vi.fn>, type: string) =>
    spy.mock.calls.map((c) => c[0]).filter((e) => e.type === type);
  const last = (spy: ReturnType<typeof vi.fn>, type: string) => {
    const es = of(spy, type);
    return es[es.length - 1];
  };
  const expand = () => fireEvent.click(screen.getByRole("button", { name: /view visualization/i }));

  test("stamps seq/ts/source=pill and increments seq monotonically", () => {
    const onEvent = vi.fn();
    render(<EntvizPill value={HEX} onCompare={vi.fn()} onEvent={onEvent} />);
    expand(); // pill → visualize
    fireEvent.click(screen.getByRole("button", { name: /compare against a reference/i })); // visualize → compare
    expect(onEvent).toHaveBeenCalled();
    const evs = onEvent.mock.calls.map((c) => c[0]);
    for (const e of evs) {
      expect(e.source).toBe("pill");
      expect(typeof e.ts).toBe("number");
      expect(typeof e.seq).toBe("number");
    }
    const seqs = evs.map((e) => e.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(new Set(seqs).size).toBe(seqs.length);
  });

  test("a throwing host handler never breaks the pill", () => {
    const onEvent = vi.fn(() => { throw new Error("host bug"); });
    render(<EntvizPill value={HEX} onEvent={onEvent} />);
    expect(() => fireEvent.click(screen.getByRole("button", { name: /view visualization/i }))).not.toThrow();
    expect(screen.getByRole("dialog")).toBeTruthy(); // still expands
  });

  test("disclosure.change fires on pill→visualize→compare→pill transitions, carrying prev", () => {
    const onEvent = vi.fn();
    render(<EntvizPill value={HEX} onCompare={vi.fn()} onEvent={onEvent} />);
    expand();
    expect(last(onEvent, "disclosure.change")).toMatchObject({ state: "visualize", prev: "pill" });
    fireEvent.click(screen.getByRole("button", { name: /compare against a reference/i }));
    expect(last(onEvent, "disclosure.change")).toMatchObject({ state: "compare", prev: "visualize" });
    // collapse (Escape) → back to the pill state
    fireEvent.keyDown(document, { key: "Escape" });
    expect(last(onEvent, "disclosure.change")).toMatchObject({ state: "pill", prev: "compare" });
  });

  test("disclosure.change does not re-emit an unchanged state on an unrelated re-render", () => {
    const onEvent = vi.fn();
    const { rerender } = render(<EntvizPill value={HEX} onEvent={onEvent} />);
    expand();
    const count = of(onEvent, "disclosure.change").length;
    rerender(<EntvizPill value={HEX} label="x" onEvent={onEvent} />); // still expanded → "visualize"
    expect(of(onEvent, "disclosure.change").length).toBe(count);
  });

  test("copy fires {kind, ok:true} on success and {ok:false} on failure", async () => {
    const onEvent = vi.fn();
    render(<EntvizPill value={HEX} onEvent={onEvent} />);
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /copy value/i }));
    await waitFor(() => expect(of(onEvent, "copy").length).toBeGreaterThan(0));
    expect(last(onEvent, "copy")).toMatchObject({ kind: "value", ok: true });
    clip().writeText.mockRejectedValueOnce(new Error("denied"));
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /copy value/i }));
    await waitFor(() => expect(last(onEvent, "copy")).toMatchObject({ kind: "value", ok: false }));
  });

  test("render.error fires with the message on an unrenderable pill", () => {
    const onEvent = vi.fn();
    render(<EntvizPill {...BAD} onEvent={onEvent} />);
    const e = last(onEvent, "render.error");
    expect(e).toBeTruthy();
    expect(e.message).toMatch(/note/i);
  });
});

import { afterEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { characterize, describeChannels } from "@entviz/core";
import { EntvizPill } from "../src/index.ts";
import { a11yDescription, copyUnit, pillRole, pillType, placeFloater } from "../src/EntvizPill.ts";
import {
  fmt,
  isRtlLocale,
  resolveMessages,
  SUPPORTED_LOCALES,
} from "../src/pill-messages.ts";

const HEX = "0123456789abcdef"; // → entropyType "hex" (32 hex chars would be an undashed UUID)
const UUID = "550e8400-e29b-41d4-a716-446655440000";
const CESR = "EBfdlu8R27Fbx_ehrqwImnK_8Cm79sqbAQ4caaZG_LFv"; // scheme "cesr", role "digest"
const DID = "did:ethr:0x5:0xf3beac30c498d9e26865f34fcaa57dbb935b0d74"; // scheme "did", role "identifier"
const BIG = "0123456789abcdef".repeat(16); // >512 bits → truncated
const BAD = { value: HEX, note: "toolongnote" }; // note > 10 chars → render throws

const clip = () => navigator.clipboard as { writeText: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn> };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// --- pure helpers ---------------------------------------------------------

describe("pure helpers", () => {
  test("copyUnit", () => {
    expect(copyUnit("hex")).toBe("hex chars");
    expect(copyUnit("uuid")).toBe("chars");
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

  test("a11yDescription prefers the structured entropy type when supplied", () => {
    const m = resolveMessages("en").messages;
    // The render model's drawn label for a CESR value is "CESR Blake3-256:";
    // passing the STRUCTURED entropyType ("cesr") makes the description read the
    // clean token instead of the label string.
    const structured = a11yDescription(describeChannels(CESR), m, "cesr");
    expect(structured).toContain("cesr");
    expect(structured).not.toContain("Blake3-256");
    // omitting the override falls back to the drawn label (the render model's typeName)
    const fallback = a11yDescription(describeChannels(CESR), m);
    expect(fallback).toContain("CESR");
  });
});

// --- structured characterization consumption (spec v13) --------------------
// The pill reads scheme/role/qualifiers/entropyType off the structured
// characterization — it no longer string-parses the drawn label. These tests
// pin that structured path directly.

describe("structured characterization", () => {
  test("pillType returns entropyType (scheme ?? encoding), not a parsed label", () => {
    expect(pillType(characterize(HEX))).toBe("hex");
    expect(pillType(characterize(UUID))).toBe("uuid");
    expect(pillType(characterize(CESR))).toBe("cesr");
    expect(pillType(characterize(DID))).toBe("did");
    // the drawn label would carry a count / "Blake3-256:"; the structured type never does
    expect(pillType(characterize(CESR))).not.toContain("(");
    expect(pillType(characterize(CESR))).not.toContain("Blake3");
    expect(pillType(null)).toBeNull();
  });

  test("pillRole is the closed-enum role, present only where the recognizer asserts one", () => {
    expect(pillRole(characterize(CESR))).toBe("digest");
    expect(pillRole(characterize(DID))).toBe("identifier");
    expect(pillRole(characterize("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"))).toBe("address");
    // a bare encoding gets NO role (entviz does not guess)
    expect(pillRole(characterize(HEX))).toBeNull();
    expect(pillRole(null)).toBeNull();
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
      // the popover-close label is localized in every shipped bundle (L10N-F3);
      // no locale should fall back to the English "Close".
      expect(messages.close?.length ?? 0).toBeGreaterThan(0);
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
  test("stays valid HTML inside prose in EVERY state (no flow content ever lands in the <p>)", () => {
    render(
      <p>
        save <EntvizPill value={UUID} onCompare={vi.fn()} /> to disk
      </p>,
    );
    const p = document.querySelector("p")!;
    // A <p> may hold only phrasing content. The pill must never place a block/flow
    // element inside it in ANY state — its overlays (popover, compare) portal to a
    // flow-content ancestor, and its CSS injects to <head>. If any of that regresses,
    // a <div>/<style>/etc. appears under the <p> and this fails. This is the guard
    // that keeps the pill valid everywhere in prose.
    const FLOW = "div,p,section,article,aside,nav,header,footer,main,ul,ol,li,table,style,h1,h2,h3,h4,h5,h6,figure,form,fieldset,hr,pre,blockquote";
    const proseClean = (label: string) =>
      expect(p.querySelectorAll(FLOW).length, `flow content leaked into <p> (${label})`).toBe(0);

    proseClean("collapsed");
    fireEvent.click(screen.getByRole("button", { name: /view visualization/i })); // expand → visualize
    // the popover was portaled to a flow-content ancestor, not left inside the <p>
    expect(p.contains(screen.getByRole("dialog"))).toBe(false);
    proseClean("visualize");
    fireEvent.click(screen.getByRole("button", { name: /compare against another value/i })); // → compare
    proseClean("compare");
  });

  test("renders the pill with badge, type, and aria-label; tooltip previews the value", () => {
    render(<EntvizPill value={HEX} />);
    const pill = screen.getByRole("button", { name: /view visualization/i });
    // The hover tooltip previews the value (not "View visualization"); the pointer
    // cursor implies clickability. The accessible name is unchanged.
    expect(pill.getAttribute("title")).toBe(HEX);
    expect(pill.getAttribute("aria-label")).toBe("view visualization, hex");
    expect(screen.getByText("hex")).toBeTruthy();
    // badge = a 2x2 grid of 4 constant color cells
    expect(pill.querySelectorAll('span[aria-hidden] > span').length).toBe(4);
  });

  test("showIcon=false hides the badge; showType=false + label shows only the label", () => {
    const { rerender } = render(<EntvizPill value={HEX} showIcon={false} />);
    expect(screen.getByRole("button", { name: /view visualization/i }).querySelector("span[aria-hidden]")).toBeNull();
    rerender(<EntvizPill value={HEX} showType={false} label="my key" />);
    expect(screen.queryByText("hex")).toBeNull();
    expect(screen.getByText("my key")).toBeTruthy();
  });

  test(">512-bit input: the pill shows the bare type, NOT the '+hash' caveat", () => {
    // the large-input caveat (v15: "+hash") is a visualization note; it must
    // never appear on the pill
    render(<EntvizPill value={BIG} />);
    const pill = screen.getByRole("button", { name: /view visualization/i });
    expect(pill.getAttribute("aria-label")).not.toContain("+hash");
    expect(screen.queryByText(/\+hash/i)).toBeNull();
    expect(screen.getByText("hex")).toBeTruthy(); // typeName "hex(256)" → entropyType "hex"
  });

  test("renders the structured scheme + role from the characterization", () => {
    // A CESR value: the pill reads scheme "cesr" (the type token) and the
    // closed-enum role "digest" as a secondary caption — both structured fields,
    // not substrings of the drawn "CESR Blake3-256:" label.
    render(<EntvizPill value={CESR} />);
    expect(screen.getByText("cesr")).toBeTruthy();
    expect(screen.getByText("digest")).toBeTruthy();
    // the label's algorithm text never leaks onto the pill
    expect(screen.queryByText(/Blake3-256/)).toBeNull();
    const pill = screen.getByRole("button", { name: /view visualization/i });
    expect(pill.getAttribute("aria-label")).toBe("view visualization, cesr");
  });

  test("a bare encoding shows the type but no role caption (entviz does not guess)", () => {
    render(<EntvizPill value={HEX} />);
    expect(screen.getByText("hex")).toBeTruthy();
    // none of the closed-enum role words appears for a bare hex value
    for (const role of ["key", "signature", "digest", "address", "identifier"]) {
      expect(screen.queryByText(role)).toBeNull();
    }
  });

  test("a render error fires onError; the pill still renders (unrenderable)", () => {
    const onError = vi.fn();
    render(<EntvizPill {...BAD} onError={onError} />);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toMatch(/note/i);
    expect(screen.getByRole("button", { name: /unrenderable/i })).toBeTruthy();
  });

  test("v14: a checksum-rejected value fails closed — onError fires, no fake type is shown", () => {
    // a valid EIP-55 address with its last checksum char flipped (d→D): characterize()
    // now THROWS instead of rendering it as a valid address (v14 verified checksums).
    const onError = vi.fn();
    render(<EntvizPill value="0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAeD" onError={onError} />);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toMatch(/checksum/i); // a meaningful, specific reason
    // it must NOT silently masquerade as a valid ETH address
    expect(screen.queryByText("eth")).toBeNull();
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

  test("Escape and the ✕ dismiss the popover; an outside click does NOT", () => {
    render(<EntvizPill value={HEX} />);
    const pill = screen.getByRole("button", { name: /view visualization/i });
    fireEvent.click(pill);
    expect(screen.getByRole("dialog")).toBeTruthy();
    // an incidental outside click (e.g. clicking back into the window) must NOT close it
    fireEvent.mouseDown(document.body);
    expect(screen.getByRole("dialog")).toBeTruthy();
    // Escape closes
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    // reopen; the explicit ✕ closes
    fireEvent.click(pill);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /close/i }));
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
    // A messages override wins over the locale's chrome (the accessible name here,
    // since the collapsed pill no longer carries a `view` tooltip).
    rerender(<EntvizPill value={HEX} locale="fr" messages={{ ariaView: "Custom {type}" }} />);
    expect(screen.getByRole("button", { name: "Custom hex" })).toBeTruthy();
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

  test("expanded (no onCompare): rail shows Cite·Visualize, no compare affordance", () => {
    render(<EntvizPill value={HEX} />);
    expand();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Cite")).toBeTruthy();
    expect(within(dialog).getByText("Visualize")).toBeTruthy();
    // recognition-only: no compare step, no compare button, no acquisition field
    expect(within(dialog).queryByText("Compare")).toBeNull();
    expect(screen.queryByRole("button", { name: /compare against another value/i })).toBeNull();
    expect(within(dialog).queryByRole("textbox")).toBeNull();
    // grow-from-pill motion class is applied
    expect(dialog.classList.contains("entviz-pill__pop")).toBe(true);
  });

  test("onCompare opts in the compare affordance + the Compare rail step", () => {
    render(<EntvizPill value={HEX} onCompare={vi.fn()} />);
    expand();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Compare")).toBeTruthy();
    expect(screen.getByRole("button", { name: /compare against another value/i })).toBeTruthy();
    // still recognition-only until the user chooses to verify
    expect(within(dialog).queryByRole("textbox")).toBeNull();
  });

  test("clicking the affordance enters compare: fires onCompare, renders the real <EntvizCompare> (a reference-requiring task, not a verdict)", () => {
    const onCompare = vi.fn();
    render(<EntvizPill value={UUID} onCompare={onCompare} />);
    expand();
    fireEvent.click(screen.getByRole("button", { name: /compare against another value/i }));
    expect(onCompare).toHaveBeenCalledTimes(1);
    const dialog = screen.getByRole("dialog");
    // EntvizCompare's reference-acquisition field is now present (the gate)…
    expect(within(dialog).getByRole("textbox")).toBeTruthy();
    // …and no affirmative verdict is shown at entry (no green "=" chip yet).
    expect(within(dialog).queryByText("=")).toBeNull();
    // the visualize-state affordance/teaching are replaced, not duplicated
    expect(screen.queryByRole("button", { name: /compare against another value/i })).toBeNull();
  });

  test("showCompareAffordance={false} keeps the hook but hides the built-in button", () => {
    render(<EntvizPill value={HEX} onCompare={vi.fn()} showCompareAffordance={false} />);
    expand();
    expect(screen.queryByRole("button", { name: /compare against another value/i })).toBeNull();
    expect(within(screen.getByRole("dialog")).queryByText("Compare")).toBeNull();
  });

  test("collapsing resets to the visualize state (no back-slide into a stale compare)", () => {
    render(<EntvizPill value={HEX} onCompare={vi.fn()} />);
    expand();
    fireEvent.click(screen.getByRole("button", { name: /compare against another value/i }));
    expect(within(screen.getByRole("dialog")).getByRole("textbox")).toBeTruthy();
    // click the pill again to collapse, then reopen
    fireEvent.click(screen.getByRole("button", { name: /view visualization/i }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expand();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByRole("textbox")).toBeNull(); // back at visualize
    expect(screen.getByRole("button", { name: /compare against another value/i })).toBeTruthy();
  });

  test("the Visualize rail step steps back out of compare without closing the popover", () => {
    render(<EntvizPill value={HEX} onCompare={vi.fn()} />);
    expand();
    fireEvent.click(screen.getByRole("button", { name: /compare against another value/i }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("textbox")).toBeTruthy(); // in compare
    // the Visualize step is now a link back to the visualization
    fireEvent.click(within(dialog).getByRole("button", { name: /^visualize$/i }));
    // popover stays open, but we're back at the visualize state (no reference field)
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(within(screen.getByRole("dialog")).queryByRole("textbox")).toBeNull();
    // and the compare affordance is offered again
    expect(screen.getByRole("button", { name: /compare against another value/i })).toBeTruthy();
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
    fireEvent.click(screen.getByRole("button", { name: /compare against another value/i })); // visualize → compare
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
    fireEvent.click(screen.getByRole("button", { name: /compare against another value/i }));
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

// --- controlled disclosure: open / onOpenChange ---------------------------

describe("EntvizPill controlled disclosure (open / onOpenChange)", () => {
  const view = () => screen.getByRole("button", { name: /view visualization/i });

  test("open={true} opens the popover without a click; open={false} keeps it closed", () => {
    const { rerender } = render(<EntvizPill value={HEX} open={false} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender(<EntvizPill value={HEX} open={true} />);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(view().getAttribute("aria-expanded")).toBe("true");
    // host closes it again
    rerender(<EntvizPill value={HEX} open={false} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("clicking a controlled pill fires onOpenChange but does NOT self-toggle (host owns state)", () => {
    const onOpenChange = vi.fn();
    // controlled-closed: a click requests OPEN but the popover stays closed until
    // the host flips `open`.
    const { rerender } = render(<EntvizPill value={HEX} open={false} onOpenChange={onOpenChange} />);
    fireEvent.click(view());
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    expect(screen.queryByRole("dialog")).toBeNull(); // did NOT open on its own
    // controlled-open: a click requests CLOSE, still no self-toggle.
    rerender(<EntvizPill value={HEX} open={true} onOpenChange={onOpenChange} />);
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(view());
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole("dialog")).toBeTruthy(); // still open — host hasn't flipped it
  });

  test("Escape on a controlled-open pill requests close via onOpenChange (no self-toggle)", () => {
    const onOpenChange = vi.fn();
    render(<EntvizPill value={HEX} open={true} onOpenChange={onOpenChange} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole("dialog")).toBeTruthy(); // host owns the state
  });

  test("uncontrolled still works AND fires onOpenChange on open/close transitions", () => {
    const onOpenChange = vi.fn();
    render(<EntvizPill value={HEX} onOpenChange={onOpenChange} />);
    // click opens (internal state flips) and notifies
    fireEvent.click(view());
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    // click collapses and notifies
    fireEvent.click(view());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  test("uncontrolled with no onOpenChange keeps the plain toggle behavior", () => {
    render(<EntvizPill value={HEX} />);
    fireEvent.click(view());
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(view());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("SECURITY (§5.3): entering compare under controlled open still yields the EntvizCompare reference gate", () => {
    // A host drives the pill open (controlled) and opts into compare. Controlled
    // `open` must NOT let the compare journey skip the reference-acquisition
    // surface (where the provenance chrome + §2.4 scoping copy live). Entering
    // compare must still render <EntvizCompare>'s acquisition textbox, and show no
    // affirmative "=" verdict at entry.
    render(<EntvizPill value={UUID} open={true} onCompare={vi.fn()} onOpenChange={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /compare against another value/i }));
    expect(within(screen.getByRole("dialog")).getByRole("textbox")).toBeTruthy();
    expect(within(screen.getByRole("dialog")).queryByText("=")).toBeNull();
  });
});

describe("EntvizPill popover accessibility", () => {
  test("the popover is an aria-modal dialog (A11Y-F2)", () => {
    render(<EntvizPill value={HEX} />);
    fireEvent.click(screen.getByRole("button", { name: /view visualization/i }));
    expect(screen.getByRole("dialog").getAttribute("aria-modal")).toBe("true");
  });

  test("opening the popover moves focus into it (A11Y-F1)", async () => {
    render(<EntvizPill value={HEX} />);
    fireEvent.click(screen.getByRole("button", { name: /view visualization/i }));
    const dialog = screen.getByRole("dialog");
    // Before the fix, focus stayed on the pill button (a sibling of the portaled
    // dialog), so keyboard/SR users had to back-navigate to reach the content.
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
  });

  test("the popover close button meets the WCAG 2.5.8 minimum touch target (A11Y-F5)", () => {
    render(<EntvizPill value={HEX} />);
    fireEvent.click(screen.getByRole("button", { name: /view visualization/i }));
    const closeBtn = within(screen.getByRole("dialog")).getByRole("button", { name: /close/i });
    expect(parseInt(closeBtn.style.width, 10)).toBeGreaterThanOrEqual(24);
    expect(parseInt(closeBtn.style.height, 10)).toBeGreaterThanOrEqual(24);
  });

  // The popover is centered in the viewport (not anchored below the pill, which ran
  // off the bottom/edge of the screen), and scrolls when it is taller than the
  // screen — so the whole visualization stays reachable on small/short viewports.
  test("the popover is centered on screen and scrolls on overflow", () => {
    render(<EntvizPill value={HEX} />);
    fireEvent.click(screen.getByRole("button", { name: /view visualization/i }));
    const dialog = screen.getByRole("dialog");
    // The dialog sits inside a full-viewport centering overlay, not positioned by
    // per-pill floater math (top/left offsets from the anchor).
    const overlay = dialog.parentElement as HTMLElement;
    expect(overlay.style.position).toBe("fixed");
    expect(overlay.style.alignItems).toBe("center");
    expect(overlay.style.justifyContent).toBe("center");
    // The overlay must not steal clicks from the page (the pill's popover is
    // non-modal and does not close on outside-click) — only the dialog is interactive.
    expect(overlay.style.pointerEvents).toBe("none");
    expect(dialog.style.pointerEvents).toBe("auto");
    // The dialog is no longer absolutely/fixed-positioned by an anchor offset…
    expect(dialog.style.top).toBe("");
    expect(dialog.style.left).toBe("");
    // …and it caps its height + scrolls so a tall popover never runs off-screen.
    expect(dialog.style.overflowY).toBe("auto");
    expect(dialog.style.maxHeight).toBeTruthy();
  });
});

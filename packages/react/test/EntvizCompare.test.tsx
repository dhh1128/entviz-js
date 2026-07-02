import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render as rtlRender, screen, waitFor } from "@testing-library/react";
import { render, comparisonText, type Verdict } from "@entviz/core";
import { EntvizCompare } from "../src/index.ts";
import { classifyResult, looksLikeSecret, readFileAsReference } from "../src/EntvizCompare.ts";

const HEX = "0123456789abcdef";
const OTHER = "fedcba9876543210";
const BIG = "0123456789abcdef".repeat(16); // >512 bits → truncated
const SVG = render(HEX); // a faithful entviz SVG of HEX

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const status = () => screen.getByRole("status").textContent ?? "";

// The raster/file paths are async (FileReader / Image decode → canvas → render
// ours → disprove). The chain is microtask-fast, but waitFor's 1s default is
// wall-clock — under the full suite with v8 coverage a starved event loop can
// blow past it and flake. Give those waits real headroom (well under the 20s
// testTimeout).
const RWAIT = { timeout: 8000 };

// --- pure helpers ---------------------------------------------------------

describe("classifyResult", () => {
  test("empty → pending; text → value verdict (with the value to render)", () => {
    expect(classifyResult(HEX, "  ")).toEqual({ kind: "pending" });
    expect(classifyResult(HEX, HEX)).toEqual({ kind: "verdict", verdict: { state: "identical" }, refValue: HEX });
    expect(classifyResult(HEX, OTHER)).toEqual({ kind: "verdict", verdict: { state: "different" }, refValue: OTHER });
  });
  test("a faithful entviz SVG → identical; a different one → different; garbage → unknown", () => {
    expect(classifyResult(HEX, SVG)).toEqual({ kind: "verdict", verdict: { state: "identical" }, refValue: HEX });
    expect(classifyResult(OTHER, SVG)).toEqual({ kind: "verdict", verdict: { state: "different" }, refValue: null });
    const r = classifyResult(HEX, "<svg></svg>");
    expect(r.kind).toBe("verdict");
    expect((r as { verdict: { state: string } }).verdict.state).toBe("unknown");
  });
  test("comparison text: matching our value → identical + render OUR figure", () => {
    const ct = comparisonText(HEX);
    expect(ct).toMatch(/\s/); // it's space-separated cells, not a lone token
    expect(classifyResult(HEX, ct)).toEqual({ kind: "verdict", verdict: { state: "identical" }, refValue: HEX });
  });
  test("comparison text: a different value → different + no reference figure to draw", () => {
    expect(classifyResult(HEX, comparisonText(OTHER))).toEqual({
      kind: "verdict", verdict: { state: "different" }, refValue: null,
    });
  });
  test("comparison text: a >512-bit match is unknown (strong, not proof) + renders ours", () => {
    const r = classifyResult(BIG, comparisonText(BIG)) as { kind: string; verdict: Verdict; refValue: string | null };
    expect(r.kind).toBe("verdict");
    expect(r.verdict.state).toBe("unknown");
    expect(r.refValue).toBe(BIG);
  });
  test("a multi-word value that matches wins over comparison-text routing", () => {
    const phrase = "correct horse battery staple";
    expect(classifyResult(phrase, phrase)).toEqual({ kind: "verdict", verdict: { state: "identical" }, refValue: phrase });
  });
  test("a raster data URL is deferred; ambiguous fails closed", () => {
    expect(classifyResult(HEX, "data:image/png;base64,iVBOR")).toEqual({ kind: "deferred", medium: "raster" });
    expect(classifyResult(HEX, "https://example.com")).toEqual({ kind: "ambiguous" });
  });
});

describe("looksLikeSecret", () => {
  test("flags secret material, ignores ordinary values", () => {
    expect(looksLikeSecret("-----BEGIN EC PRIVATE KEY-----\nx")).toBe(true);
    expect(looksLikeSecret("xprv" + "a".repeat(60))).toBe(true);
    expect(looksLikeSecret("legal winner thank year wave sausage worth useful legal winner thank yellow")).toBe(true);
    expect(looksLikeSecret(HEX)).toBe(false);
  });
});

describe("readFileAsReference", () => {
  test("reads SVG/text as text and other images as a data URL", async () => {
    const svgFile = new File([SVG], "ref.svg", { type: "image/svg+xml" });
    await expect(readFileAsReference(svgFile)).resolves.toContain("<svg");
    const png = new File([new Uint8Array([1, 2, 3])], "x.png", { type: "image/png" });
    await expect(readFileAsReference(png)).resolves.toMatch(/^data:image\/png/);
  });
});

// --- component ------------------------------------------------------------

describe("EntvizCompare", () => {
  test("renders, starts pending, shows the user's panel + acquisition controls", () => {
    rtlRender(<EntvizCompare value={HEX} />);
    expect(screen.getByText("Compare visualizations")).toBeTruthy();
    expect(screen.getAllByRole("img").length).toBe(1);
    expect(screen.getByRole("textbox", { name: /paste/i })).toBeTruthy(); // paste box
    // no verdict chip while merely pending — that pill just restated the placeholder (#3)
    expect(screen.queryByRole("status")).toBeNull();
  });

  test("pasting comparison text of our value matches and renders both figures", () => {
    rtlRender(<EntvizCompare value={HEX} />);
    fireEvent.change(screen.getByRole("textbox", { name: /paste/i }), { target: { value: comparisonText(HEX) } });
    expect(status()).toContain("Identical");
    // the reference is drawn from OUR value (comparison text can't be reconstructed)
    expect(screen.getAllByRole("img").length).toBe(2);
  });

  test("pasting comparison text of a DIFFERENT value → different, no reference figure", () => {
    rtlRender(<EntvizCompare value={HEX} />);
    fireEvent.change(screen.getByRole("textbox", { name: /paste/i }), { target: { value: comparisonText(OTHER) } });
    expect(status()).toContain("Different");
    expect(screen.getAllByRole("img").length).toBe(1); // only ours; the reference can't be drawn
  });

  test("reference: a placeholder holds the slot until a value is given; inputs sit below the figure", () => {
    rtlRender(<EntvizCompare value={HEX} />);
    const placeholder = screen.getByText(/drop an entviz svg or image here/i);
    const textarea = screen.getByRole("textbox", { name: /paste/i });
    // figure-sized placeholder comes BEFORE the inputs (horizontal line-of-sight)
    expect(placeholder.compareDocumentPosition(textarea) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // once a value arrives, the placeholder gives way to the re-rendered figure
    fireEvent.change(textarea, { target: { value: HEX } });
    expect(screen.queryByText(/drop an entviz svg or image here/i)).toBeNull();
    expect(screen.getAllByRole("img").length).toBe(2);
  });

  test("the empty placeholder is figure-sized and tracks the live shape", () => {
    const MULTI = "0123456789abcdef".repeat(4);
    const { container } = rtlRender(<EntvizCompare value={MULTI} />);
    const ph = () => screen.getByText(/drop an entviz svg or image here/i) as HTMLElement;
    expect(ph().style.width).toMatch(/px$/); // explicit footprint, not a bare aspect-ratio
    const before = ph().style.width;
    fireEvent.click(container.querySelector('button[aria-label="shape"]') as HTMLButtonElement); // open the shape dropdown
    const other = [...container.querySelectorAll('[role="menu"][aria-label="shape"] [role="menuitem"]')].find(
      (b) => b.getAttribute("aria-pressed") !== "true",
    ) as HTMLButtonElement;
    fireEvent.click(other); // reshape "Yours" while the reference is still empty
    expect(ph().style.width).not.toBe(before); // placeholder follows the new shape's footprint
  });

  test("placeholder falls back to a default size if our value can't be measured", () => {
    rtlRender(<EntvizCompare value={HEX} note="toolongnote" />); // describeChannels throws
    const ph = screen.getByText(/drop an entviz svg or image here/i) as HTMLElement;
    expect(ph.style.width).toBe("180px"); // graceful fallback footprint
  });

  test("the empty reference rect IS the upload control (click-the-rect-to-upload), with an icon, no separate button", () => {
    const { container } = rtlRender(<EntvizCompare value={HEX} />);
    const rect = screen.getByText(/click to choose a file/i) as HTMLLabelElement;
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(rect.tagName).toBe("LABEL");
    expect(fileInput.id).toBeTruthy();
    expect(rect.getAttribute("for")).toBe(fileInput.id); // clicking the rect opens the picker
    expect(rect.querySelector("svg")).toBeTruthy(); // upload glyph lives inside the rect
    // the paste prompt no longer advertises a separate "pick a file" button
    expect(screen.getByRole("textbox", { name: /paste a value/i }).getAttribute("aria-label")).not.toMatch(/pick a file/i);
  });

  test("resize on our figure drives BOTH panels", () => {
    const { container } = rtlRender(<EntvizCompare value={HEX} />);
    fireEvent.change(screen.getByRole("textbox", { name: /paste/i }), { target: { value: HEX } });
    const figs = () => [...container.querySelectorAll("svg[data-entviz-version]")] as SVGElement[];
    expect(figs().length).toBe(2); // ours + the re-rendered reference
    const before = figs().map((s) => Number(s.getAttribute("width")));
    fireEvent.click(container.querySelector('[aria-label="larger"]') as HTMLButtonElement);
    const after = figs().map((s) => Number(s.getAttribute("width")));
    expect(after[0]).toBeGreaterThan(before[0]); // ours grew
    expect(after[1]).toBeGreaterThan(before[1]); // reference grew too — one control, both panels
  });

  test("reshape on our figure drives BOTH panels", () => {
    const MULTI = "0123456789abcdef".repeat(4); // many grid shapes
    const { container } = rtlRender(<EntvizCompare value={MULTI} />);
    fireEvent.change(screen.getByRole("textbox", { name: /paste/i }), { target: { value: MULTI } });
    const dims = () =>
      [...container.querySelectorAll("svg[data-entviz-version]")].map(
        (s) => `${s.getAttribute("width")}x${s.getAttribute("height")}`,
      );
    const before = dims();
    fireEvent.click(container.querySelector('button[aria-label="shape"]') as HTMLButtonElement); // open the shape dropdown
    const other = [...container.querySelectorAll('[role="menu"][aria-label="shape"] [role="menuitem"]')].find(
      (b) => b.getAttribute("aria-pressed") !== "true",
    ) as HTMLButtonElement;
    fireEvent.click(other);
    const after = dims();
    expect(after[0]).not.toBe(before[0]); // ours re-shaped
    expect(after[1]).not.toBe(before[1]); // reference re-shaped too
  });

  test("a raster reference disables reshape on our figure (size stays)", () => {
    const MULTI = "0123456789abcdef".repeat(4);
    const { container } = rtlRender(<EntvizCompare value={MULTI} />);
    fireEvent.change(screen.getByRole("textbox", { name: /paste/i }), {
      target: { value: "data:image/png;base64,iVBORw0KGgo=" },
    });
    expect(container.querySelector('[aria-label="shape"]')).toBeNull(); // can't reshape an image
    expect(container.querySelector('[aria-label="size"]')).toBeTruthy(); // size still offered
  });

  test("layout: side-by-side by default; stacked/auto configurable", () => {
    for (const layout of [undefined, "stacked", "auto"] as const) {
      const { container, unmount } = rtlRender(<EntvizCompare value={HEX} layout={layout} />);
      const panels = container.querySelector("[data-entviz-layout]") as HTMLElement;
      expect(panels.getAttribute("data-entviz-layout")).toBe(layout ?? "side-by-side");
      expect(panels.style.flexDirection || "row").toBe(layout === "stacked" ? "column" : "row");
      unmount();
    }
  });

  test("pasting a matching value → `=`; a different value → `≠`", () => {
    const onVerdict = vi.fn();
    rtlRender(<EntvizCompare value={HEX} onVerdict={onVerdict} />);
    fireEvent.change(screen.getByRole("textbox", { name: /paste/i }), { target: { value: HEX } });
    expect(status()).toContain("=");
    expect(status()).toContain("Identical");
    expect(onVerdict).toHaveBeenCalledWith({ state: "identical" });
    expect(screen.getByText("Reference: pasted")).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: /paste/i }), { target: { value: OTHER } });
    expect(status()).toContain("≠");
  });

  test("the verdict is labeled as the machine's check (and there's no chip while pending)", () => {
    rtlRender(<EntvizCompare value={HEX} />);
    expect(screen.queryByRole("status")).toBeNull(); // pending shows no chip at all (#3)
    fireEvent.change(screen.getByRole("textbox", { name: /paste/i }), { target: { value: HEX } });
    expect(status()).toContain("Machine check");
    expect(status()).toContain("Identical");
  });

  test("editing a reference into a checksum-broken value → `unknown`, never blanks the page", () => {
    // Regression: an ETH address is a hex value, and flipping any hex digit's
    // case breaks its EIP-55 checksum, which made classifyInput throw THROUGH
    // the render path (no error boundary) — blanking the entire page on a single
    // keystroke. It must fail closed to a warn `unknown` instead.
    const ETH = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed"; // valid EIP-55
    const ETH_BAD = "0x5Aaeb6053F3E94C9b9A09f33669435E7Ef1BeAed"; // case flipped → bad checksum
    rtlRender(<EntvizCompare value={HEX} />);
    const box = screen.getByRole("textbox", { name: /paste/i });
    fireEvent.change(box, { target: { value: ETH } });
    expect(status()).toContain("≠"); // the valid address classifies fine
    expect(() => fireEvent.change(box, { target: { value: ETH_BAD } })).not.toThrow();
    expect(status()).toMatch(/could not read the reference/i);
  });

  test("pasting a faithful entviz SVG → identical (re-rendered in our font, not embedded)", () => {
    rtlRender(<EntvizCompare value={HEX} />);
    fireEvent.change(screen.getByRole("textbox", { name: /paste/i }), { target: { value: SVG } });
    expect(status()).toContain("Identical");
    expect(screen.getAllByRole("img").length).toBe(2); // our render of the (equal) value
  });

  test("a tampered / non-entviz SVG is `unknown`, never a false `≠`", () => {
    rtlRender(<EntvizCompare value={HEX} />);
    fireEvent.change(screen.getByRole("textbox", { name: /paste/i }), { target: { value: SVG.replace("</svg>", "<script/></svg>") } });
    expect(status()).toMatch(/confirm a match/i);
    expect(screen.getAllByRole("img").length).toBe(1); // no reference panel for an unconfirmed SVG
  });

  test("pasting an ambiguous (non-URL) string fails closed (no false verdict)", () => {
    rtlRender(<EntvizCompare value={HEX} />);
    // markup-ish but not a recognized entviz SVG, and not a URL → ambiguous warning
    fireEvent.change(screen.getByRole("textbox", { name: /paste/i }), { target: { value: "<not-an-entviz>" } });
    expect(status()).toMatch(/recognize/i);
    expect(screen.getByText("Reference: pasted")).toBeTruthy();
  });

  test("file-pick: an SVG file → identical; a PNG file → raster engine (disprove-only)", async () => {
    const { container } = rtlRender(<EntvizCompare value={HEX} />);
    const file = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(file, { target: { files: [new File([SVG], "r.svg", { type: "image/svg+xml" })] } });
    await waitFor(() => expect(status()).toContain("Identical"), RWAIT);
    expect(screen.getByText("Reference: file")).toBeTruthy();
    // a raster file runs the geometry-anchored engine → never identical (the mock
    // raster isn't a faithful entviz, so it resolves to an unknown/different, not `=`)
    fireEvent.change(file, { target: { files: [new File([new Uint8Array([1])], "p.png", { type: "image/png" })] } });
    await waitFor(() => expect(status()).toMatch(/couldn't|different|too small|no visible/i), RWAIT);
    expect(status()).not.toContain("Identical");
    // an empty file list is a no-op
    fireEvent.change(file, { target: { files: [] } });
  });

  test("a raster reference is disprove-only and never reaches identical", async () => {
    const onVerdict = vi.fn();
    rtlRender(<EntvizCompare value={HEX} onVerdict={onVerdict} />);
    fireEvent.change(screen.getByRole("textbox", { name: /paste/i }), { target: { value: "data:image/png;base64,iVBORw0KGgo=" } });
    // retry BOTH conditions together — the async decode resolves the verdict and
    // the onVerdict callback on the same render, but over separate microtask ticks.
    await waitFor(() => {
      expect(status()).toMatch(/couldn't|different|too small|no visible/i);
      expect(onVerdict).toHaveBeenCalled();
    }, RWAIT);
    expect(onVerdict.mock.calls.every((c) => c[0].state !== "identical")).toBe(true);
    // the raster reference is now shown as an image beside our figure
    expect(screen.queryAllByRole("img").length).toBe(2); // ours + the reference image
    expect((screen.getByRole("textbox", { name: /paste/i }) as HTMLTextAreaElement).value).toBe("[image]");
  });

  test("pasting a raster image sets it as the reference, shows [image], and renders it", async () => {
    const { container } = rtlRender(<EntvizCompare value={HEX} />);
    const ta = screen.getByRole("textbox", { name: /paste/i }) as HTMLTextAreaElement;
    const png = new File([new Uint8Array([1, 2, 3])], "shot.png", { type: "image/png" });
    fireEvent.paste(ta, { clipboardData: { files: [png] } });
    await waitFor(() => expect(ta.value).toBe("[image]"), RWAIT);
    const refImg = container.querySelector('img[alt="Pasted reference image"]') as HTMLImageElement;
    expect(refImg).toBeTruthy();
    expect(refImg.getAttribute("src")).toMatch(/^data:/); // a data URL, sized into the panel
    expect(screen.getByText("Reference: pasted")).toBeTruthy();
  });

  test("pasting non-image content falls through to the normal text paste", () => {
    rtlRender(<EntvizCompare value={HEX} />);
    const ta = screen.getByRole("textbox", { name: /paste/i }) as HTMLTextAreaElement;
    fireEvent.paste(ta, { clipboardData: { files: [] } }); // no image → handler is a no-op
    expect(ta.value).toBe("");
    expect(screen.queryByAltText("Pasted reference image")).toBeNull();
  });

  test("typing over the [image] marker replaces the image with a text value", async () => {
    rtlRender(<EntvizCompare value={HEX} />);
    const ta = screen.getByRole("textbox", { name: /paste/i }) as HTMLTextAreaElement;
    const png = new File([new Uint8Array([1])], "s.png", { type: "image/png" });
    fireEvent.paste(ta, { clipboardData: { files: [png] } });
    await waitFor(() => expect(ta.value).toBe("[image]"), RWAIT);
    fireEvent.change(ta, { target: { value: "[image]" + HEX } }); // user types the value after the marker
    await waitFor(() => expect(status()).toContain("Identical"), RWAIT);
    expect(ta.value).toBe(HEX); // marker stripped, image replaced
  });

  test("a reference image that fails to decode is unknown", async () => {
    class FailImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 0;
      naturalHeight = 0;
      set src(_v: string) { Promise.resolve().then(() => this.onerror?.()); }
    }
    vi.stubGlobal("Image", FailImage);
    rtlRender(<EntvizCompare value={HEX} />);
    fireEvent.change(screen.getByRole("textbox", { name: /paste/i }), { target: { value: "data:image/png;base64,zzzz" } });
    await waitFor(() => expect(status()).toMatch(/could not read the reference image/i), RWAIT);
  });

  test("a URL pasted into the single field is detected and offered for fetch, then compares", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ text: async () => SVG })));
    rtlRender(<EntvizCompare value={HEX} />);
    const field = screen.getByRole("textbox", { name: /paste/i });
    expect(screen.queryByRole("button", { name: "Fetch" })).toBeNull(); // no URL yet
    fireEvent.change(field, { target: { value: "https://example.com/key.svg" } });
    expect(screen.getByText(/Will fetch from https:\/\/example.com/)).toBeTruthy(); // origin shown first (§5)
    fireEvent.click(screen.getByRole("button", { name: "Fetch" }));
    await waitFor(() => expect(status()).toContain("Identical"));
    expect(screen.getByText(/Reference: https:\/\/example.com/)).toBeTruthy();
  });

  test("URL-fetch failure surfaces an error, not a verdict", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    rtlRender(<EntvizCompare value={HEX} />);
    fireEvent.change(screen.getByRole("textbox", { name: /paste/i }), { target: { value: "https://example.com/x" } });
    fireEvent.click(screen.getByRole("button", { name: "Fetch" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/network down/i));
  });

  test("drag-drop a value compares it (provenance: dropped)", () => {
    const { container } = rtlRender(<EntvizCompare value={HEX} />);
    const root = container.firstElementChild as HTMLElement;
    fireEvent.dragOver(root);
    fireEvent.drop(root, { dataTransfer: { files: [], getData: () => HEX } });
    expect(status()).toContain("Identical");
    expect(screen.getByText("Reference: dropped")).toBeTruthy();
    // a drop with neither file nor text is a no-op
    fireEvent.drop(root, { dataTransfer: { files: [], getData: () => "" } });
  });

  test("drag-drop an SVG file compares it", async () => {
    const { container } = rtlRender(<EntvizCompare value={HEX} />);
    const root = container.firstElementChild as HTMLElement;
    fireEvent.drop(root, { dataTransfer: { files: [new File([SVG], "r.svg", { type: "image/svg+xml" })], getData: () => "" } });
    await waitFor(() => expect(status()).toContain("Identical"));
  });

  test("a file that fails to read surfaces an error (not a verdict)", async () => {
    class ErrFileReader {
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;
      result = "";
      readAsText() { Promise.resolve().then(() => this.onerror?.()); }
      readAsDataURL() { Promise.resolve().then(() => this.onerror?.()); }
    }
    vi.stubGlobal("FileReader", ErrFileReader);
    await expect(readFileAsReference(new File(["x"], "r.svg", { type: "image/svg+xml" }))).rejects.toThrow();
    const { container } = rtlRender(<EntvizCompare value={HEX} />);
    const file = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(file, { target: { files: [new File(["x"], "r.svg", { type: "image/svg+xml" })] } });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/read failed/i));
  });

  test("a controlled SVG reference compares without acquisition UI (provenance: provided)", () => {
    rtlRender(<EntvizCompare value={HEX} reference={{ kind: "svg", data: SVG }} />);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(status()).toContain("Identical");
    expect(screen.getByText("Reference: provided")).toBeTruthy();
  });

  test("offers Spot-check and Complete for a large value; only Complete for a small one", () => {
    const MULTI = "0123456789abcdef".repeat(4); // large
    const big = rtlRender(<EntvizCompare value={MULTI} />);
    fireEvent.change(screen.getByRole("textbox", { name: /paste/i }), { target: { value: MULTI } });
    expect(screen.getByRole("button", { name: /spot-check/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /check \(complete\)/i })).toBeTruthy();
    big.unmount();
    // a small value: a spot-check is degenerate, so only Complete
    rtlRender(<EntvizCompare value={HEX} />);
    fireEvent.change(screen.getByRole("textbox", { name: /paste/i }), { target: { value: HEX } });
    expect(screen.queryByRole("button", { name: /spot-check/i })).toBeNull();
    expect(screen.getByRole("button", { name: /check \(complete\)/i })).toBeTruthy();
  });

  test("clicking Spot-check reuses the static figures (no second pair) and rings them", () => {
    const MULTI = "0123456789abcdef".repeat(4);
    const { container } = rtlRender(<EntvizCompare value={MULTI} />);
    fireEvent.change(screen.getByRole("textbox", { name: /paste/i }), { target: { value: MULTI } });
    expect(screen.getAllByRole("img").length).toBe(2); // ours + reference
    fireEvent.click(screen.getByRole("button", { name: /spot-check/i })); // straight into the walk
    expect(screen.getAllByRole("img").length).toBe(2); // STILL two — no duplicate pair
    // a focus-ring overlay is drawn on the existing figures (mask id from ringOverlay)
    expect(container.querySelector('[id^="entviz-walk-spot-"]')).toBeTruthy();
  });

  test("Complete launches a walk; finishing clears the focus ring", () => {
    const MULTI = "0123456789abcdef".repeat(4);
    const { container } = rtlRender(<EntvizCompare value={MULTI} />);
    fireEvent.change(screen.getByRole("textbox", { name: /paste/i }), { target: { value: MULTI } });
    fireEvent.click(screen.getByRole("button", { name: /check \(complete\)/i }));
    expect(screen.getByRole("button", { name: /looks the same/i })).toBeTruthy(); // walking
    fireEvent.click(screen.getByRole("button", { name: /done — that's enough/i }));
    expect(container.querySelector('[id^="entviz-walk-spot-"]')).toBeNull(); // ring cleared on finish
  });

  test("a pasted raster image can be verified with the guided walk (rings both figures)", async () => {
    const MULTI = "0123456789abcdef".repeat(4);
    const { container } = rtlRender(<EntvizCompare value={MULTI} />);
    const png = new File([new Uint8Array([1, 2, 3])], "shot.png", { type: "image/png" });
    fireEvent.paste(screen.getByRole("textbox", { name: /paste/i }), { clipboardData: { files: [png] } });
    await waitFor(() => expect(screen.queryAllByAltText("Pasted reference image").length).toBe(1), RWAIT);
    // a raster reference offers ONLY Complete (the human does the exhaustive text
    // read; the machine already pixel-compared the gestalt, §6.3/S10) — no spot-check
    expect(screen.queryByRole("button", { name: /spot-check/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /check \(complete\)/i }));
    // the current feature is ringed on BOTH our figure and the pasted image
    await waitFor(() => expect(container.querySelectorAll('[id^="entviz-walk-spot-"]').length).toBe(2), RWAIT);
    expect(screen.getByAltText("Pasted reference image")).toBeTruthy(); // image still shown during the walk
  });

  test("warns on secret material; RTL + messages override", () => {
    const mnemonic = "legal winner thank year wave sausage worth useful legal winner thank yellow";
    const { container, rerender } = rtlRender(<EntvizCompare value={mnemonic} />);
    expect(screen.getByRole("alert").textContent).toMatch(/secret/i);
    rerender(<EntvizCompare value={HEX} locale="ar" messages={{ heading: "مقارنة" }} />);
    expect(container.firstElementChild?.getAttribute("dir")).toBe("rtl");
    expect(screen.getByText("مقارنة")).toBeTruthy();
  });
});

describe("EntvizCompare integrity (T2 render-tamper resistance)", () => {
  test("the verdict chip is painted with FIXED colors, not host-themeable vars (ambient CSS can't recolor a verdict)", () => {
    rtlRender(<EntvizCompare value={HEX} />);
    fireEvent.change(screen.getByRole("textbox", { name: /paste/i }), { target: { value: OTHER } });
    const chip = screen.getByRole("status");
    expect(chip.textContent).toContain("Different");
    expect(chip.textContent).toContain("≠"); // symbol is a non-color channel
    const style = chip.getAttribute("style") ?? "";
    // the verdict tone must NOT be painted with the overridable --entviz-compare-* vars,
    // or a T2 stylesheet setting --entviz-compare-bad:#1a7f37 would render "≠ Different" green
    expect(style).not.toMatch(/var\(--entviz-compare-(good|bad|warn|neutral)/);
  });

  test("messages can localize chrome but NOT relabel the verdict (judgment-tamper)", () => {
    rtlRender(<EntvizCompare value={HEX} messages={{ heading: "My Compare", different: "Actually a Match" }} />);
    expect(screen.getByText("My Compare")).toBeTruthy(); // chrome override still works
    fireEvent.change(screen.getByRole("textbox", { name: /paste/i }), { target: { value: OTHER } });
    expect(status()).toContain("Different"); // the locked verdict label wins
    expect(status()).not.toContain("Actually a Match"); // the attacker's relabel is ignored
  });

  test("an identical machine verdict renders the §2.4 scoping caveat, and it can't be softened via messages", () => {
    rtlRender(<EntvizCompare value={HEX} messages={{ recognitionNote: "This reference is fully trusted", identical: "PERFECT MATCH" }} />);
    fireEvent.change(screen.getByRole("textbox", { name: /paste/i }), { target: { value: HEX } });
    expect(status()).toContain("Identical"); // locked verdict label
    expect(screen.queryByText(/perfect match/i)).toBeNull();
    // the scoping copy is rendered on the MACHINE chip (not just walk/voice) and is the locked default
    expect(screen.getByText(/does not vouch for the reference/i)).toBeTruthy();
    expect(screen.queryByText(/fully trusted/i)).toBeNull();
  });

  test("the walk focus ring/scrim use fixed colors (T2 can't set --entviz-walk-ring transparent to erase the spotlight)", () => {
    const MULTI = "0123456789abcdef".repeat(4);
    const { container } = rtlRender(<EntvizCompare value={MULTI} />);
    fireEvent.change(screen.getByRole("textbox", { name: /paste/i }), { target: { value: MULTI } });
    fireEvent.click(screen.getByRole("button", { name: /check \(complete\)/i }));
    expect(container.querySelector('[stroke="#39ff14"]')).toBeTruthy(); // ring drawn with the literal
    expect(container.innerHTML).not.toContain("var(--entviz-walk-ring");
    expect(container.innerHTML).not.toContain("var(--entviz-walk-scrim");
  });
});

describe("EntvizCompare: the voice ceremony tab (§15.8)", () => {
  const voiceTab = () => screen.queryByRole("tab", { name: /compare by voice/i });
  const refTab = () => screen.getByRole("tab", { name: /compare visualizations/i });

  test("presents the two situational choices as tabs; the voice tab launches the ceremony", () => {
    rtlRender(<EntvizCompare value={HEX} />);
    expect(voiceTab()).toBeTruthy();
    fireEvent.click(voiceTab()!);
    // the affirmation gate takes over the surface
    expect(screen.getByText(/same value as you/i)).toBeTruthy();
    // the reference tab switches back to the comparator
    fireEvent.click(refTab());
    expect(screen.getByRole("textbox", { name: /paste/i })).toBeTruthy();
  });

  test("with no reference it runs voice-only (read the cells)", () => {
    rtlRender(<EntvizCompare value={HEX} />);
    fireEvent.click(voiceTab()!);
    fireEvent.click(screen.getByRole("button", { name: /^proceed$/i }));
    expect(screen.getByText(/read each highlighted cell/i)).toBeTruthy();
  });

  test("after an identical machine match it runs paste-bind (bind a couple of cells)", () => {
    rtlRender(<EntvizCompare value={HEX} />);
    fireEvent.change(screen.getByRole("textbox", { name: /paste/i }), { target: { value: HEX } });
    expect(status()).toMatch(/identical/i);
    fireEvent.click(voiceTab()!);
    fireEvent.click(screen.getByRole("button", { name: /^proceed$/i }));
    expect(screen.getByText(/pasted value already matched by machine/i)).toBeTruthy();
  });

  test("a host-provided reference renders directly, with no tabs", () => {
    rtlRender(<EntvizCompare value={HEX} reference={{ kind: "text", data: HEX }} />);
    expect(voiceTab()).toBeNull();
    // a plain heading instead of a tablist
    expect(screen.getByText("Compare visualizations")).toBeTruthy();
    expect(screen.queryByRole("tablist")).toBeNull();
  });
});

describe("EntvizCompare onEvent firehose", () => {
  const MULTI = "0123456789abcdef".repeat(4); // large → offers spot-check + reshape
  // Collect every emitted event of a given type from a spy.
  const of = (spy: ReturnType<typeof vi.fn>, type: string) =>
    spy.mock.calls.map((c) => c[0]).filter((e) => e.type === type);
  const last = (spy: ReturnType<typeof vi.fn>, type: string) => {
    const es = of(spy, type);
    return es[es.length - 1];
  };
  const box = () => screen.getByRole("textbox", { name: /paste/i });

  test("stamps seq/ts/source on every event and monotonically increments seq", () => {
    const onEvent = vi.fn();
    rtlRender(<EntvizCompare value={HEX} onEvent={onEvent} />);
    fireEvent.change(box(), { target: { value: HEX } });
    expect(onEvent).toHaveBeenCalled();
    const evs = onEvent.mock.calls.map((c) => c[0]);
    for (const e of evs) {
      expect(e.source).toBe("compare");
      expect(typeof e.ts).toBe("number");
      expect(typeof e.seq).toBe("number");
    }
    const seqs = evs.map((e) => e.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(new Set(seqs).size).toBe(seqs.length); // all distinct
  });

  test("a throwing host handler never breaks the widget", () => {
    const onEvent = vi.fn(() => { throw new Error("host bug"); });
    rtlRender(<EntvizCompare value={HEX} onEvent={onEvent} />);
    expect(() => fireEvent.change(box(), { target: { value: HEX } })).not.toThrow();
    expect(status()).toContain("Identical"); // still renders the verdict
  });

  test("reference.acquired fires on acquisition (with provenance/medium/byteLength) and NOT content", () => {
    const onEvent = vi.fn();
    rtlRender(<EntvizCompare value={HEX} onEvent={onEvent} />);
    fireEvent.change(box(), { target: { value: HEX } });
    const e = last(onEvent, "reference.acquired");
    expect(e).toBeTruthy();
    expect(e.provenance).toBe("pasted");
    expect(e.medium).toBe("text");
    expect(e.byteLength).toBe(new TextEncoder().encode(HEX).length);
    expect(e.content).toBeUndefined(); // content is gated behind a future includeContent prop
  });

  test("reference.acquired carries origin for a fetched (url) reference", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 200, text: async () => SVG })));
    const onEvent = vi.fn();
    rtlRender(<EntvizCompare value={HEX} onEvent={onEvent} />);
    fireEvent.change(box(), { target: { value: "https://example.com/key.svg" } });
    fireEvent.click(screen.getByRole("button", { name: "Fetch" }));
    await waitFor(() => expect(last(onEvent, "reference.acquired")?.provenance).toBe("url"));
    expect(last(onEvent, "reference.acquired").origin).toBe("https://example.com");
  });

  test("reference.cleared fires when the reference goes empty again", () => {
    const onEvent = vi.fn();
    rtlRender(<EntvizCompare value={HEX} onEvent={onEvent} />);
    fireEvent.change(box(), { target: { value: HEX } });
    expect(of(onEvent, "reference.cleared").length).toBe(0);
    fireEvent.change(box(), { target: { value: "" } }); // edit it empty
    expect(of(onEvent, "reference.cleared").length).toBe(1);
  });

  test("reference.mediumDetected fires with medium + isUrl", () => {
    const onEvent = vi.fn();
    rtlRender(<EntvizCompare value={HEX} onEvent={onEvent} />);
    fireEvent.change(box(), { target: { value: HEX } });
    expect(last(onEvent, "reference.mediumDetected")).toMatchObject({ medium: "text", isUrl: false });
    // a URL is medium "ambiguous" but flagged isUrl:true
    fireEvent.change(box(), { target: { value: "https://example.com/x" } });
    expect(last(onEvent, "reference.mediumDetected")).toMatchObject({ medium: "ambiguous", isUrl: true });
  });

  test("secret.detected fires with where=value when the OWN value looks secret", () => {
    const mnemonic = "legal winner thank year wave sausage worth useful legal winner thank yellow";
    const onEvent = vi.fn();
    rtlRender(<EntvizCompare value={mnemonic} onEvent={onEvent} />);
    expect(last(onEvent, "secret.detected")).toMatchObject({ where: "value" });
  });

  test("secret.detected fires with where=reference when only the reference looks secret", () => {
    const mnemonic = "legal winner thank year wave sausage worth useful legal winner thank yellow";
    const onEvent = vi.fn();
    rtlRender(<EntvizCompare value={HEX} onEvent={onEvent} />);
    fireEvent.change(box(), { target: { value: mnemonic } });
    expect(last(onEvent, "secret.detected")).toMatchObject({ where: "reference" });
  });

  test("reference.readError fires when a picked file fails to read", async () => {
    class ErrFileReader {
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;
      result = "";
      readAsText() { Promise.resolve().then(() => this.onerror?.()); }
      readAsDataURL() { Promise.resolve().then(() => this.onerror?.()); }
    }
    vi.stubGlobal("FileReader", ErrFileReader);
    const onEvent = vi.fn();
    const { container } = rtlRender(<EntvizCompare value={HEX} onEvent={onEvent} />);
    const file = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(file, { target: { files: [new File(["x"], "r.svg", { type: "image/svg+xml" })] } });
    await waitFor(() => expect(of(onEvent, "reference.readError").length).toBeGreaterThan(0), RWAIT);
    expect(last(onEvent, "reference.readError").reason).toMatch(/read failed/i);
  });

  test("reference.readError fires when a reference image fails to decode", async () => {
    class FailImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 0;
      naturalHeight = 0;
      set src(_v: string) { Promise.resolve().then(() => this.onerror?.()); }
    }
    vi.stubGlobal("Image", FailImage);
    const onEvent = vi.fn();
    rtlRender(<EntvizCompare value={HEX} onEvent={onEvent} />);
    fireEvent.change(box(), { target: { value: "data:image/png;base64,zzzz" } });
    await waitFor(() => expect(of(onEvent, "reference.readError").length).toBeGreaterThan(0), RWAIT);
    expect(last(onEvent, "reference.readError").reason).toMatch(/could not read the reference image/i);
  });

  test("fetch.start / fetch.success carry origin/status/byteLength/durationMs and tag network sensitivity", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 200, text: async () => SVG })));
    const onEvent = vi.fn();
    rtlRender(<EntvizCompare value={HEX} onEvent={onEvent} />);
    fireEvent.change(box(), { target: { value: "https://example.com/key.svg" } });
    fireEvent.click(screen.getByRole("button", { name: "Fetch" }));
    await waitFor(() => expect(of(onEvent, "fetch.success").length).toBe(1));
    const start = last(onEvent, "fetch.start");
    expect(start.origin).toBe("https://example.com");
    expect(start.url).toBe("https://example.com/key.svg");
    expect(start.sensitivity).toBe("network");
    expect(typeof start.preventDefault).toBe("function");
    const ok = last(onEvent, "fetch.success");
    expect(ok).toMatchObject({ origin: "https://example.com", status: 200, sensitivity: "network" });
    expect(ok.byteLength).toBe(new TextEncoder().encode(SVG).length);
    expect(typeof ok.durationMs).toBe("number");
  });

  test("fetch.start preventDefault ABORTS the fetch (fail-closed) — no fetch, no success/error", async () => {
    const fetchSpy = vi.fn(async () => ({ status: 200, text: async () => SVG }));
    vi.stubGlobal("fetch", fetchSpy);
    const onEvent = vi.fn((e: { type: string; preventDefault?: () => void }) => {
      if (e.type === "fetch.start") e.preventDefault!();
    });
    rtlRender(<EntvizCompare value={HEX} onEvent={onEvent} />);
    fireEvent.change(box(), { target: { value: "https://example.com/key.svg" } });
    fireEvent.click(screen.getByRole("button", { name: "Fetch" }));
    await Promise.resolve();
    expect(fetchSpy).not.toHaveBeenCalled(); // egress blocked
    expect(of(onEvent, "fetch.success").length).toBe(0);
    expect(of(onEvent, "fetch.error").length).toBe(0);
  });

  test("fetch.error fires (network sensitivity) when the fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    const onEvent = vi.fn();
    rtlRender(<EntvizCompare value={HEX} onEvent={onEvent} />);
    fireEvent.change(box(), { target: { value: "https://example.com/x" } });
    fireEvent.click(screen.getByRole("button", { name: "Fetch" }));
    await waitFor(() => expect(of(onEvent, "fetch.error").length).toBe(1));
    const e = last(onEvent, "fetch.error");
    expect(e).toMatchObject({ origin: "https://example.com", sensitivity: "network" });
    expect(e.message).toMatch(/network down/i);
  });

  test("verdict.change fires on the verdict STATE transition (notify-only, carries medium+provenance)", () => {
    const onEvent = vi.fn();
    rtlRender(<EntvizCompare value={HEX} onEvent={onEvent} />);
    fireEvent.change(box(), { target: { value: HEX } });
    const idn = last(onEvent, "verdict.change");
    expect(idn).toMatchObject({ verdict: "identical", medium: "text", provenance: "pasted" });
    expect(idn.preventDefault).toBeUndefined(); // notify-only
    const beforeCount = of(onEvent, "verdict.change").length;
    fireEvent.change(box(), { target: { value: OTHER } }); // identical → different transition
    expect(of(onEvent, "verdict.change").length).toBe(beforeCount + 1);
    expect(last(onEvent, "verdict.change").verdict).toBe("different");
  });

  test("display.tab fires when switching to the voice tab", () => {
    const onEvent = vi.fn();
    rtlRender(<EntvizCompare value={HEX} onEvent={onEvent} />);
    fireEvent.click(screen.getByRole("tab", { name: /compare by voice/i }));
    expect(last(onEvent, "display.tab")).toMatchObject({ tab: "voice" });
  });

  test("display.resize fires with the new fontSizePt", () => {
    const onEvent = vi.fn();
    const { container } = rtlRender(<EntvizCompare value={HEX} onEvent={onEvent} />);
    fireEvent.change(box(), { target: { value: HEX } });
    fireEvent.click(container.querySelector('[aria-label="larger"]') as HTMLButtonElement);
    const e = last(onEvent, "display.resize");
    expect(e).toBeTruthy();
    expect(typeof e.fontSizePt).toBe("number");
  });

  test("display.reshape fires with targetAr + cols/rows", () => {
    const onEvent = vi.fn();
    const { container } = rtlRender(<EntvizCompare value={MULTI} onEvent={onEvent} />);
    fireEvent.change(box(), { target: { value: MULTI } });
    fireEvent.click(container.querySelector('button[aria-label="shape"]') as HTMLButtonElement);
    const other = [...container.querySelectorAll('[role="menu"][aria-label="shape"] [role="menuitem"]')].find(
      (b) => b.getAttribute("aria-pressed") !== "true",
    ) as HTMLButtonElement;
    fireEvent.click(other);
    const e = last(onEvent, "display.reshape");
    expect(e).toBeTruthy();
    expect(typeof e.targetAr).toBe("number");
    expect(e.cols).toBeGreaterThan(0);
    expect(e.rows).toBeGreaterThan(0);
  });

  test("walk.start / walk.step / walk.complete fire through a guided walk (feature=kind, never glyphs)", () => {
    const onEvent = vi.fn();
    rtlRender(<EntvizCompare value={MULTI} onEvent={onEvent} />);
    fireEvent.change(box(), { target: { value: MULTI } });
    fireEvent.click(screen.getByRole("button", { name: /check \(complete\)/i }));
    expect(last(onEvent, "walk.start")).toMatchObject({ mode: "complete" });
    const steps = of(onEvent, "walk.step");
    expect(steps.length).toBeGreaterThan(0);
    // feature is a KIND from the WalkStep union, never glyph text
    for (const s of steps) {
      expect(["text", "gestalt", "probe"]).toContain(s.feature);
      expect(typeof s.index).toBe("number");
    }
    // indices are monotonic from 0
    expect(steps.map((s) => s.index)).toEqual(steps.map((_, i) => i));
    fireEvent.click(screen.getByRole("button", { name: /done — that's enough/i }));
    const done = last(onEvent, "walk.complete");
    expect(done).toBeTruthy();
    expect(["no-difference", "different", "inconclusive", "pending-done"]).toContain(done.status);
  });

  test("voice.complete forwards the ceremony outcome (and no voice.step/voice.start ever fires)", () => {
    const onEvent = vi.fn();
    rtlRender(<EntvizCompare value={HEX} onEvent={onEvent} />);
    fireEvent.click(screen.getByRole("tab", { name: /compare by voice/i }));
    fireEvent.click(screen.getByRole("button", { name: /^proceed$/i }));
    // Drive the ceremony to its verdict: "Matches" advances one planned cell at a
    // time; the plan is finite, so this terminates in "no difference found".
    for (let i = 0; i < 60 && of(onEvent, "voice.complete").length === 0; i++) {
      const match = screen.queryByRole("button", { name: /^matches$/i });
      if (!match) break;
      fireEvent.click(match);
    }
    const done = last(onEvent, "voice.complete");
    expect(done).toBeTruthy();
    expect(["no-difference", "different"]).toContain(done.status);
    // The live check-order must never leave the endpoint: no voice.start, no voice.step.
    expect(of(onEvent, "voice.start").length).toBe(0);
    expect(of(onEvent, "voice.step").length).toBe(0);
  });
});

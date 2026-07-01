import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render as rtlRender, screen, waitFor } from "@testing-library/react";
import { render } from "@entviz/core";
import { EntvizCompare } from "../src/index.ts";
import { classifyResult, looksLikeSecret, readFileAsReference } from "../src/EntvizCompare.ts";

const HEX = "0123456789abcdef";
const OTHER = "fedcba9876543210";
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
  test("empty → pending; text → value verdict", () => {
    expect(classifyResult(HEX, "  ")).toEqual({ kind: "pending" });
    expect(classifyResult(HEX, HEX)).toEqual({ kind: "verdict", verdict: { state: "identical" } });
    expect(classifyResult(HEX, OTHER)).toEqual({ kind: "verdict", verdict: { state: "different" } });
  });
  test("a faithful entviz SVG → identical; a different one → different; garbage → unknown", () => {
    expect(classifyResult(HEX, SVG)).toEqual({ kind: "verdict", verdict: { state: "identical" } });
    expect(classifyResult(OTHER, SVG)).toEqual({ kind: "verdict", verdict: { state: "different" } });
    const r = classifyResult(HEX, "<svg></svg>");
    expect(r.kind).toBe("verdict");
    expect((r as { verdict: { state: string } }).verdict.state).toBe("unknown");
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
    expect(status()).toContain("Paste");
  });

  test("reference: a placeholder holds the slot until a value is given; inputs sit below the figure", () => {
    rtlRender(<EntvizCompare value={HEX} />);
    const placeholder = screen.getByText(/reference will appear here/i);
    const textarea = screen.getByRole("textbox", { name: /paste/i });
    // figure-sized placeholder comes BEFORE the inputs (horizontal line-of-sight)
    expect(placeholder.compareDocumentPosition(textarea) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // once a value arrives, the placeholder gives way to the re-rendered figure
    fireEvent.change(textarea, { target: { value: HEX } });
    expect(screen.queryByText(/reference will appear here/i)).toBeNull();
    expect(screen.getAllByRole("img").length).toBe(2);
  });

  test("the empty placeholder is figure-sized and tracks the live shape", () => {
    const MULTI = "0123456789abcdef".repeat(4);
    const { container } = rtlRender(<EntvizCompare value={MULTI} />);
    const ph = () => screen.getByText(/reference will appear here/i) as HTMLElement;
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
    const ph = screen.getByText(/reference will appear here/i) as HTMLElement;
    expect(ph.style.width).toBe("180px"); // graceful fallback footprint
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

  test("the verdict is labeled as the machine's check (but not while pending)", () => {
    rtlRender(<EntvizCompare value={HEX} />);
    expect(status()).not.toContain("Machine check"); // pending is an instruction, not a result
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
    // a raster file runs the raster engine → never identical (mocked clean rasters
    // are look-alikes, so: unknown — an image cannot prove equality)
    fireEvent.change(file, { target: { files: [new File([new Uint8Array([1])], "p.png", { type: "image/png" })] } });
    await waitFor(() => expect(status()).toMatch(/look very similar/i), RWAIT);
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
      expect(status()).toMatch(/look very similar/i);
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
    // the guided walk is offered for a raster reference too
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

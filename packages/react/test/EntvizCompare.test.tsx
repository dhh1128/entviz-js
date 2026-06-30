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

  test("pasting an ambiguous string fails closed (no false verdict)", () => {
    rtlRender(<EntvizCompare value={HEX} />);
    fireEvent.change(screen.getByRole("textbox", { name: /paste/i }), { target: { value: "https://example.com/x" } });
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
    await waitFor(() => expect(status()).toMatch(/cannot prove|look alike/i), RWAIT);
    // an empty file list is a no-op
    fireEvent.change(file, { target: { files: [] } });
  });

  test("a raster reference is disprove-only and never reaches identical", async () => {
    const onVerdict = vi.fn();
    rtlRender(<EntvizCompare value={HEX} onVerdict={onVerdict} />);
    fireEvent.change(screen.getByRole("textbox", { name: /paste/i }), { target: { value: "data:image/png;base64,iVBORw0KGgo=" } });
    await waitFor(() => expect(status()).toMatch(/cannot prove|look alike/i), RWAIT);
    expect(onVerdict).toHaveBeenCalled();
    expect(onVerdict.mock.calls.every((c) => c[0].state !== "identical")).toBe(true);
    expect(screen.queryAllByRole("img").length).toBe(1); // no reference panel for a raster
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

  test("URL-fetch: surfaces the origin, then fetches and compares", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ text: async () => SVG })));
    rtlRender(<EntvizCompare value={HEX} />);
    const url = screen.getByRole("textbox", { name: /URL of an entviz/i });
    const fetchBtn = screen.getByRole("button", { name: "Fetch" });
    expect((fetchBtn as HTMLButtonElement).disabled).toBe(true); // disabled until a valid URL
    fireEvent.change(url, { target: { value: "https://example.com/key.svg" } });
    expect(screen.getByText(/Will fetch from https:\/\/example.com/)).toBeTruthy();
    expect((fetchBtn as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(fetchBtn);
    await waitFor(() => expect(status()).toContain("Identical"));
    expect(screen.getByText(/Reference: https:\/\/example.com/)).toBeTruthy();
  });

  test("URL-fetch failure surfaces an error, not a verdict", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    rtlRender(<EntvizCompare value={HEX} />);
    fireEvent.change(screen.getByRole("textbox", { name: /URL of an entviz/i }), { target: { value: "https://example.com/x" } });
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

  test("offers a manual cell-walk for a value reference", () => {
    rtlRender(<EntvizCompare value={HEX} />);
    fireEvent.change(screen.getByRole("textbox", { name: /paste/i }), { target: { value: HEX } });
    fireEvent.click(screen.getByRole("button", { name: /walking the cells/i }));
    expect(screen.getByText(/how thorough/i)).toBeTruthy(); // the walk's preset picker
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

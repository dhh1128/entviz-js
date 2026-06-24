import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { EntvizCompare } from "../src/index.ts";
import { classifyResult, looksLikeSecret } from "../src/EntvizCompare.ts";

const HEX = "0123456789abcdef";
const OTHER = "fedcba9876543210";

afterEach(cleanup);

const paste = (text: string) =>
  fireEvent.change(screen.getByRole("textbox"), { target: { value: text } });

// --- pure helpers ---------------------------------------------------------

describe("classifyResult", () => {
  test("empty reference is pending", () => {
    expect(classifyResult(HEX, "   ")).toEqual({ kind: "pending" });
  });
  test("text reference → a value verdict", () => {
    expect(classifyResult(HEX, HEX)).toEqual({ kind: "verdict", verdict: { state: "identical" } });
    expect(classifyResult(HEX, OTHER)).toEqual({ kind: "verdict", verdict: { state: "different" } });
  });
  test("svg / raster references are deferred", () => {
    expect(classifyResult(HEX, "<svg></svg>")).toEqual({ kind: "deferred", medium: "svg" });
    expect(classifyResult(HEX, "data:image/png;base64,iVBOR")).toEqual({ kind: "deferred", medium: "raster" });
  });
  test("ambiguous references fail closed", () => {
    expect(classifyResult(HEX, "https://example.com")).toEqual({ kind: "ambiguous" });
  });
});

describe("looksLikeSecret", () => {
  test("flags PEM private keys, extended private keys, and mnemonics", () => {
    expect(looksLikeSecret("-----BEGIN EC PRIVATE KEY-----\nMHc...")).toBe(true);
    expect(looksLikeSecret("xprv" + "a".repeat(60))).toBe(true);
    expect(looksLikeSecret("legal winner thank year wave sausage worth useful legal winner thank yellow")).toBe(true);
  });
  test("does not flag ordinary values", () => {
    expect(looksLikeSecret(HEX)).toBe(false);
    expect(looksLikeSecret("550e8400-e29b-41d4-a716-446655440000")).toBe(false);
  });
});

// --- component ------------------------------------------------------------

describe("EntvizCompare", () => {
  test("renders heading, the user's panel, and a paste box; starts pending", () => {
    render(<EntvizCompare value={HEX} />);
    expect(screen.getByText("Compare visualizations")).toBeTruthy();
    expect(screen.getAllByRole("img").length).toBe(1); // only "Yours" until a reference arrives
    expect(screen.getByRole("textbox")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Paste a reference");
  });

  test("a matching pasted value yields a machine `=` verdict + fires onVerdict", () => {
    const onVerdict = vi.fn();
    render(<EntvizCompare value={HEX} onVerdict={onVerdict} />);
    paste(HEX);
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("=");
    expect(status.textContent).toContain("Identical");
    expect(screen.getAllByRole("img").length).toBe(2); // reference panel now renders
    expect(onVerdict).toHaveBeenCalledWith({ state: "identical" });
  });

  test("a different pasted value yields `≠`", () => {
    render(<EntvizCompare value={HEX} />);
    paste(OTHER);
    expect(screen.getByRole("status").textContent).toContain("≠");
    expect(screen.getByRole("status").textContent).toContain("Different");
  });

  test("a pasted SVG / image defers; ambiguous input fails closed (no false ≠)", () => {
    const { rerender } = render(<EntvizCompare value={HEX} />);
    paste("<svg></svg>");
    expect(screen.getByRole("status").textContent).toMatch(/SVG/i);
    expect(screen.queryAllByRole("img").length).toBe(1); // no reference entviz for a deferred medium
    rerender(<EntvizCompare value={HEX} />);
    paste("data:image/png;base64,iVBOR");
    expect(screen.getByRole("status").textContent).toMatch(/image/i);
    rerender(<EntvizCompare value={HEX} />);
    paste("https://example.com/x");
    expect(screen.getByRole("status").textContent).toMatch(/recognize/i);
  });

  test("a controlled text reference renders without a paste box", () => {
    render(<EntvizCompare value={HEX} reference={{ kind: "text", data: HEX }} />);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getAllByRole("img").length).toBe(2);
    expect(screen.getByRole("status").textContent).toContain("Identical");
    expect(screen.getByText("Reference: pasted")).toBeTruthy();
  });

  test("warns when the value looks like secret material", () => {
    const mnemonic = "legal winner thank year wave sausage worth useful legal winner thank yellow";
    render(<EntvizCompare value={mnemonic} />);
    expect(screen.getByRole("alert").textContent).toMatch(/secret/i);
  });

  test("RTL locale mirrors the chrome; messages override applies", () => {
    const { container, rerender } = render(<EntvizCompare value={HEX} locale="ar" />);
    expect(container.firstElementChild?.getAttribute("dir")).toBe("rtl");
    rerender(<EntvizCompare value={HEX} messages={{ heading: "Vergleich" }} />);
    expect(screen.getByText("Vergleich")).toBeTruthy();
    expect(container.firstElementChild?.getAttribute("dir")).toBeNull();
  });
});

import { describe, expect, test } from "vitest";
import { render } from "@testing-library/react";
import { RoleGlyph, roleIconKey } from "../src/role-icon.ts";
import type { Role } from "@entviz/core";

// The role glyph maps the closed `role` enum (null → "raw") to a monochrome
// currentColor Lucide icon, tagged with data-evz-role-icon for identification.

describe("roleIconKey", () => {
  test("passes the five roles through and maps null → raw", () => {
    for (const r of ["key", "signature", "digest", "address", "identifier"] as const) {
      expect(roleIconKey(r)).toBe(r);
    }
    expect(roleIconKey(null)).toBe("raw");
  });
});

describe("RoleGlyph", () => {
  const glyph = (role: Role | null) => {
    const { container } = render(<>{RoleGlyph({ role })}</>);
    return container.querySelector("svg")!;
  };

  test("renders a currentColor SVG tagged by role", () => {
    const svg = glyph("signature");
    expect(svg.getAttribute("data-evz-role-icon")).toBe("signature");
    expect(svg.getAttribute("stroke")).toBe("currentColor");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.querySelectorAll("path, circle, line, rect").length).toBeGreaterThan(0);
  });

  test("null role renders the raw (binary) glyph", () => {
    expect(glyph(null).getAttribute("data-evz-role-icon")).toBe("raw");
  });

  test("every role yields a distinct, non-empty glyph", () => {
    const keys = (["key", "signature", "digest", "address", "identifier", null] as (Role | null)[]).map(
      (r) => glyph(r).getAttribute("data-evz-role-icon"),
    );
    expect(new Set(keys).size).toBe(6);
  });
});

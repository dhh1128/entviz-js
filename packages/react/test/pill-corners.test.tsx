import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { EntvizPill } from "../src/index.ts";
import type { CornerMap } from "@entviz/core";

// Corner channel wired into the pill (this.i gk37dm5n): the value's `role` (from
// characterize) resolves through a host CornerMap to the pill body's corner CSS.
// Un-gated — no TrustAssumption needed, since the corner encodes the type entviz
// already discloses, not the value.

const CESR = "EBfdlu8R27Fbx_ehrqwImnK_8Cm79sqbAQ4caaZG_LFv"; // role "digest"
const DID = "did:ethr:0x5:0xf3beac30c498d9e26865f34fcaa57dbb935b0d74"; // role "identifier"
const HEX = "0123456789abcdef"; // bare hex → role null → "raw" bucket

afterEach(cleanup);

const pillBody = (c: HTMLElement) =>
  c.querySelector('button[aria-expanded]')!.parentElement! as HTMLElement;
const radius = (c: HTMLElement) => pillBody(c).style.borderRadius;
const clip = (c: HTMLElement) => pillBody(c).style.clipPath;

describe("EntvizPill corner channel", () => {
  test("an unconfigured pill keeps the themeable default radius (unchanged)", () => {
    const { container } = render(<EntvizPill value={CESR} />);
    expect(radius(container)).toContain("--entviz-pill-radius");
    expect(clip(container)).toBe("");
  });

  test("cornerMap resolves by role: digest → sharp (square)", () => {
    const map: CornerMap = { digest: "sharp", default: "round" };
    const { container } = render(<EntvizPill value={CESR} cornerMap={map} />);
    expect(["0", "0px"]).toContain(radius(container));
  });

  test("an unmapped role falls through to the map default", () => {
    const map: CornerMap = { digest: "sharp", default: "leaf" };
    const { container } = render(<EntvizPill value={DID} cornerMap={map} />);
    expect(radius(container)).toContain("0.5em");
  });

  test("a null role resolves via the \"raw\" bucket — bevel applies a clip-path", () => {
    const map: CornerMap = { raw: "bevel", default: "round" };
    const { container } = render(<EntvizPill value={HEX} cornerMap={map} />);
    expect(clip(container)).toContain("polygon");
    expect(["0", "0px"]).toContain(radius(container));
  });

  test("explicit `corner` overrides both the map and the role", () => {
    const map: CornerMap = { digest: "leaf" };
    const { container } = render(<EntvizPill value={CESR} corner="sharp" cornerMap={map} />);
    expect(["0", "0px"]).toContain(radius(container));
  });
});

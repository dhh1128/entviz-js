import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { EntvizPill } from "../src/index.ts";

// Corner is an explicit, optional pill style (this.i gk37dm5n) — no longer keyed to the
// value's type. The `corner` prop sets the pill body's border-radius; unset = default.

const HEX = "0123456789abcdef";

afterEach(cleanup);

const pillBody = (c: HTMLElement) =>
  c.querySelector('button[aria-expanded]')!.parentElement! as HTMLElement;
const radius = (c: HTMLElement) => pillBody(c).style.borderRadius;

describe("EntvizPill corner style", () => {
  test("unset keeps the themeable default radius", () => {
    const { container } = render(<EntvizPill value={HEX} />);
    expect(radius(container)).toContain("--entviz-pill-radius");
  });

  test("corner=\"sharp\" squares the pill", () => {
    const { container } = render(<EntvizPill value={HEX} corner="sharp" />);
    expect(["0", "0px"]).toContain(radius(container));
  });

  test("corner=\"leaf\" rounds the TL+BR diagonal", () => {
    const { container } = render(<EntvizPill value={HEX} corner="leaf" />);
    expect(radius(container)).toContain("0.5em");
  });
});

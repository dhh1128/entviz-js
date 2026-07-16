import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { EntvizPill } from "../src/index.ts";
import { characterize, describeChannels, mnemonic, type TrustAssumption } from "@entviz/core";

// Auto-mnemonic wired into the pill (this.i mmtxrg4w), GATED by the trust posture
// (ujdwjtex). It renders as the label ONLY under a corpus posture that opted the
// channel in; the wild default shows nothing value-derived. Explicit `label` wins.

const CESR = "DKxy2sgzfplyr_tgwIxS19f2OchFHtLwPWD3v4oYimBx"; // role "key"
const corpus: TrustAssumption = { posture: "corpus", mnemonic: true };
// The expected mnemonic, computed the same way the pill does (from the entviz cells).
const MN = mnemonic(describeChannels(CESR).cells, characterize(CESR).sizeBits);

afterEach(cleanup);

const pillText = (c: HTMLElement) =>
  (c.querySelector('button[aria-expanded]') as HTMLElement).textContent ?? "";

describe("EntvizPill auto-mnemonic", () => {
  test("no trust (wild default) shows no mnemonic — the value never leaks", () => {
    const { container } = render(<EntvizPill value={CESR} />);
    expect(pillText(container)).not.toContain(MN);
    // and specifically no raw value characters
    expect(pillText(container)).not.toContain("DKxy");
  });

  test("wild posture keeps the mnemonic off even if the channel flag is set", () => {
    const wild: TrustAssumption = { posture: "wild", mnemonic: true };
    const { container } = render(<EntvizPill value={CESR} trust={wild} />);
    expect(pillText(container)).not.toContain("DKxy");
  });

  test("corpus posture with mnemonic opted-in renders the mnemonic as the label", () => {
    const { container } = render(<EntvizPill value={CESR} trust={corpus} />);
    expect(pillText(container)).toContain(MN);
  });

  test("corpus posture WITHOUT the mnemonic flag shows nothing value-derived", () => {
    const { container } = render(<EntvizPill value={CESR} trust={{ posture: "corpus" }} />);
    expect(pillText(container)).not.toContain("DKxy");
  });

  test("an explicit label wins over the mnemonic", () => {
    const { container } = render(<EntvizPill value={CESR} trust={corpus} label="signing-key" />);
    expect(pillText(container)).toContain("signing-key");
    expect(pillText(container)).not.toContain(MN);
  });

  test("an unrenderable pill (error) suppresses the mnemonic", () => {
    // note > 10 chars → render throws → the pill is in its unrenderable state; the
    // mnemonic must not appear beside an error.
    const { container } = render(<EntvizPill value={CESR} note="toolongnote" trust={corpus} />);
    expect(pillText(container)).not.toContain(MN);
  });

  test("the mnemonic renders in a monospace span (recognition anchor)", () => {
    const { container } = render(<EntvizPill value={CESR} trust={corpus} />);
    // The monospace label span specifically (ancestors also carry the same textContent).
    const span = [...container.querySelectorAll("span")].find(
      (s) => s.textContent === MN && s.style.fontFamily.includes("monospace"),
    );
    expect(span).toBeTruthy();
  });
});

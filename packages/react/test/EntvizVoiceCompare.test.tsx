import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { EntvizVoiceCompare } from "../src/index.ts";

const UUID = "550e8400-e29b-41d4-a716-446655440000"; // small → all-cells (hex, clean)
const HEX512 = "0123456789abcdef".repeat(8); // medium constrained → row-or-column
const BIG = "0123456789abcdef".repeat(16); // big → fingerprint-cells
const B64URL = "AbCd-EfGh_IjKl-MnOp_QrSt-UvWx_YzAb01"; // medium base64url → row-or-column + 1 extra

afterEach(cleanup);

function rngFrom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const click = (name: RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const maybe = (name: RegExp) => screen.queryByRole("button", { name });
const START = /^yes.*start$/i;
const MATCH = /^matches$/i;
const DIFFER = /^doesn.t match$/i;
const DONE = /^done.*read$/i;

const affirm = () => click(START);
function driveMatchAll(max = 100) {
  for (let i = 0; i < max; i++) {
    const m = maybe(MATCH);
    if (!m) return;
    fireEvent.click(m);
  }
}

describe("EntvizVoiceCompare: the affirmation gate", () => {
  test("shows the channel-authentication affirmation before crediting anything", () => {
    render(<EntvizVoiceCompare value={UUID} rng={rngFrom(1)} />);
    expect(screen.getByText(/live voice or video call/i)).toBeTruthy();
    // no read-back controls until affirmed
    expect(maybe(MATCH)).toBeNull();
    affirm();
    expect(maybe(MATCH)).toBeTruthy();
  });
});

describe("EntvizVoiceCompare: verdicts", () => {
  test("voice-only, small: reading every cell reaches NO-DIFFERENCE (never identical)", () => {
    render(<EntvizVoiceCompare value={UUID} rng={rngFrom(1)} />);
    affirm();
    driveMatchAll();
    expect(screen.getByText(/no difference found across what they read/i)).toBeTruthy();
    // the §15.1 conditional is always present
    expect(screen.getByText(/valid only if the person/i)).toBeTruthy();
  });

  test("one differ, after a re-look, is a certain DIFFERENT", () => {
    render(<EntvizVoiceCompare value={UUID} rng={rngFrom(1)} />);
    affirm();
    click(DIFFER); // → re-look prompt
    expect(screen.getByText(/are you sure/i)).toBeTruthy();
    click(/^yes, different$/i);
    expect(screen.getByText(/what they read does not match/i)).toBeTruthy();
  });

  test("re-look retraction returns to the read-back", () => {
    render(<EntvizVoiceCompare value={UUID} rng={rngFrom(1)} />);
    affirm();
    click(DIFFER);
    click(/^no, my mistake$/i);
    expect(maybe(MATCH)).toBeTruthy();
  });

  test("stopping early freezes PENDING ('proves nothing')", () => {
    render(<EntvizVoiceCompare value={UUID} rng={rngFrom(1)} />);
    affirm();
    click(DONE);
    expect(screen.getByText(/stopped early/i)).toBeTruthy();
  });

  test("big value: reads the fingerprint-middle cells", () => {
    render(<EntvizVoiceCompare value={BIG} rng={rngFrom(5)} />);
    affirm();
    expect(screen.getByText(/highlighted middle cells/i)).toBeTruthy();
    driveMatchAll();
    expect(screen.getByText(/no difference found across what they read/i)).toBeTruthy();
  });

  test("paste-bind: binds a couple of cells and shows the machine-matched copy", () => {
    render(<EntvizVoiceCompare value={HEX512} mode="paste-bind" rng={rngFrom(3)} />);
    affirm();
    expect(screen.getByText(/pasted value already matched by machine/i)).toBeTruthy();
    driveMatchAll();
    expect(screen.getByText(/confirmed.*pasted value machine-matched/i)).toBeTruthy();
  });

  test("confusable alphabet: warns that an extra cell was added", () => {
    render(<EntvizVoiceCompare value={B64URL} rng={rngFrom(7)} />);
    affirm();
    expect(screen.getByText(/look-alike characters/i)).toBeTruthy();
  });
});

describe("EntvizVoiceCompare: wiring", () => {
  test("externalFigures suppresses our figure; default renders it with the ring", () => {
    const ext = render(<EntvizVoiceCompare value={UUID} externalFigures rng={rngFrom(1)} />);
    affirm();
    expect(ext.container.querySelector("[data-entviz-layout]")).toBeNull();
    cleanup();

    const own = render(<EntvizVoiceCompare value={UUID} rng={rngFrom(1)} />);
    affirm();
    expect(own.container.querySelector("[data-entviz-layout]")).toBeTruthy();
    expect(own.container.querySelector("svg")).toBeTruthy();
  });

  test("reports steps and completion to the host", () => {
    const onStep = vi.fn();
    const onComplete = vi.fn();
    render(<EntvizVoiceCompare value={UUID} rng={rngFrom(1)} onStep={onStep} onComplete={onComplete} />);
    affirm();
    expect(onStep).toHaveBeenCalled(); // the current cell was reported
    driveMatchAll();
    expect(onComplete).toHaveBeenCalledWith("no-difference");
    // once ended, the step is cleared
    expect(onStep).toHaveBeenLastCalledWith(null);
  });

  test("Start over returns to the affirmation gate", () => {
    render(<EntvizVoiceCompare value={UUID} rng={rngFrom(1)} />);
    affirm();
    driveMatchAll();
    click(/^start over$/i);
    expect(screen.getByText(/live voice or video call/i)).toBeTruthy();
  });

  test("with the default CSPRNG (no rng prop) a sampling plan still completes", () => {
    // a medium value samples a row/column, so the default CSPRNG is actually drawn
    render(<EntvizVoiceCompare value={HEX512} />);
    affirm();
    driveMatchAll();
    expect(screen.getByText(/no difference found across what they read/i)).toBeTruthy();
  });

  test("an unrenderable value degrades to the gate without throwing", () => {
    // over the input cap ⇒ describeChannels throws ⇒ safeDescribe returns null; the
    // affirmation gate still renders (we never build a plan until it's affirmed).
    render(<EntvizVoiceCompare value={"!".repeat(65537)} rng={rngFrom(1)} />);
    expect(screen.getByText(/live voice or video call/i)).toBeTruthy();
  });
});

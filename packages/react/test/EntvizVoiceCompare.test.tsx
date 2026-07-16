import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { describeChannels } from "@entviz/core";
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
const START = /^proceed$/i;
const MATCH = /^matches$/i;
const DIFFER = /^doesn.t match$/i;

const affirm = () => click(START);
function driveMatchAll(max = 100) {
  for (let i = 0; i < max; i++) {
    const m = maybe(MATCH);
    if (!m) return;
    fireEvent.click(m);
  }
}
// Click "Matches" exactly n times (or until the read-back ends).
function driveMatchN(n: number) {
  for (let i = 0; i < n; i++) {
    const m = maybe(MATCH);
    if (!m) return;
    fireEvent.click(m);
  }
}
// The number of hash-anchored fingerprint-middle cells — the sound-sample milestone
// (goodCells) for a big value.
const fingerprintCount = (value: string): number =>
  describeChannels(value, {}).cells.filter((c) => c.fingerprint).length;

describe("EntvizVoiceCompare: the affirmation gate", () => {
  test("shows the channel-authentication affirmation before crediting anything", () => {
    render(<EntvizVoiceCompare value={UUID} rng={rngFrom(1)} />);
    expect(screen.getByText(/same value as you/i)).toBeTruthy();
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
    // the §15.10 conditional (voice-channel integrity, NOT identity) is always present
    expect(screen.getByText(/voice channel wasn.t tampered with/i)).toBeTruthy();
    expect(screen.getByText(/says nothing about who they are/i)).toBeTruthy();
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

  test("names the exact cell by grid address so the reader can be pointed at it", () => {
    render(<EntvizVoiceCompare value={HEX512} rng={rngFrom(4)} />);
    affirm();
    expect(screen.getByText(/have the other party read row \d+, column \d+/i)).toBeTruthy();
    // the read-back is open-ended: a coverage meter plus a Done affordance to stop
    // when satisfied (progress meter, like the guided walk).
    expect(screen.getByRole("progressbar")).toBeTruthy();
    expect(maybe(/done/i)).toBeTruthy();
  });

  test("big value: reads the fingerprint-middle cells", () => {
    render(<EntvizVoiceCompare value={BIG} rng={rngFrom(5)} />);
    affirm();
    expect(screen.getByText(/highlighted middle cells/i)).toBeTruthy();
    driveMatchAll();
    expect(screen.getByText(/no difference found across what they read/i)).toBeTruthy();
  });

  test("Done at the sound-sample milestone freezes NO-DIFFERENCE (needn't read the rest)", () => {
    render(<EntvizVoiceCompare value={BIG} rng={rngFrom(5)} />);
    affirm();
    // read exactly the sound sample (the fingerprint cells), then stop
    driveMatchN(fingerprintCount(BIG));
    click(/done/i);
    expect(screen.getByText(/no difference found across what they read/i)).toBeTruthy();
    expect(screen.queryByText(/stopped early/i)).toBeNull();
  });

  test("Done before the milestone freezes PENDING (a neutral 'stopped early', not a mismatch)", () => {
    render(<EntvizVoiceCompare value={BIG} rng={rngFrom(5)} />);
    affirm();
    driveMatchN(1); // one cell read, below the milestone
    click(/done/i);
    expect(screen.getByText(/stopped early/i)).toBeTruthy();
    // it is NOT dressed as a DIFFERENT verdict
    expect(screen.queryByText(/does not match your value/i)).toBeNull();
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
    expect(screen.getByText(/same value as you/i)).toBeTruthy();
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
    expect(screen.getByText(/same value as you/i)).toBeTruthy();
  });
});

// --- onEvent firehose ------------------------------------------------------

describe("EntvizVoiceCompare onEvent firehose", () => {
  const of = (spy: ReturnType<typeof vi.fn>, type: string) =>
    spy.mock.calls.map((c) => c[0]).filter((e) => e.type === type);
  const last = (spy: ReturnType<typeof vi.fn>, type: string) => {
    const es = of(spy, type);
    return es[es.length - 1];
  };

  test("stamps seq/ts/source=voice and increments seq monotonically", () => {
    const onEvent = vi.fn();
    render(<EntvizVoiceCompare value={UUID} rng={rngFrom(1)} onEvent={onEvent} />);
    affirm();
    driveMatchAll();
    expect(onEvent).toHaveBeenCalled();
    const evs = onEvent.mock.calls.map((c) => c[0]);
    for (const e of evs) {
      expect(e.source).toBe("voice");
      expect(typeof e.ts).toBe("number");
      expect(typeof e.seq).toBe("number");
    }
    const seqs = evs.map((e) => e.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(new Set(seqs).size).toBe(seqs.length);
  });

  test("a throwing host handler never breaks the ceremony", () => {
    const onEvent = vi.fn(() => { throw new Error("host bug"); });
    render(<EntvizVoiceCompare value={UUID} rng={rngFrom(1)} onEvent={onEvent} />);
    expect(() => affirm()).not.toThrow();
    expect(maybe(MATCH)).toBeTruthy(); // still reading
  });

  test("voice.start fires past the affirmation gate, carrying the mode; NOT before", () => {
    const onEvent = vi.fn();
    render(<EntvizVoiceCompare value={UUID} rng={rngFrom(1)} onEvent={onEvent} />);
    expect(of(onEvent, "voice.start").length).toBe(0); // gate still up
    affirm();
    expect(last(onEvent, "voice.start")).toMatchObject({ mode: "voice-only" });
  });

  test("voice.start reports the paste-bind mode", () => {
    const onEvent = vi.fn();
    render(<EntvizVoiceCompare value={HEX512} mode="paste-bind" rng={rngFrom(3)} onEvent={onEvent} />);
    affirm();
    expect(last(onEvent, "voice.start")).toMatchObject({ mode: "paste-bind" });
  });

  test("voice.complete fires with the terminal status at the end of the ceremony", () => {
    const onEvent = vi.fn();
    render(<EntvizVoiceCompare value={UUID} rng={rngFrom(1)} onEvent={onEvent} />);
    affirm();
    driveMatchAll();
    expect(last(onEvent, "voice.complete")).toMatchObject({ status: "no-difference" });
  });

  test("voice.complete reports 'different' when a difference is confirmed", () => {
    const onEvent = vi.fn();
    render(<EntvizVoiceCompare value={UUID} rng={rngFrom(1)} onEvent={onEvent} />);
    affirm();
    click(DIFFER);
    click(/^yes, different$/i);
    expect(last(onEvent, "voice.complete")).toMatchObject({ status: "different" });
  });

  test("voice.complete maps an early Done before the sound-sample milestone (core 'pending') → 'pending-done'", () => {
    const onEvent = vi.fn();
    render(<EntvizVoiceCompare value={BIG} rng={rngFrom(1)} onEvent={onEvent} />);
    affirm();
    click(/done — that's enough/i); // stop below the fingerprint sound-sample milestone
    expect(last(onEvent, "voice.complete")).toMatchObject({ status: "pending-done" });
  });

  test("NO per-cell step ever leaves the endpoint — no voice.step and no walk.step, ever", () => {
    const onEvent = vi.fn();
    render(<EntvizVoiceCompare value={HEX512} rng={rngFrom(4)} onEvent={onEvent} />);
    affirm();
    driveMatchAll(); // drives every planned cell to the verdict
    // the live authenticator-chosen cell order must never be reported (events.ts doc)
    expect(of(onEvent, "voice.step").length).toBe(0);
    expect(of(onEvent, "walk.step").length).toBe(0);
    // only the coarse lifecycle events are emitted
    const types = new Set(onEvent.mock.calls.map((c) => c[0].type));
    expect(types).toEqual(new Set(["voice.start", "voice.complete"]));
  });
});

describe("EntvizVoiceCompare rng prod-gate (§5.4)", () => {
  test("an injected rng IS consulted in the (default) test env", () => {
    // A medium-constrained value → a consecutive run from an UNPREDICTABLE start,
    // which draws from the source (small/big enumerate or hash-anchor without it).
    const rng = vi.fn(rngFrom(1));
    render(<EntvizVoiceCompare value={HEX512} rng={rng} />);
    affirm(); // the read-back plan is built on affirm, drawing from the source
    expect(rng).toHaveBeenCalled();
  });

  test("under NODE_ENV=production the injected rng is IGNORED (platform csprng)", () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      // A medium-constrained value that WOULD draw from an honored rng (consecutive
      // run) — so `not.toHaveBeenCalled` is a meaningful assertion of the prod gate.
      const rng = vi.fn(rngFrom(1));
      render(<EntvizVoiceCompare value={HEX512} rng={rng} />);
      affirm();
      expect(rng).not.toHaveBeenCalled();
      // the ceremony still runs to a verdict on the platform csprng
      driveMatchAll();
      expect(screen.getByText(/no difference found across what they read/i)).toBeTruthy();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("EntvizVoiceCompare: reduced-motion", () => {
  test("consults prefers-reduced-motion for the coverage meter when matchMedia exists", () => {
    // jsdom ships no matchMedia (the SSR guard then returns false); stub it so the
    // meter's transition path reads (prefers-reduced-motion: reduce).matches.
    const saved = (window as unknown as { matchMedia?: unknown }).matchMedia;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn((q: string) => ({ matches: true, media: q }) as MediaQueryList),
    });
    try {
      render(<EntvizVoiceCompare value={UUID} rng={rngFrom(1)} />);
      affirm();
      // the coverage meter is rendered post-affirmation; its fill consults
      // prefersReducedMotion(), exercising the matchMedia read.
      expect(screen.getByRole("progressbar")).toBeTruthy();
    } finally {
      if (saved) Object.defineProperty(window, "matchMedia", { configurable: true, value: saved });
      else delete (window as unknown as { matchMedia?: unknown }).matchMedia;
    }
  });
});

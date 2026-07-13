import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render as rtlRender, screen } from "@testing-library/react";
import { EntvizWalk, mutate, PROMPTS } from "../src/index.ts";

const UUID = "550e8400-e29b-41d4-a716-446655440000"; // 6 cells → small
const HEX256 = "0123456789abcdef".repeat(4); // ~11 cells → large, no probe
const HEX512 = "0123456789abcdef".repeat(8); // ~22 cells → large, with probe

afterEach(cleanup);

const btn = (re: RegExp) => screen.queryByRole("button", { name: re });
const isProbe = () => screen.queryAllByText(/planted check/i).length > 0;

// Drive to the end: catch the planted probe (differ), match everything else →
// the walk runs to exhaustion and ends NO-DIFFERENCE.
function driveToEnd(max = 200) {
  for (let i = 0; i < max; i++) {
    const match = btn(/looks the same/i);
    if (!match) return;
    if (isProbe()) fireEvent.click(btn(/looks different/i)!);
    else fireEvent.click(match);
  }
}

// Click "match" on everything, including the probe → two probe misses → inconclusive.
function driveAlwaysMatch(max = 200) {
  for (let i = 0; i < max; i++) {
    const match = btn(/looks the same/i);
    if (!match) return;
    fireEvent.click(match);
  }
}

// Match n times (to climb part-way up the scale without finishing).
function matchN(n: number) {
  for (let i = 0; i < n; i++) {
    const match = btn(/looks the same/i);
    if (!match) return;
    fireEvent.click(match);
  }
}

describe("EntvizWalk layout", () => {
  test("arranges the two figures; side-by-side by default", () => {
    for (const layout of [undefined, "stacked", "auto"] as const) {
      const { container, unmount } = rtlRender(
        <EntvizWalk value={HEX256} reference={HEX256} mode="spot-check" layout={layout} />,
      );
      const figs = container.querySelector("[data-entviz-layout]") as HTMLElement;
      expect(figs.getAttribute("data-entviz-layout")).toBe(layout ?? "side-by-side");
      unmount();
    }
  });
});

describe("mutate", () => {
  test("changes the last character deterministically", () => {
    expect(mutate("abcdef")).toBe("abcdee"); // f→e
    expect(mutate("01230")).toBe("01231"); // 0→1
    expect(mutate("xyz")).toBe("xyy"); // z→y
    expect(mutate("789")).toBe("788"); // 9→8
    expect(mutate("abca")).toBe("abc0"); // other→0
    expect(mutate("")).toBe("0");
  });
});

// --- the mode picker (binary; Quick/Good are milestones, not buttons) -------

describe("EntvizWalk mode picker", () => {
  test("a small value offers only Complete, which starts the walk", () => {
    rtlRender(<EntvizWalk value={UUID} reference={UUID} />);
    expect(btn(/spot-check/i)).toBeNull(); // a spot-check of a few cells is degenerate
    fireEvent.click(btn(/read every cell/i)!);
    expect(btn(/looks the same/i)).toBeTruthy(); // walk started
  });

  test("a large value offers Spot-check and Complete, each starting a walk", () => {
    for (const re of [/spot-check/i, /read every cell|complete/i]) {
      const { unmount } = rtlRender(<EntvizWalk value={HEX512} reference={HEX512} />);
      fireEvent.click(btn(re)!);
      expect(btn(/looks the same/i)).toBeTruthy();
      unmount();
    }
  });

  test("an unrenderable value still shows a picker (degrades safely)", () => {
    rtlRender(<EntvizWalk value="" reference="" />);
    expect(screen.getByText(/walking the cells/i)).toBeTruthy();
  });
});

describe("EntvizWalk verdicts", () => {
  test("a spot-check shows Quick/Good milestone ticks and climbs to NO-DIFFERENCE", () => {
    const onComplete = vi.fn();
    rtlRender(<EntvizWalk value={HEX256} reference={HEX256} mode="spot-check" onComplete={onComplete} />);
    expect(screen.getByText(/^Quick$/)).toBeTruthy(); // milestone ticks on the meter
    expect(screen.getByText(/^Good$/)).toBeTruthy();
    driveToEnd();
    expect(screen.getByText(/no difference found/i)).toBeTruthy();
    expect(onComplete).toHaveBeenCalledWith("no-difference");
  });

  test("Done below Good → a peek (PENDING); Done past Good → NO-DIFFERENCE", () => {
    // Done immediately → stopped early, not a verification
    rtlRender(<EntvizWalk value={HEX256} reference={HEX256} mode="spot-check" />);
    fireEvent.click(btn(/done — that's enough/i)!);
    expect(screen.getByText(/stopped early/i)).toBeTruthy();
    cleanup();
    // Climb past Good, then stop → keeps the affirmative
    rtlRender(<EntvizWalk value={HEX256} reference={HEX256} mode="spot-check" />);
    matchN(8); // enough to clear the Good front of an ~11-cell value
    fireEvent.click(btn(/done — that's enough/i)!);
    expect(screen.getByText(/no difference found/i)).toBeTruthy();
  });

  test("no redundant live 'sanity look' verdict line — the meter is the sole progress signal", () => {
    rtlRender(<EntvizWalk value={HEX256} reference={HEX256} mode="spot-check" />);
    expect(screen.getByRole("progressbar")).toBeTruthy(); // the meter carries progress
    // the old restating text (both its below-Good and past-Good variants) is gone
    expect(screen.queryByText(/sanity look/i)).toBeNull();
    expect(screen.queryByText(/keep going to reach a verification/i)).toBeNull();
    matchN(8); // cross Good
    expect(screen.queryByText(/no difference so far/i)).toBeNull();
  });

  test("gestalt prompts are full, style-consistent questions (colorbar + quartile precision)", () => {
    // Each prompt is a complete yes/no question (starts with a verb, ends in "?"),
    // so it reads consistently above the "Looks the same / different" buttons.
    for (const p of Object.values(PROMPTS)) {
      expect(/^(Do|Does|Is|Are)\b/.test(p)).toBe(true);
      expect(p.endsWith("?")).toBe(true);
    }
    // the color-bar prompt is a full sentence, not the old fragment
    expect(PROMPTS["colorbar-pattern"]).toBe(
      "Does the color bar consist of the same colored bands, in the same order and the same ratios?",
    );
    // the quartile prompt now names place, color, AND cell (was just "…on the same cells?")
    expect(PROMPTS["quartile-marks"]).toMatch(/places/i);
    expect(PROMPTS["quartile-marks"]).toMatch(/colors/i);
    expect(PROMPTS["quartile-marks"]).toMatch(/cells/i);
  });

  test("a reported difference asks for a re-look, then confirms DIFFERENT", () => {
    rtlRender(<EntvizWalk value={HEX256} reference={HEX256} mode="spot-check" />);
    fireEvent.click(btn(/looks different/i)!);
    expect(screen.getByText(/look again/i)).toBeTruthy();
    fireEvent.click(btn(/yes, different/i)!);
    expect(screen.getByText(/not the same value/i)).toBeTruthy();
  });

  test("re-look can be retracted, returning to the walk", () => {
    rtlRender(<EntvizWalk value={HEX256} reference={HEX256} mode="spot-check" />);
    fireEvent.click(btn(/looks different/i)!);
    fireEvent.click(btn(/my mistake/i)!);
    expect(btn(/looks the same/i)).toBeTruthy(); // back to the step
  });

  test("a large Complete walk: catching the planted probe reaches no difference", () => {
    rtlRender(<EntvizWalk value={HEX512} reference={HEX512} mode="complete" />);
    driveToEndWithReveal();
    expect(screen.getByText(/no difference found/i)).toBeTruthy();
  });

  test("a large Complete walk: missing the planted probe twice is inconclusive", () => {
    rtlRender(<EntvizWalk value={HEX512} reference={HEX512} mode="complete" />);
    driveAlwaysMatch();
    expect(screen.getByText(/inconclusive/i)).toBeTruthy();
  });

  test("a small Complete walk reads every cell → no difference", () => {
    rtlRender(<EntvizWalk value={UUID} reference={UUID} mode="complete" />);
    driveToEnd();
    expect(screen.getByText(/no difference found/i)).toBeTruthy();
  });

  test("'Walk again' restarts after a verdict — fresh walk (mode) or picker (none)", () => {
    // with a fixed mode → rebuilds that walk
    const a = rtlRender(<EntvizWalk value={HEX256} reference={HEX256} mode="spot-check" />);
    driveToEnd();
    expect(screen.getByText(/no difference found/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /walk again/i }));
    expect(btn(/looks the same/i)).toBeTruthy(); // back in a walk
    a.unmount();
    // no mode → returns to the picker so the choice can change
    rtlRender(<EntvizWalk value={HEX256} reference={HEX256} />);
    fireEvent.click(btn(/spot-check/i)!);
    driveToEnd();
    fireEvent.click(screen.getByRole("button", { name: /walk again/i }));
    expect(btn(/spot-check/i)).toBeTruthy(); // picker again
  });
});

function driveToEndWithReveal(max = 200) {
  for (let i = 0; i < max; i++) {
    const match = btn(/looks the same/i);
    if (!match) return;
    if (isProbe()) {
      const planted = screen.getAllByText(/[0-9a-z]/i).find((e) => e.tagName === "SPAN" && /^[0-9a-zA-Z]+$/.test(e.textContent ?? ""));
      if (planted) fireEvent.mouseEnter(planted);
      fireEvent.click(btn(/looks different/i)!);
    } else {
      fireEvent.click(match);
    }
  }
}

// --- onEvent firehose ------------------------------------------------------

describe("EntvizWalk onEvent firehose", () => {
  const of = (spy: ReturnType<typeof vi.fn>, type: string) =>
    spy.mock.calls.map((c) => c[0]).filter((e) => e.type === type);
  const last = (spy: ReturnType<typeof vi.fn>, type: string) => {
    const es = of(spy, type);
    return es[es.length - 1];
  };

  test("stamps seq/ts/source=walk and increments seq monotonically", () => {
    const onEvent = vi.fn();
    rtlRender(<EntvizWalk value={HEX256} reference={HEX256} mode="spot-check" onEvent={onEvent} />);
    matchN(3);
    expect(onEvent).toHaveBeenCalled();
    const evs = onEvent.mock.calls.map((c) => c[0]);
    for (const e of evs) {
      expect(e.source).toBe("walk");
      expect(typeof e.ts).toBe("number");
      expect(typeof e.seq).toBe("number");
    }
    const seqs = evs.map((e) => e.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(new Set(seqs).size).toBe(seqs.length);
  });

  test("a throwing host handler never breaks the walk", () => {
    const onEvent = vi.fn(() => { throw new Error("host bug"); });
    rtlRender(<EntvizWalk value={HEX256} reference={HEX256} mode="spot-check" onEvent={onEvent} />);
    expect(() => matchN(2)).not.toThrow();
    expect(btn(/looks the same/i)).toBeTruthy(); // still walking
  });

  test("walk.start fires with the mode when a mode-prop walk launches", () => {
    const onEvent = vi.fn();
    rtlRender(<EntvizWalk value={HEX256} reference={HEX256} mode="complete" onEvent={onEvent} />);
    expect(last(onEvent, "walk.start")).toMatchObject({ mode: "complete" });
  });

  test("walk.start fires with the mode chosen in the picker", () => {
    const onEvent = vi.fn();
    rtlRender(<EntvizWalk value={HEX512} reference={HEX512} onEvent={onEvent} />);
    expect(of(onEvent, "walk.start").length).toBe(0); // picker: no walk yet
    fireEvent.click(btn(/spot-check/i)!);
    expect(last(onEvent, "walk.start")).toMatchObject({ mode: "spot-check" });
  });

  test("walk.step carries the feature KIND (never glyphs) with a monotonic index from 0", () => {
    const onEvent = vi.fn();
    rtlRender(<EntvizWalk value={HEX512} reference={HEX512} mode="complete" onEvent={onEvent} />);
    driveToEndWithReveal();
    const steps = of(onEvent, "walk.step");
    expect(steps.length).toBeGreaterThan(0);
    for (const s of steps) {
      expect(["text", "gestalt", "probe"]).toContain(s.feature); // a KIND, not glyph text
      expect(typeof s.index).toBe("number");
    }
    expect(steps.map((s) => s.index)).toEqual(steps.map((_, i) => i)); // monotonic from 0
  });

  test("walk.complete fires with the terminal status (no-difference)", () => {
    const onEvent = vi.fn();
    rtlRender(<EntvizWalk value={HEX256} reference={HEX256} mode="spot-check" onEvent={onEvent} />);
    driveToEnd();
    expect(last(onEvent, "walk.complete")).toMatchObject({ status: "no-difference" });
  });

  test("walk.complete maps a sub-Good early Done (core 'pending') → 'pending-done'", () => {
    const onEvent = vi.fn();
    rtlRender(<EntvizWalk value={HEX256} reference={HEX256} mode="spot-check" onEvent={onEvent} />);
    fireEvent.click(btn(/done — that's enough/i)!); // stop below the Good milestone
    expect(last(onEvent, "walk.complete")).toMatchObject({ status: "pending-done" });
  });

  test("walk.complete reports 'different' when a difference is confirmed", () => {
    const onEvent = vi.fn();
    rtlRender(<EntvizWalk value={HEX256} reference={HEX256} mode="spot-check" onEvent={onEvent} />);
    fireEvent.click(btn(/looks different/i)!);
    fireEvent.click(btn(/yes, different/i)!);
    expect(last(onEvent, "walk.complete")).toMatchObject({ status: "different" });
  });

  test("restarting via 'Walk again' emits a fresh walk.start and resets the step index", () => {
    const onEvent = vi.fn();
    rtlRender(<EntvizWalk value={HEX256} reference={HEX256} mode="spot-check" onEvent={onEvent} />);
    driveToEnd();
    const startsBefore = of(onEvent, "walk.start").length;
    fireEvent.click(screen.getByRole("button", { name: /walk again/i }));
    expect(of(onEvent, "walk.start").length).toBe(startsBefore + 1);
    // the new walk's first step re-starts the index at 0
    expect(of(onEvent, "walk.step").slice(-1)[0].index).toBe(0);
  });
});

// --- accessibility (A11Y-F4) -----------------------------------------------

describe("EntvizWalk accessibility", () => {
  test("the coverage progressbar has a non-empty accessible name", () => {
    rtlRender(<EntvizWalk value={HEX256} reference={HEX256} mode="spot-check" />);
    const bar = screen.getByRole("progressbar");
    // an aria-label gives screen-reader users the context that this measures
    // walk coverage (WCAG 1.3.1), rather than a bare percentage
    expect(bar.getAttribute("aria-label")).toBeTruthy();
    expect((bar.getAttribute("aria-label") ?? "").trim().length).toBeGreaterThan(0);
  });

  test("the meter fill animates when reduced motion is NOT preferred", () => {
    const mql = { matches: false, media: "", addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const spy = vi.fn(() => mql);
    Object.defineProperty(window, "matchMedia", { configurable: true, value: spy });
    try {
      const { container } = rtlRender(<EntvizWalk value={HEX256} reference={HEX256} mode="spot-check" />);
      const bar = screen.getByRole("progressbar");
      const fill = bar.firstElementChild as HTMLElement;
      expect(fill.style.transition).toMatch(/width/);
      void container;
    } finally {
      delete (window as unknown as { matchMedia?: unknown }).matchMedia;
    }
  });

  test("the meter fill does NOT animate when prefers-reduced-motion: reduce", () => {
    const mql = { matches: true, media: "", addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const spy = vi.fn(() => mql);
    Object.defineProperty(window, "matchMedia", { configurable: true, value: spy });
    try {
      rtlRender(<EntvizWalk value={HEX256} reference={HEX256} mode="spot-check" />);
      const bar = screen.getByRole("progressbar");
      const fill = bar.firstElementChild as HTMLElement;
      // no width transition for users with vestibular sensitivity
      expect(fill.style.transition === "none" || fill.style.transition === "").toBe(true);
      expect(fill.style.transition).not.toMatch(/width/);
    } finally {
      delete (window as unknown as { matchMedia?: unknown }).matchMedia;
    }
  });

  test("the meter fill animates when matchMedia is unavailable (SSR guard)", () => {
    const saved = (window as unknown as { matchMedia?: unknown }).matchMedia;
    delete (window as unknown as { matchMedia?: unknown }).matchMedia;
    try {
      rtlRender(<EntvizWalk value={HEX256} reference={HEX256} mode="spot-check" />);
      const bar = screen.getByRole("progressbar");
      const fill = bar.firstElementChild as HTMLElement;
      expect(fill.style.transition).toMatch(/width/);
    } finally {
      if (saved) Object.defineProperty(window, "matchMedia", { configurable: true, value: saved });
    }
  });
});

// --- rng prod-gate (§5.4) --------------------------------------------------

describe("EntvizWalk rng prod-gate", () => {
  test("an injected rng IS consulted in the (default) test env", () => {
    const rng = vi.fn(() => 0.5);
    rtlRender(<EntvizWalk value={HEX256} reference={HEX256} mode="spot-check" rng={rng} />);
    // the plan is built from the injected source, so it was drawn from
    expect(rng).toHaveBeenCalled();
  });

  test("under NODE_ENV=production the injected rng is IGNORED (platform csprng)", () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      const rng = vi.fn(() => 0.5);
      // the walk still builds a plan and runs to a verdict, but never touches the fake
      rtlRender(<EntvizWalk value={HEX256} reference={HEX256} mode="spot-check" rng={rng} />);
      expect(rng).not.toHaveBeenCalled();
      driveToEnd();
      expect(screen.getByText(/no difference found/i)).toBeTruthy();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render as rtlRender, screen } from "@testing-library/react";
import { EntvizWalk, mutate } from "../src/index.ts";

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
    expect(screen.getByText(/no difference so far/i)).toBeTruthy(); // live verdict crossed Good
    fireEvent.click(btn(/done — that's enough/i)!);
    expect(screen.getByText(/no difference found/i)).toBeTruthy();
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

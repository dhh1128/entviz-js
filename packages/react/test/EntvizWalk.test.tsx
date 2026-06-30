import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render as rtlRender, screen } from "@testing-library/react";
import { render } from "@entviz/core";
import { EntvizWalk, featureRects, mutate } from "../src/index.ts";
import { rectOf } from "../src/EntvizWalk.ts";

const UUID = "550e8400-e29b-41d4-a716-446655440000"; // 6 cells → small
const HEX256 = "0123456789abcdef".repeat(4); // ~11 cells → large, no probe
const HEX512 = "0123456789abcdef".repeat(8); // ~22 cells → large, with probe

afterEach(cleanup);

const btn = (re: RegExp) => screen.queryByRole("button", { name: re });
const isProbe = () => screen.queryAllByText(/planted check/i).length > 0;

// Drive the walk: catch the planted probe (differ), match everything else → reaches
// an affirmative verdict on a probe-containing plan.
function driveCatchingProbe(max = 120) {
  for (let i = 0; i < max; i++) {
    const match = btn(/looks the same/i);
    if (!match) return;
    if (isProbe()) fireEvent.click(btn(/looks different/i)!);
    else fireEvent.click(match);
  }
}

// Click "match" on everything, including the probe → two probe misses → inconclusive.
function driveAlwaysMatch(max = 120) {
  for (let i = 0; i < max; i++) {
    const match = btn(/looks the same/i);
    if (!match) return;
    fireEvent.click(match);
  }
}

// --- featureRects (pure) --------------------------------------------------

describe("featureRects", () => {
  const svg = render(HEX512); // has blanks, quartiles, all gestalt dimensions

  test("text cell → one rect; viewBox present", () => {
    const { viewBox, rects } = featureRects(svg, { kind: "text", cellIndex: 0 });
    expect(viewBox).toMatch(/^0 0 /);
    expect(rects.length).toBe(1);
    expect(rects[0].w).toBeGreaterThan(0);
  });

  test("each gestalt dimension yields at least one rect", () => {
    const dims = ["background", "colorbar-pattern", "colorbar-markers", "ellipse", "blank-pattern", "blank-map", "quartile-marks"] as const;
    for (const dimension of dims) {
      const { rects } = featureRects(svg, { kind: "gestalt", dimension });
      expect(rects.length, dimension).toBeGreaterThan(0);
    }
  });

  test("colorbar-pattern unions its bands into a single rect", () => {
    expect(featureRects(svg, { kind: "gestalt", dimension: "colorbar-pattern" }).rects.length).toBe(1);
  });

  test("a probe step has no figure rect", () => {
    expect(featureRects(svg, { kind: "probe" }).rects.length).toBe(0);
  });

  test("rectOf returns null for a non-shape element", () => {
    const g = new DOMParser().parseFromString("<svg><g/></svg>", "image/svg+xml").querySelector("g")!;
    expect(rectOf(g)).toBeNull();
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

// --- the walk component ---------------------------------------------------

describe("EntvizWalk preset picker", () => {
  test("a small value offers only Complete, which starts the walk", () => {
    rtlRender(<EntvizWalk value={UUID} reference={UUID} />);
    expect(btn(/sanity peek \(/i)).toBeNull();
    fireEvent.click(btn(/read every cell/i)!);
    expect(btn(/looks the same/i)).toBeTruthy(); // walk started
  });

  test("a large value offers all three presets, each starting a walk", () => {
    for (const re of [/sanity peek \(/i, /strong spot-check/i, /verify in full/i]) {
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
  test("matching through a Good walk → no difference found", () => {
    const onComplete = vi.fn();
    rtlRender(<EntvizWalk value={HEX256} reference={HEX256} preset="good" onComplete={onComplete} />);
    driveCatchingProbe(); // good has no probe, but the driver still matches through
    expect(screen.getByText(/no difference found/i)).toBeTruthy();
    expect(onComplete).toHaveBeenCalledWith("no-difference");
  });

  test("a reported difference asks for a re-look, then confirms DIFFERENT", () => {
    rtlRender(<EntvizWalk value={HEX256} reference={HEX256} preset="good" />);
    fireEvent.click(btn(/looks different/i)!);
    expect(screen.getByText(/look again/i)).toBeTruthy();
    fireEvent.click(btn(/yes, different/i)!);
    expect(screen.getByText(/not the same value/i)).toBeTruthy();
  });

  test("re-look can be retracted, returning to the walk", () => {
    rtlRender(<EntvizWalk value={HEX256} reference={HEX256} preset="good" />);
    fireEvent.click(btn(/looks different/i)!);
    fireEvent.click(btn(/my mistake/i)!);
    expect(btn(/looks the same/i)).toBeTruthy(); // back to the step
  });

  test("a Quick walk completes but stays a non-verdict peek", () => {
    rtlRender(<EntvizWalk value={HEX512} reference={HEX512} preset="quick" />);
    driveAlwaysMatch();
    expect(screen.getByText(/sanity peek done/i)).toBeTruthy();
  });

  test("a large Complete walk: catching the planted probe reaches no difference", () => {
    rtlRender(<EntvizWalk value={HEX512} reference={HEX512} preset="complete" />);
    // reveal the probe text at least once during the walk (covers the reveal handler)
    driveCatchingProbeWithReveal();
    expect(screen.getByText(/no difference found/i)).toBeTruthy();
  });

  test("a large Complete walk: missing the planted probe twice is inconclusive", () => {
    rtlRender(<EntvizWalk value={HEX512} reference={HEX512} preset="complete" />);
    driveAlwaysMatch();
    expect(screen.getByText(/inconclusive/i)).toBeTruthy();
  });

  test("a small Complete walk reads every cell → no difference", () => {
    rtlRender(<EntvizWalk value={UUID} reference={UUID} preset="complete" />);
    driveCatchingProbe();
    expect(screen.getByText(/no difference found/i)).toBeTruthy();
  });
});

function driveCatchingProbeWithReveal(max = 120) {
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

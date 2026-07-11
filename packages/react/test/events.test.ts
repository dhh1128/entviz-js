import { describe, expect, test } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { emitEvent, type EntvizEvent } from "../src/index.ts";
import { useEmit } from "../src/events.ts";

describe("emitEvent", () => {
  test("stamps seq/ts/source + default sensitivity, forwards to the handler", () => {
    const seq = { current: 0 };
    const got: EntvizEvent[] = [];
    emitEvent((e) => got.push(e), "compare", seq, { type: "reference.cleared" });
    expect(got[0]).toMatchObject({ type: "reference.cleared", seq: 0, source: "compare", sensitivity: "plain" });
    expect(typeof got[0].ts).toBe("number");
  });

  test("seq is monotonic; an explicit sensitivity overrides the default", () => {
    const seq = { current: 0 };
    const got: EntvizEvent[] = [];
    const on = (e: EntvizEvent) => got.push(e);
    emitEvent(on, "compare", seq, { type: "reference.cleared" });
    emitEvent(on, "compare", seq, { type: "fetch.error", origin: "https://x", message: "m", sensitivity: "network" });
    expect(got.map((e) => e.seq)).toEqual([0, 1]);
    expect(got[1].sensitivity).toBe("network");
  });

  test("no handler is a no-op; a throwing handler is swallowed (a host bug can't wedge a safety)", () => {
    const seq = { current: 0 };
    expect(() => emitEvent(undefined, "compare", seq, { type: "reference.cleared" })).not.toThrow();
    expect(seq.current).toBe(0); // no handler → seq untouched
    expect(() =>
      emitEvent(() => { throw new Error("boom"); }, "compare", seq, { type: "reference.cleared" }),
    ).not.toThrow();
  });
});

describe("useEmit", () => {
  test("returns a STABLE emit that always calls the LATEST onEvent (no stale closure)", () => {
    const a: EntvizEvent[] = [];
    const b: EntvizEvent[] = [];
    const onA = (e: EntvizEvent) => a.push(e);
    const onB = (e: EntvizEvent) => b.push(e);
    const { result, rerender } = renderHook(({ on }) => useEmit(on, "compare"), {
      initialProps: { on: onA as (e: EntvizEvent) => void },
    });
    const emit1 = result.current;
    act(() => emit1({ type: "reference.cleared" }));
    expect(a).toHaveLength(1);

    // The host swaps in a new handler on the next render.
    rerender({ on: onB });
    const emit2 = result.current;
    expect(emit2).toBe(emit1); // identity is stable across a handler change (usable in dep arrays)
    act(() => emit2({ type: "reference.cleared" }));
    expect(b).toHaveLength(1); // the CURRENT handler receives it...
    expect(a).toHaveLength(1); // ...not the stale one captured at creation
    // seq stays monotonic per instance across renders.
    expect([...a, ...b].map((e) => e.seq)).toEqual([0, 1]);
  });

  test("undefined onEvent is a no-op", () => {
    const { result } = renderHook(() => useEmit(undefined, "pill"));
    expect(() => act(() => result.current({ type: "reference.cleared" }))).not.toThrow();
  });
});

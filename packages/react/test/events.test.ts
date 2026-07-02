import { describe, expect, test } from "vitest";
import { emitEvent, type EntvizEvent } from "../src/index.ts";

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

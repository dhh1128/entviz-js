import { afterEach, describe, expect, test, vi } from "vitest";
import { safeRng } from "../src/rng-guard.ts";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("safeRng", () => {
  test("in the default (test) env an injected rng IS used", () => {
    const fake = () => 0.42;
    const r = safeRng(fake);
    // The returned fn defers to the injected source (same identity is fine, but
    // assert BEHAVIOR: it yields the injected value, not a platform draw).
    expect(r()).toBe(0.42);
  });

  test("under NODE_ENV=production the injected rng is IGNORED (platform CSPRNG only)", () => {
    vi.stubEnv("NODE_ENV", "production");
    let called = false;
    const fake = () => { called = true; return 0.42; };
    const r = safeRng(fake);
    const draw = r();
    // The injected fake must NOT be consulted…
    expect(called).toBe(false);
    // …and the returned fn is not the fake (it's the platform csprng).
    expect(r).not.toBe(fake);
    // …and it still yields a working [0,1) number.
    expect(draw).toBeGreaterThanOrEqual(0);
    expect(draw).toBeLessThan(1);
  });

  test("safeRng(undefined) returns a working platform csprng in [0,1)", () => {
    const r = safeRng();
    for (let i = 0; i < 5; i++) {
      const x = r();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  test("does not throw when `process` is undefined (browser bundle)", () => {
    vi.stubGlobal("process", undefined);
    const fake = () => 0.7;
    let r!: () => number;
    expect(() => { r = safeRng(fake); }).not.toThrow();
    // process undefined ⇒ not production ⇒ the injected rng is honored.
    expect(r()).toBe(0.7);
  });

  test("tolerates a `process` without an `env` object", () => {
    vi.stubGlobal("process", {} as unknown as NodeJS.Process);
    const fake = () => 0.13;
    let r!: () => number;
    expect(() => { r = safeRng(fake); }).not.toThrow();
    expect(r()).toBe(0.13);
  });
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveChannels,
  type TrustAssumption,
} from "../../src/trust.ts";

// ujdwjtex (this.i): the TrustAssumption gate. A shareable, host-declared,
// v1-immutable object whose posture opens (or keeps shut) the three value-derived
// gestalt channels — mnemonic / icon / autoColor. The security-load-bearing rule:
// the default (no object / anything but the corpus posture) turns ALL of them OFF
// (maximum safety = the wild posture), and even an explicit channel flag can NEVER
// switch a channel on outside the corpus posture. Within corpus, each channel is
// opt-in (default off) so enabling a visible channel stays deliberate.

test("no assumption -> every value-derived channel is off", () => {
  assert.deepEqual(resolveChannels(), { mnemonic: false, icon: false, autoColor: false });
  assert.deepEqual(resolveChannels(null), { mnemonic: false, icon: false, autoColor: false });
  assert.deepEqual(resolveChannels(undefined), { mnemonic: false, icon: false, autoColor: false });
});

test("wild posture forces every channel off, even when flags are set (the safety gate)", () => {
  const a: TrustAssumption = { posture: "wild", mnemonic: true, icon: true, autoColor: true };
  assert.deepEqual(resolveChannels(a), { mnemonic: false, icon: false, autoColor: false });
});

test("corpus posture with nothing opted-in leaves every channel off", () => {
  assert.deepEqual(resolveChannels({ posture: "corpus" }), {
    mnemonic: false,
    icon: false,
    autoColor: false,
  });
});

test("corpus posture enables exactly the opted-in channels", () => {
  assert.deepEqual(resolveChannels({ posture: "corpus", mnemonic: true }), {
    mnemonic: true,
    icon: false,
    autoColor: false,
  });
  assert.deepEqual(resolveChannels({ posture: "corpus", icon: true, autoColor: true }), {
    mnemonic: false,
    icon: true,
    autoColor: true,
  });
});

test("corpus posture with all three opted-in enables all three", () => {
  const a: TrustAssumption = { posture: "corpus", mnemonic: true, icon: true, autoColor: true };
  assert.deepEqual(resolveChannels(a), { mnemonic: true, icon: true, autoColor: true });
});

test("only strict `true` opts a channel in (a truthy non-true is off)", () => {
  // Defends against a stray value flipping a channel on; the gate is boolean-exact.
  const a = { posture: "corpus", mnemonic: 1 as unknown as boolean };
  assert.equal(resolveChannels(a as TrustAssumption).mnemonic, false);
});

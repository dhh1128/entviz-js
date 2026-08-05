import { test } from "node:test";
import assert from "node:assert/strict";
import { characterize, renderLabel } from "../../src/characterize.ts";
import { parse } from "../../src/entviz.ts";

// v17: the network qualifier is read from the prefix, not assumed.
//
// Through v16 `characterize()` hardcoded `network: "mainnet"` for every BTC
// address and emitted no network at all for Cardano Shelley. Because mods()
// surfaces the network only when it *departs* from mainnet (the v14 rule —
// "testnet loud, mainnet silent"), a testnet address rendered a label
// indistinguishable from its mainnet twin: `BTC, tb1` where `BTC, testnet, tb1`
// was required. The port was non-conformant to the spec, in the same
// mainnet-versus-testnet confusability family that v16 closed for the HRP.
//
// The Shelley matcher also had a length hole: its body floor of 50 characters
// excluded every 29-byte Shelley address — all reward (`stake1…`) and
// enterprise addresses, which are 47 characters ahead of the 6-character
// checksum. See this.i:n3twrkq and this.i:sh3lley29.

const q = (value: string) => characterize(value).qualifiers;
const label = (value: string) => renderLabel(characterize(value)).top;

// [value, expected network, expected label]
const NETWORK_CASES: Array<[string, string, string]> = [
  ["bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4", "mainnet", "BTC, bc1"],
  ["tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx", "testnet", "BTC, testnet, tb1"],
  ["1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", "mainnet", "BTC, 1"],
  ["mfWyW5fc9NUj75YAnFgoRLrjxgLDn2MMth", "testnet", "BTC, testnet, m"],
  ["ltc1qw508d6qejxtdg4y5r3zarvary0c5xw7kgmn4n9", "mainnet", "LTC, ltc1"],
  ["bitcoincash:qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a", "mainnet", "BCH, bitcoincash:"],
  ["bchtest:qpm2qsznhks23z7629mms6s4cwef74vcwvqcw003ap", "testnet", "BCH, testnet, bchtest:"],
  ["stake1uyqqzqsrqszsvpcgpy9qkrqdpc83qygjzv2p29shrqv35xcwfvml6", "mainnet", "ADA, stake1"],
  ["stake_test1uqqqzqsrqszsvpcgpy9qkrqdpc83qygjzv2p29shrqv35xcfrxem8", "testnet",
   "ADA, testnet, stake_test1"],
];

test("v17: the network qualifier is read from the prefix on every path", () => {
  for (const [value, network, expected] of NETWORK_CASES) {
    assert.equal(q(value).network, network, value);
    assert.equal(label(value), expected, value);
  }
});

test("v17: testnet is loud and mainnet is silent", () => {
  // The v14 label rule, restated as a property so it cannot rot: the word
  // appears in the label exactly when the network departs from mainnet.
  for (const [value, network, expected] of NETWORK_CASES) {
    assert.equal(expected.includes("testnet"), network === "testnet", value);
  }
});

test("v17: a testnet address never labels like its mainnet twin", () => {
  // The defect, stated directly. These two share a payload and differ only in
  // the network; before v17 both read "BTC, …", separable only by the small
  // prefix slot, and their characterizations were byte-identical.
  const main = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4";
  const testnet = "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx";
  assert.equal(parse(main)!.core, parse(testnet)!.core, "premise: one payload");
  assert.notDeepEqual(q(main), q(testnet));
  assert.notEqual(label(main), label(testnet));
});

test("v17: the remaining legacy version bytes map to their networks", () => {
  // `3` is mainnet P2SH and `2` its testnet counterpart (version bytes 0x05 and
  // 0xc4); `n` is the second testnet P2PKH leading character alongside the `m`
  // covered above. All are base58check-valid — the `2` is the mainnet P2SH
  // vector's own hash160 re-encoded under 0xc4, so only the network differs.
  assert.equal(q("3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy").network, "mainnet");
  assert.equal(q("2N9hLwkSqr1cPQAPxbrGVUjxyjD11G2e1he").network, "testnet");
  assert.equal(q("n2fep8JzqiZMPnmZVRC27Ux4mikUH2JYtC").network, "testnet");
});

test("v17: Byron claims no network", () => {
  // Deliberate: a Byron address's network magic is inside the CBOR payload,
  // which this parser does not decode — the same reason its CRC-32 goes
  // unverified. Asserting mainnet would be a guess dressed as a fact.
  for (const value of [
    "Ae2tdPwUPEZ7SZaSCeU8sGZXGZ7YrVc96FnzYdZcLkbry4CqUKax9dNeEoe",
    "DdzFFzCqrht1D2Tv5F9HLtZHEd4P9Tddf9DFv3d4KXa2RxudcL4uHKWtc2HfiDopch5UHyZkXQx7",
  ]) {
    const c = characterize(value);
    assert.equal(c.scheme, "ada");
    assert.deepEqual(c.qualifiers, { variant: "byron" });
    assert.ok(!renderLabel(c).top.includes("testnet"), value);
  }
});

// --- the Shelley 29-byte hole ---------------------------------------------

test("v17: 29-byte Shelley addresses reach the Cardano parser", () => {
  // Before v17 the mainnet form fell through to the generic bech32 parser
  // (scheme "bech32"), and the testnet form did not parse as bech32 at all —
  // `stake_test` contains `_`, outside the generic parser's [a-z] HRP charset,
  // so it landed on the base64url fallback with no scheme and no checksum
  // verification. Both are 47 body characters, under the old floor of 50.
  for (const value of [
    "stake1uyqqzqsrqszsvpcgpy9qkrqdpc83qygjzv2p29shrqv35xcwfvml6",
    "stake_test1uqqqzqsrqszsvpcgpy9qkrqdpc83qygjzv2p29shrqv35xcfrxem8",
  ]) {
    const p = parse(value);
    assert.ok(p, value);
    assert.equal(p!.type, "ADA Shelley", value);
    assert.equal(p!.prefixSemantic, true, value);
    assert.equal(characterize(value).scheme, "ada", value);
  }
});

test("v17: the 57-byte base address still parses", () => {
  // The floor moved from 50 to 45; the long form must be unaffected.
  const value =
    "addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3x";
  assert.equal(parse(value)!.type, "ADA Shelley");
  assert.deepEqual(characterize(value).qualifiers, { network: "mainnet", variant: "shelley" });
});

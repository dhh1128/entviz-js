import { test } from "node:test";
import assert from "node:assert/strict";
import { parse, classifyInput, render, HEX } from "../../src/entviz.ts";

// Corpus addresses (entviz repo compliance/corpus/eth-*):
const ETH_LOWER = "0x742d35cc6634c0532925a3b844bc454e4438f44e";
const ETH_CHECKSUMMED = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed"; // valid EIP-55
const ETH_BAD = "0x5aaeb6053F3E94C9b9A09f33669435E7Ef1BeAed"; // err-eip55-bad-checksum

test("parse: 0x-prefixed all-lowercase address -> ETH (checksum not asserted)", () => {
  const p = parse(ETH_LOWER)!;
  assert.equal(p.type, "ETH");
  assert.equal(p.core, "742d35cc6634c0532925a3b844bc454e4438f44e");
  assert.equal(p.alphabet, HEX);
  assert.equal(p.prefix, "0x");
});

test("parse: valid EIP-55 mixed-case address -> ETH, core lowercased", () => {
  const p = parse(ETH_CHECKSUMMED)!;
  assert.equal(p.type, "ETH");
  assert.equal(p.core, "5aaeb6053f3e94c9b9a09f33669435e7ef1beaed");
});

test("parse: bad EIP-55 checksum is REJECTED (fails closed, not rendered)", () => {
  assert.throws(() => parse(ETH_BAD), /EIP-55 checksum mismatch at position 2/);
});

test("parse: bare single-case 40-hex is plain hex, not promoted to ETH", () => {
  const p = parse("742d35cc6634c0532925a3b844bc454e4438f44e")!;
  assert.equal(p.type, "hex");
});

test("parse: bare mixed-case 40-hex still enforces EIP-55 (mixed case is the signal)", () => {
  // Same body as ETH_BAD but no 0x prefix — still a bad checksum, still rejected.
  assert.throws(() => parse("5aaeb6053F3E94C9b9A09f33669435E7Ef1BeAed"), /EIP-55/);
  // The valid one parses to ETH even without the prefix.
  assert.equal(parse("5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed")!.type, "ETH");
});

test("classifyInput: an ETH address keeps its ETH type label", () => {
  assert.equal(classifyInput(ETH_CHECKSUMMED).typeName, "ETH");
});

test("render: a bad-checksum address throws instead of rendering an SVG", () => {
  assert.throws(() => render(ETH_BAD));
});

test("render: checksummed and equivalent all-lowercase address render identically", () => {
  // Both have the same lowercase core, so the entviz must be byte-identical —
  // the EIP-55 case is a checksum, not part of the visualized value.
  const lowerEquivalent = "0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed";
  assert.equal(render(ETH_CHECKSUMMED), render(lowerEquivalent));
});

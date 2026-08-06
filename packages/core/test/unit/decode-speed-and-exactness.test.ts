import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DIGIT_LEAF,
  characterize,
  decodedBytesInteger,
  digitsToInt,
} from "../../src/characterize.ts";
import { BASE58, BASE36, DECIMAL, MAX_INPUT_CHARS, inputTooLargeMessage } from "../../src/entviz.ts";

// The positional decode must stay EXACT while being fast. A port of the
// reference's tests/test_decode_speed_and_exactness.py (entviz 77d35cc).
//
// `sizeBits` for base58/base36/decimal is defined normatively as "decode the
// core to its integer value and take its minimal byte length" (docs/spec.md,
// Resolution A). The implementation computes that with a balanced
// divide-and-conquer fold rather than the O(n²) digit-at-a-time one. These
// tests pin the two properties that matter: the fast fold returns exactly what
// the naive fold would, and the cheap `ceil(len × log2(base) / 8)` estimate —
// which is what a reader reaching for a speedup will try next, and which the
// entviz-js security scan (F3) proposed — is *not* equivalent, so nobody swaps
// it in.

function naive(digits: number[], base: bigint): bigint {
  let n = 0n;
  for (const d of digits) n = n * base + BigInt(d);
  return n;
}

function digitsOf(core: string, chars: string): number[] {
  const lower = chars.toLowerCase();
  return [...core].map((c) => {
    let v = chars.indexOf(c);
    if (v < 0) v = lower.indexOf(c.toLowerCase());
    return v < 0 ? 0 : v;
  });
}

// Deterministic digits with a mix of leading zeros and full-range values.
function mkDigits(length: number, base: number): number[] {
  return Array.from({ length }, (_, i) => (i * 7 + Math.floor(i / 3)) % base);
}

for (const base of [58, 36, 10]) {
  // Lengths straddle the leaf threshold in both directions, so both arms of the
  // recursion are exercised for every base.
  for (const length of [0, 1, DIGIT_LEAF - 1, DIGIT_LEAF, DIGIT_LEAF + 1, 64, 129, 1000]) {
    test(`balanced fold equals the naive fold (base ${base}, ${length} digits)`, () => {
      const digits = mkDigits(length, base);
      assert.equal(digitsToInt(digits, BigInt(base)), naive(digits, BigInt(base)));
      if (length) {
        // Leading zeros are the case the cheap estimate gets wrong, so they must
        // be exercised on both sides of the leaf threshold too.
        const zeros = [...Array(length >> 1).fill(0), ...digits.slice(length >> 1)];
        assert.equal(digitsToInt(zeros, BigInt(base)), naive(zeros, BigInt(base)));
      }
    });
  }
}

test("leading zero digits survive the split", () => {
  // A base58 core of all '1's decodes to 0 regardless of length. The split must
  // not turn that into something else.
  for (const n of [1, DIGIT_LEAF, DIGIT_LEAF + 1, 100]) {
    assert.equal(digitsToInt(Array(n).fill(0), 58n), 0n);
  }
});

for (const [core, alphabet] of [
  ["1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", BASE58], // Bitcoin P2PKH, leading zero byte
  ["rEb8TK3gBgk5auZkwc6sHnwrGVJH8DuaLh", BASE58],
  ["1".repeat(26), BASE58], // decodes to zero
  ["5493001KJTIIGC8Y1R12", BASE36], // an LEI
  ["123456789", DECIMAL],
  ["z".repeat(DIGIT_LEAF * 4 + 5), BASE58], // past the leaf threshold
] as const) {
  test(`decoded byte length matches a direct computation (${alphabet.name}, ${core.length} chars)`, () => {
    const n = naive(digitsOf(core, alphabet.chars), BigInt(alphabet.chars.length));
    const expected = n === 0n ? 1 : Math.floor((n.toString(2).length + 7) / 8);
    assert.equal(decodedBytesInteger(core, alphabet), expected);
  });
}

test("an out-of-alphabet character decodes as a zero digit, as the tokenizer tolerates", () => {
  // '0' is not in base58; the lookup falls through both cases to 0.
  assert.equal(decodedBytesInteger("0", BASE58), 1);
  // Case tolerance: 'A' is base36's own char, 'a' reaches it via the lower map.
  assert.equal(decodedBytesInteger("a", BASE36), decodedBytesInteger("A", BASE36));
});

test("the cheap estimate is NOT equivalent and must not be substituted", () => {
  // Guard against a future "optimization" that swaps the exact decode for
  // ceil(len * log2(base) / 8). It disagrees on the most ordinary input there
  // is — a Bitcoin P2PKH address, whose leading '1' is a leading zero byte.
  const core = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa";
  const exact = decodedBytesInteger(core, BASE58) * 8;
  const estimate = Math.ceil((core.length * Math.log2(58)) / 8) * 8;
  assert.equal(exact, 192);
  assert.equal(estimate, 200);
  assert.notEqual(exact, estimate);

  // And on a core of all base58 '1's, which decodes to zero.
  const ones = "1".repeat(26);
  assert.equal(decodedBytesInteger(ones, BASE58) * 8, 8);
  assert.equal(Math.ceil((ones.length * Math.log2(58)) / 8) * 8, 160);
});

// SEC-F3/F9 — the anti-DoS cap has to hold at the entry point that runs FIRST.
// <EntvizPill> calls characterize() before render(), so a cap that lives only
// inside render() never fires.

test("characterize() enforces MAX_INPUT_CHARS itself, before any decode", () => {
  const over = "z".repeat(MAX_INPUT_CHARS + 1);
  assert.throws(
    () => characterize(over),
    new RegExp(inputTooLargeMessage(MAX_INPUT_CHARS + 1).replace(/[.]/g, "\\.")),
  );
  // The cap is applied AFTER the trim, so surrounding whitespace does not push
  // an otherwise-legal value over it. "z1" repeated is the finding's own
  // payload: it disproves hex, base32 and bech32, so the detector says base58
  // and the value reaches the positional decode.
  const atCap = "z1".repeat(MAX_INPUT_CHARS / 2);
  assert.equal(characterize(`  ${atCap}  `).encoding, "base58");
});

test("a base58 value at the cap characterizes promptly rather than quadratically", () => {
  // Not a wall-clock assertion — timings are not portable. This pins that the
  // capped worst case COMPLETES: with the O(n²) fold this input took ~740 ms of
  // pure BigInt work, and a 10 MB one (which the cap now rejects) took minutes.
  const chars = BASE58.chars;
  const value = Array.from({ length: MAX_INPUT_CHARS }, (_, i) => chars[(i * 7 + Math.floor(i / 3)) % 58]).join("");
  const c = characterize(value);
  assert.equal(c.encoding, "base58");
  assert.equal(c.sizeBits % 8, 0);
  assert.equal(c.sizeBits, decodedBytesInteger(value, BASE58) * 8);
});

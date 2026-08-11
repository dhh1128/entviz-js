import { test } from "node:test";
import assert from "node:assert/strict";
import { characterize, renderLabel } from "../../src/characterize.ts";

// v18: the multihash hash function is rendered, so its lookup table is
// OBSERVABLE.
//
// Through v17 `characterize()` parsed the hash-function name out of the
// recognizer's type string ("hex multihash sha3-256") and then threw it away,
// so `qualifiers.hash` was never set for a multihash and the `labelMods` branch
// that renders it — present and correct since v14, which requires "a multihash
// hash on departure" — could never fire. A sha3-256 multihash labeled exactly
// like a sha2-256 one. Same shape as v17's network qualifier: the rule existed,
// the rendering code existed, the field feeding them was empty.
//
// The consequence worth testing for is not the missing word. It is that the
// 48-entry hash table and the 12-entry multicodec table were certified by
// NOTHING: their result never reached the model, so an implementation could get
// every entry wrong and still pass Tier A. Three sibling ports were found in the
// 0.17.3 pass carrying roughly nine entries each. See this.i:mh4shnam — a lookup
// table is only as certified as its most observable consumer.
//
// So this file does not just check that a hash name appears. It transcribes both
// reference tables from entviz `src/entviz/entropy.py` and drives EVERY entry
// through a rendered label, which is the only thing a checker can see.

const label = (value: string) => renderLabel(characterize(value)).top;
const hashQualifier = (value: string) => characterize(value).qualifiers.hash;

// The reference MULTIHASH_HASH_FUNCS, transcribed entry by entry from
// entviz `src/entviz/entropy.py`. 48 entries — the count itself is asserted
// below, because the failure mode this file exists for was a table silently
// truncated to a remembered size.
const MULTIHASH_HASH_FUNCS: Record<number, string> = {
  0x11: "sha1", 0x12: "sha2-256", 0x13: "sha2-512", 0x14: "sha3-224",
  0x15: "sha3-256", 0x16: "sha3-384", 0x17: "sha3-512", 0x18: "shake-128",
  0x19: "shake-256", 0x1a: "keccak-224", 0x1b: "keccak-256", 0x1c: "keccak-384",
  0x1d: "keccak-512", 0x22: "blake2b-8", 0x23: "blake2b-16", 0x24: "blake2b-24",
  0x25: "blake2b-32", 0x26: "blake2b-40", 0x27: "blake2b-48", 0x28: "blake2b-56",
  0x29: "blake2b-64", 0x2a: "blake2b-72", 0x2b: "blake2b-80", 0x2c: "blake2b-88",
  0x2d: "blake2b-96", 0x2e: "blake2b-104", 0x2f: "blake2b-112", 0x30: "blake2b-120",
  0x31: "blake2b-128", 0x32: "blake2b-136", 0x33: "blake2b-144", 0x34: "blake2b-152",
  0x35: "blake2b-160", 0x36: "blake2b-168", 0x37: "blake2b-176", 0x38: "blake2b-184",
  0x39: "blake2b-192", 0x3a: "blake2b-200", 0x3b: "blake2b-208", 0x3c: "blake2b-216",
  0x3d: "blake2b-224", 0x3e: "blake2b-232", 0x3f: "blake2b-240", 0x40: "blake2b-248",
  0x41: "blake2b-256", 0xb201: "dbl-sha2-256", 0xb202: "murmur3-128", 0xb203: "murmur3-32",
};

// The reference MULTICODEC_CONTENT, same source. The CID label always shows the
// codec, so these entries were never quite as invisible as the hash ones — but
// every CID vector before v18 was dag-pb, so eleven of the twelve were untested.
const MULTICODEC_CONTENT: Record<number, string> = {
  0x00: "identity", 0x51: "cbor", 0x55: "raw", 0x60: "rlp", 0x70: "dag-pb",
  0x71: "dag-cbor", 0x72: "libp2p-key", 0x78: "git-raw", 0x90: "eth-block",
  0x97: "eth-tx", 0x0129: "dag-json", 0x0202: "car",
};

const DIGEST = "ab".repeat(32); // 32 bytes, the length byte below says 0x20

// A hex multihash: one-byte hash code, one-byte digest length, digest.
const hexMultihash = (code: number) =>
  code.toString(16).padStart(2, "0") + "20" + DIGEST;

// LEB128, matching the varint the CID prefix uses.
function uvarint(n: number): number[] {
  const out: number[] = [];
  let v = n;
  while (v >= 0x80) {
    out.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  out.push(v);
  return out;
}

const B32 = "abcdefghijklmnopqrstuvwxyz234567";

// RFC 4648 base32, lowercase, unpadded — the multibase `b` body form.
function b32(bytes: number[]): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += B32[(value >>> bits) & 0x1f];
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 0x1f];
  return out;
}

// A multibase-`b` CIDv1: version 1, content codec, hash code, digest length,
// digest.
const cidV1 = (codec: number, hashCode: number) =>
  "b" +
  b32([
    ...uvarint(1),
    ...uvarint(codec),
    ...uvarint(hashCode),
    0x20,
    ...Array.from({ length: 32 }, () => 0xab),
  ]);

test("v18: the reference tables have their documented sizes", () => {
  // 48 and 12. Asserted literally because the 0.17.3 pass produced three ports
  // whose agents each "remembered" a different size (63, 42, ~9).
  assert.equal(Object.keys(MULTIHASH_HASH_FUNCS).length, 48);
  assert.equal(Object.keys(MULTICODEC_CONTENT).length, 12);
});

test("v18: the four new corpus vectors render their hash function", () => {
  // The exact inputs added to the conformance corpus at spec v18, each DEPARTING
  // from a default — a sha2-256 vector proves nothing, since the default is
  // silent under the loud-departure rule, which is precisely how this hid.
  assert.equal(label("1520" + "ab".repeat(32)), "multihash, sha3-256, 256-bit, 1520");
  assert.equal(label("1340" + "ab".repeat(64)), "multihash, sha2-512, 512-bit, 1340");
  assert.equal(label("1114" + "ab".repeat(20)), "multihash, sha1, 160-bit, 1114");
  // Departs on BOTH axes: raw rather than dag-pb, sha3-256 rather than sha2-256.
  // CIDv1's multicodec decode is the hash table's other consumer.
  assert.equal(
    label("bafkrkiaaaebagbafaydqqcikbmga2dqpcaireeyuculbogazdinryhi6d4"),
    "CIDv1, raw, sha3-256, b",
  );
});

test("v18: sha2-256 stays silent — the default carries no qualifier and no MOD", () => {
  // The recognizer does not append the default name, so the qualifier is absent
  // rather than present-and-elided, and the MOD slot is empty. This is the
  // asymmetry that let a wrong table hide: the ONE multihash vector the corpus
  // carried before v18 was this one.
  const sha2 = "1220" + "ab".repeat(32);
  assert.equal(hashQualifier(sha2), undefined);
  assert.equal(label(sha2), "multihash, 256-bit, 1220");
});

test("v18: every single-byte hash code in the table renders its own name", () => {
  // 45 of the 48 codes fit in one byte and are therefore reachable through a
  // multihash header. A wrong entry now changes a rendered label, which is the
  // whole point of v18.
  let checked = 0;
  for (const [code, name] of Object.entries(MULTIHASH_HASH_FUNCS)) {
    const value = Number(code);
    if (value > 0xff) continue;
    const rendered = label(hexMultihash(value));
    const prefix = value.toString(16).padStart(2, "0") + "20";
    if (name === "sha2-256") {
      assert.equal(rendered, `multihash, 256-bit, ${prefix}`);
      assert.equal(hashQualifier(hexMultihash(value)), undefined);
    } else {
      assert.equal(rendered, `multihash, ${name}, 256-bit, ${prefix}`);
      assert.equal(hashQualifier(hexMultihash(value)), name);
    }
    checked += 1;
  }
  assert.equal(checked, 45);
});

test("v18: an unassigned hash code is not a multihash at all", () => {
  // 0x20 is not in the table; the value must fall through to bare hex rather
  // than be labeled with an invented hash name.
  const c = characterize("2020" + DIGEST);
  assert.equal(c.scheme, null);
  assert.equal(c.entropyType, "hex");
});

test("v18: the multicodec table's entries all reach a CID label", () => {
  // The hash table's other consumer. Held to sha2-256 so the codec is the only
  // thing that can move the label.
  for (const [code, name] of Object.entries(MULTICODEC_CONTENT)) {
    assert.equal(label(cidV1(Number(code), 0x12)), `CIDv1, ${name}, b`);
  }
});

test("v18: the three varint-only hash codes reach a CID label", () => {
  // 0xb201-0xb203 need a multi-byte varint, so they are unreachable through a
  // multihash header and only ever surface through a CID prefix. Without this
  // they would be the last unobservable rows in the table.
  for (const code of [0xb201, 0xb202, 0xb203]) {
    const name = MULTIHASH_HASH_FUNCS[code];
    assert.equal(label(cidV1(0x55, code)), `CIDv1, raw, ${name}, b`);
  }
});

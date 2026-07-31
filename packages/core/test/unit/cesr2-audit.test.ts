import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCesr } from "../../src/entviz.ts";
import { characterize } from "../../src/characterize.ts";

// CESR 2.0 / KERI 2.x audit guard (2026-07-21).
//
// Driving question (from cesrview, which is adding CESR 2.0 stream support and
// renders each framed PRIMITIVE value as an entviz pill): does entviz itself
// need v2 work to keep characterizing v2 streams correctly?
//
// Verdict from a full diff of entviz's CESR primitive tables against keripy 2.x
// ground truth (WebOfTrust/keripy main: coring.MatterCodex/.Sizes,
// indexing.IndexerCodex/.Sizes): NO. Every FIXED-SIZE, HIGH-ENTROPY Matter and
// Indexer primitive KERI 2.x defines (seeds, pubkeys, signatures, digests,
// salts, fixed ciphers, indexed sigs, Dater) is already recognized with the
// correct full-size. entviz is in fact a SUPERSET on signatures — it already
// carries FN-DSA (FIPS-206) post-quantum codes that keripy main has not yet
// assigned.
//
// The codes that are NEW in CESR 2.0 at the primitive level are almost all
// LOW-ENTROPY control material — Tag1..Tag11, Null/No/Yes/Empty/Escape,
// Short/Long/Big/Tall number codes, Label1/2, GramHead, and the variable-size
// StrB64/Bytes/Decimal/HPKE-cipher families. entviz deliberately does NOT treat
// these as comparison targets: a KEL index, a boolean, or a 3-char tag is not a
// high-entropy object a human compares. They must therefore degrade
// GRACEFULLY — fall through parseCesr to null and render as a generic
// fingerprint pill — never crash, and never be mislabeled as a recognized CESR
// primitive with a spurious role. This test locks that half of the verdict
// (the recognized-primitive half is covered by issue36-indexer-dater.test.ts).
//
// NB the (code, full-length) disambiguation invariant is what keeps this safe:
// a v2 control code can share a leading char with a real primitive (e.g. `b`
// is keripy's 8-char GramHead but entviz's 2392-char FN-DSA pubkey; `A` is a
// 44-char Matter seed but an 88-char Indexer sig) yet never collides, because
// length always separates them.

// New-in-2.0 primitive codes that are LOW-ENTROPY and must NOT be treated as
// comparison targets. [qb64-shaped value, human note]. Values are length-correct
// per keripy's Sizes; parseCesr keys only on (code, length, base64url charset).
const V2_CONTROL_CODES: [string, string][] = [
  ["Xabc", "Tag3 — 3-char special value"],
  ["Y" + "a".repeat(7), "Tag7 — 7-char special value"],
  ["Z" + "a".repeat(11), "Tag11 — 11-char special value"],
  ["0J" + "ab", "Tag1 — 1-char tag + prepad"],
  ["1AAK", "Null"],
  ["1AAL", "No (falsey boolean)"],
  ["1AAM", "Yes (truthy boolean)"],
  ["1AAP", "Empty (nonce/UUID sentinel)"],
  ["MAAA", "Short — 2-byte number"],
  ["0H" + "AAAA", "Long — 4-byte number"],
  ["b" + "a".repeat(7), "GramHead — 8-char header (entviz `b` is FN-DSA@2392)"],
  ["4A" + "a".repeat(10), "StrB64 — variable-size text (fs=None; unrepresentable)"],
  ["4B" + "a".repeat(10), "Bytes — variable-size byte string"],
];

test("v2 control/tag/number codes fall through parseCesr to null", () => {
  for (const [value, note] of V2_CONTROL_CODES) {
    assert.equal(
      parseCesr(value),
      null,
      `${note}: a low-entropy v2 control code must NOT be recognized as a CESR primitive (${value})`,
    );
  }
});

test("v2 control codes degrade gracefully — characterize never throws, never mis-tags as CESR", () => {
  for (const [value, note] of V2_CONTROL_CODES) {
    let ch: ReturnType<typeof characterize>;
    assert.doesNotThrow(() => {
      ch = characterize(value);
    }, `${note}: characterize must not crash on an unrecognized v2 code (${value})`);
    // The pill still renders (deterministic fingerprint avatar from the string);
    // it just carries no CESR scheme/role. The one thing that must NEVER happen
    // is a spurious "cesr" classification with a comparison role.
    assert.notEqual(ch!.scheme, "cesr", `${note}: mis-classified as CESR (${value})`);
  }
});

// Sanity anchors: representative genus-stable v2 PRIMITIVES still characterize
// correctly (these qb64 are the same in a v1 or v2 stream). Length-correct
// synthetic base64url bodies, per the issue36 test's disambiguation pattern.
const V2_PRIMITIVES: [string, string, "key" | "signature" | "digest" | null][] = [
  ["D" + "a".repeat(43), "Ed25519 pubkey", "key"],
  ["1AAJ" + "a".repeat(44), "secp256r1 pub/enc key", "key"], // fs 48
  ["1AAD" + "a".repeat(76), "Ed448 pubkey", "key"], // fs 80
  ["0I" + "a".repeat(86), "secp256r1 sig", "signature"], // fs 88
  ["1AAE" + "a".repeat(152), "Ed448 sig", "signature"], // fs 156
  ["E" + "a".repeat(43), "Blake3-256", "digest"], // self-addressing digest → digest role
];

test("genus-stable v2 primitives still recognized with correct label + role", () => {
  for (const [value, label, role] of V2_PRIMITIVES) {
    const p = parseCesr(value);
    assert.ok(p !== null, `primitive fell through to raw: ${label} (${value})`);
    assert.equal(p.type, `CESR ${label}`, value);
    const ch = characterize(value);
    assert.equal(ch.scheme, "cesr", label);
    assert.equal(ch.role, role, label);
    assert.deepEqual(ch.qualifiers, { algorithm: label }, label);
  }
});

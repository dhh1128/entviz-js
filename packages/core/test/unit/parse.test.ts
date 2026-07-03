import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parse,
  classifyInput,
  bareEntropyType,
  fingerprintCore,
  render,
  sanitizeNote,
  roundHalfEven,
  HEX,
  BASE64URL,
} from "../../src/entviz.ts";

test("parse: dashed UUID -> UUID, dashes stripped, lowercased", () => {
  const p = parse("550E8400-E29B-41D4-A716-446655440000")!;
  assert.equal(p.type, "UUID");
  assert.equal(p.core, "550e8400e29b41d4a716446655440000");
  assert.equal(p.alphabet, HEX);
});

test("parse: undashed 32-hex UUID -> UUID", () => {
  assert.equal(parse("550e8400e29b41d4a716446655440000")!.type, "UUID");
});

test("parse: a plain hex string -> hex", () => {
  const p = parse("DEADBEEF")!;
  assert.equal(p.type, "hex");
  assert.equal(p.core, "deadbeef");
});

test("parse: input no parser claims -> null (caller applies the fallback)", () => {
  // A space is in no known alphabet, so disproof also declines -> null.
  assert.equal(parse("hello world"), null);
  // NOTE: a bare lowercase word like "xyz" is now claimed as EOS (its
  // [a-z1-5.] alphabet is a superset), matching the reference dispatch.
});

test("classifyInput: hex gets a length-bearing label", () => {
  const c = classifyInput("abcdef");
  assert.equal(c.typeName, "hex(6)");
  assert.equal(c.core, "abcdef");
  assert.equal(c.alphabet, HEX);
});

test("classifyInput: UUID keeps its bare type label", () => {
  assert.equal(classifyInput("550e8400e29b41d4a716446655440000").typeName, "UUID");
});

test("classifyInput: entropyType is the drawn typeName minus the (count) — same token as the glyph", () => {
  // the count/format in typeName is stripped; the leading token matches the glyph
  assert.equal(classifyInput("abcdef").typeName, "hex(6)"); // visualization keeps the count
  assert.equal(classifyInput("abcdef").entropyType, "hex"); // pill drops it
  assert.equal(classifyInput("550e8400e29b41d4a716446655440000").entropyType, "UUID");
  // unrecognized input: typeName "txt(N)->b64url" → "txt"
  assert.equal(classifyInput("hi there").entropyType, "txt");
  // bareEntropyType strips everything from the first "(" — derived from the LABEL,
  // not a separate taxonomy, so a "b64(392)" glyph and its pill both read "b64"
  assert.equal(bareEntropyType("b64(392)"), "b64");
  assert.equal(bareEntropyType("hex(64)"), "hex");
  assert.equal(bareEntropyType("txt(585)->b64url"), "txt");
  assert.equal(bareEntropyType("UUID"), "UUID"); // count-free labels pass through
});

test("classifyInput: unknown input falls back to UTF-8 -> base64url", () => {
  const c = classifyInput("hi there");
  assert.equal(c.typeName, "txt(8)->b64url");
  assert.equal(c.alphabet, BASE64URL);
  assert.equal(c.core, Buffer.from("hi there", "utf8").toString("base64url"));
  assert.equal(c.prefix, null);
  assert.equal(c.suffix, null);
});

test("sanitizeNote: null/undefined pass through as null", () => {
  assert.equal(sanitizeNote(null), null);
  assert.equal(sanitizeNote(undefined), null);
});

test("sanitizeNote: empty/null/undefined mean no note", () => {
  assert.equal(sanitizeNote(""), null);
});

test("sanitizeNote: printable-ASCII notes (incl. spaces/punctuation) pass", () => {
  assert.equal(sanitizeNote("git"), "git");
  assert.equal(sanitizeNote("ABCdef12"), "ABCdef12");
  assert.equal(sanitizeNote("two words"), "two words");
  assert.equal(sanitizeNote("a.b_c-d!"), "a.b_c-d!");
  // Boundary chars: U+0020 space and U+007E tilde are in range.
  assert.equal(sanitizeNote(" "), " ");
  assert.equal(sanitizeNote("~"), "~");
  // Exactly 10 chars allowed.
  assert.equal(sanitizeNote("0123456789"), "0123456789");
});

test("sanitizeNote: too-long, control, and non-ASCII notes are rejected", () => {
  assert.throws(() => sanitizeNote("toolongnote")); // 11 chars
  assert.throws(() => sanitizeNote("ab\tcd")); // control char (tab)
  assert.throws(() => sanitizeNote("café")); // non-ASCII (é = U+00E9)
  assert.throws(() => sanitizeNote("a\u202Eb")); // bidi override (RLO)
  assert.throws(() => sanitizeNote("a\u200Bb")); // zero-width space
});

// --- v11: DID parsing ----------------------------------------------------
test("parse: did:web basic -> no type, semantic prefix, core verbatim", () => {
  const p = parse("did:web:example.com")!;
  assert.equal(p.type, "");
  assert.equal(p.prefix, "did:web:");
  assert.equal(p.core, "example.com");
  assert.equal(p.alphabet, BASE64URL);
  assert.equal(p.prefixSemantic, true);
  assert.equal(p.suffix, null);
});

test("parse: did method-specific-id keeps internal ':' segments", () => {
  const p = parse("did:web:example.com%3A3000:user:alice")!;
  assert.equal(p.prefix, "did:web:");
  assert.equal(p.core, "example.com%3A3000:user:alice");
  assert.equal(p.prefixSemantic, true);
});

test("parse: DID-URL tail (/path?q#frag) is dropped; core == bare msid", () => {
  const bare = parse("did:web:example.com:user:alice")!;
  const tailed = parse("did:web:example.com:user:alice/did.json?versionId=1#key-0")!;
  assert.equal(tailed.core, bare.core);
  assert.equal(tailed.prefix, "did:web:");
  assert.equal(tailed.core, "example.com:user:alice");
});

test("parse: did:key fragment dropped, core is the multibase value", () => {
  const p = parse("did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK#z6Mkh")!;
  assert.equal(p.prefix, "did:key:");
  assert.equal(p.core, "z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK");
  assert.equal(p.type, "");
  assert.equal(p.prefixSemantic, true);
});

test("parse: did method is lowercase alnum; uppercase method is not a DID", () => {
  // method `[a-z0-9]+` — an uppercase method letter fails the DID regex.
  assert.equal(parse("did:WEB:example.com"), null);
});

// --- v11: URN parsing ----------------------------------------------------
test("parse: urn:isbn basic -> no type, semantic prefix, NSS core", () => {
  const p = parse("urn:isbn:0451450523")!;
  assert.equal(p.type, "");
  assert.equal(p.prefix, "urn:isbn:");
  assert.equal(p.core, "0451450523");
  assert.equal(p.alphabet, BASE64URL);
  assert.equal(p.prefixSemantic, true);
  assert.equal(p.suffix, null);
});

test("parse: URN scheme+NID lowercased, NSS case PRESERVED", () => {
  const p = parse("URN:ISBN:Abc-XYZ")!;
  assert.equal(p.prefix, "urn:isbn:");
  assert.equal(p.core, "Abc-XYZ"); // NSS case preserved
  assert.equal(p.prefixSemantic, true);
});

test("parse: urn NSS keeps '/' (only '?'/'#' terminate it)", () => {
  const p = parse("urn:example:a/b/c")!;
  assert.equal(p.prefix, "urn:example:");
  assert.equal(p.core, "a/b/c");
});

test("parse: urn r-/q-/f-components are dropped", () => {
  const bare = parse("urn:example:weather")!;
  const comp = parse("urn:example:weather?=op=map&lat=39#section")!;
  assert.equal(comp.core, bare.core);
  assert.equal(comp.core, "weather");
  assert.equal(comp.prefix, "urn:example:");
});

// --- v11: prefix-fold fingerprint binding --------------------------------
test("classifyInput: DID surfaces semantic prefix (prefix-fold input)", () => {
  const c = classifyInput("did:web:example.com");
  assert.equal(c.typeName, "");
  assert.equal(c.prefix, "did:web:");
  assert.equal(c.prefixSemantic, true);
  assert.equal(c.alphabet, BASE64URL);
});

test("fingerprintCore: folds prefix only when semantic", () => {
  // semantic prefix -> prefix ‖ core
  assert.equal(fingerprintCore("example.com", "did:web:", true), "did:web:example.com");
  // signal prefix (or unset) -> bare core unchanged (hex/UUID/ETH keying intact)
  assert.equal(fingerprintCore("deadbeef", "0x", false), "deadbeef");
  assert.equal(fingerprintCore("deadbeef", null, undefined), "deadbeef");
});

test("render: did:web:X and did:key:X fingerprint differently (no collision)", () => {
  // Pre-v11 the method was stripped & unbound, so these collided. The folded
  // prefix now avalanches them apart — assert the digest-keyed clip ids differ.
  const a = render("did:web:example");
  const b = render("did:key:example");
  const idA = a.match(/grid-clip-([0-9a-f]+)-/)![1];
  const idB = b.match(/grid-clip-([0-9a-f]+)-/)![1];
  assert.notEqual(idA, idB);
});

test("roundHalfEven: below/above .5 and ties toward even", () => {
  assert.equal(roundHalfEven(2.4), 2); // diff < .5
  assert.equal(roundHalfEven(2.6), 3); // diff > .5
  assert.equal(roundHalfEven(2.5), 2); // tie -> even
  assert.equal(roundHalfEven(3.5), 4); // tie -> even
});

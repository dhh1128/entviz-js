import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parse,
  classifyInput,
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

test("parse: non-hex / non-UUID -> null (caller applies the fallback)", () => {
  assert.equal(parse("hello world"), null);
  assert.equal(parse("xyz"), null);
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

test("sanitizeNote: a valid 1-8 alnum note is returned unchanged", () => {
  assert.equal(sanitizeNote("git"), "git");
  assert.equal(sanitizeNote("ABCdef12"), "ABCdef12");
});

test("sanitizeNote: spaces, punctuation, and >8 chars are rejected", () => {
  assert.throws(() => sanitizeNote("two words"));
  assert.throws(() => sanitizeNote("a.b"));
  assert.throws(() => sanitizeNote("toolongnote"));
});

test("roundHalfEven: below/above .5 and ties toward even", () => {
  assert.equal(roundHalfEven(2.4), 2); // diff < .5
  assert.equal(roundHalfEven(2.6), 3); // diff > .5
  assert.equal(roundHalfEven(2.5), 2); // tie -> even
  assert.equal(roundHalfEven(3.5), 4); // tie -> even
});

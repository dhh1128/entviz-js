// The inputs behind the committed golden SVG fixtures in this directory.
//
// ONE source of truth, shared by the two things that must agree about it: the
// determinism test (test/integration/determinism.test.ts), which asserts each
// fixture still renders byte-identically, and scripts/regen-golden, which
// rewrites them when a rendering change is intended. Keeping the map here means
// adding a fixture is a single edit and the regenerator can never fall behind
// the test.
//
// Each key is the fixture's basename: `<key>.svg` in this directory.
export const GOLDEN_INPUTS: Record<string, string> = {
  hex32: "0123456789abcdef0123456789abcdef",
  uuid: "550e8400-e29b-41d4-a716-446655440000",
  txt: "The quick brown fox jumps over the lazy dog",
  // >512-bit large-input path: head + 4 Crockford fingerprint-middle cells + tail.
  hex1024: "0123456789abcdef".repeat(16),
};

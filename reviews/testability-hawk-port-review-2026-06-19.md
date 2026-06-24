# Testability Review: entviz-js

**Date:** 2026-06-19
**Effort level:** medium
**Run label:** port-review-2026-06-19
**Context sources used:** `AGENTS.md`, `packages/core/src/entviz.ts`, `packages/core/src/cli.ts`,
`packages/react/src/Entviz.tsx`, `packages/core/package.json`, `packages/react/package.json`,
all test modules (`test/unit/*.test.ts`, `test/integration/render.test.ts`),
`.github/workflows/ci.yml`, `CERTIFICATION.md`, `entviz/docs/spec.md` (Conformance section),
`entviz/compliance/model.py` (Tier-A checker), prior sibling reviews
(`spec-conformance-auditor`, `security-hawk`, `devops-engineer`, `perception-reviewer`).
**Suite run:** yes -- `npm test --workspace=packages/core` completed 82/82 pass, 0 fail.
Full-suite coverage: 100 % lines, 100 % functions, 95.56 % branches. Unit-suite alone: 81.16 %
lines (239 of 639 lines in `render()` and below are integration-only by design, per AGENTS.md).
**Determinism re-render diff:** not performed manually (the SPEC reviewer ran it cross-process and
confirmed byte-identity; the integration test `render is deterministic` confirms it within-process).

---

## Evidence Inventory

Files read (all under `/home/daniel/code/entviz-js`):
- `AGENTS.md` -- TDD mandate, test-split rationale, coverage floors, CI description.
- `packages/core/src/entviz.ts` -- full source (1036 lines); production code design.
- `packages/core/src/cli.ts` -- conformance CLI (38 lines; reads JSON from stdin, calls render).
- `packages/react/src/Entviz.tsx` -- React wrapper (58 lines).
- `packages/core/package.json` -- test scripts, coverage flags.
- `packages/react/package.json` -- no `test` script present.
- `packages/core/test/unit/` -- 7 modules (blank-cells, colors, geometry, grid, parse,
  render-helpers, svg-el, tokenize).
- `packages/core/test/integration/render.test.ts` -- 10 integration tests.
- `.github/workflows/ci.yml` -- CI matrix; `conformance` job description.
- `CERTIFICATION.md` -- certified scope (24 vectors, Tier A+B).
- `entviz/docs/spec.md` -- SVG profile / conformance section (lines 100-200).
- `entviz/compliance/model.py` -- Tier-A field extraction and `diff_models`.

Prior reviews read (after forming independent view):
- `spec-conformance-auditor-port-review-2026-06-19.md` -- found no nondeterminism, confirmed
  24/24 Tier A+B. Deferred "no golden-SVG lock test" and "no determinism test across alphabets"
  to this lens.
- `security-hawk-port-review-2026-06-19.md` -- found no SVG injection, noted no integration
  test for SVG-hostile strings (`text-channel-untested`).
- `perception-reviewer-port-review-2026-06-19.md` -- noted no CVD test suite
  (`palette-missing-cvd-tests`).
- `devops-engineer-port-review-2026-06-19.md` -- found release gate skips conformance.

Not run: the CLI directly (SPEC reviewer ran it cross-process; result is trusted here).
Not run: React component rendering in a browser or test harness.

---

## Executive Summary

The `@entviz/core` test suite is structurally sound and notably better-architected than the
Python reference's test suite at the same stage: every major stage function is exported and
directly unit-tested, the coverage floors are enforced by CI, and the TDD split (unit gate then
integration gate) prevents coverage laundering through `render()`. Two structural gaps stand out.
First, `cli.ts` and `packages/react/Entviz.tsx` have **zero test coverage** -- the CLI is the
conformance harness entry point and the React component is the primary user-facing surface, yet
neither appears in the test suite or in CI coverage. Second, determinism is confirmed by the
SPEC reviewer's cross-process diff and by one within-process assertion, but it is not **locked
in by a golden-SVG regression test**: a future change to the renderer that accidentally
breaks byte-identity would not be caught until the Tier-B conformance raster diff failed -- a
signal that is not wired into the unit/integration test gate. The urgency of any individual
finding is moderate: the conformance harness (Tier A+B in CI) closes many of the gaps one would
otherwise worry about, but it runs against a fixed subset of the corpus and any input outside
that subset is unguarded.

---

## Top Findings

Ordered by bang-for-buck.

### F1: CLI entry point (cli.ts) and React wrapper (Entviz.tsx) have zero test coverage

- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Location:** `packages/core/src/cli.ts`; `packages/react/src/Entviz.tsx`
- **Finding:** No test exercises `cli.ts` -- the JSON-from-stdin entry point that is the
  conformance runner's `--impl-cmd` target. The JSON parsing, the `params` extraction with its
  defaults (`target_ar`, `font_size_pt`, `note`), the exit-0 happy path, and the exit-1 error
  path are all untested. The React `Entviz` component also has no tests: the `onError` callback,
  the error-state fallback span, the title default, and the `useMemo` dependency array are
  untested. Neither package has a `test` script, so CI's `npm test --workspaces --if-present`
  silently skips both.
- **Consequence:** A bug in `cli.ts` JSON deserialization (e.g. wrong default for `target_ar`)
  would cause every Tier-A conformance run to use wrong parameters -- potentially passing with a
  conformance-breaking renderer if the wrong params happen to produce an accidentally-matching
  output. A bug in the React error callback path or the fallback span would ship silently to
  consumers.
- **Recommendation:** For `cli.ts`: add a test that spawns the CLI process with a fixture
  `input.json` and asserts exit code and SVG output; add a second that feeds a reject vector
  and asserts exit-1. For React: add a test using `@testing-library/react` or
  `react-test-renderer` that renders `<Entviz value="deadbeef" />` and asserts the inner HTML
  contains `data-entviz-version`, and a second that supplies a bad note and asserts `onError`
  is called and the fallback span is rendered.

---

### F2: Determinism not locked in by a committed golden-SVG regression test

- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Location:** `packages/core/test/integration/render.test.ts:9`
- **Finding:** The existing determinism test renders one hex input twice within a single process
  and asserts `a === b`. This confirms within-process stability for one input but does not
  guard against a future renderer change that introduces iteration-order sensitivity (e.g.
  `Object.keys` order on an added field) or produces different output across separate
  invocations. A golden-SVG file committed to the repo and diffed in CI would catch any such
  regression immediately, independently of the Tier-B raster comparison. The SPEC reviewer
  explicitly deferred this gap to this lens.
- **Consequence:** A nondeterminism bug introduced by a benign-looking refactor -- say, sorting
  a `Map` differently, or adding a `new Date()` to a log call near `render()` -- would produce
  two different SVGs from the same input in separate processes. The within-process test would
  still pass (both calls produce the same new wrong output in the same process) and the Tier-B
  CI gate would catch it only for the 24 certified corpus inputs.
- **Recommendation:** Commit golden SVG files (e.g. `test/fixtures/golden-hex-64.svg`,
  `test/fixtures/golden-uuid.svg`) and add a test that renders the same inputs and asserts
  `strict.equal(result, GOLDEN)`. Update the golden on intentional spec-version bumps (the
  CI spec-sync check already fails on version drift, making the update ceremony explicit).

---

### F3: Fingerprint-edge cell edge-color wiring untested at the render() level

- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Location:** `packages/core/src/entviz.ts:738-744`; `packages/core/test/unit/render-helpers.test.ts`
- **Finding:** `fingerprintEdgeCells()` is unit-tested and confirms which set of cell indices
  gets the override, but no test verifies that those cells actually receive
  `edgeColors[ftok.quant & 0b11]` rather than the nearest-palette echo through `render()`.
  The render path branches at `fpEdgeCells.has(tc.ci)` (line 742) and applies either the
  fingerprint-driven color or `closestPaletteColor` -- but integration tests only check
  `data-cols`, `data-rows`, `viewBox`, and color-bar markers, not specific cell edge colors.
  The only gate on edge-color correctness is the Tier-A golden corpus comparison, which runs
  in a separate CI job against 24 corpus inputs only.
- **Consequence:** If the `render()` wiring were accidentally inverted (e.g. a
  `!fpEdgeCells.has(tc.ci)` typo), all cells would receive the wrong color rule. The unit test
  for `fingerprintEdgeCells` would still pass (it tests set membership, not wiring), and the
  unit-suite coverage gate would still pass (the line is executed by integration tests). Only
  the Tier-A check would catch it -- and only for 24 corpus inputs.
- **Recommendation:** Add an integration test that renders a known input, parses the SVG for
  the surround rect fills of cell 0 and the quartile cells, and asserts they match
  `style.edgeColors[ftok.quant & 0b11]`. This directly tests the v10 fingerprint-edge wiring
  through `render()`, not just the helper.

---

### F4: Whitespace-only input and short-path byte-length boundary are untested

- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Location:** `packages/core/test/integration/render.test.ts`; `packages/core/src/entviz.ts:650`
- **Finding:** The integration tests cover empty-string rejection, UUID, plain hex, UTF-8
  fallback, and parameter range errors. They do not cover:
  (a) Whitespace-only input: `render("   ")` trims to `""` and hits the "No tokens"
  rejection, but no test asserts it. The existing test uses `""` directly.
  (b) Exactly 64-byte short-path ceiling: `render("a".repeat(128))` (128 hex chars = 64
  bytes) is the maximum input that stays on the short path. No test renders it. The only
  near-boundary test is `render("a".repeat(130))` (65 bytes, one over the limit).
- **Consequence:** A regression in the `rawInput.trim()` call or in the `byteLen > 64`
  comparison would not be caught. These are one-liner additions to the integration suite.
- **Recommendation:** Add `assert.throws(() => render("   "), /No tokens/)` and
  `assert.doesNotThrow(() => render("a".repeat(128)))` to the integration test file.

---

### F5: Determinism asserted on only one input; no spread across alphabets or grid sizes

- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Location:** `packages/core/test/integration/render.test.ts:10-12`
- **Finding:** The spec MUST-determinism claim applies to all inputs and all alphabets. The
  current assertion tests one 32-char hex input. An alphabet-conditional nondeterminism bug
  (e.g. a `Math.random()` call on the BASE64URL path) would pass the current test. Adding a
  UUID and a UTF-8 fallback to the determinism assertion covers the three distinct code paths
  (hex, UUID-normalized-hex, base64url-re-encoded).
- **Consequence:** Narrow determinism coverage means a regression on a non-hex alphabet would
  be caught only by the conformance corpus, which exercises those paths but does not explicitly
  assert byte-identity across two render calls.
- **Recommendation:** Extend the determinism test to three inputs:
  `"deadbeef"` (hex), `"550e8400-e29b-41d4-a716-446655440000"` (UUID), and `"hello, world"`
  (UTF-8 fallback). Each calls `render()` twice and asserts equality. Fix effort: small.

---

## Additional Patterns Noted

- **Spec bit-extension example `0xABC -> 0xABCABC` untested.** The tokenize tests cover
  `0xAB -> 0xABABAB` and `0xa -> 0xaaaaaa` but not the 12-bit extension case. The spec
  calls it out explicitly. Adding `assert.equal(tokenize("abc", HEX)[0].quant, 0xabcabc)` would
  close this.

- **`selectVisualStyle` test does not assert `bgColor` is never `"#000000"`.** The comment
  explains why (index 4 unreachable from `quant & 0x03`), but no assertion documents it. A
  one-line `assert.notEqual(style.bgColor, "#000000")` would guard the invariant.

- **`drawBlankCells` tests assert only that `data-blank-map-min` matches `\d+,\d+`**, not
  the specific `"row,col"` values for the given inputs. Adding a concrete assertion (e.g.
  that `minCi=0` maps to `"0,0"`) would guard the row/col computation.

- **No test for `blankFillColors` with an empty `blankIndices` array** (the full-grid case,
  e.g. 6 tokens in a 2x3 grid). This should return an empty map and not throw; a one-liner
  test documents the contract.

- **CVD simulation gap (overlapping with PSY-JS-F1).** `oklabLightness` is pure and fully
  testable. A table of `{rgb -> expectedFgColor}` under simulated protanopia/grayscale would
  guard the Oklab threshold against regression. The security reviewer (SEC-F2) also noted no
  integration test for SVG-hostile entropy strings -- a low-effort addition to the integration
  suite.

- **`El.set()` is not tested with an attribute value that requires XML escaping.** The `esc()`
  function is exercised on text content but attribute values with `&` or `"` are not covered.

- **React `useMemo` dependency array includes `onError`**: if the consumer passes an inline
  arrow function, the memo fires on every parent render. No test or doc comment warns of this.

---

## Residual Unknowns

- **4.44 % uncovered branches.** Node's built-in coverage tool reports the fraction but not
  the locations. AGENTS.md names two acknowledged-unreachable guards (`tokenizeFingerprint`
  ftok-count, `drawEllipse` degenerate geometry). The remaining gap may include the
  `!pts.length` early return in `drawEllipse` and the `candidates.length === 0` path in
  `chooseGrid`. A tool that reports per-branch source locations (e.g. `c8`) would confirm.

- **Whether `render("   ")` currently throws.** The code path is: trim -> `""` -> `tokenize`
  returns `[]` -> `if (!tokens.length)` throws. Logically it should, but no test verifies it.

- **React runtime behavior** (memo invalidation, SSR, strict-mode double-invoke) is not
  observable from static review alone.

---

## Decisions Needed

- **Golden SVG files.** Should they live in `packages/core/test/fixtures/` and be regenerated
  by a script on intentional spec bumps? Or should the CI spec-sync check in `ci.yml` serve as
  the sole gate? The SPEC reviewer deferred this decision here.

- **React test setup.** Adding `@testing-library/react` to `packages/react` is a small but
  real dependency addition. Worth a brief decision on whether React tests belong in the monorepo
  or in a separate consumer repo.

- **CLI test strategy.** Testing `cli.ts` via a spawned process is more robust (covers the
  actual `node` invocation the conformance runner uses) but slower. Exporting `main()` and
  mocking `process.stdin`/`process.stdout`/`process.exit` is faster but exercises a slightly
  different path.

---

## Findings Manifest

```yaml
findings:
  - id: TST-F1
    persona: testability-hawk
    title: CLI entry point (cli.ts) and React wrapper (Entviz.tsx) have zero test coverage
    severity: HIGH
    confidence: CONFIRMED
    location: packages/core/src/cli.ts, packages/react/src/Entviz.tsx
    dedupe_key: cli-untested
    recommended_disposition: recommend-fix
    rationale: >
      cli.ts is the --impl-cmd target for every conformance run; its JSON deserialization,
      param defaults, exit codes, and error path are untested. Entviz.tsx onError/fallback
      are also untested. A bug in either ships silently to consumers.
    revisit_condition: null
    fix_effort: small

  - id: TST-F2
    persona: testability-hawk
    title: Determinism not locked in by a committed golden-SVG regression test
    severity: HIGH
    confidence: CONFIRMED
    location: packages/core/test/integration/render.test.ts:9
    dedupe_key: render-nondeterministic-ungated
    recommended_disposition: recommend-fix
    rationale: >
      A within-process same-call assert guards against one input in one process run; it
      does not catch accumulated-state bugs or cross-invocation drift. A committed golden
      SVG would catch any byte-level regression independently of the corpus Tier-B gate.
    revisit_condition: null
    fix_effort: small

  - id: TST-F3
    persona: testability-hawk
    title: Fingerprint-edge cell edge-color wiring untested at the render() level
    severity: MEDIUM
    confidence: CONFIRMED
    location: packages/core/src/entviz.ts:738-744
    dedupe_key: render-untested-fp-edge-wiring
    recommended_disposition: recommend-fix
    rationale: >
      fingerprintEdgeCells() is unit-tested for set membership but no test confirms those
      cells receive edgeColors[ftok.quant & 0b11] through render(). An inversion bug would
      pass all unit tests and be caught only by Tier-A corpus comparison (24 vectors only).
    revisit_condition: null
    fix_effort: small

  - id: TST-F4
    persona: testability-hawk
    title: Whitespace-only input and short-path byte-length boundary untested
    severity: MEDIUM
    confidence: CONFIRMED
    location: packages/core/test/integration/render.test.ts
    dedupe_key: render-unhandled-boundary-inputs
    recommended_disposition: recommend-fix
    rationale: >
      render("   ") and render("a".repeat(128)) (64-byte ceiling) have no tests. A regression
      in the trim path or the 64-byte boundary check would ship silently.
    revisit_condition: null
    fix_effort: small

  - id: TST-F5
    persona: testability-hawk
    title: Determinism asserted on only one input with no spread across alphabets
    severity: MEDIUM
    confidence: CONFIRMED
    location: packages/core/test/integration/render.test.ts:10-12
    dedupe_key: render-flaky-single-input-determinism
    recommended_disposition: recommend-fix
    rationale: >
      Spec MUST-determinism applies to all inputs and alphabets. An alphabet-conditional
      nondeterminism bug would pass the current single-input hex check. Adding UUID and
      UTF-8 fallback inputs is a one-liner.
    revisit_condition: null
    fix_effort: small
```

# Error-Message Quality Review: entviz-js

**Date:** 2026-07-11
**Effort level:** medium
**Implementation commit:** 82f81ff11948b2e891ff9ec3acc38a2095764212
**Context sources used:** full grep enumeration of all `throw`/`new Error`/`reject(` sites in both packages; traced React surfacing paths through `onPick`, `onFetch`, `setFetchError`, `copyFailed`, and `error` state in `EntvizPill`/`EntvizCompare`; confirmed absence of any error-code scheme or typed-error taxonomy; read `pill-messages.ts` and `compare-messages.ts` for user-facing message infrastructure.

---

## The Rubric Applied

The rubric below is the yardstick this review grades against. It applies to two distinct audiences with different standards:

- **Developer-facing errors** (most of `@entviz/core` and the option-validation paths): the reader is a programmer. The message should make the *fix* obvious without opening the source — complete sentences, correct terms, the valid range or expected format stated, no internal jargon that only a core contributor would recognize.
- **User-facing / surfaced errors** (React flows a real person triggers — copy, paste, file, fetch, decode): the reader may be a non-technical person using the pill or the compare UI. The message that *reaches* them should be calm, friendly, and actionable; raw developer-shaped throws must never escape to the surface without a translation layer.

**The three headline axes the maintainer cares most about:**

### 1. Stable symbolic codes
Every error should carry a stable, symbolic identifier — a constant like `EV_INPUT_TOO_LARGE` or a documented string code on the thrown object — independent of the prose. This lets consumers branch programmatically on error *kind* without string-matching, survives rewording, and gives everyone something concrete to grep for, search, or paste into a bug report. Its absence is a real gap, most acutely on the `render()` / `parse()` public API where consumers need to distinguish "bad checksum" from "option out of range" from "input too large."

**Verdict on this codebase:** absent. Every throw is `new Error(prose)` with no `.code` property, no typed-error subclass, and no exported error-code constants. The error taxonomy exists implicitly in the prose but is not programmatically addressable.

### 2. Permanent vs. transient signalling
An error should tell the reader whether retrying the same action could help. Almost all of `@entviz/core` is deterministic — same input, same failure — and a message implying any ambiguity wastes the reader's time. The genuinely transient case is the URL-fetch path in `EntvizCompare` (network failure). File-read and image-decode failures are mostly permanent (bad/blocked file). The canvas APIs (`no 2d context`, `toBlob failed`) are environment failures that may or may not be transient.

**Verdict on this codebase:** generally unaddressed. The core validation messages are effectively permanent by nature but say nothing about retryability. The React browser-API errors are context-free and say nothing about whether the user should try again.

### 3. Complete-sentence house voice
All messages — developer and user-facing alike — should be complete sentences: subject + verb + (helpful detail). The user-facing voice adds "I/you" warmth. Jargon (`ftoks`) and pronoun-drops ("Couldn't reach server") are the maintainer's explicit pet peeves.

**Good:** "I couldn't read that file. The file picker may not have supported this format."
**Bad:** "read failed"

**Good (dev-facing):** "The `note` option must be printable ASCII (U+0020–U+007E) and at most 10 characters; you passed a string with 15 characters."
**Bad:** "expected 22 ftoks, got 5" — `ftoks` is internal jargon, and the sentence has no subject.

---

## Evidence Inventory

### `@entviz/core` — `packages/core/src/entviz.ts`

All errors are `new Error(prose)` — no typed-error classes, no `.code` property, no exported constants.

| Line | Quoted message | Audience | Notes |
|------|---------------|----------|-------|
| 189 | `"fingerprint must be 64 bytes"` | dev-internal | defensive guard on `tokenizeFingerprint`; reachable only via internal calling code |
| 192 | `` `expected 22 ftoks, got ${toks.length}` `` | dev-internal | defensive guard — same function; `ftoks` is internal jargon |
| 532 | `` `EIP-55 checksum mismatch at position ${i}: '${c}' should be '${expected}'` `` | developer | includes offending position and expected char — one of the better messages |
| 901 | `` `Bitcoin legacy address ${text} fails its base58check (double-SHA256) checksum` `` | developer | `${text}` is unbounded — no length cap on the echoed value |
| 912 | `` `Bitcoin segwit address ${text} fails its bech32 checksum` `` | developer | same unbounded-echo issue |
| 930 | `` `Litecoin legacy address ${text} fails its base58check (double-SHA256) checksum` `` | developer | same |
| 940 | `` `Litecoin address ${text} fails its bech32 checksum` `` | developer | same |
| 958 | `` `Bitcoin Cash address ${text} fails its CashAddr checksum` `` | developer | same |
| 981 | `` `Cardano Shelley address ${text} fails its bech32 checksum` `` | developer | same |
| 1067 | `` `LEI ${upper} fails its MOD 97-10 checksum` `` | developer | same (all-uppercase, bounded by LEI length — less risky) |
| 1142 | `` `bech32 address ${text} fails its bech32 checksum` `` | developer | same — plus "bech32 address … bech32 checksum" is redundant |
| 1271–1273 | `` `note must be at most ${NOTE_MAX_LEN} characters (got ${note.length})` `` | developer | clear, actionable |
| 1276–1278 | `` `note must be printable ASCII (U+0020-U+007E); no control or non-ASCII characters (got ${JSON.stringify(note)})` `` | developer | `JSON.stringify` on an untrusted string can produce a long/ugly echo |
| 1407 | `` `input too large (>${MAX_INPUT_CHARS} characters)` `` | developer/user | fragment, no subject; same text appears at 1649 (duplicated) |
| 1641 | `` `font_size_pt must be in [6, 30] (got ${fontSizePt})` `` | developer | underscore naming leaks an internal snake_case option name |
| 1644 | `` `target_ar must be in [0.01, 100] (got ${targetAr})` `` | developer | same |
| 1661 | `"No tokens produced from input entropy."` | dev-internal | a defensive guard; likely unreachable via public API (earlier guards block the path) |

**No central error-code scheme, no typed-error classes, no exported error-kind constants.** All messages are ad-hoc prose.

### `@entviz/react` — `packages/react/src/copy-actions.ts`

| Line | Quoted message | Surfaced to user? |
|------|---------------|------------------|
| 19 | `"image decode failed"` | No — `rasterizeToPng` throws; `copyEntviz` propagates it; `EntvizPill.doCopy` catches it and shows `m.copyFailed` ("Copy failed") — NOT the raw message |
| 29 | `"no 2d context"` | No — same path; raw error is caught and swallowed by the `copyFailed` toast |
| 33 | `"toBlob failed"` | No — same |

Copy errors from `copy-actions.ts` are well-handled: the pill catches any throw from `copyEntviz` and surfaces the localized `m.copyFailed` string, never the raw message. The raw messages are developer-only context for catching/debugging, but they are still individually weak (see findings).

### `@entviz/react` — `packages/react/src/EntvizCompare.ts`

| Line | Quoted message | Surfaced to user? |
|------|---------------|------------------|
| 144 | `"read failed"` | **YES** — `onPick` catches the rejection and calls `setFetchError("read failed")`, which renders verbatim via `fmt(m.fetchError, { error: fetchError })` → `"Couldn't fetch that URL (read failed)"` — but this wasn't a URL fetch, it was a file read, making the error incoherent |
| 156 | `"read failed"` | **YES** — same path via `blobToDataUrl` |
| 166 | `"image decode failed"` | **YES** — `compareRaster → loadImage` throws; the `compareRaster` effect's `.catch` sets `setRasterV({ state: "unknown", reason: "could not read the reference image" })` — the raw "image decode failed" becomes the reason string passed to `m.unknownReason` |
| 176 | `"no 2d context"` | **YES (partial)** — `imageToRaster` throws; `compareRaster → imageToRaster` would propagate to the same `.catch` path, making "no 2d context" potentially appear as the reason for an "unknown" verdict |

**Key finding:** line 479 hardcodes the string `"read failed"` directly into `setFetchError` (copying the raw error message rather than calling `e.message`). This bypasses the localized `m.fetchError` template in a specific way: even if the template is localized, the error fragment `(read failed)` is always English and always a raw developer message.

```typescript
// EntvizCompare.ts:475-480
readFileAsReference(file).then(
  (content) => setRef({ content, provenance, origin: "" }),
  () => {
    emit({ type: "reference.readError", reason: "read failed" });
    setFetchError("read failed");  // ← hardcoded English fragment
  },
);
```

The rendered string a user sees: `"Couldn't fetch that URL (read failed)"` — which is doubly wrong: it was not a URL fetch, and the fragment is English-only and context-free.

---

## Executive Summary

The `@entviz/core` error messages are **developer-competent but not developer-excellent**: the checksum failures and option-range messages are generally informative, but the whole set lacks stable symbolic codes, uses internal jargon (`ftoks`) in two places, uses snake_case option names (`font_size_pt`, `target_ar`) that contradict the camelCase API surface, and echoes `${text}` without a length cap (a minor DoS/UX issue on very long inputs). The biggest systemic weakness is the total absence of any error-code scheme — every consumer must string-match volatile prose.

The `@entviz/react` situation is mixed. Copy errors are correctly translated to a localized, user-safe `copyFailed` string. But file-read errors in `EntvizCompare` are surfaced through the *URL-fetch* error template with the raw English string `"read failed"` hardcoded, making them incoherent (wrong error type named) and non-localizable. The most urgent fix is routing `onPick` errors through an appropriate message key rather than hardcoding `"read failed"` into the URL-fetch error channel.

---

## Three-Axis Assessment

### 1. Codes / distinguishability

**Verdict: absent.**

There are no symbolic codes, no typed-error subclasses, no exported constants. A consumer catching a `render()` call cannot programmatically distinguish `"input too large"` from `"font_size_pt must be in [6, 30]"` from a checksum failure — they must string-match volatile prose or treat all errors as opaque. The same gap makes internationalization of error messages impractical (there is no stable key to hang a translated string on).

Introducing a `code` field is a medium-effort addition: a small `EntvizError` subclass (or even a plain `Object.assign(new Error(msg), { code })` pattern) would let consumers write `e.code === "EV_INPUT_TOO_LARGE"` rather than `e.message.startsWith("input too large")`. The symbolic codes would also serve as the catalog keys for any future localized error messages.

### 2. Permanent vs. transient

**Verdict: unaddressed across the board.**

Every `@entviz/core` message is for a deterministic, permanent failure but says nothing about retryability. The option-range and checksum failures are obviously permanent, but an explicit cue would still help: a reader who hits `"Bitcoin segwit address … fails its bech32 checksum"` knows the checksum failed but must infer that re-submitting the same value won't help.

The critical gap is in `@entviz/react`: the URL-fetch path captures an exception and sets it as the error fragment, but neither the fetch-error message (`"Couldn't fetch that URL ({error})"`) nor the file-read error message says whether trying again makes sense. A network timeout is transient (retry is worth it); a malformed URL or a non-image file is permanent (retry won't help). Both situations produce the same neutral, non-committing error display.

### 3. Voice

**Verdict: developer messages are serviceable but not excellent; user-facing surfacing has a concrete defect.**

The checksum messages (`"Bitcoin segwit address ${text} fails its bech32 checksum"`) read as complete sentences and are specific — they pass the "names what failed" and "offending value included" criteria. The option-range messages (`"font_size_pt must be in [6, 30] (got ${fontSizePt})"`) are also complete and actionable.

**Failing the voice standard:**
- `"fingerprint must be 64 bytes"` — no subject ("The fingerprint…").
- `` `expected 22 ftoks, got ${toks.length}` `` — `ftoks` is opaque jargon; the sentence has no subject.
- `"No tokens produced from input entropy."` — passive/impersonal, jargon-flavored.
- `"input too large (>${MAX_INPUT_CHARS} characters)"` — a parenthetical fragment, not a sentence; no subject. Appears **twice** at lines 1407 and 1649.
- `"font_size_pt must be in [6, 30] (got …)"` — the option name is snake_case while the public API property is camelCase (`fontSizePt`), confusing consumers who use the camelCase name.
- `"read failed"` (surfaced raw to users) — a bare past-tense fragment, no context, wrong error channel.

---

## Findings by Criterion

### Rubric #5 (no stable codes): ALL errors
No error in either package carries a stable symbolic identifier. All 20+ throws are bare `new Error(prose)`.

### Rubric #9 (voice — jargon, fragments, pronoun-drops): 4 sites
Lines 192 (`ftoks`), 1407/1649 (`input too large` fragment), 1641/1644 (snake_case option names vs. camelCase API).

### Rubric #2 (unbounded value echo): checksum messages
Lines 901, 912, 930, 940, 958, 981, 1142 all echo `${text}` without a length cap.

### Rubric #11 (translation layer absent): `setFetchError("read failed")` at line 479
The raw developer string is set as the interpolated fragment in a URL-fetch-labeled user-facing error for a *file-read* failure.

### Rubric #4 (retry ambiguity): all React error paths
Neither the fetch-error display nor the file-read-error display indicates permanence vs. transience.

### Rubric #8 (wrong error type): all errors
Every throw is `new Error(…)` regardless of the violation kind — range errors, type errors, checksum failures, and API misuse all produce the same generic type.

---

## Top Findings

### F1: No stable symbolic error codes anywhere in the public API

- **Severity:** HIGH | **Confidence:** CONFIRMED
- **Location:** `packages/core/src/entviz.ts` (all throw sites); `packages/react/src/copy-actions.ts`, `EntvizCompare.ts` (all reject sites)
- **Rubric criteria failed:** #5 (no stable code), #8 (wrong/generic type), #12 (not localizable)
- **Finding:** Every error thrown in both packages is a bare `new Error(prose)`. A consumer catching a `render()` call cannot distinguish "input too large" from "font_size_pt out of range" from a checksum failure without string-matching volatile prose. The same absence blocks any future error-message localization (no stable key to hang a translated string on) and makes it impossible to programmatically branch on error kind in a way that survives a prose reword.
- **Consequence:** API consumers must write fragile `e.message.startsWith(…)` guards or treat all render failures as opaque. Any future reword of a message (e.g. fixing the `font_size_pt` → `fontSizePt` naming) silently breaks those guards.
- **Recommendation:** Introduce a minimal typed-error pattern. A small `EntvizError extends Error` with a `code: string` field (and a discriminated union of code constants exported from `@entviz/core`) is the cleanest shape. At minimum, a plain `Object.assign(new Error(msg), { code: 'EV_INPUT_TOO_LARGE' })` pattern is one line per throw and gives consumers something stable without a class hierarchy. Suggested codes: `EV_INPUT_TOO_LARGE`, `EV_CHECKSUM_FAILED`, `EV_OPTION_OUT_OF_RANGE`, `EV_NOTE_INVALID`, `EV_INTERNAL` (for the defensive guards).
- **Fix effort:** medium (introduces a small exported type + touches ~18 throw sites)

---

### F2: File-read error surfaces through the URL-fetch error template with hardcoded English fragment

- **Severity:** HIGH | **Confidence:** CONFIRMED
- **Location:** `packages/react/src/EntvizCompare.ts:474-480` and `packages/react/src/EntvizCompare.ts:144,156`
- **Rubric criteria failed:** #1 (wrong operation named), #3 (not actionable), #9 (fragment, not a sentence), #11 (no translation layer), #12 (not localizable)
- **Finding:** When a file read fails (`readFileAsReference` rejects), `onPick` catches the error and calls `setFetchError("read failed")`. The error is then rendered via `fmt(m.fetchError, { error: fetchError })`, which produces: `"Couldn't fetch that URL (read failed)"`. This is wrong on three counts: (1) it was not a URL fetch, (2) `"read failed"` is a raw developer string hardcoded in English — it won't localize even when the surrounding template is translated, and (3) it tells the user nothing actionable (what file type isn't supported? what should they try instead?).
  ```
  // Rendered to user:
  "Couldn't fetch that URL (read failed)"
  //   ↑ wrong: this was a file read, not a URL fetch
  //                          ↑ raw English dev-string, non-localizable
  ```
- **Consequence:** A real user who tries to pick an unsupported file type sees an incoherent error message that blames a URL they never entered.
- **Recommendation:** Add a dedicated `readError` message key to `CompareMessages` and use it in `onPick`:
  ```
  // compare-messages.ts:
  readError: "I couldn't read that file. Try a different file, or paste the value directly."
  
  // EntvizCompare.ts onPick:
  () => {
    emit({ type: "reference.readError", reason: "read failed" });
    setFetchError(m.readError);  // use the localized message, not the raw string
  }
  ```
  The `m.fetchError` display should then be renamed/split: one template for URL fetch failures (transient: suggest retry) and one for file-read failures (likely permanent: suggest a different file or pasting directly).
- **Fix effort:** small

---

### F3: `"expected 22 ftoks, got N"` uses internal jargon; `"fingerprint must be 64 bytes"` has no subject

- **Severity:** MEDIUM | **Confidence:** CONFIRMED
- **Location:** `packages/core/src/entviz.ts:192` and `packages/core/src/entviz.ts:189`
- **Rubric criteria failed:** #9 (jargon, incomplete sentence), #6 (not precise to what the caller knows)
- **Finding:** `"expected 22 ftoks, got ${toks.length}"` exposes the internal name `ftoks` (short for "fingerprint tokens") which appears nowhere in the public API or documentation. A developer hitting this (likely via a programmatic `tokenizeFingerprint` call with a wrong-length digest) has no obvious next step. Similarly, `"fingerprint must be 64 bytes"` drops the subject — "The fingerprint digest must be 64 bytes; you passed one that was N bytes" would be clearer.
  Both of these are on `tokenizeFingerprint`, an internal-ish export that ordinary `render()` callers never see. The priority is medium (limited blast radius), but the `ftoks` jargon is the maintainer's stated pet peeve class and worth fixing.
- **Recommendation:**
  - Line 192: `"The fingerprint digest must produce exactly 22 tokens, but this digest produced ${toks.length}."`
  - Line 189: `"The fingerprint digest must be 64 bytes, but you passed a ${digest.length}-byte buffer."`
- **Fix effort:** small

---

### F4: `"input too large"` is a fragment and duplicated; option-name jargon in `font_size_pt` / `target_ar` messages

- **Severity:** MEDIUM | **Confidence:** CONFIRMED
- **Location:** `packages/core/src/entviz.ts:1407`, `1641`, `1644`, `1649`
- **Rubric criteria failed:** #9 (fragment, not a sentence; jargon in option names), #3 (partially actionable but imprecise), #1 (names what failed but the format is terse)
- **Finding:** `"input too large (>${MAX_INPUT_CHARS} characters)"` is a parenthetical fragment. It appears at both line 1407 (in `classifyInput`) and line 1649 (in `render`) — identical prose, duplicated literal. A consumer whose `render()` throws this sees a fragment rather than a complete sentence and may not know which option to adjust (the cap is an anti-DoS measure, not an arbitrary bound).
  The option-range messages `"font_size_pt must be in [6, 30] (got …)"` and `"target_ar must be in [0.01, 100] (got …)"` use snake_case names that contradict the camelCase property names in `RenderOptions` (`fontSizePt`, `targetAr`). A consumer who calls `render(v, { fontSizePt: 40 })` gets an error message that says `font_size_pt` — a mismatch that could cause confusion, especially for TypeScript users.
- **Recommendation:**
  - Lines 1407/1649: `"The input is too large to render (${rawInput.length.toLocaleString()} characters; the limit is ${MAX_INPUT_CHARS.toLocaleString()})."` — extract to a shared constant so the text isn't duplicated.
  - Line 1641: `"The \`fontSizePt\` option must be between 6 and 30 (you passed ${fontSizePt})."`
  - Line 1644: `"The \`targetAr\` option must be between 0.01 and 100 (you passed ${targetAr})."`
- **Fix effort:** small

---

### F5: Checksum-failure messages echo `${text}` without a length cap

- **Severity:** LOW | **Confidence:** CONFIRMED
- **Location:** `packages/core/src/entviz.ts:901, 912, 930, 940, 958, 981, 1142`
- **Rubric criteria failed:** #2/#7 (unbounded/untrusted input echo)
- **Finding:** Seven checksum-failure messages (Bitcoin legacy/segwit, Litecoin, Bitcoin Cash, Cardano Shelley, generic bech32) echo `${text}` directly. In practice these parsers are guarded by regex matches that bound the match length, so a multi-megabyte string won't reach these throws. But the bound is implicit — the messages carry no explicit cap, and any future refactor that widens a regex could silently enable a very long echo. The rubric requires the included value to be "length-capped and safe to echo."
  The `bech32 address ${text} fails its bech32 checksum` phrasing is also slightly redundant ("bech32 … bech32").
- **Recommendation:** Add a short helper `cap(s: string, n = 80): string` and use it: `` `Bitcoin segwit address ${cap(text)} fails its bech32 checksum` ``. For the generic bech32 message, consider `"The bech32 address '${cap(text)}' has an invalid checksum."` to reduce the redundancy.
- **Fix effort:** small

---

## Additional Weak Messages Noted

- **`packages/core/src/entviz.ts:1661`** — `"No tokens produced from input entropy."` — This message is almost certainly **unreachable** via the public API: `render()` calls `classifyInput` first, which either returns a parsed result or applies the `input too large` guard; the subsequent `tokenizeEntropy` should always produce tokens for a non-empty input that passes the DoS cap. If the guard is actually dead code, the message contributes dead noise. If it isn't unreachable, it should say what the caller should do ("Input entropy yielded no tokens. Check that the value is a non-empty string."). Track the reachability via the test suite (the AGENTS.md coverage rules should confirm it).

- **`packages/react/src/EntvizCompare.ts:369-378`** — The raster comparison `catch` path sets `reason: "could not read the reference image"`. This string is used in `m.unknownReason` (`"Couldn't confirm a match — {reason}"`) → user sees `"Couldn't confirm a match — could not read the reference image."` The lower-case `"could not…"` reads awkwardly after the template's capitalized `"Couldn't confirm a match — "`. It is also a pronoun-drop ("Could not" → should be "I could not read the reference image"). The fragment capitalization inconsistency is a minor voice issue but worth fixing.

- **`packages/core/src/entviz.ts:1277`** — `got ${JSON.stringify(note)}` — `JSON.stringify` on an untrusted note could produce multi-line or very long output if the note contains escape sequences or control characters. A `JSON.stringify(note.slice(0, 20))` cap would limit the echo.

---

## What's Done Well

- **The checksum-failure messages** (Bitcoin, Litecoin, Bitcoin Cash, Cardano, LEI, generic bech32) are **the best messages in the codebase.** They name the specific address type, echo the offending value, name the specific checksum algorithm, and are complete sentences. They make the fix obvious (the checksum is wrong, so the address is corrupted). This is the template the weaker messages should follow.

- **The EIP-55 message** (`"EIP-55 checksum mismatch at position ${i}: '${c}' should be '${expected}'"`) goes even further — it names the position and the expected character. Excellent for a developer debugging a corrupted Ethereum address.

- **The `sanitizeNote` messages** (`"note must be at most N characters"`, `"note must be printable ASCII…"`) are clear, actionable, and state both the constraint and the actual value.

- **The copy-error path in `EntvizPill`** correctly catches any throw from `copyEntviz` and surfaces only the localized `m.copyFailed` string. The raw `"image decode failed"` / `"toBlob failed"` / `"no 2d context"` messages never reach the user's screen from the copy path.

- **The `compare-messages.ts` messages** for URL handling are well-written and use the correct "I/you" house voice: `"Couldn't fetch that URL ({error})"`, `"Couldn't recognize that — paste another value or an entviz SVG"`. These are good models for the messages that need improvement.

---

## Residual Unknowns

1. **`"No tokens produced from input entropy."` (line 1661) reachability:** Static analysis suggests this is a dead defensive guard — every non-large input that reaches `tokenizeEntropy` should produce tokens. Confirmed by the 100% line coverage claim in AGENTS.md only if this line is exercised by a test; otherwise it's nominally covered by the "≥95% branches" floor. Check: `grep -r "No tokens" packages/core/test/` — if no test exercises it, it may be a dead path. Either remove it or document the case in which it fires.

2. **`compareRaster` catch-path propagation of `"image decode failed"` / `"no 2d context"`:** The raster comparison effect catches errors and constructs `{ state: "unknown", reason: "could not read the reference image" }`. Whether the raw Error message (`"image decode failed"`) ever leaks into the `reason` depends on the catch implementation. At line 370-376, the catch hardcodes `"could not read the reference image"` (overriding the raw error), so the raw messages do NOT surface to the verdict chip. Confirmed: the raw messages from `loadImage`/`imageToRaster` are developer-only in the raster path. However, the `"no 2d context"` throw from `imageToRaster` (line 176) is a synchronous throw inside `compareRaster`, not inside the `loadImage` Promise — it may propagate outside the effect's async `.catch` if the host calls `compareRaster` directly. This is a low-priority structural hazard, not a current user-visible bug.

---

## Findings Manifest

```yaml
findings:
  - id: ERR-F1
    persona: error-quality
    title: No stable symbolic error codes on any public-API throw (all errors are bare prose)
    severity: HIGH
    confidence: CONFIRMED
    location: packages/core/src/entviz.ts (all throw sites); packages/react/src/copy-actions.ts; packages/react/src/EntvizCompare.ts
    dedupe_key: core-uncoded
    recommended_disposition: recommend-fix
    rationale: Consumers can only string-match volatile prose to distinguish error kinds; blocks future localization; every throw is a bare new Error with no code or typed subclass.
    revisit_condition: null
    fix_effort: medium

  - id: ERR-F2
    persona: error-quality
    title: File-read error shows through URL-fetch template with hardcoded English fragment "read failed"
    severity: HIGH
    confidence: CONFIRMED
    location: packages/react/src/EntvizCompare.ts:479
    dedupe_key: entviz-compare-contextless
    recommended_disposition: recommend-fix
    rationale: User sees "Couldn't fetch that URL (read failed)" for a file-read failure — wrong operation named, non-localizable English fragment, no actionable guidance.
    revisit_condition: null
    fix_effort: small

  - id: ERR-F3
    persona: error-quality
    title: '"expected 22 ftoks, got N" uses internal jargon; "fingerprint must be 64 bytes" has no subject'
    severity: MEDIUM
    confidence: CONFIRMED
    location: packages/core/src/entviz.ts:192,189
    dedupe_key: core-clipped
    recommended_disposition: recommend-fix
    rationale: ftoks is internal jargon not in any public API or doc; no subject on either message; maintainer's explicit pet peeve class.
    revisit_condition: null
    fix_effort: small

  - id: ERR-F4
    persona: error-quality
    title: '"input too large" is a fragment (not a sentence) and is duplicated; font_size_pt/target_ar use snake_case names inconsistent with camelCase API'
    severity: MEDIUM
    confidence: CONFIRMED
    location: packages/core/src/entviz.ts:1407,1641,1644,1649
    dedupe_key: render-options-clipped
    recommended_disposition: recommend-fix
    rationale: Parenthetical fragment violates house-voice; snake_case in error messages contradicts camelCase RenderOptions property names, confusing callers; text is duplicated at 1407 and 1649.
    revisit_condition: null
    fix_effort: small

  - id: ERR-F5
    persona: error-quality
    title: Checksum-failure messages echo ${text} without a length cap
    severity: LOW
    confidence: CONFIRMED
    location: packages/core/src/entviz.ts:901,912,930,940,958,981,1142
    dedupe_key: checksum-validators-leaky
    recommended_disposition: recommend-defer
    rationale: Echoed value is practically bounded by the regex match, but the cap is implicit; a future regex widening could enable a very long echo; low current risk.
    revisit_condition: If any checksum-validator regex is widened to allow longer inputs, apply the cap then.
    fix_effort: small
```

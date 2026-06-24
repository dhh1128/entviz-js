# Security Review: entviz-js

**Date:** 2026-06-19
**Effort level:** medium
**Run label:** port-review-2026-06-19
**Context sources used:** `AGENTS.md`, `CERTIFICATION.md`, `SECURITY.md`, `README.md`,
`packages/core/src/entviz.ts`, `packages/core/src/cli.ts`,
`packages/react/src/Entviz.tsx`, `package.json`, `packages/core/package.json`,
`packages/react/package.json`, `package-lock.json`, `.github/workflows/ci.yml`,
`.github/workflows/release.yml`, `.github/workflows/codeql.yml`,
`.github/dependabot.yml`, `scripts/release.py`;
full scan for hidden Unicode, dangerous primitives, secrets.
Spec/threat-model docs from sister repo read via the persona prompt;
`this.i` is absent in this repo (noted).

---

## Evidence Inventory

**Read:** all source files under `packages/core/src/` and `packages/react/src/`,
all test files under `packages/core/test/`, all three workflow files, the
dependabot config, `scripts/release.py`, and all top-level Markdown files.
`package-lock.json` (58 lines) was read to enumerate the runtime dependency graph.

**Shell scans run:**
- Unicode hidden-character scan (rg -nP on packages/ scripts/) -- no hits.
- Dangerous-primitive scan (grep -r eval/exec/shell=True/subprocess/pickle/yaml.load)
  -- no hits in TypeScript source; `subprocess` found only in `scripts/release.py`
  where it is expected and safe (CLI-only, no shell=True, no user input interpolated).
- Secret scan (grep -r PEM/BEGIN PRIVATE/api_key/password/token) -- only harmless
  references in documentation strings and OIDC workflow comments; no embedded credentials.
- Regex scan for ReDoS shapes -- all three regexes in entviz.ts use anchored,
  fixed-quantifier patterns; none exhibit catastrophic backtracking.

**Not run:** the renderer on adversarial inputs (effort is medium, not deep);
`npm audit` (offline); CodeQL scan (requires GitHub). These are flagged under
Residual Unknowns.

---

## Executive Summary

`@entviz/core` has a narrow and well-controlled security surface. SVG output is
built entirely through the `El` class whose `render()` method applies `esc()` to
every attribute value and every text node -- there is no string concatenation that
bypasses escaping, no CDATA, no `fromString`, no raw markup assembly. The CLI
(`cli.ts`) reads stdin, parses JSON, and calls `render()`; it has no filesystem
write path and no dangerous shell primitives. The GitHub Actions supply chain is
the best-in-class implementation seen among entviz-family repos: every action is
pinned by full SHA to a node24-runtime version, `persist-credentials: false` is
set on every checkout, no untrusted event context is interpolated into `run:`
blocks, and OIDC Trusted Publishing eliminates long-lived npm tokens. The one
actionable issue is that `classifyInput()` -- which for large text inputs allocates
a full base64url buffer -- is called *before* the `byteLen > 64` cap in `render()`,
so a caller can force two oversized heap allocations before the guard fires.

---

## Top Findings

Ordered by bang-for-buck (highest risk reduction per unit fix effort, first).

---

### F1: Large-input allocation precedes the byte-length cap

- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Location:** `packages/core/src/entviz.ts:650-656`
- **Finding:**
  `render()` calls `classifyInput(rawInput)` at line 651 and *then* checks
  `decodedByteLength(core, alphabet) > 64` at line 656. For an unbounded
  text input (anything that does not parse as hex or UUID), `classifyInput`
  executes `Buffer.from(rawInput, "utf8").toString("base64url")` (line 426),
  which allocates a buffer proportional to the raw input length before the cap
  fires. For a 100 MB entropy string: (1) `entropy.trim()` copies 100 MB,
  (2) `classifyInput` allocates an approx 100 MB UTF-8 buffer plus an approx 133 MB
  base64url string, (3) the cap fires and throws -- but approx 233 MB of heap were
  already allocated and must be GC'd. A caller or conformance harness that
  repeatedly presents large inputs can force sustained memory pressure.
  The current `CERTIFICATION.md` notes the large-input path as "not yet
  ported," so the codebase implicitly relies on callers not sending large
  inputs; that constraint is not enforced at the API boundary.
- **Exploit path:**
  A service wrapper that passes user-supplied entropy to `render()` without
  pre-filtering length can be steered into repeated GC storms by sending
  >1 MB text blobs. Local CLI use via `cli.ts` reads stdin and presents the
  full payload to `render()` -- an attacker who can feed a large JSON document
  into `cli.ts` wastes the operator's CPU before the error is emitted.
- **Recommendation:**
  Add a raw-length guard at the top of `render()` (before `classifyInput`):
    if (entropy.length > 2048) {
      throw new Error("input exceeds the short-input path limit");
    }
  512 characters covers all conformance-corpus vectors; 2048 gives generous
  headroom for future parsers while remaining far below the threshold where
  base64url overhead causes excessive allocation. The maintainer should
  ratify the threshold. This makes the cap O(1) instead of O(input-length).

---

### F2: No test exercises `render()` with SVG-hostile entropy strings

- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Location:** `packages/core/test/integration/render.test.ts` (file-level
  gap); `packages/core/test/unit/svg-el.test.ts:23-26` (only covers `El`
  directly, not the full pipeline)
- **Finding:**
  The injection safety of the SVG output rests on one structural property:
  `El.render()` applies `esc()` to every attribute value and text node. That
  property is unit-tested at `svg-el.test.ts:23-26`. However, there is no
  integration test that calls `render()` with a crafted entropy string
  containing XML-hostile characters, then verifies that the SVG output does
  not contain bare instances of those characters. The current parsers (hex,
  UUID, base64url) produce clean cores -- hex is lowercase [0-9a-f]+, base64url
  is [A-Za-z0-9_-]+ -- so injection is not currently reachable through any
  ported parser. But future parsers for CESR, SWHID, SSH fingerprints, or
  base58 may introduce prefix/suffix values that carry special characters
  (colons, slashes, dots), and the absence of a regression test means injection
  exposure would not be caught automatically when those parsers land.
- **Exploit path:**
  Not currently exploitable (hex, UUID, and base64url cores cannot embed
  SVG-hostile characters). Risk surfaces when future parsers that extract
  non-trivial prefix/suffix strings are added without escaping being re-verified.
  `drawLabels` routes `prefix` and `suffix` through `El.text` which is esc()d,
  so the property holds today -- but a test regression catching any future
  deviation is missing.
- **Recommendation:**
  Add one integration test in `render.test.ts` that supplies entropy containing
  XML-hostile characters via the UTF-8 fallback path (e.g. a text string with
  angle brackets) and asserts that the SVG output contains only properly-escaped
  forms of those characters. This is a one-time ~10-line test that makes the
  escaping invariant machine-verifiable as parsers expand.

---

### F3: React component comment understates the event-handler residual risk from innerHTML

- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Location:** `packages/react/src/Entviz.tsx:49-55`
- **Finding:**
  The React component uses innerHTML injection to place the SVG string into
  the DOM. The inline comment (line 29-31) correctly notes that the SVG is
  produced by the renderer and that text content is escaped. However, the
  comment does not acknowledge the residual risk: when SVG is injected via
  innerHTML, browsers do NOT suppress event handlers on SVG elements (such as
  onload, onerror, onfocus), even though they do suppress script tags. The
  current `render()` never adds event handlers, so this is not exploitable
  today. But the comment's wording -- "escapes all text content" -- could
  mislead a future contributor into believing injection safety is solely about
  text escaping, rather than also about never generating event-bearing SVG.
  A secondary observation: when render() throws due to an invalid note and
  the onError callback is invoked, the error message includes the verbatim
  note string (via JSON.stringify). If the onError handler logs to a service,
  an attacker probing the note validation can exfiltrate that the note was
  rejected and view its exact encoding.
- **Exploit path:**
  Currently unexploitable via the render() path alone. Risk materializes if
  a future change adds event-handler-bearing SVG elements (e.g. an animated
  element with an event callback). The onError information leakage is available
  today to any caller that passes bad notes and has an onError handler.
- **Recommendation:**
  Strengthen the comment to explicitly name event-handler SVG attributes as
  the class of risk render() must never introduce. For the onError leakage:
  document that the note field is echoed in error messages, so callers with
  an onError handler should treat its argument as potentially containing raw
  user input and avoid logging it verbatim to external services.

---

### F4: No threat-model document names trust boundaries and accepted risks

- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Location:** repository root (absent file)
- **Finding:**
  There is no `docs/threat-model.md` or equivalent in this repo. The
  `SECURITY.md` covers responsible disclosure; `CERTIFICATION.md` covers
  conformance scope; but no single document names the trust boundary
  (caller supplies entropy string, library produces SVG), the assets being
  protected (escaping invariant, id uniqueness), the accepted risks
  (large-input path unported; CSS from hostile embedding page), or the
  downstream usage contexts (gallery page, service-side render, React
  component). This is a documentation gap, not an exploitable hole.
- **Exploit path:**
  Not directly exploitable. The absence means contributors and security
  reviewers must reconstruct the threat model from code, which increases the
  probability of a future contributor inadvertently violating an implicit
  constraint (e.g. adding a parser that embeds raw prefix text in SVG without
  routing it through El.text).
- **Recommendation:**
  A one-page `docs/threat-model.md` noting: (1) trust boundary; (2) escaping
  invariant (all user-controlled content flows through El.text or El.set(),
  never raw concatenation); (3) id-collision design (clip-path is fingerprint-
  salted; no other ids are emitted); (4) accepted risks (large-input allocation
  pre-cap; CSS overrides from hosting page; innerHTML event-handler residual).
  Offer to draft this.

---

### F5: typeName echoes rawInput.length before any pre-cap guard (cosmetic, moot if F1 fixed)

- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Location:** `packages/core/src/entviz.ts:427`
- **Finding:**
  When the UTF-8 fallback path is taken, `typeName` is set to
  txt(${rawInput.length})->b64url. `rawInput.length` is a JS character count
  that can be an arbitrarily large integer (bounded only by V8's string limit).
  This integer is later embedded in the SVG label element via drawLabels.
  An integer rendered as a string is XML-safe (no special characters), so this
  is not an injection risk. However, for a very large input (if the pre-cap
  guard from F1 is not added), the typeName string would display a number like
  txt(10000000)->b64url in the top label -- misleading to the user. Since the
  byteLen > 64 guard throws before the SVG is produced, this typeName is never
  emitted to SVG output in any case. This finding is rendered moot if F1 is
  fixed, and is included only for completeness.
- **Exploit path:**
  None. The typeName is never emitted to SVG output for large inputs.
- **Recommendation:**
  No action needed beyond F1's pre-cap guard, which would throw before
  classifyInput is reached.

---

## Additional Patterns Noted

- **CSS override by hostile embedding page:** A page embedding entviz SVG can
  apply rules like circle{fill:black!important} to erase blank-map markers, or
  text{display:none} to hide cell labels. This is an inherent limitation of
  inline SVG in an untrusted host; worth documenting in a threat model (F4)
  but not a code defect.

- **npm audit at audit-level=high in CI:** CI runs npm audit with
  --audit-level=high. The lock file shows only two entries: @entviz/core
  (zero runtime deps) and react@19.2.7 (peer). The runtime attack surface
  via npm is therefore minimal. Positive control.

- **package-lock.json committed, npm ci in CI:** The lock file is 58 lines and
  committed, and CI uses npm ci (reproducible installs). The react peer is
  pinned to 19.2.7 with an integrity hash. Supply-chain posture is good.

- **CodeQL weekly re-scan:** .github/workflows/codeql.yml runs weekly on a
  schedule, targeting javascript-typescript. This catches newly-published
  CodeQL query findings against unchanged code. Positive control.

- **OIDC Trusted Publishing:** release.yml uses id-token: write and
  npm publish --provenance. The NPM_TOKEN secret is absent by design. This
  eliminates the highest-probability supply-chain attack vector.

- **persist-credentials: false on every actions/checkout:** All three workflow
  files include this on all checkout steps. A compromised step cannot use the
  default GITHUB_TOKEN to push.

- **GitHub Actions SHA-pinning:** All actions are pinned to full commit SHAs
  with node24-runtime versions. No mutable tags. Dependabot bumps the SHAs
  weekly.

- **No this.i file:** Security-relevant design decisions (escaping design,
  clip-path salt choice) live in code comments but not in a searchable intent
  record. Low concern for a port, but worth noting.

---

## Residual Unknowns

1. **Live npm audit result not run** (offline): known advisories in react@19.2.7
   or development tooling cannot be confirmed. CI's npm audit --audit-level=high
   covers this; no offline advisory check was performed here.

2. **Renderer not run on adversarial inputs** (medium effort, not deep):
   actual SVG bytes for entropy strings containing XML-hostile characters were
   not inspected. The structural analysis of esc() coverage gives high
   confidence, but byte-level verification would upgrade finding F2's
   recommendation from "add a test" to "add a test and confirm current output."

3. **Future parsers not yet ported:** CESR, SSH, SWHID, bech32, base58, etc.
   may introduce prefix/suffix strings with characters that have not been
   stress-tested for injection. The escaping property holds structurally, but
   field validation of those parsers' prefix/suffix content is unknown.

4. **@entviz/react not published to npm yet** (per release.yml comment):
   Trusted Publisher registration for @entviz/react on npmjs.com is noted as
   future work. If @entviz/react is published before that registration is done,
   the publish step would fail -- operational gap, not a security hole.

---

## Decisions Needed

1. **Pre-cap guard (F1):** What is the spec-defined maximum character count
   for the short-input path? A 2048-character limit covers all current corpus
   vectors with generous headroom. The maintainer should ratify the threshold.

2. **Threat model doc (F4):** Accept the recommendation to draft
   docs/threat-model.md? Offer to draft it from the material gathered in
   this review.

3. **Injection regression test (F2):** The test is low-effort (~10 lines) and
   would provide a durable safety net as parsers expand. Accept or note as a
   tracked follow-on?

---

## Findings Manifest

```yaml
findings:
  - id: SEC-F1
    persona: security-hawk
    title: classifyInput allocates a full base64url buffer before the byte-length cap fires
    severity: MEDIUM
    confidence: CONFIRMED
    location: packages/core/src/entviz.ts:650-656
    dedupe_key: render-unbounded
    recommended_disposition: recommend-fix
    rationale: >
      For large text inputs, classifyInput() allocates O(input-length) heap
      (UTF-8 buffer + base64url string) before the byteLen > 64 guard throws;
      a pre-call character-length check would make the cap O(1).
    revisit_condition: null
    fix_effort: small

  - id: SEC-F2
    persona: security-hawk
    title: No integration test exercises render() with SVG-hostile entropy strings
    severity: LOW
    confidence: CONFIRMED
    location: packages/core/test/integration/render.test.ts
    dedupe_key: text-channel-untested
    recommended_disposition: recommend-fix
    rationale: >
      Injection safety is structurally correct today but untested end-to-end;
      a ~10-line test with XML-hostile entropy would lock in the invariant as
      future parsers add prefix/suffix strings with special characters.
    revisit_condition: null
    fix_effort: small

  - id: SEC-F3
    persona: security-hawk
    title: React innerHTML comment understates event-handler residual risk
    severity: LOW
    confidence: CONFIRMED
    location: packages/react/src/Entviz.tsx:49-55
    dedupe_key: react-unsafe
    recommended_disposition: recommend-fix
    rationale: >
      The inline comment only covers text escaping; it should also name
      event-handler SVG attributes as the class of risk render() must never
      introduce, so future contributors understand the full invariant.
    revisit_condition: null
    fix_effort: small

  - id: SEC-F4
    persona: security-hawk
    title: No threat-model document names trust boundaries and accepted risks
    severity: LOW
    confidence: CONFIRMED
    location: docs/ (absent file)
    dedupe_key: threat-model-missing
    recommended_disposition: recommend-defer
    rationale: >
      Documentation gap only -- no exploitable hole -- but absence increases
      the probability a future contributor violates an implicit constraint;
      a one-page docs/threat-model.md would capture the escaping invariant,
      id-collision design, and accepted risks.
    revisit_condition: "When the first unported parser with non-null prefix/suffix lands."
    fix_effort: small

  - id: SEC-F5
    persona: security-hawk
    title: typeName echoes rawInput.length before the pre-cap guard (moot if F1 fixed)
    severity: LOW
    confidence: CONFIRMED
    location: packages/core/src/entviz.ts:427
    dedupe_key: cli-unbounded
    recommended_disposition: recommend-accept-risk
    rationale: >
      rawInput.length (a number, not a user string) is XML-safe and never
      emitted to SVG output because the byteLen > 64 guard throws before
      drawLabels is reached. Rendered moot if F1 is fixed.
    revisit_condition: null
    fix_effort: small
```

# TS/React Craftsmanship Review: entviz-js

**Date:** 2026-07-11
**Effort level:** deep
**Implementation commit:** 82f81ff11948b2e891ff9ec3acc38a2095764212 (main, v0.15.0)
**Context sources used:** README.md (root), AGENTS.md, CLAUDE.md, tsconfig.typedoc.json (strict mode confirmed), packages/core/src/entviz.ts (full, 2207 lines), packages/core/src/characterize.ts, packages/core/src/describe.ts, packages/core/src/compare.ts, packages/core/src/compare-walk.ts, packages/core/src/bytes.ts, packages/core/src/rng-guard.ts (react), packages/react/src/Entviz.ts, packages/react/src/EntvizPill.ts, packages/react/src/EntvizCompare.ts, packages/react/src/EntvizWalk.ts (header), packages/react/src/EntvizVoiceCompare.ts (header), packages/react/src/events.ts, packages/react/src/copy-actions.ts, packages/react/src/pill-messages.ts, packages/react/src/compare-messages.ts, packages/react/src/text-scale.ts, packages/react/src/rng-guard.ts, packages/react/src/index.ts; no tick marks found in packages/ source.

---

## Evidence Inventory

**@entviz/core** — all `src/*.ts` files read in full. Strictness: `strict: true` in tsconfig.typedoc.json (the only tsconfig that covers both packages). Node's native type-stripping runner never type-checks source at runtime, so the source must be clean under `strict` purely for consumer correctness and for the TypeDoc build. No `any` types found in core source; `as T` casts appear only at Map.get() call-sites where the key is proven to exist by surrounding control flow, and `as { version: string }` on the JSON import (correct narrowing). `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are NOT in force.

**@entviz/react** — all `src/*.ts` files read in full. TypeScript idiom assessed against the no-build-step / no-JSX / no-transform constraint. Vitest covers only `events.ts` and `rng-guard.ts`; the component files themselves are untested (no React Testing Library tests for the component rendering paths).

---

## Executive Summary

The codebase is technically solid: the typing is precise (no unguarded `any`), the security-critical paths are well-commented, and the React components correctly use hooks for their complexity. Against the grade-A bar for a widely-depended-on library the two meaningful divergences are: (1) `packages/core/src/entviz.ts` is a 2207-line monolith that fuses seven orthogonal concerns — parsing, fingerprinting, color, geometry, SVG helpers, the `El` builder, and the top-level orchestrator — making it impractical to navigate for a maintainer who needs to change one concern; and (2) throughout `@entviz/react`, `emit` is recreated as an unstable closure every render and then used inside `useEffect` callbacks whose dependency arrays suppress the exhaustive-deps lint rule, creating a class of stale-callback bugs where the firehose handler (`onEvent`) will not be updated in long-lived effects. These two issues have the highest future-change cost. A secondary craft inconsistency — `Entviz.ts` uses a different React import idiom than every other component — adds navigability friction but no runtime risk.

---

## Top Findings

### F1: `core/entviz.ts` monolith fuses seven orthogonal concerns in 2207 lines

- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Location:** `packages/core/src/entviz.ts:1–2207`
- **Finding:** A single file contains: (a) alphabet constants and the tokenizer (lines 44–141); (b) fingerprint/digest primitives (151–259); (c) color functions including Oklab lightness, palette selection, and CVD utilities (291–373); (d) grid geometry (377–417); (e) the full blockchain and identifier parser suite (448–1235); (f) the low-level SVG `El` builder and all `draw*` helpers (1317–2158); (g) the top-level `render()` orchestrator (1635–1931). Each of these is an independently-varying axis: the color model, the parser suite, the grid algorithm, and the SVG builder all have their own spec sections, their own test files (colors.test.ts, parsers.test.ts, geometry.test.ts, svg-el.test.ts), and their own change rates.
- **Consequence:** A reviewer or maintainer looking at a geometry change must mentally filter 2000 lines they are not responsible for; `git blame` and merge conflict probability scale with file size; understanding what a "stage function" does requires scanning past unrelated parser code to find it. The test infrastructure already respects the natural module boundary (unit tests import individual stage functions), so extracting the modules does not change the public API or test coverage.
- **Recommendation:** Extract at minimum: `alphabets.ts` (the `Alphabet` type + the nine constant alphabet objects + `detectAlphabetByDisproof`), `fingerprint.ts` (all fingerprint/digest primitives), `parsers.ts` (all `parse*` functions + `PARSE_FUNCS` + `parse`), `svg.ts` (the `El` class + all `draw*` / `border*` / `enumerate*` helpers, `n`, `esc`), and `color.ts` (all color functions). `render()` and `classifyInput()` stay in a thin `entviz.ts` that orchestrates. This splits six natural boundaries without changing any export signature.

---

### F2: `emit` is an unstable closure in `useEffect` dependency arrays across all three complex components

- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Location:** `packages/react/src/EntvizCompare.ts:291`, `packages/react/src/EntvizPill.ts:243`, `packages/react/src/Entviz.ts:64`
- **Finding:** Each component defines `emit` inline as `const emit = (init) => emitEvent(onEvent, source, seqRef, init)`. Because `onEvent` is a prop that may change across renders, `emit` is also a new function each render. All `useEffect` callbacks that call `emit` suppress the exhaustive-deps warning (`// eslint-disable-next-line react-hooks/exhaustive-deps`) and omit `emit` from their dependency arrays. Concretely: in `EntvizCompare`, the verdict-change effect `[result, medium, effProvenance]` (line 389–396), the reference-acquired effect `[refContent, medium]` (line 408–428), and the raster comparison effect `[medium, refContent, value, opts]` (line 365–381) all close over a `emit` that was current at the time the effect was last re-run — meaning a stale `onEvent` handler will be invoked until that specific deps set changes.
- **Consequence:** If a host passes a fresh `onEvent` (e.g., after re-mounting or replacing a callback), transition events — including the load-bearing `verdict.change` — will be routed to the OLD handler until an unrelated deps change re-runs the effect. The `verdict.change` event in particular is security-relevant (it backs the host's awareness of a comparison outcome). In Entviz.ts the error-event effect has the same pattern (line 127–130).
- **Recommendation:** The clean fix is to stop recreating `emit` each render. Two options:  
  (a) Store `onEvent` in a ref that is always current, and have `emit` read from the ref: `const onEventRef = useRef(onEvent); useEffect(() => { onEventRef.current = onEvent; }, [onEvent]);` — then `emit` can be a stable `useCallback(() => emitEvent(onEventRef.current, ...), [])` and need not appear in any effect dep array.  
  (b) Move `emit` into `events.ts` as a `useEmit(source, onEvent)` hook returning a stable `useCallback`. Option (a) is narrower; option (b) deduplicates the three call-sites.

---

### F3: `Entviz.ts` uses a different React import idiom than every other component

- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Location:** `packages/react/src/Entviz.ts:6–7, 63–90, 157`
- **Finding:** `Entviz.ts` opens with `import React from "react"` (a default namespace import) and calls all hooks as `React.useState`, `React.useRef`, `React.useEffect`, etc., throughout the base component (lines 63–130). Then, inside the controls branch, it defines `const h = React.createElement` (line 157) and switches to the `h()` shorthand for the controls subtree (lines 204–298). In contrast, every other component in the package (`EntvizPill.ts`, `EntvizCompare.ts`, `EntvizWalk.ts`, `EntvizVoiceCompare.ts`) opens with a named destructure: `import { createElement as h, useEffect, useRef, useState, … } from "react"` and uses `h()` throughout.  
  Within `Entviz.ts` itself, the pre-controls path uses `React.createElement` implicitly (via JSX-free `React.createElement` calls that were never aliased), while the controls path uses `h`. A developer adding code to the non-controls path will naturally follow `React.xxx`; one adding to the controls path will follow `h()` — leading to further divergence.
- **Consequence:** A reader must track two parallel idioms within one file and across the package. The `import React from "react"` default import also makes the package more dependent on React's legacy default export, which may matter under module-resolution edge cases for consumers using certain bundlers with `@entviz/react`'s raw-TS exports. Small navigability tax now, larger divergence as the component grows.
- **Recommendation:** Align `Entviz.ts` with the package's established idiom: replace `import React from "react"` with the named destructure (`import { createElement as h, useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactElement } from "react"`), and replace all `React.xxx` with the destructured names and `h()`. Remove the `const h = React.createElement` local alias (it was only needed because `h` was not yet in scope). The result is consistent with the other four components.

---

### F4: `onMenuKey` ARIA keyboard handler is copy-pasted between `Entviz.ts` and `EntvizPill.ts`

- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Location:** `packages/react/src/Entviz.ts:186–193`, `packages/react/src/EntvizPill.ts:412–419`
- **Finding:** Both components implement the same roving-focus menu keyboard handler (ArrowDown wraps, ArrowUp wraps, Home goes to first, End goes to last). The logic is functionally identical — the only structural difference is how each finds its menu items: `Entviz.ts` queries from `e.currentTarget` (the non-portaled menu element is always a local DOM child); `EntvizPill.ts` queries from `menuFloat.ref.current` (the menu is portaled, so `currentTarget` would be wrong). The four-key dispatch (ArrowDown, ArrowUp, Home, End) is character-for-character the same.
- **Consequence:** A future spec change to the ARIA menu keyboard pattern (e.g., adding Tab handling, or wrapping behavior) must be applied in both places. The two implementations will drift. `EntvizVoiceCompare.ts` and `EntvizWalk.ts` may add their own menus later.
- **Recommendation:** Extract a `menuKeyHandler(getItems: () => HTMLElement[])` utility in, say, `keyboard.ts`, that returns the `onKeyDown` handler. Callers pass a factory that retrieves menu items by whichever lookup is correct for their context (`() => [...el.querySelectorAll('[role="menuitem"]')]` for local; `() => [...ref.current?.querySelectorAll('[role="menuitem"]') ?? []]` for portaled). The factory pattern accommodates both call-sites without coupling them.

---

### F5: `core/entviz.ts` public surface exports geometry/draw internals needed by tests but unguarded from consumers

- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Location:** `packages/core/src/entviz.ts:1563, 1940, 1951, 1962, 1974, 1990, 2074, 2104, 2109, 2114, 2122`
- **Finding:** To satisfy the `AGENTS.md` unit-test architecture (which tests individual stage functions directly by importing them), `entviz.ts` exports a large set of implementation-detail functions: `drawBlankCells`, `boxOrigin`, `drawQuartileMark`, `twoBitUsage`, `twoBitFirstAppearance`, `drawColorBar`, `drawLabels`, `borderLine`, `enumerateInteriorCorners`, `enumerateExternalCorners`, `drawEllipse`. None of these are used by `@entviz/react` or by any consumer of the library; they are imported only by test files. They thus appear in TypeDoc's generated API documentation and in consumers' autocomplete as if they were part of the deliberate public surface.
- **Consequence:** Consumers may begin depending on these functions, which are implementation details of the SVG renderer. Changing `drawBlankCells`'s signature (e.g., to accommodate a new spec requirement) becomes a semver-breaking change for no reason. TypeDoc pages are polluted with 10+ helper functions that a consumer will never call.
- **Recommendation:** The cleanest resolution is to extract the SVG helpers into `packages/core/src/svg.ts` (a separate module, as suggested under F1) and NOT re-export that module from `entviz.ts`. Tests can import from `../../src/svg.ts` directly — the repo's tests already use direct `.ts` specifiers. This removes the helpers from the public surface without touching the test coverage floor. If the F1 extraction is deferred, a comment block above the helper exports (e.g., `// --- test-only internals, not part of the public API ---`) at minimum signals intent and blocks future doc generation with `@internal` JSDoc tags.

---

## Additional Patterns Noted

- **`rng-guard.ts` (react) `isProduction()` relies on `process.env.NODE_ENV`**: this is the standard bundler convention and works correctly in all common bundlers (Vite, webpack, esbuild), but a consumer using Node's native TS runner (which `@entviz/core` is designed for) without setting `NODE_ENV=production` will get dev behavior. The comment in the file already acknowledges this; it is consistent with the stated security model. No change needed; noted as a residual.

- **`EntvizPill.ts` `useInjectStyles` uses `useLayoutEffect`**: injecting a `<style>` tag on every mount is correct; the `typeof document === "undefined"` guard handles SSR. React emits a warning on the server for `useLayoutEffect` regardless, but suppressing this is a DX/packaging question, not a craft one. The alternative is `useEffect` (defers injection by one frame, avoiding the server warning at the cost of a flash on first render). Neither is wrong; the current choice avoids a paint flash.

- **`EntvizCompare.ts:525`**: `(res as { status?: number }).status ?? 0` — the `as` cast is needed because the `fetch` `Response` type does not need narrowing (it always has `.status`). This cast is unnecessary; `res.status` works directly. Minor.

- **`characterize.ts:94`**: the `pickKey` locale matching uses a regex `/hant|\b(tw|hk|mo)\b|-(tw|hk|mo)/` for Traditional Chinese detection. The `\b` word-boundary does not apply to the hyphen-delimited BCP-47 tags (hyphen is a word-boundary). The pattern still works because the outer `t.startsWith("zh")` pre-filters, but the `\b` is misleading. A simpler `/(hant|tw|hk|mo)/i` or explicit split-based match would be clearer.

- **`EntvizCompare.ts` `looksLikeSecret`**: the mnemonic-phrase heuristic (12–24 words, each 3–8 lowercase letters) would match many non-secrets (e.g., a poem fragment). This is called out in the component's own comments as a heuristic, not a firewall. The craft concern is the over-detection risk surfacing a banner to a non-secret paste; this is an acceptable design trade-off per the comparison-design doc. No craft action needed.

---

## What's Done Well

- **Zero `any` types in core.** The core's type surface is precise throughout: discriminated unions are handled with exhaustive `never` guards in characterize.ts, nullability is modeled honestly (`parse` returns `Parsed | null`, `medianToken` returns `Token | null`), and all `as T` casts are justified by the surrounding control flow. The `strict` tsconfig setting is in force and the code earns it.

- **Security-critical paths are documented at the decision point.** The LOAD-BEARING fingerprint comment (line 146), the EIP-55 `validateEip55` rejection comment (line 519), the allowlist-closed acquisition gate (`allow ? allow.x === true : true`, never `?? true`), and the verdict-string locking in `EntvizCompare` are all commented with the exact failure mode they prevent — exactly the kind of "why, not what" comment that earns its keep. A future maintainer can understand the invariant without reading a spec.

- **React hook discipline is sound in the non-emit dimension.** `useMemo` and `useCallback` are used where identity actually matters (the memoized `opts` object in `EntvizCompare`, the `dispOpts` derivation). State is not duplicated from props. The controlled/uncontrolled disclosure pattern in `EntvizPill` is correctly implemented with a single `isOpen` derivation gate.

- **No-build-step React idiom is consistent and correct.** The `createElement as h` destructure, extension-ful `.ts` specifiers, `import type` for type-only imports, and the browser-safe `@noble/hashes` dependency in core are maintained correctly. The `rng-guard.ts` production gate (always CSPRNG in production, regardless of injected `rng`) is a clean, single-function, single-responsibility module.

- **`entviz.ts` parsing section is admirably DRY for what it does.** The blockchain checksum validators (`base58checkOk`, `bech32ChecksumValid`, `cashaddrVerify`) are factored as standalone verifiers shared across Bitcoin/Litecoin, Cardano Shelley, and generic Bech32. The `PARSE_FUNCS` dispatch table makes the parser order explicit. The near-identical checksum error message strings (`{name} fails its {algorithm} checksum`) are not yet templatized, but each is at a unique call-site so the duplication cost is low in practice.

---

## Residual Unknowns

- **`noUncheckedIndexedAccess`**: the tsconfig does not enable this flag. Arrays are indexed freely (e.g., `tightest.get(rows) as number`). Enabling it would surface whether any array indexing is unsafe beyond what the existing `as number` casts already acknowledge. A one-time `tsc --noUncheckedIndexedAccess` run over the source would settle this.

- **`emit` stale closure (F2) practical impact**: without a test that changes `onEvent` mid-render and checks which handler receives `verdict.change`, it is unknown whether any host in the wild is affected. A targeted `vitest` test in `packages/react/test/` that replaces the `onEvent` prop between a reference acquisition and a verdict resolution would confirm or refute the stale-handler scenario.

---

```yaml
findings:
  - id: CRAFT-F1
    persona: tsreact-craftsmanship
    title: core/entviz.ts is a 2207-line monolith fusing parsing, fingerprinting, color, geometry, SVG, and orchestration
    severity: HIGH
    confidence: CONFIRMED
    location: packages/core/src/entviz.ts:1-2207
    dedupe_key: core-monolithic
    recommended_disposition: recommend-fix
    rationale: Seven orthogonal concerns in one file make every review, merge conflict, and change harder; the test architecture already respects the natural splits.
    revisit_condition: null
    fix_effort: medium
  - id: CRAFT-F2
    persona: tsreact-craftsmanship
    title: emit is an unstable closure used inside useEffect dep arrays that suppress the exhaustive-deps lint rule
    severity: HIGH
    confidence: CONFIRMED
    location: packages/react/src/EntvizCompare.ts:291,packages/react/src/EntvizPill.ts:243,packages/react/src/Entviz.ts:64
    dedupe_key: react-emit-stale-closure
    recommended_disposition: recommend-fix
    rationale: A host that passes a new onEvent handler after a raster comparison starts will receive verdict.change on the old handler; a ref-based stable emit eliminates the entire class of stale closures.
    revisit_condition: null
    fix_effort: small
  - id: CRAFT-F3
    persona: tsreact-craftsmanship
    title: Entviz.ts uses React default-import namespace idiom while every other component uses named destructured imports
    severity: MEDIUM
    confidence: CONFIRMED
    location: packages/react/src/Entviz.ts:6,157
    dedupe_key: entviz-react-import-inconsistent
    recommended_disposition: recommend-fix
    rationale: Two parallel idioms within one package and within one file impose navigability tax and will compound as the component grows.
    revisit_condition: null
    fix_effort: small
  - id: CRAFT-F4
    persona: tsreact-craftsmanship
    title: ARIA menu keyboard handler duplicated between Entviz.ts and EntvizPill.ts
    severity: MEDIUM
    confidence: CONFIRMED
    location: packages/react/src/Entviz.ts:186,packages/react/src/EntvizPill.ts:412
    dedupe_key: menu-keys-duplicated
    recommended_disposition: recommend-fix
    rationale: A pattern-spec change (e.g., adding Tab handling or changing wrap behavior) must be applied in two places and will drift.
    revisit_condition: null
    fix_effort: small
  - id: CRAFT-F5
    persona: tsreact-craftsmanship
    title: Internal geometry/draw helpers are exported from the public surface to serve test imports only
    severity: LOW
    confidence: CONFIRMED
    location: packages/core/src/entviz.ts:1563,1940,1951,1962,1974,1990,2074,2104,2109,2114,2122
    dedupe_key: core-draw-helpers-overexposed
    recommended_disposition: recommend-defer
    rationale: Consumers may inadvertently depend on test-only helpers, turning implementation details into a semver surface; resolved naturally if F1 extraction moves helpers to a non-re-exported module.
    revisit_condition: Resolves if F1 extraction is implemented; otherwise add @internal JSDoc to suppress TypeDoc.
    fix_effort: small
```

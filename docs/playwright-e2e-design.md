# Playwright browser E2E for `@entviz/react` — design

**Status:** design, pre-implementation. **Audience:** implementers of `@entviz/react`.
**Tracks:** `tick 2sky` ("playwright tests on the react", idea → to be graduated to a
committed todo on approval).
**Depends on:** the existing Vitest/jsdom suite (`packages/react/test/`), the
`rng-guard` production gate (`packages/react/src/rng-guard.ts`), the event surface
(`packages/react/src/events.ts`), and the Vite playground (`apps/playground/`).

This doc scopes a real-browser end-to-end layer. It is deliberately narrow: Playwright
earns its keep **only** where a real browser engine sees something jsdom cannot. Anything
the 315-test Vitest suite already covers stays there — E2E must not become a slower,
flakier copy of it.

---

## 1. Why — the gap Vitest cannot close

The Vitest suite runs in **jsdom** with a load-bearing set of fakes in
`test/setup.ts`. Those fakes are exactly the browser-only surfaces E2E exists to exercise:

| jsdom fake (today) | What a real browser would actually exercise |
|---|---|
| `getBoundingClientRect` → **hardcoded 100×20** | Real geometry: pill compare-width sizing, **reshape/responsive** (`display.reshape`, cols/rows/`targetAr`), font `display.resize` (`fontSizePt`), menu/popover positioning |
| `canvas.getContext`/`getImageData` → **synthetic gray ring** | Real image decode + 2D raster: `rasterCompare`, the fidelity probe, `raster-text.ts` (the file whose operator-precedence bug shipped undetected — jsdom's fake `getImageData` structurally cannot catch it) |
| `clipboard.writeText`/`write` → `vi.fn()` no-ops | Real clipboard: `ClipboardItem` with SVG/PNG blobs, permission prompts, focus requirements |
| `Image.src` → instant fake `onload` | Real fetch/decode of a pasted / dropped / URL reference |
| — | Real focus management + keyboard nav through the menu & popover in an engine with a real a11y tree |

**One-line motivation:** the raster precedence bug is the existence proof — a class of
defects lives entirely below jsdom's fakes, and only a real engine surfaces it.

## 2. Non-goals (what E2E must NOT do)

- **Re-test verdict logic / event emission / the walk & ceremony state machines.** Those
  are pure and already covered in Vitest — cheaper and more thorough there.
- **Pixel-perfect snapshot testing of the raster path in v1.** Screenshot diffs are
  flaky across OS/font stacks and turn into a maintenance tax. (Revisit only after the
  DOM/geometry layer is stable, and if so, pin to Playwright's bundled Chromium **only**
  with a tolerance threshold — see §5.)
- **Cross-browser matrix in v1.** Chromium only. WebKit/Firefox is a later, explicit
  decision, not a default.
- **Testing the playground's own showcase UI.** The playground is a means (a host page to
  mount components in), not the subject.

## 3. Scope — prioritized browser-only coverage

**P0 — geometry & the raster path (the two gaps with proven defect history):**
- Pill mounts with **real** measured layout; the compare-width sizing that the
  "structural compare-width fix" (v0.15.1) addressed reflects a real `getBoundingClientRect`,
  not the constant fake.
- Drill pill → Visualize → real SVG renders; **reshape** to a target aspect ratio emits a
  `display.reshape` with sane cols/rows; **font resize** emits `display.resize`.
- Compare a text reference against the value through the **real** raster/text path and
  reach a verdict (order-independent — see §5).

**P1 — clipboard & reference acquisition:**
- Copy actions write real `ClipboardItem`s (SVG + PNG) and the `copy` event reports `ok`.
- A pasted / URL reference is really decoded (`reference.acquired`, `reference.mediumDetected`).

**P2 — a11y & responsive in-engine:**
- Keyboard-only: tab into the pill, open the menu, arrow through `menuitem`s, Escape closes
  and restores focus — asserted against the real focus ring and computed roles.
- Narrow viewport: the pill/compare layout adapts (no overflow, controls reachable).

Voice/walk deep flows are reachable (via the pill drill-down) but are **P1-at-most** and
only for **order-independent** outcomes (§5) — their logic is a Vitest concern.

## 4. Harness — a dedicated `/e2e` fixture, not the showcase App

The showcase `App.tsx` renders **only `<EntvizPill>`**, wires `onCompare`/`onError` to
`console.log`, injects **no `rng`**, and exposes **no `onEvent`, no `data-testid`, no
query-param prop injection**. Retrofitting it with test affordances would pollute the demo
and still not reach every component/state deterministically.

**Decision:** add a dedicated fixture page in the playground — a second Vite entry
(`apps/playground/e2e.html` + `src/e2e.tsx`, alongside the existing `calibrate.html`
pattern) — that:

1. **Reads props from query params** — `value`, `mode`, `locale`, `fontSizePt`, `theme`,
   `posture`, and `seed`. Each spec navigates to a fully-specified URL; no shared mutable
   state between tests.
2. **Injects a seeded `rng`** (a small LCG keyed by `seed`) into the components. Honored
   only in dev (§5) — this is a legitimate use of the `rng` DevX affordance, **not** a
   production bypass; the `rng-guard` gate stays airtight and untouched.
3. **Captures the event firehose** — `onEvent` pushes into `window.__evz.events` (and
   maintains `window.__evz.counts[type]`), so specs assert on the real emitted stream
   instead of scraping the DOM.
4. **Anchors stable selectors** — `data-testid` on the mount root and a few key controls,
   plus reliance on existing ARIA roles (`tab`, `menu`, `menuitem`, `progressbar`).

This keeps the demo pristine and gives specs a deterministic, fully-addressable surface.

**Safety boundary for affordances.** Test hooks are fair game because the playground is
`private: true` — it is **never published**, so nothing here reaches the shipped `@entviz/*`
packages. The one hard rule: **never weaken `safeRng` / the rng production gate** to gain
determinism. That gate is a security property of the *shipped* react package (§5a); a
prod-parity bypass would defeat the unpredictable-sampling defense. Determinism comes from
order-independence and, where truly needed, a non-production build mode of the *unpublished*
fixture — not from touching the gate.

## 5. Determinism strategy

Three sources of nondeterminism, each with a decision:

**(a) `rng` / sampling order — the prod gate (confirmed).** `safeRng` discards an injected
`rng` whenever `isProduction()` (`process.env.NODE_ENV === "production"`) and returns the
platform CSPRNG — pinned by `rng-guard.test.ts:18` ("under NODE_ENV=production the injected
rng is IGNORED"). This is the security property, not a quirk: voice/walk draw their check
*order* from an unpredictable source, so a predictable order shipped to production would let
an attacker pre-forge exactly the sampled cells → a false NO-DIFFERENCE (compare design
§5.4). Vite sets `NODE_ENV=production` in `vite build`/`preview` and leaves `process`
undefined under the `vite` dev server (`rng-guard.test.ts:46`: "process undefined ⇒ not
production ⇒ honored"). Consequences for E2E:
- **Default: order-INDEPENDENT assertions against a production-parity build.** "Answer
  *matches* for every planned cell → NO-DIFFERENCE" holds under any order (exactly how the
  Vitest `driveMatchAll` helper works), so it needs **no seed** and runs against
  `vite preview` — which is also what we want for geometry/raster/clipboard parity.
  This removes the rng problem from ~all flows.
- **Exception, only for an order-SPECIFIC spec:** serve the fixture in a **non-production
  Vite mode** (dev, or an explicit test mode) where `safeRng` honors the injected seed.
  This touches only the unpublished playground.
- We do **not** add a production rng bypass — the gate stays airtight; tests bend to it.

**(b) Layout/async timing.** Use Playwright's auto-waiting locators and web-first
assertions (`expect(locator).toHaveText`, `toBeVisible`) — never fixed `sleep`s. Assert on
the captured event stream (`window.__evz`) for lifecycle milestones rather than racing the
DOM.

**(c) Raster pixels.** v1 asserts **structural DOM/geometry + emitted verdicts**, not pixel
buffers. The real `<canvas>` path runs (so a precedence-class bug throws or yields a wrong
verdict), but we assert the *verdict/coverage*, not a screenshot. Pixel snapshots are a
deferred, opt-in follow-up (Chromium-only, thresholded).

## 6. Concrete changes required (implementation checklist)

- `apps/playground/`: new `e2e.html` + `src/e2e.tsx` fixture (query-param props, seeded
  `rng`, `window.__evz` event capture, `data-testid`s). Add the entry to `vite.config.ts`
  (it already multi-entries `calibrate*`).
- Root/react: add `@playwright/test` as a devDep; `npx playwright install --with-deps
  chromium` in CI.
- `playwright.config.ts` (repo root): `testDir` = `packages/react/e2e/`, `webServer` runs
  the **production-parity preview** by default (`npm run build && npm run preview -w
  @entviz/playground`) so P0/P1 run against the shipped-shape bundle; an order-specific
  spec (rare) opts into a dev-mode server variant where the seed is honored (§5a).
  `projects` = chromium only, `use.baseURL` = the preview server, retries=1 in CI, trace on
  first retry.
- `packages/react/e2e/*.spec.ts`: P0 specs first (§3), then P1.
- `package.json`: `test:e2e` script (`playwright test`), wired so it is **not** part of the
  default `npm test` (keep the fast Vitest gate fast); E2E runs as its own CI job and,
  optionally, in `release.py`'s gate (decide in §8).

## 7. CI shape

A new `e2e` job in `ci.yml`, node24 runtime, pinned action SHAs consistent with the
rest of the file (`actions/checkout` v7.0.0, `actions/setup-node` v6.4.0 as already used).
Cache the Playwright browser download keyed on the resolved `@playwright/test` version
(verify the cache action's node24 runtime per the repo's GH-Actions-version rule before
pinning). Upload the HTML report + traces as an artifact on failure.

**Open decision (see §9):** is `e2e` a **required** check, and does `release.py`'s
`run_gate()` also run it? Leaning: required in CI, but keep it **out** of `release.py`'s
gate initially (browser install makes a local release slow); revisit once it is proven
non-flaky.

## 8. Rollout / phasing

1. **Walking skeleton** — Playwright + config + the `/e2e` fixture + **one** P0 spec that
   proves the geometry gap (real `getBoundingClientRect` drives pill compare-width). Green
   in CI. This de-risks the toolchain before volume.
2. **P0 batch** — geometry/reshape/resize + the real raster verdict path.
3. **P1 batch** — clipboard + reference acquisition.
4. **P2 batch** — keyboard a11y + narrow-viewport responsive.
5. Reassess pixel snapshots and cross-browser as separate, explicit ticks.

## 9. Open questions (resolve before/with implementation)

1. **Required check?** Make `e2e` block merge, or advisory until its flake rate is known?
2. **`release.py` gate?** Include E2E in the release gate, or keep it CI-only for now?
3. **Fixture location** — a second playground entry (proposed) vs. a standalone
   `packages/react/e2e/fixture/` mini-app. The playground reuses existing Vite wiring; the
   standalone keeps demo and test fully separate. (Proposed: playground entry.)
4. **Clipboard permissions** — grant via Playwright context (`permissions: ['clipboard-read',
   'clipboard-write']`); confirm the copy-actions path is drivable headless.

## 10. Provenance

Scoped 2026-07-16 against the state at `v0.15.2`, after the TypeDoc type-hygiene pass
(`1d103fc`) whose raster-text precedence bug is the motivating example in §1 — a defect the
jsdom suite structurally could not have caught. Consistent with the repo's design-first
methodology (`docs/intent-methodology.md`): this doc is the workshop for `tick 2sky`; on
approval it graduates the idea into a committed implementation todo.

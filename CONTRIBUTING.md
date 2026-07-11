# Contributing to entviz-js

Thanks for your interest in `entviz-js` — the TypeScript/React port of
[entviz](https://github.com/dhh1128/entviz). This guide is for **human
contributors**; agent-oriented instructions live in
[`AGENTS.md`](AGENTS.md), which goes deeper on several of the rules summarized
here.

## The shape of the project

This is an npm workspace with two published packages and a demo app:

- **`packages/core`** (`@entviz/core`) — the pure renderer. Parses a
  high-entropy value and emits an SVG string. **No UI.**
- **`packages/react`** (`@entviz/react`) — React components over the core.
- **`apps/playground`** (`@entviz/playground`, unpublished) — a Vite dev app.

**The normative spec and the reference implementation live in a *different*
repo:** [`entviz`](https://github.com/dhh1128/entviz) (Python). `docs/spec.md`
there is the source of truth for the algorithm, and its `compliance/` corpus is
the shared conformance suite that every implementation (Python, JS, Rust, Go,
Java) is checked against. **This repo must never diverge from that spec.** New
*features* can be added here, but algorithm/behavior changes belong in the spec
first. Keeping the sister repo checked out as a sibling directory
(`../entviz`) makes running the conformance suite (below) easy.

## Non-obvious rules you will trip over if you don't read them

These three constraints aren't visible from a casual read of the code, and
violating them causes confusing CI failures:

1. **`@entviz/core` must stay isomorphic (browser-safe).** It may **not** import
   `node:` built-ins (`node:crypto`, `node:fs`, `Buffer`, …) or touch the DOM.
   Hashing goes through [`@noble/hashes`](https://github.com/paulmillr/noble-hashes),
   its only runtime dependency. This is what lets the core bundle for the browser
   (it backs `@entviz/react`). If you need bytes/encoding helpers, use
   `packages/core/src/bytes.ts`.
2. **The packages ship raw `.ts` and are authored with `React.createElement`,
   not JSX — no build step.** Components use `import { createElement as h }` and
   call `h(...)`. Match that style; don't introduce JSX into the library source.
   (Your *own* app consuming the library can use JSX freely; and see the README's
   *Bundler configuration* note for consumers on webpack/Next.js.)
3. **The `tick` ledger.** Tasks, tech debt, and rationale are tracked in a local
   [`tick`](https://github.com/dhh1128/tick) ledger (an orphan `tick` branch),
   not in GitHub issues alone. A code location may carry a **mark** — the sigil
   `~` followed by a 4-char id (e.g. `~4mz3`). **Before editing a file, grep it
   for marks** (`rg '~[2-7][a-z2-7]{3}\b' <file>`) and read what they reference
   (`tick show <id>`): a mark means recorded context exists for that spot.

## Setup

- **Node ≥ 22.6** is required (the packages run under Node's native
  type-stripping). The repo pins Node **24** via `.nvmrc` — `nvm use` picks it up.
- Install from the repo root: `npm install` (installs the whole workspace).
- Run the playground: `npm run dev -w @entviz/playground` → http://localhost:5173

## Testing — strict TDD, two gates

Follow **test-driven development**: write one or more failing tests that capture
each requirement (happy path *and* edge/unhappy paths) **before** implementing,
then implement until green. **Never commit unless all tests pass, and never let
coverage of code you touched decrease.**

### `@entviz/core` — two suites, run in order

`npm test` (from `packages/core`) runs **both** gates; either failing fails the
build, and CI runs the same command:

```sh
cd packages/core
npm test            # test:unit then test:full — both must pass
npm run test:unit   # pure unit tests only (must NOT call render())
npm run test:full   # unit + integration, with the full-coverage floors
```

- `test/unit/` — pure tests of the individual stage functions (`tokenize`,
  `classifyInput`, `computeGeometry`, …). **They must not call `render()`.**
- `test/integration/` — end-to-end `render()` tests that confirm the stages are
  wired together.

Enforced floors (do **not** weaken them):

- **Unit suite alone:** ≥ **80 % lines** of `src/`. This is load-bearing — the
  bulk of coverage must come from real unit tests, not from `render()` running
  end-to-end as a side effect. **If you add logic inside `render()`, extract it
  into a small exported function and unit-test that** so the unit gate still
  clears 80 %.
- **Full suite (unit + integration):** **100 % lines, 100 % functions, ≥ 95 %
  branches** of `src/`.

The few uncovered branches are **provably-unreachable defensive guards** — keep
them; don't delete safety code to chase 100 %.

### `@entviz/react`

```sh
cd packages/react
npm test            # vitest run --coverage (jsdom)
```

Floors: **100 % lines, 100 % functions, ≥ 90 % branches** of `src/`. Tests are
authored with JSX (Vite transforms it) even though the components are not.

### Conformance (rendered correctness)

The cross-language **conformance harness** in the sister `entviz` repo is the
authority on whether the renderer is correct — run it after any change to the
renderer:

```sh
# from ../entviz (the reference repo):
PYTHONPATH=src:. python -m compliance.runner \
  --impl-cmd 'node <abs path>/entviz-js/packages/core/src/cli.ts' --tiers A
```

See [`README.md`](README.md) → *Conformance* and [`CERTIFICATION.md`](CERTIFICATION.md).

## Spec version & drift

Every rendered SVG stamps the spec revision it targets (`SPEC_VERSION` in
`packages/core/src/entviz.ts`). The release **minor tracks the spec major**
(`0.<spec-major>.x`). CI checks `SPEC_VERSION` against the reference and warns on
drift. **Releases are cut by a maintainer** with `scripts/release.py` — please
don't bump versions or push tags in a PR.

## Submitting a change

1. Branch from `main`.
2. Make focused, logically-scoped commits. **Sign off every commit** (`git commit
   -s`) — this repo follows the DCO, so each commit needs a `Signed-off-by:`
   trailer matching the author.
3. Ensure **both** package test suites pass locally (`npm test` in each package
   you touched) and coverage floors hold. If you changed the renderer, run the
   conformance suite.
4. Open a PR against `main` with a clear description of what changed and why.

Spelling note: this codebase uses US spelling throughout — **`color`, never
`colour`** — in code, comments, docs, and user-facing strings.

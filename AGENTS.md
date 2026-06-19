This repo is a port of a sister repo, https://github.com/dhh1128/entviz, which
contains the entviz spec, other important documentation, and the reference impl
of entviz in python. The repos are intended to be sister folders on disk and
may already exist in your dev environment. New features can be added here,
but should never violate the specification or the documentation about the
entviz technology that have their definitive embodiment in the entviz repo. 

<!-- >>> tick stanza >>> (managed by `tick init`) -->

## Task tracking: `tick`

This repo tracks tasks, tech debt, and ideas in a local [`tick`](https://github.com/dhh1128/tick)
ledger (an orphan `tick` branch; the `tick` CLI is the interface). Reads are plain
files — do **not** use an external API for task tracking.

- **First, if a `tick` command says the repo isn't initialized**, run `tick init`
  once to connect this clone to the ledger — it adopts the existing remote ledger
  if a colleague already set one up, or creates a new one otherwise.
- **A tick mark is the sigil `~` immediately followed by a digit-first 4-char
  base32 id** (the id part looks like `4mz3`, so the full mark is that id with a
  leading `~`). It pins a tick to a code location.
- **Before editing a file**, grep it for marks and read what they reference:
  `rg '~[2-7][a-z2-7]{3}\b' <file>` then `tick show <id>`. A mark means recorded
  context exists for that spot — read it first.
- **Search** existing ticks with `tick grep <text>`; **list** with `tick ls`.
- **Capture** new work with `tick add "<title>"` and place the printed mark
  (`~` + the new id) at the relevant code spot.
- When your change **resolves** a tick, run `tick off <id>` and **delete the
  mark(s)** it reports still in the code.

<!-- <<< tick stanza <<< -->

## Testing Protocol

This repository has an established test suite. Follow strict TDD:
1. Write one or more failing tests that capture each requirement (including
   both happy paths and its edge cases/unhappy paths) before implementing.
2. Implement until all tests pass.
3. Never commit unless all tests pass. Coverage of any code you touch
   must not decrease.

### Two test suites + coverage guardrail (do not weaken)

`@entviz/core` tests are split deliberately, and `npm test` runs **both gates in
order** (`test:unit` then `test:full`); either failing fails the build, and CI
runs the same `npm test`:

- **`packages/core/test/unit/`** — pure unit tests that **must NOT call
  `render()`**. They exercise the individual stage functions (`tokenize`,
  `classifyInput`, `computeGeometry`, `fingerprintEdgeCells`, `drawColorBar`,
  `drawBlankCells`, …) directly, with real assertions on their outputs.
- **`packages/core/test/integration/`** — end-to-end `render()` tests that
  confirm the orchestration wires the stages together.

Enforced floors (Node's built-in `--test-coverage-*`):
- **Unit suite alone:** ≥ **80 % lines** of `src/`. This is the load-bearing
  rule: the bulk of coverage must come from real unit tests, not from
  `render()` running end-to-end as a side effect. If you add logic to
  `render()`, **extract it into a small exported function and unit-test that** —
  do not let `render()`'s integration coverage paper over an untested helper.
- **Full suite (unit + integration):** **100 % lines, 100 % functions, ≥ 95 %
  branches** of `src/`.

When you add a feature: add its unit tests first (TDD), and if it lands inside
`render()`, extract the logic so the unit gate still clears 80 %. The remaining
uncovered branches are a small set of provably-unreachable defensive guards
(e.g. the `tokenizeFingerprint` ftok-count assertion, the `drawEllipse`
degenerate-geometry guards); keep them, and keep the branch floor honest rather
than deleting safety code to chase 100 %. The cross-language **conformance
harness** in the sister `entviz` repo (`compliance/runner.py`, Tier A + B) is
the authority on rendered correctness — run it after any change to the renderer
(see `README.md` → Conformance and `CERTIFICATION.md`).

## CI and Documentation

This repo has CI: `.github/workflows/ci.yml` builds and tests on every push
and pull request, and runs a spec-sync + Tier-A conformance check against the
entviz reference. Releases are cut by `scripts/release.py` and published by
`.github/workflows/release.yml` on a `vX.Y.Z` tag.

When writing or modifying GitHub Actions workflows, always use the latest
stable release of each action. Avoid versions pinned to Node.js 16 or
Node.js 20 (both deprecated by GitHub). In 2026, this meant to prefer Node.js
24-compatible versions, but the standard may evolve over time. Check the GitHub
Marketplace for each action's current release.


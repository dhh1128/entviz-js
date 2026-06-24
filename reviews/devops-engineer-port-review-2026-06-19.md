# DevOps / CI/CD Review: entviz-js

**Date:** 2026-06-19
**Effort level:** medium
**Run label:** port-review-2026-06-19
**Mode:** unattended
**Context sources used:** `AGENTS.md`, `README.md`, `CERTIFICATION.md`, `SECURITY.md`, `scripts/release.py`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `.github/workflows/codeql.yml`, `.github/dependabot.yml`, `.github/instructions/infra.instructions.md`, `package.json`, `packages/core/package.json`, `packages/react/package.json`, `.gitignore`, `git ls-files` (full tracked-file enumeration), SHA → runtime verification via `curl` for `actions/checkout`, `actions/setup-node`, and `github/codeql-action`.

---

## Evidence Inventory

**Files read:** all workflow YAML files, both workspace `package.json` manifests, the root `package.json`, the `release.py` script, `AGENTS.md`, `README.md`, `CERTIFICATION.md`, `.gitignore`.

**Action SHA resolution:** three actions verified online:
- `actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0` (`# v7.0.0`) → `using: node24` ✓
- `actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e` (`# v6.4.0`) → `using: 'node24'` ✓
- `github/codeql-action/init@8aad20d150bbac5944a9f9d289da16a4b0d87c1e` (`# v4.36.2`) → `using: node24` ✓

**Suite run:** not run (this is a read-only review; running `npm test` on the tagged release commit would be non-trivial from outside the repo and is not required at medium effort).

**Drift-check note:** this is a JavaScript/TypeScript monorepo, not the Python reference repo. There are no generated-asset drift checks (`test_figures.py`, `gallery.py`, etc.) here; those belong to the `entviz` reference repo. The JS repo's CI discipline is the `package-lock.json`-enforced reproducibility (via `npm ci`), the test suite coverage floors, and the Tier-A conformance harness.

**Prior OPS findings from `entviz` (Python) repo:** OPS-F1 (release ungated), OPS-F2 (docs deploy ungated), OPS-F4 (build not `--frozen`), OPS-F3 (branch/tag protection), OPS-F5 (README badges). These were scoped to the Python reference repo. The JS port has its own CI and no docs-deploy workflow. I assess each finding independently below.

---

## Executive Summary

The `entviz-js` pipeline is in strong shape for a first-release JS port. Actions are SHA-pinned to node24 runtimes, `npm ci` enforces lockfile integrity, Dependabot covers both npm and GitHub Actions ecosystems, OIDC Trusted Publishing is wired up (no stored npm token), `persist-credentials: false` is set on every checkout, and all permissions are narrowly scoped. The two most operationally significant gaps are: (1) the release workflow's inline test run covers the unit/integration suite but skips the `npm audit` and Tier-A conformance checks that `ci.yml` runs as separate jobs on branch pushes — so a tag cut directly from a commit that never hit `main` could ship without those gates; and (2) `npm install -g npm@latest` in `release.yml` resolves to the current latest npm at publish time, making the exact npm version in a given release non-reproducible and theoretically susceptible to a compromised npm release.

---

## Top Findings

Ordered by bang-for-buck (highest operational-risk reduction per unit of fix effort, first).

### F1: Conformance and audit checks absent from the release gate

- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Location:** `.github/workflows/release.yml:publish` job (inline Test step); `.github/workflows/ci.yml:audit` and `ci.yml:conformance` jobs
- **Finding:** `ci.yml` runs three jobs on `push: branches: [main]` and `pull_request`: `test`, `audit` (`npm audit --audit-level=high`), and `conformance` (spec-version sync + Tier-A corpus run against the reference). `release.yml` is triggered on `push: tags: ["v*"]` — a different event — and its single `publish` job runs only `npm test`. The `audit` and `conformance` jobs do **not** run on tag pushes, and `ci.yml` has no `tags:` trigger. Therefore a `vX.Y.Z` tag can be published to npm without the dependency-advisory check or the spec-conformance gate. In the normal workflow (`release.py` runs on `main`, which was gated by `ci.yml`), this gap is partially bridged by the branch gate — but a manually created tag, a tag at a cherry-picked commit, or a CI regression between merge and tag can still escape.
- **Operational consequence:** A release could ship with a known high/critical advisory in the dependency tree, or with a Tier-A conformance regression on the supported corpus, without any CI signal.
- **Recommendation:** Either (a) add `audit` and `conformance` as additional jobs in `release.yml` (with the publish job declaring `needs: [test, audit, conformance]`) so every tag is fully gated, or (b) add `tags: ["v*"]` to `ci.yml`'s trigger so all three CI jobs run on a tag push, and the release workflow can then declare `needs: [ci-test, ci-audit, ci-conformance]` via cross-workflow job IDs (possible via the `workflow_run` trigger). Option (a) is simpler and self-contained.

---

### F2: `npm install -g npm@latest` in release workflow pins to a mutable version

- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Location:** `.github/workflows/release.yml:34`
- **Finding:** The `Ensure npm supports trusted publishing` step runs `npm install -g npm@latest`. This is intentionally mutable — it always installs the most recent npm release at publish time. The stated reason is ensuring `npm >= 11.5.1` for OIDC Trusted Publishing support. While pragmatic, this means: (a) the exact npm version is not recorded or pinned, so two release runs at different times may use different npm versions; (b) a compromised or breaking npm release would affect the next publication without any defense.
- **Operational consequence:** Non-reproducible publish environment; theoretical supply-chain exposure to a compromised `npm@latest`. Low probability but nonzero for a public registry.
- **Recommendation:** Pin to a specific known-good version (e.g. `npm install -g npm@11.5.1` or the specific minimum needed), or query the registry for a version constraint (`npm install -g 'npm@>=11.5.1'` is still mutable but at least sets a floor). If the intent is to stay current for security fixes, document the decision and its rationale in the workflow comment. A Dependabot `npm` entry won't cover a globally installed npm; manual tracking is needed.

---

### F3: `id-token: write` permission granted at workflow level in `release.yml`

- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Location:** `.github/workflows/release.yml:9-13`
- **Finding:** `id-token: write` is declared at the workflow `permissions:` block (top level), not scoped to the job or step that needs it. In a single-job workflow this is largely harmless, but it means all steps in the `publish` job — including `actions/checkout`, `npm ci`, and the test run — hold the OIDC token capability. If a malicious transitive dependency or a compromised test step tried to request an OIDC token, the permission would be available.
- **Operational consequence:** Marginally wider blast radius if a build step is compromised; the OIDC token could be requested during npm install or npm test, not just during the publish step.
- **Recommendation:** Move `id-token: write` to the `publish` job's own `permissions:` block (alongside or instead of the workflow-level block) and keep `contents: read` at the workflow level. The `setup-node` action with `registry-url` already handles token population correctly; this just narrows the scope. This is a defense-in-depth improvement, not an immediate exploitation vector.

---

### F4: No `concurrency` guard on `release.yml`

- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Location:** `.github/workflows/release.yml` (no `concurrency:` key present)
- **Finding:** If two `vX.Y.Z` tags are pushed in rapid succession (e.g. a patch tag pushed while a minor-release publish job is still running, or a network retry scenario), two `publish` jobs would run concurrently. Both would attempt to `npm publish` the same or overlapping package versions, likely resulting in a 403 error from npm's registry for the duplicate, but with an unclean failure mode. The CI workflow similarly lacks `concurrency:`.
- **Operational consequence:** Race condition between simultaneous publish jobs; first one wins, second produces a confusing error rather than a clean failure or orderly serial execution.
- **Recommendation:** Add a `concurrency:` block to `release.yml`:
  ```yaml
  concurrency:
    group: npm-publish
    cancel-in-progress: false   # let the first publish finish; don't cancel mid-publish
  ```
  Use `cancel-in-progress: false` because a publish mid-flight must not be cancelled. For `ci.yml`, adding `cancel-in-progress: true` on a per-branch group is conventional and avoids redundant CI runs on fast-push workflows.

---

### F5: Branch/tag protection not committed as infrastructure

- **Severity:** LOW
- **Confidence:** LIKELY
- **Location:** Repo settings (not visible in the tree); no `rulesets/` file committed
- **Finding:** No committed branch-protection or tag-protection ruleset was found in the tree (no `.github/rulesets/` or equivalent). This means `main` and `vX.Y.Z` tags can potentially be force-pushed or deleted through repo settings, outside of any code review. For a single-author repo the practical risk is low, but the release gate's value is partially undercut if a tag can be moved after the workflow ran. The prior `entviz` (Python) review flagged this as OPS-F3 and reasonably deferred it.
- **Operational consequence:** Tags could theoretically be retargeted after a successful publish, silently diverging the npm package content from what the CI gate verified. In practice, the maintainer is the only committer, which limits the actual risk.
- **Recommendation:** Defer as before — the single-author nature makes this low-urgency. If the repo ever gets contributors, commit a GitHub Ruleset (`gh api --method POST /repos/dhh1128/entviz-js/rulesets ...`) blocking force-pushes to `main` and disabling tag deletion. Record this as a deferred item.

---

## Additional Patterns Noted

- **`@entviz/react` has no test script.** `npm test --workspaces --if-present` silently skips the React package because it has no `"scripts": { "test": ... }` entry. The React component (`packages/react/src/Entviz.tsx`) ships with no CI coverage. This is documented context (the package is "held back until proven"), but may be worth a `test:unit` placeholder that fails with `echo 'no tests yet; add them before publishing'` to prevent silent pass.
- **`lxml` installed without a hash in the conformance job.** The conformance job in `ci.yml` runs `pip install --quiet lxml` without `--require-hashes` or a pinned version. This is a lower-stakes supply-chain surface than the main npm graph (it only affects the Tier-A conformance check, not the published artifact), but is worth noting.
- **`.gitignore` is minimal for a repo with a Python release script.** The `.gitignore` covers `__pycache__/` but not `*.pyc`, `.venv/`, `venv/`, or `*.egg-info`. Running `release.py` locally with a venv in the repo root would leave an unignored `.venv/`. The `scripts/release.py` uses only the stdlib, so no venv is strictly needed, but the pattern is common enough to add these entries proactively.
- **No unicode guard in `ci.yml`.** The Python reference repo has a `scripts/check_unicode.py` gate against bidi-reorder / Trojan-Source characters. No equivalent exists in `ci.yml` for the TypeScript source. This is not a finding gap — TypeScript's toolchain doesn't have the same invisible-character surface as Python's string literals — but worth noting for completeness.
- **No docs-deploy workflow.** `entviz-js` has no GitHub Pages deploy (there are no generated docs in the repository), so OPS-F2 from the Python reference repo does not apply here. The absence of a deploy workflow is correct.
- **README badges match workflow names.** The `CI` badge points at `ci.yml` (workflow `name: CI`) and the `Release` badge points at `release.yml` (workflow `name: Release`) — both are correct. OPS-F5 from the Python reference repo does not apply.

---

## Residual Unknowns

- **Branch and tag protection rules** are not visible in the repository tree; whether PR-required or force-push-disabled rulesets are active in GitHub's repo settings cannot be confirmed from a code review alone.
- **OIDC Trusted Publishing registration on npm.** The release workflow uses `npm publish --provenance` without a `NODE_AUTH_TOKEN`, relying on an OIDC Trusted Publisher registered on the `@entviz/core` package on npm.org. This cannot be verified from the repository tree; if the trusted publisher was never registered, every release publish will fail silently with a 403.
- **Whether `npm install -g npm@latest` resolved to a version >= 11.5.1** in any actual run. The version is not logged by default in the current workflow configuration.

---

## Decisions Needed

- **Closing the conformance/audit gap at release (F1):** Should the `audit` and `conformance` jobs from `ci.yml` be replicated in `release.yml`, or should `ci.yml` gain a `tags:` trigger? The simpler approach is replicating in `release.yml` (no cross-workflow dependencies); the cleaner long-term approach is adding `tags: ["v*"]` to `ci.yml` and having `release.yml` use `workflow_run` to gate on it.
- **Pinning `npm@latest` (F2):** Accept the mutable risk (document the known minimum version) or pin to a specific npm version and track it manually?
- **`@entviz/react` test coverage:** When is the React package expected to be published, and should a failing test placeholder be added now to ensure it can't silently pass CI forever?

---

## Findings Manifest

```yaml
findings:
  - id: OPS-F1
    persona: devops-engineer
    title: Release gate skips npm audit and Tier-A conformance checks
    severity: HIGH
    confidence: CONFIRMED
    location: .github/workflows/release.yml:publish (Test step); ci.yml:audit; ci.yml:conformance
    dedupe_key: release-yml-ungated
    recommended_disposition: recommend-fix
    rationale: >
      release.yml triggers on tags but runs only npm test; the audit and conformance
      jobs from ci.yml do not fire on tag pushes, so a release can ship without the
      dependency-advisory gate or the Tier-A spec-conformance check.
    revisit_condition: null
    fix_effort: small

  - id: OPS-F2
    persona: devops-engineer
    title: release.yml installs npm@latest — mutable, non-reproducible publish environment
    severity: MEDIUM
    confidence: CONFIRMED
    location: .github/workflows/release.yml:34
    dedupe_key: release-yml-unpinned
    recommended_disposition: recommend-fix
    rationale: >
      npm install -g npm@latest resolves to whatever latest npm is at publish time;
      pin to a specific version for reproducibility and supply-chain hygiene.
    revisit_condition: null
    fix_effort: small

  - id: OPS-F3
    persona: devops-engineer
    title: id-token:write granted at workflow level rather than job level
    severity: LOW
    confidence: CONFIRMED
    location: .github/workflows/release.yml:9-13
    dedupe_key: release-yml-overpermissioned
    recommended_disposition: recommend-fix
    rationale: >
      id-token:write is declared workflow-wide; moving it to the publish job's
      permissions block is a small hardening that limits OIDC token exposure to
      the single step that needs it.
    revisit_condition: null
    fix_effort: small

  - id: OPS-F4
    persona: devops-engineer
    title: No concurrency guard on release.yml — simultaneous tag pushes race to publish
    severity: LOW
    confidence: CONFIRMED
    location: .github/workflows/release.yml (no concurrency: block)
    dedupe_key: release-yml-missing-concurrency
    recommended_disposition: recommend-fix
    rationale: >
      Without concurrency: cancel-in-progress:false, two tag pushes in rapid
      succession spawn two publish jobs; the second hits a registry 403 with an
      unclean failure rather than orderly serialization.
    revisit_condition: null
    fix_effort: small

  - id: OPS-F5
    persona: devops-engineer
    title: Branch/tag protection not committed as reviewable infrastructure
    severity: LOW
    confidence: LIKELY
    location: .github/ (no rulesets/ present)
    dedupe_key: branch-protection-missing
    recommended_disposition: recommend-defer
    rationale: >
      Single-author repo; practical risk is low. Defer until contributors join.
      Commit a GitHub Ruleset blocking force-push to main and tag deletion at
      that point.
    revisit_condition: When the repo gains additional contributors or the first
      external PR is merged.
    fix_effort: small
```

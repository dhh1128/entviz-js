# Orchestrating Adversarial Code Reviews — entviz-js

The orchestrator-side companion to the review-persona prompts in this folder
(`tsreact-craftsmanship.md`, `developer-experience.md`,
`frontend-a11y-responsive.md`, `localization.md`, `error-quality.md`).

Use this when you run the personas as **subagents at a milestone** — spawning
several, collecting their findings, deduplicating across them, and adjudicating
dispositions, with no human in the loop (or with human input deferred). Each
persona prompt describes *its* half of the contract; this doc describes how to
drive the panel and combine the results.

> **About this set.** `entviz-js` is the TypeScript/React port of the entviz
> algorithm whose normative spec + Python reference implementation live in the
> sibling repo `../entviz` (`docs/spec.md`, RFC 2119). This repo is a small
> monorepo:
> - **`@entviz/core`** (`packages/core`) — a *pure isomorphic* TS library (no
>   DOM, no `node:` builtins beyond what `@noble/hashes` needs) that parses a
>   high-entropy value and emits a comparable SVG string. No UI.
> - **`@entviz/react`** (`packages/react`) — React components shipped as **raw
>   `.ts` using `React.createElement` (no JSX, no build step)**. This is where
>   all human-facing UI, localization, accessibility, and responsive behavior
>   live.
> - **`apps/playground`** — a demo app.
>
> Intent and rationale are recorded in the **`tick` ledger** (an orphan `tick`
> branch; the `tick` CLI is the interface — grep source for marks `~[2-7][a-z2-7]{3}`
> and run `tick show <id>`), in **`AGENTS.md`**, and in **`docs/`** and
> **`packages/*/docs/`**. There is **no `this.i` file** here — that belongs to
> the Python `../entviz` repo. When a persona prompt inherited from a sister
> project mentions `this.i`, read it as "the recorded-intent layer," which in
> this repo means `tick` + `AGENTS.md` + `docs/`.
>
> **The five lenses are bespoke to this port's quality goals** and do not
> duplicate the sister repo's spec-conformance / perception / security lenses.
> They answer: *would an expert TS/React practitioner call this grade-A work
> (CRAFT); is it documented well enough to consume and contribute to (DX); does
> the React UI work on mobile and web and for assistive-tech users (A11Y); is
> the UI fully and correctly localized (L10N); and are the error messages
> high-quality (ERR)?*

---

## 1. Spawning a persona

Each prompt has an **Invocation Contract** section defining two modes and a set
of knobs. To run one unattended, set `mode: unattended` and pass whatever else
applies:

| Knob | Meaning |
|---|---|
| `mode` | `interactive` (default) or `unattended`. Unattended = no human answers mid-run; the persona never blocks and never mutates the repo (no edits, no `tick` writes). |
| `effort` | `medium` (default) or `deep`. |
| `max_findings` | size of the Top Findings list (default 5). |
| `run_label` | goes in the report filename so milestones/concurrent runs don't collide (default: today's date). |
| `prior_dispositions` | findings already adjudicated in earlier runs (accepted-risk / deferred / rebutted). The persona must not re-litigate these. |

When driving the panel as a **Workflow** (§7), these orchestrator-level knobs
also apply: `model` (run-wide model override), `overrides` (per-persona
`{PREFIX: {effort, model}}`), `verify` (`off`/`default`/`all` pre-merge
refutation pass), and `personas: 'auto'` (git-aware lens scoping).

### Package scope per persona

Two of the five lenses are React-only. Do not spend a persona's budget outside
its scope.

| Lens | `packages/core` | `packages/react` | `apps/playground` |
|---|---|---|---|
| CRAFT (craftsmanship) | ✔ | ✔ | context only |
| DX (developer experience) | ✔ | ✔ | ✔ (as a live usage example) |
| A11Y (accessibility + responsive) | — | ✔ | ✔ (rendered surface) |
| L10N (localization) | — (errors are en-US by design) | ✔ | context only |
| ERR (error-message quality) | ✔ | ✔ | — |

### Verification pass

Before the exact-key merge, a `Verify` phase adversarially tries to **refute**
high-stakes findings against the repo (each finding needs only itself + the
tree, not the merged view). Scope is gated by `verify`: `off` skips it;
`default` verifies any `CRITICAL`; `all` verifies every `CRITICAL`/`HIGH`
`recommend-fix`. A **refuted** finding is removed from the queue that flows into
merge + synthesis but is **recorded** in the report's `## Refuted (excluded from
findings)` section, so nothing is silently lost. A claim like "string X is
hardcoded, not localized" or "this `throw` leaks an internal value" is exactly
the kind of concrete, checkable assertion the verify pass should challenge.

---

## 2. Severity is a fix-obligation, not a bug-triage score

All personas use one scale: **CRITICAL / HIGH / MEDIUM / LOW**. There is no
per-persona variant, so sort the merged queue directly.

The scale measures **how mandatory the fix is, relative to tolerating the code
as-is** — e.g. before raising a PR, or before declaring the work "good enough":

| Level | Obligation |
|---|---|
| **CRITICAL** | Must be fixed before this code is tolerated as-is. Leaving it is not acceptable. |
| **HIGH** | Default expectation is "fix before moving on." Deferring requires an explicit, recorded decision. |
| **MEDIUM** | Worth fixing; acceptable to defer with a note. |
| **LOW** | Optional; fix if convenient. |

### Severity vs. recommended_disposition

- **severity** = the finding's intrinsic fix-obligation (a property of the finding).
- **recommended_disposition** = what the reviewer recommends doing *now*, given milestone context (`recommend-fix` / `recommend-defer` / `recommend-accept-risk`).

Calibrate to the **audience** of the artifact. A missing screen-reader label on
a primary compare action ships broken UI to a whole class of users → HIGH. A
thin JSDoc on an internal helper a consumer never imports → LOW. A hardcoded
English string in a component that otherwise advertises 21-locale support is a
correctness gap in a stated feature, not a nit → MEDIUM/HIGH depending on
visibility. A `throw` whose message names neither what failed nor the offending
input, on a public API a consumer will hit → HIGH.

---

## 3. The `dedupe_key` convention

Two personas seeing the same issue must produce the **same** key so the
orchestrator can merge them. The key names the *concept*, not the evidence
location (file and line live in the finding's `location` field).

**Grammar:** `<subject>-<adjective>[-<qualifier>]`, all lowercase-kebab.
- **subject** — the most stable identifier available: package (`core`, `react`),
  component/module file-stem (`entviz-pill`, `entviz-compare`, `entviz-walk`,
  `pill-messages`, `copy-actions`, `characterize`), public symbol (`render`,
  `characterize`, `resolveMessages`), or a repo-global artifact (`readme`,
  `contributing`, `typedoc`, `jsdoc`, `package-exports`, `tsconfig`).
- **adjective** — the defect class, preferably from the set below.
- **qualifier** — optional condition: `-on-mobile`, `-under-rtl`, `-for-sr`
  (screen reader), `-for-consumer`, `-for-contributor`, `-en-only`.

### Recommended adjective set (open — extend as needed)

| Adjective | Means | Usual lens |
|---|---|---|
| `duplicated` | repeated logic/constant/markup that should be shared | CRAFT |
| `monolithic` | one file/function fuses too many concerns | CRAFT |
| `misnamed` | name misleads about behavior/type/units | CRAFT |
| `stale` | comment/docstring/type/label contradicts current behavior | CRAFT, DX |
| `untyped` | `any`/loose type where a precise one exists; leaks a weak type | CRAFT |
| `undocumented` | public API/prop/behavior lacks the doc a consumer needs | DX |
| `missing` | a required artifact is absent (CONTRIBUTING, quickstart, example) | DX |
| `unactionable` | error/message doesn't tell the reader what to do next | ERR |
| `contextless` | error omits the offending value / what failed | ERR |
| `uncoded` | error carries no stable symbolic code — not distinguishable/greppable/referenceable | ERR |
| `retry-ambiguous` | error doesn't say whether it's permanent or worth retrying | ERR |
| `clipped` | terse fragment punctuated as a sentence, jargon-heavy, or pronoun-dropped (violates house voice) | ERR |
| `leaky` | error/message exposes internals, stack detail, or blames the user | ERR |
| `miscast` | wrong error *type*, or thrown where it can't be caught/handled | ERR |
| `inconsistent` | voice/format/casing diverges across sibling messages | ERR, L10N |
| `hardcoded` | user-visible string not routed through the message layer | L10N |
| `unlocalizable` | copy that can't be translated (concatenation, baked plurals) | L10N |
| `unmirrored` | chrome that doesn't honor RTL, or viz wrongly mirrored | L10N |
| `inaccessible` | fails keyboard/SR/contrast/focus expectations | A11Y |
| `untrappable` | focus escapes a modal/popover, or isn't returned on close | A11Y |
| `unresponsive` | breaks/overflows/clips on small or touch viewports | A11Y |
| `hover-only` | affordance reachable only by hover (no touch/focus path) | A11Y |

**If none fits:** use the most natural single adjective and flag it as a
candidate addition in your synthesis. The set is meant to grow.

**Fuzzy-merge safety net:** exact `dedupe_key` matching under-merges. The panel
handles this in a **synthesis-stage semantic clustering pass** (judging sameness
from title + location + rationale, conservatively); the canonical entry is the
member with the **most-obligated severity**, with the union of reporters and
locations. Examples that should collapse across lenses:
- `entviz-pill-hardcoded-en-only` ← L10N + CRAFT (a literal that is both an
  untranslated string and a copy-paste)
- `copy-actions-contextless` ← ERR + CRAFT ("image decode failed" with no context)
- `entviz-pill-untrappable-for-sr` ← A11Y (focus not returned on popover close)
- `readme-missing-for-contributor` ← DX (no CONTRIBUTING.md)

---

## 4. Manifest schema

Every persona emits a machine-readable manifest as the final section of its
report (and, in unattended mode, as part of its returned message). Core fields:

| Field | Notes |
|---|---|
| `id` | persona-prefixed, e.g. `CRAFT-F1`, `DX-F2`, `A11Y-F3`, `L10N-F4`, `ERR-F5`. |
| `persona` | which reviewer produced it. |
| `title` | short human-readable summary. |
| `severity` | CRITICAL / HIGH / MEDIUM / LOW. |
| `confidence` | CONFIRMED / LIKELY / SPECULATIVE. |
| `location` | `path:line`, or a doc/artifact reference. |
| `dedupe_key` | per §3. |
| `recommended_disposition` | recommend-fix / recommend-defer / recommend-accept-risk. |
| `rationale` | one line; enough for the orchestrator to overrule without re-deriving. |
| `revisit_condition` | required when `recommend-defer`. |
| `fix_effort` | small / medium / large. |

The workflow hands each persona's `agent()` call a JSON Schema with exactly
these required fields (plus nullable `revisit_condition`, `tier`,
`cost_category`, `measurement`), so the harness enforces the shape. Emit only
these fields.

---

## 5. Collect → merge → adjudicate

1. **Collect** every persona's returned manifest (the report file is durable backup).
2. **Merge** by `dedupe_key`: fold shared-key findings into one item with a
   `reported_by: [...]` list, the **most-obligated** severity, and the union of
   locations. Then run the synthesis-stage semantic clustering pass (§3).
3. **Adjudicate** against milestone policy. A sensible default:
   - any unresolved **CRITICAL** `recommend-fix` → milestone is **blocked**;
   - **HIGH** `recommend-fix` → blocked unless explicitly deferred with a recorded reason;
   - **MEDIUM/LOW** → logged, not blocking.
   Record each decision so it can be passed back as `prior_dispositions` next
   run. Promoting an intent-level finding into the `tick` ledger is a deliberate,
   maintainer-ratified follow-up; the orchestrator does **not** write `tick`
   autonomously.

---

## 6. The entviz-js persona roster

| Prefix | File | Lens | Scope | Default effort/model |
|---|---|---|---|---|
| `CRAFT` | `tsreact-craftsmanship.md` | grade-A TS/React: DRY, naming, comments, file org, imports, idiom | core + react | deep / Sonnet |
| `DX` | `developer-experience.md` | docs for consumers (P1) and contributors (P2); public API discoverability | both | medium / Sonnet |
| `A11Y` | `frontend-a11y-responsive.md` | accessibility + mobile/web responsive behavior | react | deep / Sonnet |
| `L10N` | `localization.md` | full, correct localization of chrome; RTL; the never-localize-the-viz contract | react | medium / Sonnet |
| `ERR` | `error-quality.md` | error-message quality against an explicit rubric | core + react | medium / Sonnet |

**Default panel:** all five (`CRAFT, DX, A11Y, L10N, ERR`) — they map 1:1 to the
maintainer's stated review goals and none is optional.

---

## 7. Running the panel as a Workflow

The workflow script lives at `.claude/workflows/review-panel.js`. It is
**opt-in** (ask to "run a review panel").

It is **self-contained**: `PROMPTS_DIR` defaults to this folder
(`<repo>/prompts/review/`), so the panel does not depend on any external clone.
Targeting is explicit and verified: a preflight agent canonicalizes
`args.target` to the enclosing git repo root and aborts if it isn't a git repo
(or `args.branch` doesn't match). Each persona agent re-confirms the resolved
tree before reviewing.

```
Workflow({ scriptPath: '<repo>/.claude/workflows/review-panel.js',
           args: { target: '<repo abs path>', milestone: 'YYYY-MM-DD review' } })
```

It mirrors the standing subagent rules on this machine: personas fan out **in
chunks of ≤3** (RAM ceiling), each agent prompt carries **`nice -n 19 ionice -c
3`** for heavy shell work, findings merge by `dedupe_key` with **most-obligated
severity winning**, refined by the synthesis-stage semantic clustering pass.

**Persistence.** The run is read-only on source but **writes its output to
`<repo>/reviews/`** (uncommitted): a synthesis index `review-panel-<milestone>.md`
(executive summary, a table of every finding, a fenced-JSON copy of the merged
manifest) plus one `<persona>-<milestone>.md` narrative report per persona. The
workflow does **not** commit and does **not** write `tick`.

---

*Canonical definitions live here. The persona prompts reference this doc for
severity semantics and the `dedupe_key` convention rather than restating them,
so there is one source of truth.*

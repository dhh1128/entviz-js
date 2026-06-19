# Copilot Code Review — Repository Instructions

These rules apply to every PR. Path-scoped files in `.github/instructions/` add language and surface rules.

## Light mode

If the PR title or description contains `[light-ccr]`, perform **only** the Light-mode checks below. Skip everything else in this file and all path-scoped files. (`[no-ccr]` is handled at the workflow layer; if you are running, the PR is at least light.)

### Light-mode checks

1. **Secrets** — hardcoded API keys, passwords, tokens, private keys, connection strings with credentials.
2. **PII/PHI in new log statements** — emails, phone numbers, names, government IDs, addresses, card-shaped strings interpolated directly or via `toString()`.
3. **Obvious security mistakes** — SQL built by string concat with user input, `eval`/`exec` of user input, disabled TLS verification, auth checks removed.
4. **Broken syntax** — missing braces, malformed imports, references to undefined symbols visible in the diff.

If none apply, output `Light review found nothing.` and stop.

## Full review — what to check

The Light-mode checks above apply in full review too. Plus:

- **Input validation on new external entry points** — new HTTP endpoints, message handlers, or CLI args without visible validation of size, type, or format.
- **Error response quality (format-agnostic).** JSON or HTML is fine. Regardless of format, every error response must:
  1. Carry a **stable distinguishing code** — two occurrences of the same error must be recognizable as the same. `"Something went wrong"` with no code is unacceptable.
  2. Have a **user-friendly message** — complete sentence, plain language, no all-caps, no exclamation, no raw stack trace or exception class name.
  3. Indicate **whether retry might succeed** — explicitly via a field (`retryable`, `transient`/`permanent`) or implicitly via a correctly chosen status code (503 vs 400, 429 vs 422). Flag generic 500s for client errors and client-blamed codes for server-side failures.
- **Hardcoded user-visible strings.** Error text, notifications, email bodies, UI labels as literal strings rather than symbolic IDs resolved by a localization layer. If the project routes any strings through l10n, hardcoded ones are violations.
- **Unmarked tech debt.** Required format: `// TECH_DEBT: <name> [TICKET-NNN]`. Ticket required for cross-module, performance, or security impact; omittable for small local cleanup. Bare TODO/FIXME/HACK is a finding.
- **Commented-out code.** Disabled blocks left in place. VCS history is the archive; delete.
- **Code health in regions the diff touches** — duplication near the change, misleading names, methods doing too much, magic numbers, dead code.
- **New dependencies** in `pom.xml`, `pyproject.toml`, `package.json`, `requirements*.txt`. Note license, maintenance, smaller-alternative-in-project.

## What NOT to review

- Design, architecture, or tradeoff correctness
- PR description, release notes, rollback plan completeness
- Test pass/fail or coverage thresholds (CI)
- Formatting, imports, line length (linters/formatters)
- Prose tone or grammar in markdown beyond broken links and bad code-fence languages
- UI visual design, copy, aesthetics
- Architectural divergence from platform conventions (deeper local reviews)
- Performance unless the diff has an obvious quadratic loop, N+1 query, or sync call in a hot path

If the PR is purely cosmetic, say so in one sentence and stop.

## Code health bias

Comment on smells *in regions the diff touches*. Do not propose refactors of untouched code. Frame as opportunities, not blockers, unless correctness or security. Prefer fewer high-signal comments. Mark speculative findings as such.

## Output

- One comment per finding, on the relevant file and line.
- No "looks good" filler. No summary that restates the diff.

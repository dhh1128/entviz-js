---
applyTo: "**/*.md,**/*.mdx,**/*.rst,**/*.txt"
---

# Documentation Review Rules

If `[light-ccr]` mode is active per `../copilot-instructions.md`, do not apply this file.

## Scope — keep it narrow

Doc review is intentionally minimal. Do **not** review prose tone, voice, grammar, or wording. AI prose-policing produces noisy, low-value comments.

Review only:

## Links

- Broken-looking internal links: relative paths referencing files not in the repo.
- Markdown link syntax errors (mismatched brackets, missing parentheses).

## Code blocks

- Fenced code blocks with no language tag where one is clearly applicable (shell, JSON, YAML, Java, Python). Small fix, not a blocker.
- Mismatched fences (opening triple-backtick but no closing fence).
- Indentation breaking rendering (mixing 2 and 4 space indent in the same list).

## Frontmatter

- Malformed YAML in frontmatter (missing colon, unbalanced quotes).
- Files with `gdoc_id`/`gdoc_source` siblings authored without the gdoc-sync metadata when surrounding files have it.
- `doc_authority: git` vs `doc_authority: gdoc` mismatch with how the file appears to be maintained.

## Cross-references

- Internal references to docs in this repo using paths that don't exist.
- "See X document" without a link.

## Stale content

- Docs referencing renamed services, deprecated endpoints, or technologies the project no longer uses — only when visible in the diff or obvious project context.
- `TODO`/`FIXME` left in published docs without ticket references.

## Code health

- Tables with rows that don't match the header column count.
- Lists with inconsistent marker style within one list (mixing `-`, `*`, `+`).
- Headers skipping levels (`#` then `###` with no `##`).

## What NOT to do

- Do not suggest rewordings, sentence restructuring, or "better" phrasings.
- Do not suggest sections the author didn't include.
- Do not police British vs American spelling, em-dash vs en-dash, or punctuation style.
- Do not flag long sentences or complex vocabulary.
- Do not propose splitting or restructuring the document.

If the only changes in the PR are markdown and you have nothing concrete to flag from the lists above, output one sentence saying so and stop.

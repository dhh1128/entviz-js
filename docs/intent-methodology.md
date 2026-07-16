# The Intent methodology (`this.i`)

**Vendored** from the sister `entviz` repo's `AGENTS.md` (§2 The Intent Layer,
§3 Engineering Discipline) so this repo is self-describing. The sister repo is
the authority on the entviz *spec/algorithm*; this document is the authority on
*how we record intent* in this port. Read it before touching `this.i`.

## Why this exists

- **Comprehension is the primary output, not code.** Understand the *why*
  before writing the *how*. Code is a byproduct of comprehension, not a
  replacement for it.
- **Intent is a first-class artifact.** Every major decision, tradeoff, and goal
  is recorded in `this.i` at the repo root. The tick ledger is the *workshop*
  (transient tasks/debt/ideas); `this.i` is the *showroom* (settled intent). A
  tick that turns out to be a real design decision **graduates** into `this.i`
  when it closes.

## The `this.i` format ("intent code")

`this.i` is a hierarchical intent tree, and it **is YAML** — each node is a
mapping whose key has the form `Meaningful Name = <kind>`, and `why:` blocks are
`>` folded block scalars holding free prose (that prose is where alternatives,
tradeoffs, and rejected options are written out). It parses as YAML; keep it
that way (valid comments, block scalars, indentation).

A node looks like:

```yaml
Human-Readable Name = <kind>:
  id: <8charid>
  why: >
    The reasoning. State the tradeoff, not just the choice. If options were
    considered and rejected, name them and say why here.
  status: <status>        # optional
  children:               # optional — nesting is meaningful
    Child Name = decision:
      id: <8charid>
      why: >
        ...
```

### Node kinds

- **`goal`** — an end we are trying to achieve.
- **`decision`** — a choice made, with its rationale. The bulk of the tree.
- **`constraint`** — a boundary every decision under/around it must respect
  (e.g. an accessibility or security invariant).

### Fields

- **`id:`** — a unique, **OPAQUE 8-character base32** handle (alphabet `a-z2-7`,
  e.g. `ujdwjtex`). Generate it randomly; do **not** make it mnemonic. This is
  deliberate and load-bearing: the node's **name** carries the meaning and may be
  renamed freely, while the id is a stable reference that never has to change when
  the name does. A mnemonic id (`tru5tasm`) is an **antipattern** — it couples the
  handle to a name that will drift. Every goal/decision/constraint gets one; other
  nodes reference it (in prose here, in commits, in code) by id, never by name.
  Generate one with, e.g.:
  `head -c 20 /dev/urandom | base32 | tr 'A-Z' 'a-z' | tr -d '01=' | cut -c1-8`
- **`why:`** — a `>` block scalar. The load-bearing field. Record the reasoning
  and the tradeoff. Alternatives-considered go **inside** this prose.
- **`status:`** — optional lifecycle marker. Observed vocabulary:
  `drafted` (designed, not yet built) · `accepted` · `deferred` ·
  `complete` / `done` · `prototype` · `nonissue`. Absence means "settled
  ambient intent," typically for goals/constraints.
- **`children:`** — nested nodes. Hierarchy encodes "this serves that."

## Workflow (how intent and code interact)

1. **Intent check before implementing.** Before starting an implementation
   task, read `this.i` (and the sister repo's `docs/spec.md` when the change
   could touch rendered output) to confirm your plan aligns with recorded
   intent.
2. **Update `this.i` first** when a task involves a design choice — capture the
   decision and its *why* before writing code, not after.
3. **True TDD.** Never modify code without a failing test; never leave the tree
   with tests red (Red → Green → Refactor). See `AGENTS.md` → Testing Protocol
   for this repo's two-suite + coverage gate.
4. **Graduate ticks.** When a `tick` resolves into a durable design decision,
   fold it into `this.i` and remove the transient tick.

## SSOT boundary (this port vs. the sister repo)

The core entviz **algorithm/spec** intent is authoritative in the sister
`entviz` repo (`this.i` + `docs/spec.md`). This port's `this.i` records
intent for the **JS/TS surface** — `@entviz/core` derivations and the
`@entviz/react` component layer — that is not part of the closed rendered
artifact. Anything here that would change the deterministic entviz SVG must
first be reconciled with the sister repo's spec, never diverge from it.

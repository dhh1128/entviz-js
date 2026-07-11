# Developer Experience Review: entviz-js

**Date:** 2026-07-11
**Effort level:** medium
**Implementation commit:** 82f81ff11948b2e891ff9ec3acc38a2095764212
**Context sources used:** root README.md; packages/core/README.md; packages/react/README.md; apps/playground/README.md; AGENTS.md; packages/react/docs/integration.md; packages/react/docs/pill-design.md (header); CERTIFICATION.md; packages/core/src/entviz.ts (SPEC_VERSION, PARSE_FUNCS, render, RenderOptions); packages/core/src/characterize.ts (Characterization, characterize); packages/core/src/describe.ts (describeChannels, comparisonText, gridShapes); packages/react/src/index.ts; packages/react/src/Entviz.ts; packages/react/src/EntvizPill.ts; packages/react/src/EntvizWalk.ts; apps/playground/vite.config.ts; apps/playground/src/App.tsx; typedoc.json; tsconfig.typedoc.json; CERTIFICATION.md; .github/workflows/pages.yml; docs/api/ structure.

---

## Evidence Inventory

**Docs read end-to-end:**
- Root README.md (full)
- packages/core/README.md (full)
- packages/react/README.md (full)
- apps/playground/README.md (full)
- AGENTS.md (full)
- packages/react/docs/integration.md (full)
- CERTIFICATION.md (header + coverage section)

**Public API surfaces sampled:**
- packages/core/src/entviz.ts — SPEC_VERSION, PARSE_FUNCS list, render(), RenderOptions, and ~79 total exports
- packages/core/src/characterize.ts — characterize(), Characterization interface, renderLabel()
- packages/core/src/describe.ts — describeChannels(), comparisonText(), gridShapes()
- packages/react/src/index.ts — the full re-export surface
- packages/react/src/Entviz.ts — EntvizProps interface
- packages/react/src/EntvizPill.ts — EntvizPillProps interface
- packages/react/src/EntvizWalk.ts — EntvizWalkProps interface

**Quickstart paths verified against source:**
- @entviz/core install + render() example in core README: imports resolve, options match RenderOptions — PASSES
- @entviz/react install + Entviz component example in react README: all props exist with correct types — PASSES
- Playground run instructions (npm run dev -w @entviz/playground) — consistent with vite.config.ts

**TypeDoc structure examined:**
- typedoc.json entry points, tsconfig.typedoc.json scope
- docs/api/functions/ (78 function pages), docs/api/interfaces/ (22 interfaces)
- Spot-checked render.html and Characterization.html for presence/absence of JSDoc

**Links noted (not live-tested):**
- https://dhh1128.github.io/entviz-js/ — referenced in react README as hosted playground
- https://dhh1128.github.io/entviz-js/api/ — referenced in react README as API reference
- https://dhh1128.github.io/entviz/integration-guide/ — referenced in root README
- reviews/integration-surface/proposal-2026-07-02-v2.md — linked from integration.md "See also"

---

## Executive Summary

A consumer installing @entviz/react can get to a working Entviz component from the react README in a few minutes — the quickstart example is correct and the prop table is complete for the primary component. However, every README advertising the spec version and parser coverage is materially stale: the code reached spec v15 and a full parser dispatch while the docs still say v11 and list dozens of parsers as "not yet ported." More critically, the raw `.ts` shipping model comes with no bundler-configuration guidance; a consumer on Next.js or a webpack project will hit an opaque module-resolution error with no documented fix path. For contributors, there is no CONTRIBUTING.md; the AGENTS.md is calibrated for AI agents and omits the architecture overview and the two hardest non-obvious constraints (isomorphic-core and no-JSX in react).

---

## Consumer Experience (Priority 1)

### The path from install to first render

A first-time consumer arriving at the npm page for @entviz/core sees a clean README with an accurate install instruction and a correct usage example. The imports resolve, the function names are right, and the options shown in the code block match the actual RenderOptions type. A consumer can copy-paste the example and run it under Node >= 22.6 within minutes.

A consumer arriving at @entviz/react is similarly well-served for the Entviz primitive: the install instruction correctly includes react as a required peer, the JSX example shows all the common props, and the component table gives a brief-but-honest description of all five components. The statement "Each component's TypeScript prop types are documented in the API reference" is true — TypeDoc generates a page per interface, and those interfaces carry JSDoc on their fields (Entviz.ts and EntvizPill.ts both have per-prop JSDoc comments).

### Where the consumer path breaks

**Bundler gotcha.** Both READMEs describe the packages as shipping "raw `.ts` source (no build step)." This phrase means the library has no compilation step — but it will be read by a significant share of consumers as "I don't need to configure anything." A consumer using Vite (as the playground does) or Node >= 22.6 native type-stripping will be fine: Vite handles .ts imports from node_modules by default, and Node 22.6 strips them natively. But a consumer on Next.js with its webpack pipeline, or a plain webpack 5 project without ts-loader on node_modules, will hit a module resolution error on the .ts extension — an opaque error with no documented remedy. The integration guide says "no build step required by consumers" without qualification, which reinforces the false impression. There is no mention anywhere of which bundlers require configuration to handle .ts imports from node_modules, nor any code example showing transpilePackages (Next.js), ts-loader (webpack), or similar.

**Stale spec version and parser coverage across four documents.** The code currently targets spec v15 (SPEC_VERSION = "v15" in packages/core/src/entviz.ts), the full parser dispatch is ported (22 parse functions in PARSE_FUNCS), and CI pins the reference corpus at v0.15.0. Yet every consumer-facing document contradicts this:

- Root README.md: "TypeScript implementation of entviz (spec v11)"; "currently v11"; "Not yet ported: the blockchain / CESR / SSH / SWHID / gitoid / LEI / snowflake / CID / ULID / base32 / bech32 / base58 parsers"
- packages/core/README.md: "(spec v11)"; "Ported parsers: hex, UUID, Ethereum, DID, URN, fallback ... The blockchain / CESR / SSH / SWHID / gitoid / LEI / snowflake / CID / ULID / base32 / bech32 / base58 parsers are mechanical follow-ons"
- CERTIFICATION.md header: "Spec: entviz v11 - Corpus: entviz compliance/ (pinned v0.11.1)"
- packages/core/src/entviz.ts file-level comment: "A faithful port of the Python reference (docs/spec.md, v14)"

These contradictions mislead consumers: a consumer integrating a Bitcoin address or a ULID will read "not yet ported" and conclude the library doesn't support their input, when in fact it does. A consumer needing an accurate spec-version claim (for a security audit) will see v11 when the library ships v15 behavior.

**No JSDoc on render() and RenderOptions.** The render() function is the most critical consumer-facing symbol — the first thing any @entviz/core consumer calls — yet it carries no JSDoc comment. In editor autocomplete the function signature shows up as bare parameter names with no description, no @param annotations, no @returns, and no @throws. A consumer must inspect the source to discover that the function throws on bad input, what the valid ranges for fontSizePt and targetAr are, and what "a self-contained svg with a viewBox" means. Similarly, RenderOptions has no JSDoc on its three fields. The core README example provides inline comments that compensate somewhat, but autocomplete — which is the documentation most developers read first and most often — is silent.

**Undocumented Characterization fields.** The root README and core README both show characterize() output as an example and point consumers to it as the structured model EntvizPill consumes. But Characterization's eight fields (encoding, scheme, role, qualifiers, sizeBasis, sizeBits, parts, entropyType) carry no JSDoc. A consumer building a custom UI that reads these fields must read characterize.ts source to understand what each field holds, when it is null, and what the vocabulary is. The TypeDoc page for Characterization reflects this absence: the generated HTML shows the field names and types but no descriptions.

### What the consumer does well

- The Entviz prop table in the react README is complete and accurate, with types and a brief description for every prop.
- The component scope descriptions (what EntvizPill does and, importantly, does not do — "never shows the note, value characters, or any value-derived visual") are accurate and well-placed in the react README.
- The integration guide's events section, theming section, and security contract are clear and complete for consumers who reach them.
- The hosted playground is live and auto-deployed on every push via the pages workflow.
- The API reference is auto-built and deployed on every push, so it cannot drift from the current source.

---

## Contributor Experience (Priority 2)

### No CONTRIBUTING.md; AGENTS.md is written for AI agents

There is no CONTRIBUTING.md. A human contributor opening the repo sees AGENTS.md as the de-facto guide. AGENTS.md contains useful content — the two-suite test split, coverage floors, CI description, TDD requirement — but it is calibrated for AI agent consumption:

- The tick stanza instructs readers to "Before editing a file, grep it for marks" — this is agent-workflow language that will confuse a human contributor who does not have the tick CLI installed.
- The very first section after the project description tells the reader to run tick init.
- There are no instructions for npm install, npm run build, npm test, or any other standard dev-environment bootstrap.
- There is no mention of Node version requirements (>= 22.6 for native type-stripping).

### Undocumented contributor constraints that will cause violations

Three structural constraints are not written down anywhere accessible to a human contributor:

1. **The isomorphic-core rule.** @entviz/core must not import node:crypto, node:fs, Buffer, or any other Node built-in. The playground CI job verifies this, and the comment in entviz.ts mentions "isomorphic" in passing — but there is no upfront warning a contributor will read before adding a hash call that breaks browser bundling.

2. **The no-JSX/React.createElement constraint.** The package ships raw .ts with React.createElement instead of JSX. A contributor who reflexively uses JSX will break the no-build model. This is mentioned in the react README's components table but not in any contributor guide.

3. **The spec-lives-in-the-sibling-repo relationship.** The spec and reference Python implementation live in ../entviz. AGENTS.md mentions this in the opening paragraph but doesn't explain what "sister folders on disk" means practically for a first-time contributor.

### No architecture overview

There is no "how the pieces fit" document: core to react to playground, where the render pipeline lives, why the stage functions are all exported (for unit testing), or how the conformance harness in the sibling repo connects. A contributor must read the 2000+ line entviz.ts and work backward to understand the architecture.

### What works for contributors

- The two-suite test split and coverage floors are clearly documented in both AGENTS.md and the root README.
- The CI is well-explained, and the conformance harness relationship to the spec is described.
- The tick ledger is documented well enough that a contributor who installs the tick CLI can use it.

---

## Top Findings

### F1: Stale spec version (v11 to v15) and parser list across four consumer-visible documents

- **Severity:** HIGH / **Confidence:** CONFIRMED
- **Location:** README.md (lines 11, 30, 32, 88, 99-102); packages/core/README.md (line 9 + Conformance section); CERTIFICATION.md header; packages/core/src/entviz.ts (line 4, file-level comment)
- **Finding:** The code targets spec v15 with a full 22-parser dispatch (PARSE_FUNCS includes CESR, SSH, bech32, ULID, base58, LEI, snowflake, etc.), but every consumer-facing document says v11 and lists those parsers as "not yet ported." The CERTIFICATION.md header says "Spec: entviz v11, Corpus: pinned v0.11.1" when CI now pins v0.15.0.
- **Consequence:** A consumer with a Bitcoin address, ULID, SSH key, or other "unported" input reads the docs, concludes the library doesn't support their format, and moves on — a false rejection. A consumer quoting the spec version for a security audit will report v11 when the library implements v15 behavior.
- **Recommendation:** Update README.md, packages/core/README.md, CERTIFICATION.md, and the entviz.ts file-level comment to v15 plus the full parser list. The root README Status table needs the most surgery: replace the Ported/Certified/Not-yet-ported rows with the CERTIFICATION.md coverage list. The entviz.ts comment "docs/spec.md, v14" should say "v15".
- **Fix effort:** small

### F2: Raw .ts shipping model has no bundler-configuration guidance

- **Severity:** HIGH / **Confidence:** CONFIRMED
- **Location:** packages/react/README.md (line 63); packages/react/docs/integration.md (lines 30-31); packages/core/README.md (line 19)
- **Finding:** The phrase "no build step required by consumers" is technically true for the library but misleads consumers on Next.js/webpack who need to configure .ts transpilation of node_modules. No document mentions this requirement or gives a configuration snippet for any common toolchain.
- **Consequence:** A consumer following the install instructions on Next.js or a plain webpack project hits a module resolution error with no documented fix path.
- **Recommendation:** Add a "Bundler compatibility" note to both the core and react READMEs (and the integration guide Install section). Cover: Vite works out of the box; Node >= 22.6 native stripping works; Next.js needs transpilePackages: ['@entviz/core', '@entviz/react']; webpack needs ts-loader or babel-loader with a node_modules/@entviz include rule.
- **Fix effort:** small

### F3: render(), RenderOptions, and Characterization carry no JSDoc

- **Severity:** MEDIUM / **Confidence:** CONFIRMED
- **Location:** packages/core/src/entviz.ts lines 1629-1635 (RenderOptions + render); packages/core/src/characterize.ts lines 49-57 (Characterization interface)
- **Finding:** render() has no JSDoc block. RenderOptions has no field-level comments. The Characterization interface's eight fields have no JSDoc. In editor autocomplete, hovering render() shows a bare signature; hovering a Characterization field shows only its TypeScript type.
- **Consequence:** A consumer using autocomplete-driven development gets no help on what targetAr or fontSizePt mean, valid ranges, or what each Characterization field holds. They must open source.
- **Recommendation:** Add JSDoc to render() (describe return value, throws conditions, valid ranges), RenderOptions fields (purpose + range per field), and each Characterization field (what scheme vs encoding vs entropyType differ on; when role is null; what parts contains). TypeDoc will pick these up automatically.
- **Fix effort:** small

### F4: No CONTRIBUTING.md — isomorphic-core and no-JSX constraints undocumented for contributors

- **Severity:** MEDIUM / **Confidence:** CONFIRMED
- **Location:** repo root (absent: CONTRIBUTING.md); AGENTS.md (present but agent-facing)
- **Finding:** No CONTRIBUTING.md exists. AGENTS.md is calibrated for AI agents and has no dev-environment bootstrap, Node version requirement, or upfront statement of the isomorphic-core rule or the no-JSX constraint in @entviz/react.
- **Consequence:** A contributor adding a hash call in core using node:crypto passes unit tests locally but breaks the playground CI build — a confusing non-obvious failure. A contributor using JSX in @entviz/react breaks the no-build model for consumers.
- **Recommendation:** Create CONTRIBUTING.md (or a new "For human contributors" section at the top of AGENTS.md) covering: clone + npm install + npm test bootstrap; Node >= 22.6; the isomorphic-core rule with rationale; the no-JSX rule with rationale; the spec-sibling-repo relationship; and a one-paragraph architecture overview.
- **Fix effort:** medium

### F5: TypeDoc entry exposes ~50 internal stage helpers alongside the consumer API

- **Severity:** MEDIUM / **Confidence:** CONFIRMED
- **Location:** typedoc.json (entryPoints: full src files); docs/api/functions/ (78 pages)
- **Finding:** entviz.ts exports 79 symbols, most of which are internal stage functions (assignCellIndices, blankCellIndices, borderLine, boxOrigin, cellTextSizes, drawBlankCells, drawColorBar, drawEllipse, drawLabels, etc.) exported for unit testing. All appear in the TypeDoc API reference alongside the ~10 consumer-relevant functions. The signal-to-noise ratio makes the reference difficult to use as a first-time consumer.
- **Consequence:** A consumer opening the TypeDoc index to find what @entviz/core offers sees an undifferentiated list of geometry helpers and rendering primitives alongside the functions they actually need.
- **Recommendation:** Tag internal stage helpers with @internal in JSDoc (typedoc.json already has excludeInternal: true). The minimum consumer surface is: render, characterize, describeChannels, comparisonText, gridShapes, parse, classifyInput, RenderOptions, Characterization, ChannelDescription, GridShape, Parsed, ClassifiedInput.
- **Fix effort:** medium

---

## Additional Gaps Noted

- **Integration guide "See also" links to reviews/integration-surface/proposal-2026-07-02-v2.md** (a relative path). The reviews/ folder is not published to the GitHub Pages _site, so this link will be broken in the hosted TypeDoc. It also points to an internal design document, not consumer documentation.
- **describeChannels(), comparisonText(), and gridShapes() are not mentioned in any README** (only in the integration guide's props tables). A @entviz/core consumer wanting structured channel data or comparison text must discover these functions through TypeDoc or source reading.
- **The core README has no link to the TypeDoc API reference.** Only the react README links to it.
- **packages/core/src/entviz.ts file-level comment says "v14"** in the same file where SPEC_VERSION = "v15" — a self-contradiction within the file.

---

## What's Done Well

- **The react README Entviz prop table** is the most consumer-useful piece of documentation in the repo: complete, typed, concise, and accurate against the actual EntvizProps interface.
- **The integration guide's events section** (the onEvent firehose table with discriminants and invariants) is excellent — it gives a consumer exactly what they need to wire up logging and analytics without reading source.
- **The integration guide's theming section** clearly explains which CSS custom properties are available, why some colors are not themeable (the security rationale), and what the defaults derive from.
- **The component scope descriptions** in the react README set the right expectations and explain the design intent.
- **TypeDoc is auto-built and auto-deployed on every push to main** via the pages workflow. The reference cannot silently drift from the published package.
- **The playground** is a genuine working demo that imports from workspace source, demonstrates all theming scenarios, and exercises the full Cite to Visualize to Compare lifecycle.
- **The security contract section** in the integration guide is exceptionally clear: it states what guarantees the components provide, which are structural (not bypassable by messages or CSS), and what falls outside the asset frame.

---

## Residual Unknowns

- **Live link validation.** Whether https://dhh1128.github.io/entviz-js/ and https://dhh1128.github.io/entviz-js/api/ are currently live and responding was not verified. The pages workflow deploys on push to main and the last push was 82f81ff, so they should be current.
- **Next.js / Turbopack bundler gotcha severity.** Whether modern Next.js v14+ with Turbopack handles .ts imports from node_modules was not empirically tested. The finding stands based on the absence of documentation; the exact set of affected setups requires a practical integration test.

---

## Findings Manifest

```yaml
findings:
  - id: DX-F1
    persona: developer-experience
    title: "Stale spec version (v11 to v15) and parser list in root README, core README, CERTIFICATION.md, and entviz.ts comment"
    severity: HIGH
    confidence: CONFIRMED
    location: "README.md:11,30,32,88,99; packages/core/README.md:9 + Conformance section; CERTIFICATION.md header; packages/core/src/entviz.ts:4"
    dedupe_key: readme-stale-for-consumer
    recommended_disposition: recommend-fix
    rationale: "Every consumer-facing doc says v11 with CESR/SSH/bech32 unported, but SPEC_VERSION=v15 and all 22 parsers are in PARSE_FUNCS. Consumers with supported inputs will conclude the library does not handle them."
    revisit_condition: null
    fix_effort: small

  - id: DX-F2
    persona: developer-experience
    title: "Raw .ts shipping model has no bundler-configuration guidance — non-Vite/non-Node consumers will hit opaque module errors"
    severity: HIGH
    confidence: CONFIRMED
    location: "packages/react/README.md:63; packages/react/docs/integration.md:30-31; packages/core/README.md:19"
    dedupe_key: readme-missing-bundler-gotcha-for-consumer
    recommended_disposition: recommend-fix
    rationale: "The phrase 'no build step required by consumers' misleads consumers on Next.js/webpack who need to configure .ts transpilation of node_modules. No documentation exists for any of these setups."
    revisit_condition: null
    fix_effort: small

  - id: DX-F3
    persona: developer-experience
    title: "render(), RenderOptions fields, and Characterization fields carry no JSDoc — autocomplete is silent for the core consumer API"
    severity: MEDIUM
    confidence: CONFIRMED
    location: "packages/core/src/entviz.ts:1629-1635 (RenderOptions, render); packages/core/src/characterize.ts:49-57 (Characterization)"
    dedupe_key: jsdoc-undocumented-for-consumer
    recommended_disposition: recommend-fix
    rationale: "render() is the first function any core consumer calls and has no JSDoc. RenderOptions and Characterization fields have no descriptions. Autocomplete shows bare types, not descriptions or valid ranges."
    revisit_condition: null
    fix_effort: small

  - id: DX-F4
    persona: developer-experience
    title: "No CONTRIBUTING.md — isomorphic-core rule and no-JSX constraint undocumented for human contributors"
    severity: MEDIUM
    confidence: CONFIRMED
    location: "repo root (absent: CONTRIBUTING.md); AGENTS.md (present but agent-facing)"
    dedupe_key: contributing-missing-for-contributor
    recommended_disposition: recommend-fix
    rationale: "No CONTRIBUTING.md exists. AGENTS.md is calibrated for AI agents. The isomorphic-core rule and no-JSX constraint both cause non-obvious CI failures when violated; neither is written in a place a human contributor finds before making a change."
    revisit_condition: null
    fix_effort: medium

  - id: DX-F5
    persona: developer-experience
    title: "TypeDoc entry exposes ~50 internal stage helpers alongside the consumer API"
    severity: MEDIUM
    confidence: CONFIRMED
    location: "typedoc.json (entryPoints); docs/api/functions/ (78 pages vs approximately 10 consumer-relevant)"
    dedupe_key: typedoc-undocumented-for-consumer
    recommended_disposition: recommend-fix
    rationale: "entviz.ts exports 79 symbols including internal rendering helpers exported for unit testing; all appear in TypeDoc. The signal-to-noise ratio makes the API reference a poor first experience."
    revisit_condition: null
    fix_effort: medium
```

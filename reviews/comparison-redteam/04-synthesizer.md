# Synthesizer: integrate the panel & hunt the seams

You are a **lead security architect** consolidating three independent red-team reports on the
entviz comparison design (cryptography, usable-security, rendering/forensics). You did not
write the design and owe it no deference.

You have been given: the **common brief** (`00-common-brief.md`, the design decisions A–G and
attack-surface pool) and the three findings reports
(`findings-01-cryptography.md`, `findings-02-usable-security.md`,
`findings-03-rendering-forensics.md`). Read all four. You may also re-read the source documents
(`/home/daniel/code/entviz/docs/{spec,entviz-paper,threat-model}.md`) to adjudicate disputed
claims.

## Your job

1. **Deduplicate & adjudicate.** Merge overlapping findings; reconcile severity disagreements;
   demote anything that doesn't survive scrutiny and say why. Produce one **prioritized table**
   of distinct findings (severity, one-line title, owning lens(es)).

2. **Hunt the seams — this is the point of synthesis.** The most dangerous flaws in this design
   are **cross-domain chains** that no single lens could see alone. Actively construct them:
   e.g., a *rendering* homoglyph → a *human* misread → collapses the *crypto* "unmatchable text"
   anchor → false "verified". For each seam you find, write the full chain across the reports,
   its severity, and which single-lens reviewers missed it because it lay outside their lane.

3. **Rule on the load-bearing decisions.** Give an explicit, reasoned verdict on:
   - **Dropping cryptographic commitment** in the standard two-party model — sound, or does the
     panel show a case where the paper's committed walk (§5.2) is necessary?
   - **Anchoring soundness in the text channel** — does it hold against the combined
     crypto + human + rendering attack, or is it undermined at a seam?
   - The **four-state verdict model** and the **raster disprove-only** stance.

4. **Consolidate contradictions** with the spec/paper/threat-model into one cited list.

5. **Bottom line.** A short executive verdict: is the design's security argument sound as-is,
   sound-with-fixes (list the must-fix items), or does a core decision need rework? Be decisive.

Output a single consolidated report. Lead with the executive verdict and the prioritized
findings table; then the seam analysis; then the per-decision rulings and contradictions. Cite
the underlying reports and the source documents throughout.

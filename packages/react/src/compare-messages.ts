// Localization strings for <EntvizCompare>. Same discipline as pill-messages
// (§8): only CHROME is localized — never a value, comparison text, or verdict
// semantics. M1a ships English content with the shared localization framework
// (fmt + isRtlLocale from pill-messages); the full per-locale catalog will be
// filled once the comparison surface stabilises through M1b/M1c.

export interface CompareMessages {
  heading: string;
  yours: string;
  reference: string;
  pastePrompt: string;
  provenancePasted: string;
  provenanceFile: string;
  provenanceUrl: string; // "Reference: {origin}"
  provenanceDropped: string;
  provenanceProvided: string;
  pickFile: string;
  dropHint: string;
  urlPlaceholder: string;
  fetchButton: string;
  fetchHint: string; // "Will fetch from {origin}"
  fetchError: string; // "…({error})"
  walkLaunch: string;
  pending: string;
  identical: string;
  different: string;
  unknownAmbiguous: string;
  unknownRaster: string;
  unknownReason: string; // "{reason}" — a machine reason for an `unknown` verdict
  secretWarning: string;
  recognitionNote: string;
  referencePlaceholder: string; // the empty reference slot, before a value is given
  machineCheck: string; // label prefixing the verdict — it's the machine's determination
}

export const defaultCompareMessages: CompareMessages = {
  heading: "Compare visualizations",
  yours: "Yours",
  reference: "Reference",
  pastePrompt: "Paste a reference value or entviz SVG to compare",
  provenancePasted: "Reference: pasted",
  provenanceFile: "Reference: file",
  provenanceUrl: "Reference: {origin}",
  provenanceDropped: "Reference: dropped",
  provenanceProvided: "Reference: provided",
  pickFile: "Choose a file…",
  dropHint: "…or drop an entviz SVG / file here",
  urlPlaceholder: "https://… (URL of an entviz SVG)",
  fetchButton: "Fetch",
  fetchHint: "Will fetch from {origin}",
  fetchError: "Couldn’t fetch that URL ({error})",
  pending: "Paste, pick, drop, or link a reference to compare",
  identical: "Identical — the same value",
  different: "Different — not the same value",
  unknownAmbiguous: "Couldn’t recognize that — paste a reference value or entviz SVG",
  unknownRaster: "Comparing the image…",
  unknownReason: "Couldn’t confirm a match — {reason}",
  walkLaunch: "Verify by walking the cells →",
  secretWarning:
    "This looks like secret key material. Comparison does not keep it confidential — only compare values you’re willing to expose here.",
  recognitionNote:
    "A match means the two values are equal; it does not vouch for the reference being the one you should trust.",
  referencePlaceholder: "The reference will appear here",
  machineCheck: "Machine check",
};

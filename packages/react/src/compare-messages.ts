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
  pending: string;
  identical: string;
  different: string;
  unknownAmbiguous: string;
  unknownSvg: string;
  unknownRaster: string;
  unknownReason: string; // "{reason}" — a machine reason for an `unknown` verdict
  secretWarning: string;
  recognitionNote: string;
}

export const defaultCompareMessages: CompareMessages = {
  heading: "Compare visualizations",
  yours: "Yours",
  reference: "Reference",
  pastePrompt: "Paste the reference value to compare",
  provenancePasted: "Reference: pasted",
  pending: "Paste a reference to compare",
  identical: "Identical — the same value",
  different: "Different — not the same value",
  unknownAmbiguous: "Couldn’t recognize that — paste the reference value",
  unknownSvg: "Comparing a pasted SVG is coming in a later release",
  unknownRaster: "Comparing a pasted image is coming in a later release",
  unknownReason: "Couldn’t determine a match — {reason}",
  secretWarning:
    "This looks like secret key material. Comparison does not keep it confidential — only compare values you’re willing to expose here.",
  recognitionNote:
    "A match means the two values are equal; it does not vouch for the reference being the one you should trust.",
};

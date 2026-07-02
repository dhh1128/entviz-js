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
  imagePasted: string; // the marker shown in the input when a raster image is the reference
  imageAlt: string; // alt text for the pasted/dropped reference image
  dropHint: string; // shown in the empty reference slot — it doubles as a drop target
  urlPlaceholder: string;
  fetchButton: string;
  fetchHint: string; // "Will fetch from {origin}"
  fetchError: string; // "…({error})"
  walkSpotCheck: string;
  walkSpotCheckHint: string;
  walkComplete: string;
  walkCompleteHint: string;
  urlReady: string; // chip label when a URL is detected but not yet fetched
  pending: string;
  identical: string;
  different: string;
  unknownAmbiguous: string;
  unknownRaster: string;
  unknownReason: string; // "{reason}" — a machine reason for an `unknown` verdict
  unknownRasterSimilar: string; // the raster look-alike verdict (pixels matched, text unchecked)
  secretWarning: string;
  recognitionNote: string;
  machineCheck: string; // label prefixing the verdict — it's the machine's determination
  voiceLaunch: string; // the "Compare by voice" tab label
}

export const defaultCompareMessages: CompareMessages = {
  heading: "Compare visualizations",
  yours: "Yours",
  reference: "Reference",
  pastePrompt: "Paste a value, an entviz SVG, or a URL — or pick a file — to compare",
  provenancePasted: "Reference: pasted",
  provenanceFile: "Reference: file",
  provenanceUrl: "Reference: {origin}",
  provenanceDropped: "Reference: dropped",
  provenanceProvided: "Reference: provided",
  pickFile: "Choose a file…",
  imagePasted: "[image]",
  imageAlt: "Pasted reference image",
  dropHint: "Drop an entviz SVG or image here",
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
  unknownRasterSimilar: "No visible difference in the colors we can sample — but an image can’t be read for text, so this isn’t a proven match. Walk the cells to check.",
  walkSpotCheck: "Spot-check",
  walkSpotCheckHint: "Sample features in a surprising order; stop when you're satisfied",
  walkComplete: "Check (complete)",
  walkCompleteHint: "Read every cell",
  urlReady: "A URL — fetch it to compare",
  secretWarning:
    "This looks like secret key material. Comparison does not keep it confidential — only compare values you’re willing to expose here.",
  recognitionNote:
    "A match means the two values are equal; it does not vouch for the reference being the one you should trust.",
  machineCheck: "Machine check",
  voiceLaunch: "Compare by voice",
};

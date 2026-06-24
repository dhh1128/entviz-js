/**
 * <EntvizCompare /> — helps a human decide whether THEIR value matches a
 * REFERENCE, by comparing entviz visualizations. This is Milestone 1a: the
 * machine "I have something to check against" flow for a pasted **value**
 * reference (the text engine). Dropping/linking an SVG or image, the guided
 * human walk, and the two-party live ceremony come in later milestones.
 *
 * Security discipline (packages/react/docs/comparison-design.md): the affirmative
 * `=` is shown ONLY for a machine `identical` verdict (§3); `unknown` ("couldn't
 * read the reference") is surfaced distinctly from `different` so a bad reference
 * can't be read as "they differ"; provenance is first-class; and a green verdict
 * means "equal to THIS reference", never "this reference is trustworthy" (§2.4).
 * Authored with React.createElement (no JSX) so the package ships raw .ts source.
 */
import {
  createElement as h,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { compareValues, detectMedium, type Verdict } from "@entviz/core";
import { Entviz } from "./Entviz.ts";
import { fmt, isRtlLocale } from "./pill-messages.ts";
import { defaultCompareMessages, type CompareMessages } from "./compare-messages.ts";

export interface EntvizCompareProps {
  // --- the user's own value + its render inputs (deterministic) ---
  value: string;
  targetAr?: number;
  fontSizePt?: number;
  note?: string | null;
  // --- reference (M1a: a pasted text value; svg/raster/url come later) ---
  reference?: { kind: "text"; data: string };
  /** Reserved for the deferred guided walk; accepted but unused in M1a. */
  confidence?: "quick" | "strong" | "paranoid";
  // --- chrome ---
  locale?: string;
  messages?: Partial<CompareMessages>;
  onVerdict?: (v: Verdict) => void;
  className?: string;
  style?: CSSProperties;
}

export type CompareResult =
  | { kind: "pending" }
  | { kind: "verdict"; verdict: Verdict }
  | { kind: "deferred"; medium: "svg" | "raster" }
  | { kind: "ambiguous" };

/** Pure: route a pasted reference to a machine result (no DOM, unit-tested). */
export function classifyResult(value: string, refValue: string): CompareResult {
  if (!refValue.trim()) return { kind: "pending" };
  const medium = detectMedium(refValue);
  if (medium === "text") return { kind: "verdict", verdict: compareValues(value, refValue) };
  if (medium === "svg" || medium === "raster") return { kind: "deferred", medium };
  return { kind: "ambiguous" };
}

/** Heuristic "is this secret key material?" so we can warn before it's pasted in
 *  (confidentiality is out of scope — comparison-design.md §5). */
export function looksLikeSecret(s: string): boolean {
  const t = s.trim();
  if (/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/.test(t)) return true;
  if (/\b(xprv|xpriv|tprv)[0-9A-Za-z]{50,}\b/.test(t)) return true;
  const words = t.split(/\s+/);
  if (words.length >= 12 && words.length <= 24 && words.every((w) => /^[a-z]{3,8}$/.test(w))) return true;
  return false;
}

interface Chip {
  symbol: string;
  label: string;
  tone: "good" | "bad" | "warn" | "neutral";
}

function chipFor(result: CompareResult, m: CompareMessages): Chip {
  switch (result.kind) {
    case "pending":
      return { symbol: "?", label: m.pending, tone: "neutral" };
    case "ambiguous":
      return { symbol: "?", label: m.unknownAmbiguous, tone: "warn" };
    case "deferred":
      return {
        symbol: "…",
        label: result.medium === "svg" ? m.unknownSvg : m.unknownRaster,
        tone: "neutral",
      };
    default: {
      const v = result.verdict;
      // The text engine yields only identical / different.
      return v.state === "identical"
        ? { symbol: "=", label: m.identical, tone: "good" }
        : { symbol: "≠", label: m.different, tone: "bad" };
    }
  }
}

const TONE: Record<Chip["tone"], string> = {
  good: "var(--entviz-compare-good, #1a7f37)",
  bad: "var(--entviz-compare-bad, #c4314b)",
  warn: "var(--entviz-compare-warn, #9a6700)",
  neutral: "var(--entviz-compare-neutral, #57606a)",
};

export function EntvizCompare(props: EntvizCompareProps): ReactNode {
  const { value, targetAr, fontSizePt, note, reference, locale, messages: overrides, onVerdict, className, style } = props;
  const m: CompareMessages = { ...defaultCompareMessages, ...overrides };
  const rtl = isRtlLocale(locale ?? "");

  const controlledRef = reference?.kind === "text" ? reference.data : undefined;
  const [pasted, setPasted] = useState("");
  const refValue = controlledRef ?? pasted;

  const result = useMemo(() => classifyResult(value, refValue), [value, refValue]);
  useEffect(() => {
    if (result.kind === "verdict") onVerdict?.(result.verdict);
  }, [result, onVerdict]);

  const secret = looksLikeSecret(value) || looksLikeSecret(refValue);
  const chip = chipFor(result, m);
  const opts = { targetAr, fontSizePt, note };

  // reference panel: an Entviz once the pasted/linked reference is a value
  const referencePanel = result.kind === "verdict"
    ? h(Entviz, { value: refValue, targetAr, fontSizePt, note, style: panelEntviz })
    : null;

  const pasteBox = controlledRef === undefined
    ? h("textarea", {
        value: pasted,
        onChange: (e: { target: { value: string } }) => setPasted(e.target.value),
        "aria-label": m.pastePrompt,
        placeholder: m.pastePrompt,
        spellCheck: false,
        autoComplete: "off",
        rows: 2,
        style: textareaStyle,
      })
    : null;

  return h(
    "div",
    {
      dir: rtl ? "rtl" : undefined,
      className,
      style: { display: "inline-flex", flexDirection: "column", gap: 10, font: "inherit", ...style },
    },
    h("strong", { style: { fontSize: "0.95em" } }, m.heading),
    secret
      ? h("span", { role: "alert", style: warnBanner }, m.secretWarning)
      : null,
    h(
      "div",
      { style: { display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" } },
      // Yours
      h(
        "div",
        { style: panelStyle },
        h("span", { style: panelLabel }, m.yours),
        h(Entviz, { value, targetAr, fontSizePt, note, style: panelEntviz }),
      ),
      // Reference
      h(
        "div",
        { style: panelStyle },
        h("span", { style: panelLabel }, m.reference),
        pasteBox,
        referencePanel,
        refValue.trim() ? h("span", { style: provenance }, m.provenancePasted) : null,
      ),
    ),
    // verdict chip
    h(
      "span",
      { role: "status", "aria-live": "polite", style: { ...chipStyle, color: TONE[chip.tone], borderColor: TONE[chip.tone] } },
      h("span", { "aria-hidden": true, style: { fontWeight: 700, fontSize: "1.1em" } }, chip.symbol),
      h("span", null, chip.label),
    ),
    h("span", { style: caption }, m.recognitionNote),
  );
}

const panelStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 6, minWidth: 180 };
const panelLabel: CSSProperties = { fontSize: "0.8em", opacity: 0.7 };
const panelEntviz: CSSProperties = { width: 180, display: "block" };
const textareaStyle: CSSProperties = {
  font: "0.85em ui-monospace, monospace", padding: "6px 8px", borderRadius: 6,
  border: "var(--entviz-compare-input-border, 1px solid #d0d7de)", resize: "vertical", minWidth: 180,
};
const chipStyle: CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 8, alignSelf: "flex-start",
  padding: "4px 10px", borderRadius: 999, border: "1px solid", font: "inherit", fontSize: "0.9em",
};
const warnBanner: CSSProperties = {
  background: "var(--entviz-compare-warn-bg, #fff8c5)", color: "var(--entviz-compare-warn-fg, #633c01)",
  border: "1px solid var(--entviz-compare-warn-border, #d4a72c)", borderRadius: 6, padding: "6px 10px", fontSize: "0.85em",
};
const provenance: CSSProperties = { fontSize: "0.75em", opacity: 0.6 };
const caption: CSSProperties = { fontSize: "0.75em", opacity: 0.6, maxWidth: 380 };

export default EntvizCompare;

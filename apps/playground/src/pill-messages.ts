// Localization catalog for the EntvizPill chrome (prototype).
//
// IMPORTANT (security): only CHROME is localized here — never the copied value
// or comparison text, and never via locale-aware case operations. See
// packages/react/docs/pill-design.md §8.
//
// Non-English strings are machine-drafted and NEED NATIVE REVIEW before this
// graduates into @entviz/react. Placeholders: {type}, {n}, {unit}.

export interface Messages {
  view: string; // tooltip / "View full" menu item
  ariaView: string; // accessible label for the pill ("...{type}")
  copyValue: string;
  copyComparison: string;
  copyImage: string;
  copySvg: string;
  copiedValue: string; // "...{n} {unit}"
  copiedComparison: string; // "...{n} cells"
  copiedImage: string;
  copiedSvg: string;
  copyFailed: string;
}

const en: Messages = {
  view: "View visualization",
  ariaView: "view visualization, {type}",
  copyValue: "Copy value",
  copyComparison: "Copy comparison text",
  copyImage: "Copy image",
  copySvg: "Copy SVG",
  copiedValue: "Copied value · {n} {unit}",
  copiedComparison: "Copied comparison text · {n} cells",
  copiedImage: "Copied image",
  copiedSvg: "Copied SVG",
  copyFailed: "Copy failed",
};

// A representative demo set (incl. two RTL scripts) so localization + RTL can be
// exercised in the playground. NOT a complete or reviewed translation set.
const CATALOG: Record<string, Messages> = {
  en,
  es: {
    view: "Ver visualización",
    ariaView: "ver visualización, {type}",
    copyValue: "Copiar valor",
    copyComparison: "Copiar texto de comparación",
    copyImage: "Copiar imagen",
    copySvg: "Copiar SVG",
    copiedValue: "Valor copiado · {n} {unit}",
    copiedComparison: "Texto de comparación copiado · {n} celdas",
    copiedImage: "Imagen copiada",
    copiedSvg: "SVG copiado",
    copyFailed: "Error al copiar",
  },
  fr: {
    view: "Voir la visualisation",
    ariaView: "voir la visualisation, {type}",
    copyValue: "Copier la valeur",
    copyComparison: "Copier le texte de comparaison",
    copyImage: "Copier l’image",
    copySvg: "Copier le SVG",
    copiedValue: "Valeur copiée · {n} {unit}",
    copiedComparison: "Texte de comparaison copié · {n} cellules",
    copiedImage: "Image copiée",
    copiedSvg: "SVG copié",
    copyFailed: "Échec de la copie",
  },
  de: {
    view: "Visualisierung anzeigen",
    ariaView: "Visualisierung anzeigen, {type}",
    copyValue: "Wert kopieren",
    copyComparison: "Vergleichstext kopieren",
    copyImage: "Bild kopieren",
    copySvg: "SVG kopieren",
    copiedValue: "Wert kopiert · {n} {unit}",
    copiedComparison: "Vergleichstext kopiert · {n} Zellen",
    copiedImage: "Bild kopiert",
    copiedSvg: "SVG kopiert",
    copyFailed: "Kopieren fehlgeschlagen",
  },
  ja: {
    view: "可視化を表示",
    ariaView: "可視化を表示、{type}",
    copyValue: "値をコピー",
    copyComparison: "比較テキストをコピー",
    copyImage: "画像をコピー",
    copySvg: "SVG をコピー",
    copiedValue: "値をコピーしました · {n} {unit}",
    copiedComparison: "比較テキストをコピーしました · {n} セル",
    copiedImage: "画像をコピーしました",
    copiedSvg: "SVG をコピーしました",
    copyFailed: "コピーに失敗しました",
  },
  ar: {
    view: "عرض التمثيل المرئي",
    ariaView: "عرض التمثيل المرئي، {type}",
    copyValue: "نسخ القيمة",
    copyComparison: "نسخ نص المقارنة",
    copyImage: "نسخ الصورة",
    copySvg: "نسخ SVG",
    copiedValue: "تم نسخ القيمة · {n} {unit}",
    copiedComparison: "تم نسخ نص المقارنة · {n} خلايا",
    copiedImage: "تم نسخ الصورة",
    copiedSvg: "تم نسخ SVG",
    copyFailed: "فشل النسخ",
  },
  he: {
    view: "הצג המחשה",
    ariaView: "הצג המחשה, {type}",
    copyValue: "העתק ערך",
    copyComparison: "העתק טקסט השוואה",
    copyImage: "העתק תמונה",
    copySvg: "העתק SVG",
    copiedValue: "הערך הועתק · {n} {unit}",
    copiedComparison: "טקסט ההשוואה הועתק · {n} תאים",
    copiedImage: "התמונה הועתקה",
    copiedSvg: "‏SVG הועתק",
    copyFailed: "ההעתקה נכשלה",
  },
};

const RTL = new Set(["ar", "he", "fa", "ur"]);

/** True if the (primary subtag of the) locale is an RTL script. */
export function isRtlLocale(locale: string): boolean {
  return RTL.has(locale.toLowerCase().split("-")[0]);
}

/**
 * Resolve a Messages bundle for a locale tag, matching by primary subtag and
 * falling back to English. Pass `undefined` to auto-detect from the browser.
 */
export function resolveMessages(locale?: string): { locale: string; messages: Messages } {
  const tags = locale
    ? [locale]
    : typeof navigator !== "undefined"
      ? [...(navigator.languages ?? [navigator.language])]
      : ["en"];
  for (const tag of tags) {
    const primary = tag.toLowerCase().split("-")[0];
    if (CATALOG[primary]) return { locale: primary, messages: CATALOG[primary] };
  }
  return { locale: "en", messages: en };
}

export const SUPPORTED_LOCALES = Object.keys(CATALOG);

export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

/**
 * describe — structured, color-independent readouts of an entviz's channels,
 * derived deterministically from the render model.
 *
 * Two public helpers:
 *  - `comparisonText(value, opts)` — the canonical read-aloud comparison surface:
 *    the cells' text in grid reading order, space-separated, with blank cells
 *    preserved as a `·` separator (so the head/middle/tail of a large input stay
 *    visually segmented). Case-exact; never localized or re-normalized.
 *  - `describeChannels(value, opts)` — structured channel data (cell text, the
 *    colour-bar band letters, the quartile marks, and the blank-map / colour-bar
 *    marker positions) for building an accessible, colour-independent description
 *    so AT users reach verification parity (pill design §9; paper §5.4).
 *
 * This module COMPOSES the same exported stage functions `render()` uses, so its
 * output cannot drift from the SVG — `test/integration/describe-consistency`
 * cross-checks every field against a freshly rendered entviz. It computes no
 * pixels; it stops at the render *model*. Isomorphic (no Node built-ins, no DOM).
 */
import {
  type RenderOptions,
  type Token,
  classifyInput,
  fingerprintCore,
  tokenizeEntropy,
  computeFingerprint,
  tokenizeFingerprint,
  chooseGrid,
  medianToken,
  quartileTokens,
  selectVisualStyle,
  assignCellIndices,
  minMaxFtokCells,
  blankCellIndices,
  twoBitUsage,
  twoBitFirstAppearance,
  fingerprintMiddleDigest,
  computeGeometry,
  sanitizeNote,
  MAX_TOKENS,
  HEAD_TOKENS,
  MIDDLE_TOKENS,
  BAND_LETTER,
} from "./entviz.ts";

// A blank cell carries no input text; it shows as this separator in the
// comparison string so blank *position* (a fingerprint-driven, CRC-like signal —
// spec "blank-cell step") stays legible and the large-input head/middle/tail
// segments do not run together. Chosen outside every entviz alphabet so it can
// never be mistaken for cell content.
const BLANK_SEP = "·";

// The triangular quartile mark's corner, fixed by quartile rank (drawQuartileMark
// in entviz.ts): rank 1→top-left, 2→top-right, 3→bottom-right, 4→bottom-left. The
// corner is constant across entvizes; the *cell* a rank lands in is the signal.
const QUARTILE_ORIENT = ["top-left", "top-right", "bottom-right", "bottom-left"] as const;

export interface CellDescription {
  index: number;
  row: number;
  col: number;
  /** The cell's token text, or null for a blank cell. */
  text: string | null;
  blank: boolean;
  /** A >512-bit input's neutralised Crockford "fingerprint-middle" cell. */
  fingerprint: boolean;
  /** The cell's 24-bit surround pattern (the fingerprint token's quant, =
   *  `data-surround-bits`); 0 for a blank cell. Geometry-independent per token, so
   *  it gives a strong self-consistency check when comparing two entvizes. */
  surroundBits: number;
}

export interface QuartileDescription {
  rank: number; // 1..4
  /** The cell this quartile mark lands in, or null if that ftok is absent. */
  cellIndex: number | null;
  orientation: (typeof QUARTILE_ORIENT)[number];
}

export interface MarkerDescription {
  /** The blank-cell map's min (dot) / max (plus) ftok cells; null when the grid
   *  has no blank cells (and therefore no map). */
  blankMap: { minCell: number; maxCell: number } | null;
  /** The two colour-bar gutter markers, by slot index within `slots` equal slots. */
  colorBar: { slots: number; left: number; right: number };
}

export interface ChannelDescription {
  typeName: string;
  /** True for a >512-bit input (text channel is head + fingerprint-middle + tail). */
  truncated: boolean;
  cols: number;
  rows: number;
  /** Every grid cell in reading order (index 0 → cols*rows-1). */
  cells: CellDescription[];
  /** Colour-bar band letters, top → bottom, lowercase (the rendered glyphs). */
  colorBarLetters: string[];
  quartiles: QuartileDescription[];
  markers: MarkerDescription;
}

// Recompute the render model (no geometry beyond what the colour-bar markers
// need). Mirrors render()'s orchestration over the shared stage functions.
function buildModel(value: string, opts: RenderOptions = {}): ChannelDescription {
  const rawInput = value.trim();
  const { core, typeName, alphabet, prefix, suffix, prefixSemantic } = classifyInput(rawInput);
  const fpCore = fingerprintCore(core, prefix, prefixSemantic);

  const { tokens, truncated } = tokenizeEntropy(core, alphabet);
  const tokenCount = tokens.length;
  const digest = computeFingerprint(fpCore);
  const usedFtoks = tokenizeFingerprint(digest).slice(0, tokenCount);
  const targetAr = opts.targetAr ?? 1.0;
  const grid = chooseGrid(truncated ? MAX_TOKENS : tokenCount, targetAr);
  const medFtok = medianToken(usedFtoks) as Token;
  const quartFtoks = quartileTokens(usedFtoks);
  const style = selectVisualStyle(medFtok);
  const cellIndices = assignCellIndices(tokens, grid, medFtok, usedFtoks);
  const usedCellIndices = new Set(cellIndices.values());

  // >512-bit: token indices 8..11 are the neutralised Crockford middle cells.
  // Those indices are always present on the truncated path (20 tokens), so the
  // lookup is non-defensive — matching render()'s own assumptions.
  const fpMiddleCells = new Set<number>();
  if (truncated) {
    for (let ti = HEAD_TOKENS; ti < HEAD_TOKENS + MIDDLE_TOKENS; ti++) {
      fpMiddleCells.add(cellIndices.get(ti) as number);
    }
  }

  const textByCell = new Map<number, string>();
  const surroundByCell = new Map<number, number>();
  for (const t of tokens) {
    const ci = cellIndices.get(t.index) as number;
    textByCell.set(ci, t.text);
    // The surround pattern is the fingerprint token's 24-bit quant (= the cell's
    // declared data-surround-bits in the SVG).
    surroundByCell.set(ci, usedFtoks[t.index].quant);
  }

  const cells: CellDescription[] = [];
  for (let ci = 0; ci < grid.cols * grid.rows; ci++) {
    const blank = !usedCellIndices.has(ci);
    cells.push({
      index: ci,
      row: Math.floor(ci / grid.cols),
      col: ci % grid.cols,
      text: blank ? null : (textByCell.get(ci) as string),
      blank,
      fingerprint: fpMiddleCells.has(ci),
      surroundBits: blank ? 0 : (surroundByCell.get(ci) as number),
    });
  }

  // Colour-bar band letters in vertical (first-appearance) order — mirrors
  // drawColorBar: only patterns that occur in the digest get a band.
  const usage = twoBitUsage(digest, style.edgeColors);
  const bandOrder = twoBitFirstAppearance(digest, style.edgeColors);
  const orderPos = new Map<string, number>();
  bandOrder.forEach((c, i) => orderPos.set(c, i));
  const paletteOrder = new Map<string, number>();
  style.edgeColors.forEach((c, i) => paletteOrder.set(c, i));
  // Every edge colour is keyed in `usage` and `orderPos` (twoBitUsage /
  // twoBitFirstAppearance set all four), so these lookups are non-defensive.
  const usedBands = style.edgeColors
    .map((c) => [c, usage.get(c) as number] as [string, number])
    .filter(([, cnt]) => cnt > 0);
  usedBands.sort(
    (a, b) =>
      (orderPos.get(a[0]) as number) - (orderPos.get(b[0]) as number) ||
      (paletteOrder.get(a[0]) as number) - (paletteOrder.get(b[0]) as number),
  );
  const colorBarLetters = usedBands.map(([c]) => BAND_LETTER[c].toLowerCase());

  // A non-null quartile ftok's index is always one of the placed tokens, so its
  // cell is always known; a null ftok (fewer than 4 tokens) yields a null cell.
  const quartiles: QuartileDescription[] = quartFtoks.map((q, qIdx) => ({
    rank: qIdx + 1,
    cellIndex: q ? (cellIndices.get(q.index) as number) : null,
    orientation: QUARTILE_ORIENT[qIdx],
  }));

  const blankIndices = blankCellIndices(grid, usedCellIndices);
  let blankMap: MarkerDescription["blankMap"] = null;
  if (blankIndices.length) {
    const { minCi, maxCi } = minMaxFtokCells(tokens, usedFtoks, cellIndices);
    blankMap = { minCell: minCi, maxCell: maxCi };
  }

  // The two colour-bar markers ride K equal gutter slots, where K depends on the
  // bar height — so this is the one channel needing geometry (font-size + whether
  // a bottom strip is present). Matches drawColorBar's K and slot math exactly.
  const fontSizePt = opts.fontSizePt ?? 12;
  const hasBottom = Boolean(suffix) || Boolean(sanitizeNote(opts.note ?? null));
  const { boundingH } = computeGeometry(fontSizePt, grid, hasBottom);
  const barHeight = boundingH - 2;
  const slots = Math.max(4, Math.min(16, Math.floor(barHeight / 12)));
  const secondDigest = fingerprintMiddleDigest(core);
  const markers: MarkerDescription = {
    blankMap,
    colorBar: { slots, left: secondDigest[12] % slots, right: secondDigest[13] % slots },
  };

  return {
    typeName,
    truncated,
    cols: grid.cols,
    rows: grid.rows,
    cells,
    colorBarLetters,
    quartiles,
    markers,
  };
}

/**
 * The canonical comparison text: the cells' text in grid reading order
 * (left→right, top→bottom), space-separated, with each blank cell preserved as a
 * `·`. Case-exact — this is the read-aloud verification surface, never localized.
 */
export function comparisonText(value: string, opts: RenderOptions = {}): string {
  const { cells } = buildModel(value, opts);
  return cells.map((c) => (c.blank ? BLANK_SEP : (c.text as string))).join(" ");
}

/** Structured, colour-independent channel data for an accessible description. */
export function describeChannels(value: string, opts: RenderOptions = {}): ChannelDescription {
  return buildModel(value, opts);
}

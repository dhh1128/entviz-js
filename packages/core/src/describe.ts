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
 *    color-bar band letters, the quartile marks, and the blank-map / color-bar
 *    marker positions) for building an accessible, color-independent description
 *    so AT users reach verification parity (pill design §9; paper §5.4).
 *
 * This module COMPOSES the same exported stage functions `render()` uses, so its
 * output cannot drift from the SVG — `test/integration/describe-consistency`
 * cross-checks every field against a freshly rendered entviz. It also exposes the
 * feature *geometry* (`ChannelDescription.geometry`) so the comparison walk can
 * draw focus rings without parsing the SVG. Isomorphic (no Node built-ins, no DOM).
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
  nucleusColors,
  blankCellIndices,
  twoBitUsage,
  twoBitFirstAppearance,
  fingerprintMiddleDigest,
  computeGeometry,
  MARGIN,
  enumerateInteriorCorners,
  enumerateExternalCorners,
  gridCandidates,
  gridAspectRatio,
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
  /** The rendered nucleus fill (`#rrggbb`), or null for a blank cell — the color
   *  the raster engine samples and compares (§6.3). A fingerprint-middle cell's
   *  nucleus is the neutralised entviz background. */
  nucleusColor: string | null;
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
  /** The two color-bar gutter markers, by slot index within `slots` equal slots. */
  colorBar: { slots: number; left: number; right: number };
}

/** An axis-aligned rectangle in the entviz's own user-units (the SVG viewBox
 *  coordinate system). */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Pixel geometry of each highlightable feature, in viewBox user-units — so a
 *  comparison/walk UI can draw a focus ring AROUND any feature without parsing
 *  the rendered SVG (it never mutates the closed-profile artifact). Derived in
 *  the same model pass as the structural channels, and cross-checked against a
 *  freshly rendered SVG by `test/integration/describe-consistency`. */
export interface LayoutGeometry {
  /** The root SVG viewBox, "0 0 W H". */
  viewBox: string;
  /** Nucleus rect of each cell, in cell-index order (matches `cells`). */
  cellRects: Rect[];
  /** The grid background rect (the "background color" feature). */
  gridRect: Rect;
  /** The visible ellipse overlay's axis-aligned bounding box: the bbox of the
   *  ROTATED ellipse, clipped to the grid (the ellipse is drawn under the grid
   *  clip-path). Always present — the ellipse is always drawn. */
  ellipse: Rect;
  /** The whole color bar (the bands stack to fill it). */
  colorBar: Rect;
  /** The two color-bar gutter marker discs (left, right), as bounding rects. */
  colorBarMarkers: Rect[];
}

export interface ChannelDescription {
  typeName: string;
  /** True for a >512-bit input (text channel is head + fingerprint-middle + tail). */
  truncated: boolean;
  cols: number;
  rows: number;
  /** Every grid cell in reading order (index 0 → cols*rows-1). */
  cells: CellDescription[];
  /** The grid background color (`#rrggbb`, an entviz palette color, never black). */
  bgColor: string;
  /** Color-bar band letters, top → bottom, lowercase (the rendered glyphs). */
  colorBarLetters: string[];
  /** Color-bar bands, top → bottom: the exact band color + its usage count (band
   *  height is a function of the count). For the raster color-bar check (§6.3). */
  colorBarBands: { color: string; count: number }[];
  quartiles: QuartileDescription[];
  markers: MarkerDescription;
  /** Pixel geometry of every highlightable feature (for the comparison walk's
   *  focus rings) — see {@link LayoutGeometry}. */
  geometry: LayoutGeometry;
}

// Recompute the render model (no geometry beyond what the color-bar markers
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
  const nucleusByCell = new Map<number, string>();
  for (const t of tokens) {
    const ci = cellIndices.get(t.index) as number;
    textByCell.set(ci, t.text);
    // The surround pattern is the fingerprint token's 24-bit quant (= the cell's
    // declared data-surround-bits in the SVG).
    surroundByCell.set(ci, usedFtoks[t.index].quant);
    // The nucleus fill: the entropy token's quant as a color, EXCEPT a >512-bit
    // fingerprint-middle cell, whose nucleus is neutralised to the entviz bg
    // (mirrors render()'s nucleusBg pick).
    nucleusByCell.set(ci, fpMiddleCells.has(ci) ? style.bgColor : nucleusColors(t.quant)[0]);
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
      nucleusColor: blank ? null : (nucleusByCell.get(ci) as string),
      surroundBits: blank ? 0 : (surroundByCell.get(ci) as number),
    });
  }

  // Color-bar band letters in vertical (first-appearance) order — mirrors
  // drawColorBar: only patterns that occur in the digest get a band.
  const usage = twoBitUsage(digest, style.edgeColors);
  const bandOrder = twoBitFirstAppearance(digest, style.edgeColors);
  const orderPos = new Map<string, number>();
  bandOrder.forEach((c, i) => orderPos.set(c, i));
  const paletteOrder = new Map<string, number>();
  style.edgeColors.forEach((c, i) => paletteOrder.set(c, i));
  // Every edge color is keyed in `usage` and `orderPos` (twoBitUsage /
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
  const colorBarBands = usedBands.map(([color, count]) => ({ color, count }));

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

  // The two color-bar markers ride K equal gutter slots, where K depends on the
  // bar height — so this is the one channel needing geometry (font-size + whether
  // a bottom strip is present). Matches drawColorBar's K and slot math exactly.
  const fontSizePt = opts.fontSizePt ?? 12;
  const hasBottom = Boolean(suffix) || Boolean(sanitizeNote(opts.note ?? null));
  const geom = computeGeometry(fontSizePt, grid, hasBottom);
  // v12: color bar height spans the inner field minus the two border pixels
  // (== boundingH - 2*MARGIN - 2). Mirrors drawColorBar's barHeight exactly.
  const barHeight = geom.boundingH - 2 * MARGIN - 2;
  const slots = Math.max(4, Math.min(16, Math.floor(barHeight / 12)));
  const secondDigest = fingerprintMiddleDigest(core);
  const markers: MarkerDescription = {
    blankMap,
    colorBar: { slots, left: secondDigest[12] % slots, right: secondDigest[13] % slots },
  };

  const geometry = computeLayoutGeometry(geom, grid, cells, markers, digest, slots);

  return {
    typeName,
    truncated,
    cols: grid.cols,
    rows: grid.rows,
    cells,
    bgColor: style.bgColor,
    colorBarLetters,
    colorBarBands,
    quartiles,
    markers,
    geometry,
  };
}

// Pixel geometry of every highlightable feature, mirroring the placement math in
// render()/drawColorBar()/drawEllipse() (the ellipse and color bar are always
// drawn — their guards are unreachable for any real grid). Kept honest by
// describe-consistency, which cross-checks every rect against a rendered SVG.
function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

function computeLayoutGeometry(
  geom: ReturnType<typeof computeGeometry>,
  grid: { cols: number; rows: number },
  cells: CellDescription[],
  markers: MarkerDescription,
  digest: Uint8Array,
  slots: number,
): LayoutGeometry {
  const {
    gridLeft, gridTop, gridW, gridH, cellWidth, cellHeight, boxWidth, boxHeight,
    nucleusWidth, nucleusHeight, barWidth, boundingW, boundingH,
  } = geom;

  // Each cell's nucleus rect (filled cell nucleus and blank-cell pill share it).
  const cellRects: Rect[] = cells.map((c) => ({
    x: gridLeft + c.col * cellWidth + boxWidth,
    y: gridTop + c.row * cellHeight + boxHeight,
    w: nucleusWidth,
    h: nucleusHeight,
  }));

  const gridRect: Rect = { x: gridLeft, y: gridTop, w: gridW, h: gridH };

  // Color bar: the bands stack to fill the gutter, so the union is the whole bar.
  // v12: inset by MARGIN (barLeft/barTop = MARGIN + 1; barHeight = boundingH -
  // 2*MARGIN - 2), mirroring drawColorBar.
  const barLeft = MARGIN + 1, barTop = MARGIN + 1, barHeight = boundingH - 2 * MARGIN - 2;
  const colorBar: Rect = { x: barLeft, y: barTop, w: barWidth, h: barHeight };

  // The two gutter marker discs (mirrors drawColorBar's slot/radius/inset math).
  const slotH = barHeight / slots;
  const radius = barWidth * 0.17;
  const inset = barWidth * 0.06;
  const discRect = (slot: number, side: "left" | "right"): Rect => {
    const cy = barTop + (slot + 0.5) * slotH;
    const cx = side === "left" ? barLeft + inset + radius : barLeft + barWidth - inset - radius;
    return { x: cx - radius, y: cy - radius, w: 2 * radius, h: 2 * radius };
  };
  const colorBarMarkers: Rect[] = [
    discRect(markers.colorBar.left, "left"),
    discRect(markers.colorBar.right, "right"),
  ];

  // Ellipse focus-ring bounding box (mirrors drawEllipse; the early-return guards
  // never fire for a real grid). The rendered ellipse is ROTATED by rotationDeg and
  // CLIPPED to the grid, so the ring's box is the axis-aligned bbox of the *rotated*
  // ellipse, intersected with the grid — using the unrotated bbox (or ignoring the
  // clip) drew the ring in the wrong place and let it start off the figure.
  const interior = (grid.cols - 1) * (grid.rows - 1);
  const pts =
    interior >= 6
      ? enumerateInteriorCorners(grid.cols, grid.rows, cellWidth, cellHeight, gridLeft, gridTop)
      : enumerateExternalCorners(grid.cols, grid.rows, cellWidth, cellHeight, gridLeft, gridTop);
  const [ax, ay] = pts[digest[60] % pts.length];
  const gridRight = gridLeft + gridW, gridBottom = gridTop + gridH;
  let dFar = 0;
  for (const [cx, cy] of [
    [gridLeft, gridTop], [gridRight, gridTop], [gridLeft, gridBottom], [gridRight, gridBottom],
  ] as [number, number][]) {
    dFar = Math.max(dFar, Math.hypot(cx - ax, cy - ay));
  }
  const rMin = 0.22 * dFar, rMax = 0.58 * dFar;
  const rx = rMin + ((digest[61] % 16) / 15) * (rMax - rMin);
  const ry = rMin + ((digest[62] % 16) / 15) * (rMax - rMin);
  // Axis-aligned half-extents of the ellipse after rotation by rotationDeg:
  // halfW = √(rx²cos²θ + ry²sin²θ), halfH = √(rx²sin²θ + ry²cos²θ).
  const rotationDeg = ((digest[63] % 16) / 15) * 180;
  const rot = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rot), sin = Math.sin(rot);
  const halfW = Math.hypot(rx * cos, ry * sin);
  const halfH = Math.hypot(rx * sin, ry * cos);
  // Clip to the grid rect (the ellipse is drawn under the grid clip-path), so the
  // ring hugs the *visible* oval instead of extending into the color bar / margins.
  const ex0 = Math.max(gridLeft, ax - halfW), ey0 = Math.max(gridTop, ay - halfH);
  const ex1 = Math.min(gridRight, ax + halfW), ey1 = Math.min(gridBottom, ay + halfH);
  const ellipse: Rect = { x: ex0, y: ey0, w: ex1 - ex0, h: ey1 - ey0 };

  return {
    viewBox: `0 0 ${round3(boundingW)} ${round3(boundingH)}`,
    cellRects,
    gridRect,
    ellipse,
    colorBar,
    colorBarMarkers,
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

/** Structured, color-independent channel data for an accessible description. */
export function describeChannels(value: string, opts: RenderOptions = {}): ChannelDescription {
  return buildModel(value, opts);
}

/**
 * A short recognition mnemonic for a TRUSTED corpus (this.i mmtxrg4w), built ONLY
 * from the entviz's own displayed cells — so it can never show a character the
 * visualization doesn't. Shape scales with the entropy so it stays distinctive:
 *   - `< 256` bits → `first…last` (first cell · last cell).
 *   - `≥ 256` bits → `first-two…middle…last`. For a >512-bit input the middle cell is
 *     a genuine fingerprint-middle cell (still shown by the entviz); otherwise it's the
 *     centre value cell.
 * The `…` is honest: it marks the omitted middle cells (all present when expanded).
 * Pure over the cell model; GATED at the pill by the corpus posture. Takes the cells
 * (from {@link describeChannels}) + `sizeBits` (from `characterize`), so it reuses what
 * the pill already computed rather than re-deriving.
 */
export function mnemonic(cells: CellDescription[], sizeBits: number): string {
  const shown = cells.filter((c) => !c.blank && c.text !== null);
  if (shown.length === 0) return "";
  const t = (c: CellDescription) => c.text as string;
  const first = t(shown[0]);
  const last = t(shown[shown.length - 1]);
  // Small entropy, or too few cells to spread three groups: first cell … last cell.
  if (sizeBits < 256 || shown.length < 4) return `${first}…${last}`;
  // Larger: first TWO cells … a middle cell … last cell. Prefer a real fingerprint-middle
  // cell for the middle when the input has them (>512-bit), else the centre value cell.
  const second = t(shown[1]);
  const fp = shown.filter((c) => c.fingerprint);
  const middle = t(fp.length ? fp[Math.floor(fp.length / 2)] : shown[Math.floor(shown.length / 2)]);
  return `${first}${second}…${middle}…${last}`;
}

/** One achievable grid arrangement for a value, with the `targetAr` that selects
 *  it (`render`/`chooseGrid` snap to it). The reshape picker offers these. */
export interface GridShape {
  cols: number;
  rows: number;
  /** Pass this as `targetAr` to render the entviz in this shape. */
  targetAr: number;
}

/**
 * Every grid shape a value can take (its cell count is fixed; only the
 * arrangement varies). Sorted tall → wide. The cell count comes from the same
 * tokenization render() uses, so the offered shapes are exactly the achievable
 * ones — picking one and feeding its `targetAr` back to render reproduces it.
 */
export function gridShapes(value: string, opts: RenderOptions = {}): GridShape[] {
  const { core, alphabet } = classifyInput(value.trim());
  const { tokens, truncated } = tokenizeEntropy(core, alphabet);
  const count = truncated ? MAX_TOKENS : tokens.length;
  const sorted = gridCandidates(count)
    .map((g) => ({ cols: g.cols, rows: g.rows, ar: gridAspectRatio(g.cols, g.rows) }))
    .sort((a, b) => a.ar - b.ar);
  // targetAr is the MIDDLE of the range that selects each shape, NOT its exact
  // aspect ratio. chooseGrid picks the candidate closest to but ≥ targetAr, so
  // shape i is selected for targetAr in (ar[i-1], ar[i]]. Returning ar[i] itself
  // is a boundary value a consumer's display rounding can tip into shape i+1
  // (e.g. 3×4's 1.125 rounded to 1.13 → 4×3); the midpoint is robust.
  return sorted.map((s, i) => ({
    cols: s.cols,
    rows: s.rows,
    targetAr: ((i > 0 ? sorted[i - 1].ar : 0) + s.ar) / 2,
  }));
}

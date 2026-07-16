/**
 * <EntvizPill /> — the collapsed, inline "pill" form of an entviz: a constant
 * badge + the parser-derived type, with a copy menu and an expand-to-popover
 * affordance. Authored with React.createElement (no JSX) so @entviz/react ships
 * raw .ts source with no build step (mirrors Entviz.ts).
 *
 * Security/design contract (packages/react/docs/pill-design.md): the pill is
 * intentionally bare — it shows the constant badge + the trusted type label
 * only, never the note, value characters, or any value-derived visual (so it
 * trains no glance-equivalence or vanity-grind heuristic). It affords
 * locate / expand / copy — never an equality decision (recognition ≠
 * verification). Chrome is localized + RTL-mirrored; the entviz itself never is.
 */
import {
  createElement as h,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  characterize,
  describeChannels,
  mnemonic,
  render,
  resolveChannels,
  type Characterization,
  type ChannelDescription,
  type CornerToken,
  type RenderOptions,
  type TrustAssumption,
} from "@entviz/core";
import { cornerStyle } from "./corners.ts";
import { autoTint } from "./auto-color.ts";
import { colorbarIcon } from "./pill-icon.ts";
import { RoleGlyph } from "./role-icon.ts";
import { Entviz } from "./Entviz.ts";
import { EntvizCompare } from "./EntvizCompare.ts";
import { copyEntviz, type CopyKind } from "./copy-actions.ts";
import { fmt, isRtlLocale, resolveMessages, type Messages } from "./pill-messages.ts";
import { useEmit, type DisclosureState, type EntvizEvent } from "./events.ts";
import { onMenuKeyNav } from "./keyboard.ts";

export type { CopyKind };

export interface EntvizPillProps {
  // --- entviz render inputs (deterministic, context-free) ---
  value: string;
  targetAr?: number;
  fontSizePt?: number;
  note?: string | null;
  // --- pill chrome (contextual) ---
  /** First-party custom text shown after the type (host-set, trusted — unlike the note). */
  label?: string;
  /** How to signal the value's type:
   *   - `autoCombo` (default): the trailing role **icon**, plus the type **text**
   *     ("cesr key") only when there's no label/mnemonic — so a pill is never empty.
   *   - `icon`: just the role icon (never the redundant type word).
   *   - `text`: just the parser-derived type text.
   *   - `none`: neither.
   *  Independent of `label`, which still shows either way. */
  typeSignal?: "none" | "icon" | "text" | "autoCombo";
  /** Corner-shape (this.i gk37dm5n): an explicit, optional pill corner style
   *  (`round` · `sharp` · `leaf`). Corners are no longer derived from the value's type —
   *  the trailing role icon carries that cue. Defaults to the themeable round. */
  corner?: CornerToken;
  /** Persistently highlight this pill (e.g. to mark 3 of 10 on a page) WITHOUT hover or
   *  focus. Draws a ring via `box-shadow`, so it coexists with the hover/focus outline;
   *  color/width are set by `--entviz-pill-highlight` (a full box-shadow value; default a
   *  2px `currentColor` mix). Host-driven, not derived from the value. */
  highlight?: boolean;
  /** The value's trust posture (this.i ujdwjtex) — a shareable, host-declared object
   *  that gates the value-derived channels. Absent, or `posture:"wild"`, keeps them
   *  all OFF (the default, maximum-safety wild posture). `posture:"corpus"` opts a
   *  same-origin, already-trusted set of values into the recognition affordances it
   *  enables (e.g. `mnemonic`). NEVER expose changing this to the end user. */
  trust?: TrustAssumption;
  maxWidth?: number | string;
  locale?: string;
  /** Chrome writing direction. "auto" (default) follows the locale's script. */
  dir?: "ltr" | "rtl" | "auto";
  messages?: Partial<Messages>;
  className?: string;
  style?: CSSProperties;
  /** Controlled disclosure of the popover's open/closed state (proposal §3, §5.3).
   *  When PROVIDED, the popover follows this prop (controlled): the pill's own
   *  open/collapse actions call `onOpenChange(next)` instead of only flipping
   *  internal state. When ABSENT, the popover is uncontrolled (today's behavior),
   *  and `onOpenChange` still fires on every open/close TRANSITION.
   *  SECURITY (§5.3): controlling `open` does NOT suppress the provenance chrome or
   *  the §2.4 scoping copy — those live inside <EntvizCompare> (the pill's compare
   *  state) and are structurally always-rendered, so controlled open can't skip the
   *  reference gate. `open === true` maps to the VISUALIZE state (never straight to a
   *  verdict); entering compare stays a deliberate, reference-requiring act. */
  open?: boolean;
  /** Called on every open/close transition with the NEXT open state. Under
   *  controlled `open` this is how the pill asks the host to change state; when
   *  uncontrolled it is a notification alongside the internal state flip. */
  onOpenChange?: (open: boolean) => void;
  onExpand?: () => void;
  /** Called when the user enters the compare state from the expanded popover.
   *  Providing it opts the pill into the in-popover "Compare against a reference…"
   *  affordance; the pill then renders <EntvizCompare> in place, so recognition →
   *  verification stays a deliberate, reference-requiring act (design Seam 2). */
  onCompare?: () => void;
  /** Show the in-popover compare affordance (default true when `onCompare` is set).
   *  Lets a host keep the onCompare hook but suppress the built-in button. */
  showCompareAffordance?: boolean;
  onCopy?: (kind: CopyKind) => void;
  onError?: (message: string) => void;
  /** The typed event firehose (see events.ts). Notify-only, in addition to the
   *  specific callbacks (disclosure.change / copy / render.error). */
  onEvent?: (e: EntvizEvent) => void;
}

// The hover tooltip's value-preview cap. Long enough to show a full AID/UUID/ETH/hash
// (and most identifiers) in one line; truncates a long key with an ellipsis (still far
// too long to grind). A native `title` tooltip manages its own width/wrapping, so we
// cap the character count rather than measure the viewport.
const VALUE_PREVIEW_CHARS = 100;

/** The unit word in the "Copied value · N <unit>" confirmation. The pill's type is
 *  the bare entropy category (e.g. "hex"), so hex is an exact match. */
export function copyUnit(type: string | null): string {
  return type === "hex" ? "hex chars" : "chars";
}

/** The pill's primary type token, read straight from the structured
 *  characterization — `scheme ?? encoding` (== `entropyType`), never
 *  string-parsed out of the drawn label. So the pill reads "cesr", "did",
 *  "uuid", "hex" without touching the label's count/format/"+hash"
 *  presentation. Returns null when the value could not be characterized. */
export function pillType(ch: Characterization | null): string | null {
  return ch ? ch.entropyType : null;
}

/** The optional secondary role token, from the closed-enum `role` axis (key /
 *  signature / digest / address / identifier). Rendered as a small caption
 *  beside the type when the recognizer asserted one; null (and omitted) for a
 *  bare encoding where entviz does not guess. This is a STRUCTURED field, not a
 *  substring of the label — so it appears only where it is honestly known. */
export function pillRole(ch: Characterization | null): string | null {
  return ch ? ch.role : null;
}

// Anchored-floater placement: flip above when there's no room below, then clamp
// horizontally into the viewport (RTL right-aligns). Pure math, unit-tested.
export function placeFloater(
  a: { top: number; bottom: number; left: number; right: number },
  f: { width: number; height: number },
  viewport: { width: number; height: number },
  rtl: boolean,
): { top: number; left: number } {
  const gap = 6, pad = 8;
  const below = viewport.height - a.bottom >= f.height + gap || viewport.height - a.bottom >= a.top;
  const top = below ? a.bottom + gap : Math.max(pad, a.top - f.height - gap);
  let left = rtl ? a.right - f.width : a.left;
  left = Math.max(pad, Math.min(left, viewport.width - f.width - pad));
  return { top, left };
}

// The accessible, color-independent description of the expanded entviz (design
// §9): every discrete verification channel as text, so AT users reach parity.
// Pure: takes the already-computed channel data + the localized template.
export function a11yDescription(
  channels: ChannelDescription,
  m: Messages,
  type?: string | null,
): string {
  const rc = (ci: number) => `${Math.floor(ci / channels.cols)},${ci % channels.cols}`;
  const cells = channels.cells.map((c) => (c.blank ? "·" : (c.text as string))).join(" ");
  const bars = channels.colorBarLetters.join(" ");
  const quartiles = channels.quartiles.map((q) => (q.cellIndex === null ? "—" : rc(q.cellIndex))).join(" ");
  const bmin = channels.markers.blankMap ? rc(channels.markers.blankMap.minCell) : "—";
  const bmax = channels.markers.blankMap ? rc(channels.markers.blankMap.maxCell) : "—";
  return fmt(m.desc, {
    // Prefer the STRUCTURED entropy type (scheme ?? encoding) when supplied, so
    // the accessible description reads the same clean token as the pill —
    // falling back to the render model's drawn label only if it wasn't passed.
    type: type ?? channels.typeName,
    cells,
    bars,
    quartiles,
    bmin,
    bmax,
    bleft: channels.markers.colorBar.left,
    bright: channels.markers.colorBar.right,
    bslots: channels.markers.colorBar.slots,
  });
}

// position:fixed so it's measured against the viewport and never clipped under
// the fold; recomputed on resize/scroll. The placement math is placeFloater().
// Tag names that CANNOT legally contain flow content (a <div>): <p>, headings, and
// text-level/phrasing wrappers. The pill is inline, so it is routinely placed inside
// one of these — but its expanded popover renders <div>s, which would be invalid
// (and get reparented by the HTML parser) there. See flowHost.
const PHRASING = new Set([
  "P", "H1", "H2", "H3", "H4", "H5", "H6", "DT", "PRE", "FIGCAPTION",
  "SPAN", "A", "ABBR", "B", "BDI", "BDO", "CITE", "CODE", "DATA", "DFN", "EM",
  "I", "KBD", "MARK", "Q", "S", "SAMP", "SMALL", "STRONG", "SUB", "SUP", "TIME",
  "U", "VAR", "LABEL", "OUTPUT",
]);

/** The nearest ancestor of `anchor` that may legally contain flow content (a
 *  <div>). Walking out of every phrasing/`<p>` wrapper lets a portaled popover be
 *  valid HTML no matter where the inline pill sits — while staying inside the host's
 *  theme scope, so its CSS vars / color / font still inherit (no copying needed). */
function flowHost(anchor: HTMLElement | null): HTMLElement | null {
  let el = anchor?.parentElement ?? null;
  while (el && PHRASING.has(el.tagName)) el = el.parentElement;
  return el;
}

/** Portal a floating layer (popover / menu) to the nearest flow-content ancestor so
 *  it escapes any prose `<p>` the pill lives in. SSR-safe: renders in place when
 *  there is no document. */
function toPortal(node: ReactNode, anchor: HTMLElement | null): ReactNode {
  return typeof document === "undefined" ? node : createPortal(node, flowHost(anchor) ?? document.body);
}

function useFloating(anchorRef: RefObject<HTMLElement | null>, open: boolean, rtl: boolean) {
  const ref = useRef<HTMLSpanElement>(null);
  const [style, setStyle] = useState<CSSProperties>({
    position: "fixed",
    top: -9999,
    left: -9999,
    visibility: "hidden",
  });
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const a = anchorRef.current?.getBoundingClientRect();
      const f = ref.current?.getBoundingClientRect();
      if (!a || !f) return;
      const { top, left } = placeFloater(
        a,
        { width: f.width, height: f.height },
        { width: window.innerWidth, height: window.innerHeight },
        rtl,
      );
      setStyle({ position: "fixed", top, left, visibility: "visible" });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, rtl, anchorRef]);
  return { ref, style };
}

export function EntvizPill(props: EntvizPillProps): ReactNode {
  const {
    value, targetAr, fontSizePt, note,
    label, typeSignal = "autoCombo", corner, highlight, trust, maxWidth, locale, dir,
    messages: overrides, className, style, open, onOpenChange, onExpand, onCompare, showCompareAffordance, onCopy, onError, onEvent,
  } = props;

  // The event firehose: a stable `emit` bound to the latest onEvent, stamping
  // source="pill", monotonic seq, and swallowing a throwing host handler (events.ts).
  const emit = useEmit(onEvent, "pill");
  useInjectStyles();

  // The type cue (typeSignal). autoCombo (default) and icon both show the role glyph;
  // showTypeText also depends on whether there's a label, so it's derived after shownLabel.
  const showRoleGlyph = typeSignal === "icon" || typeSignal === "autoCombo";

  const { locale: resolved, messages: base } = useMemo(() => resolveMessages(locale), [locale]);
  const m: Messages = { ...base, ...overrides };
  // dir prop wins; "auto"/unset follows the locale script. Chrome mirrors only.
  const rtl = dir === "rtl" ? true : dir === "ltr" ? false : isRtlLocale(resolved);
  const dirAttr: "rtl" | "ltr" | undefined = rtl ? "rtl" : dir === "ltr" ? "ltr" : undefined;

  const opts: RenderOptions = { targetAr, fontSizePt, note };
  const { type, role, channels, svg, error, sizeBits } = useMemo(() => {
    try {
      // v13: read the STRUCTURED characterization (scheme/role/qualifiers/
      // entropyType) instead of string-parsing the drawn label. `type` is the
      // canonical `scheme ?? encoding` (== entropyType) — so pill and glyph read
      // the same token ("cesr", "did", "uuid", "hex") with no count, format note,
      // or "+hash" caveat leaking in. `role` is the honest closed-enum
      // axis, present only where the generic recognizer asserted one.
      const ch = characterize(value.trim());
      const chan = describeChannels(value, opts);
      return {
        type: pillType(ch),
        role: pillRole(ch),
        sizeBits: ch.sizeBits,
        channels: chan as ChannelDescription | null,
        svg: render(value, opts),
        error: null as string | null,
      };
    } catch (e) {
      return {
        type: null as string | null,
        role: null as string | null,
        sizeBits: 0,
        channels: null as ChannelDescription | null,
        svg: null as string | null,
        error: e instanceof Error ? e.message : String(e),
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, targetAr, fontSizePt, note]);

  useEffect(() => { if (error && onError) onError(error); }, [error, onError]);

  // render.error (notify-only): mirror the onError path onto the firehose, firing
  // only when the error message TRANSITIONS (a fresh/changed failure).
  const prevErrorRef = useRef<string | null>(null);
  useEffect(() => {
    if (error && error !== prevErrorRef.current) emit({ type: "render.error", message: error });
    prevErrorRef.current = error;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Controlled/uncontrolled disclosure of the popover (§5.3). When `open` is
  // provided, the popover follows it (controlled) and internal `expanded` is
  // ignored for the open/closed decision; when absent, `expanded` drives it
  // (uncontrolled). Either way `setOpen` fires `onOpenChange` on a transition,
  // and only flips internal state when uncontrolled — a controlled pill's own
  // click reports the requested state to the host without self-toggling.
  const controlled = open !== undefined;
  const isOpen = controlled ? !!open : expanded;
  const setOpen = (next: boolean) => {
    if (next !== isOpen) onOpenChange?.(next);
    if (!controlled) setExpanded(next);
  };

  const wrapRef = useRef<HTMLSpanElement>(null);
  const pillRef = useRef<HTMLButtonElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuId = useId();
  const descId = useId();

  const menuFloat = useFloating(wrapRef, menuOpen, rtl);
  // The kebab menu is anchored to the pill (useFloating), but the popover is CENTERED
  // in the viewport via a full-screen flex overlay — not floated below the anchor,
  // which ran off the bottom/edge on small screens. So the popover only needs a ref
  // (for focus management + measurement), no placement math.
  const popRef = useRef<HTMLSpanElement>(null);

  const flash = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  };
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // disclosure.change (notify-only): the Cite · Visualize · Compare lifecycle
  // state, derived from the disclosure flags — comparing wins, else expanded, else
  // the collapsed pill. Fire only on a TRANSITION, carrying the prior state.
  const disclosure: DisclosureState = comparing ? "compare" : isOpen ? "visualize" : "pill";
  const prevDisclosureRef = useRef<DisclosureState>(disclosure);
  useEffect(() => {
    const prev = prevDisclosureRef.current;
    if (disclosure !== prev) emit({ type: "disclosure.change", state: disclosure, prev });
    prevDisclosureRef.current = disclosure;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disclosure]);

  // When the popover closes (by any path, incl. a controlled `open=false` from the
  // host), reset the transient sub-states so a reopen lands back at Visualize (no
  // back-slide into a stale Compare) and no orphaned menu lingers.
  useEffect(() => {
    if (!isOpen) { setMenuOpen(false); setComparing(false); }
  }, [isOpen]);

  // Dismiss on Escape (focus returns to the pill) and outside-click. These are the
  // pill's own collapse actions, so they route through `setOpen(false)` — firing
  // `onOpenChange` and (uncontrolled only) closing the popover. A controlled host
  // gets the request and decides; the sub-state reset happens in the effect above.
  useEffect(() => {
    if (!isOpen && !menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); setMenuOpen(false); setComparing(false); pillRef.current?.focus(); }
    };
    const onDown = (e: MouseEvent) => {
      // Outside-click closes only the transient kebab MENU — never the expanded
      // popover. Dismissing the popover on any outside click (e.g. clicking back into
      // the window after switching apps) is disorienting; it closes via ✕, Escape, or
      // the pill itself instead. The menu is PORTALED out of the wrapper, so a click
      // inside it isn't inside wrapRef — check the menu node too, else it would close
      // itself before an item's click lands.
      const t = e.target as Node;
      const inside = wrapRef.current?.contains(t) || menuFloat.ref.current?.contains(t);
      if (!inside) setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, menuOpen]);

  // Move focus to the first menu item when the menu opens (ARIA menu pattern).
  useEffect(() => {
    if (!menuOpen) return;
    const id = requestAnimationFrame(() => {
      menuFloat.ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [menuOpen, menuFloat.ref]);

  // Move focus INTO the popover when it opens, so keyboard/screen-reader users
  // reach its content (incl. the §9 a11yDescription) without back-navigating the
  // DOM — the ARIA dialog contract (pill-design.md §4). Return-focus-on-close is
  // handled by the Escape/pill path above. (A11Y-F1)
  useEffect(() => {
    if (!isOpen) return;
    const id = requestAnimationFrame(() => {
      popRef.current
        ?.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
        ?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [isOpen]);

  const collapse = () => { setOpen(false); setComparing(false); };
  const openExpand = () => { setMenuOpen(false); setComparing(false); setOpen(true); onExpand?.(); };
  const openMenu = () => { setOpen(false); setMenuOpen(true); };
  // Recognition → verification is a deliberate act: entering compare reveals a
  // reference-requiring surface (never a verdict), and reports to the host.
  const enterCompare = () => { setComparing(true); onCompare?.(); };
  // …and stepping back out of compare returns to the visualization WITHOUT closing
  // the popover (the rail's Visualize step is the way back). disclosure.change fires
  // off the derived state, so no explicit emit here.
  const exitCompare = () => { setComparing(false); };

  const doCopy = async (kind: CopyKind) => {
    setMenuOpen(false);
    try {
      await copyEntviz(kind, { value, opts, svg });
      if (kind === "value") flash(fmt(m.copiedValue, { n: value.length, unit: copyUnit(type) }));
      else if (kind === "comparison")
        flash(fmt(m.copiedComparison, { n: channels ? channels.cells.filter((c) => !c.blank).length : 0 }));
      else if (kind === "svg") flash(m.copiedSvg);
      else flash(m.copiedImage);
      emit({ type: "copy", kind, ok: true });
      onCopy?.(kind);
    } catch {
      emit({ type: "copy", kind, ok: false });
      flash(m.copyFailed);
    }
  };

  // The kebab menu is PORTALED out of the wrapper, so its items live under
  // menuFloat.ref, not the key event's currentTarget.
  const onMenuKey = (e: ReactKeyboardEvent) =>
    onMenuKeyNav(e, () => [...(menuFloat.ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]);

  // Trust gate (ujdwjtex): which value-derived channels this posture enables. Absent
  // or wild → all off (maximum safety). The mnemonic (mmtxrg4w) is the first such
  // channel; it's value-derived text, so it renders ONLY under a corpus posture.
  const gate = resolveChannels(trust);
  // The mnemonic reads the entviz's OWN cells (channels), so it only ever shows text
  // the visualization shows. `channels` is null exactly when render failed, so this is
  // skipped on an unrenderable pill.
  const autoMnemonic = useMemo(
    () => (gate.mnemonic && channels ? mnemonic(channels.cells, sizeBits) : null),
    [gate.mnemonic, channels, sizeBits],
  );
  // The label slot shows explicit host text when given, else the mnemonic when the
  // corpus posture enabled it — explicit `label` wins (host text is more meaningful).
  const shownLabel = label ?? autoMnemonic;
  const labelIsMnemonic = !label && !!autoMnemonic;
  // autoCombo shows the type text ONLY when there's no label/mnemonic in the slot — so a
  // pill is never fully empty (it falls back to "cesr key"), but never doubles up either.
  const showTypeText = typeSignal === "text" || (typeSignal === "autoCombo" && !shownLabel);

  // Auto-color channel (tgowi7go): a subtle value-hued background tint, gated by the
  // corpus posture. A transparent color-mix, so it composes with the host theme.
  const autoBg = gate.autoColor && !error ? autoTint(value) : null;

  // The hover tooltip previews the value — in BOTH postures. This does NOT reintroduce
  // §3.3's grinding vector: that targets a SHORT (~8-char) head+tail teaser, which is
  // both glanceable AND grindable (a ~48-bit prefix collision is feasible). This preview
  // shows the FULL value for essentially every identifier, and a >VALUE_PREVIEW_CHARS-char
  // (hundreds-of-bits) prefix is computationally out of reach to grind. The old "View
  // visualization" hint is dropped — the pointer cursor already signals clickability.
  const valuePreview = value.length > VALUE_PREVIEW_CHARS ? value.slice(0, VALUE_PREVIEW_CHARS) + "…" : value;

  // Type is the trusted, derived channel — the BARE entropy type only. The
  // "+hash" caveat (>512-bit inputs) is a VISUALIZATION note, not a pill
  // concern, so it never appears here. `label` is first-party host text (or the
  // gated mnemonic); never the note (self-declared) on the pill.
  const shownParts = [showTypeText ? type : null, shownLabel].filter(Boolean) as string[];
  const ariaText = shownParts.length ? shownParts.join(", ") : (type ?? "unrenderable");
  const ariaLabel = fmt(m.ariaView, { type: ariaText });

  const ACTIONS: [CopyKind | "view", string, () => void][] = [
    ["view", m.view, openExpand],
    ["value", m.copyValue, () => doCopy("value")],
    ["comparison", m.copyComparison, () => doCopy("comparison")],
    ["image", m.copyImage, () => doCopy("image")],
    ["svg", m.copySvg, () => doCopy("svg")],
  ];

  const cssVar = (name: string, fallback: string) => `var(--entviz-pill-${name}, ${fallback})`;

  // Corner (gk37dm5n): an explicit optional style; else the themeable default radius, so
  // an unconfigured pill is unchanged.
  const cornerCss: CSSProperties = corner
    ? cornerStyle(corner)
    : { borderRadius: cssVar("radius", "999px") };

  // --- disclosure-lifecycle chrome (Cite · Visualize · Compare) --------------
  // Compare is offered only when the host opts in via onCompare (design §5 / Seam
  // 2): the pill stays recognition-only unless a verification path is wanted.
  const compareAvailable = !!onCompare && (showCompareAffordance ?? true);
  const activeStep = comparing ? "compare" : "visualize";
  const railSteps: [string, string][] = compareAvailable
    ? [["cite", m.stepCite], ["visualize", m.stepVisualize], ["compare", m.stepCompare]]
    : [["cite", m.stepCite], ["visualize", m.stepVisualize]];
  const rail = h(
    "div",
    { key: "rail", style: railStyle },
    railSteps.map(([k, lbl], i) => {
      const active = k === activeStep;
      const s: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, opacity: active ? 1 : 0.5, fontWeight: active ? 600 : 500 };
      const inner = [
        i > 0 ? h("span", { key: "sep", style: railSepStyle }) : null,
        h("span", { key: "dot", style: railDotStyle(active) }),
        lbl,
      ];
      // The rail doubles as navigation within the popover: Compare enters
      // verification (when the host opts in via onCompare), and — once comparing —
      // Visualize steps back out of it without closing the popover. Whichever of the
      // two you're NOT on is a link; the current step and Cite are plain labels.
      // Compare's terse visible label gets the fuller action as its accessible name;
      // Visualize keeps its own visible text as the name (so it doesn't collide with
      // the pill's "View visualization" affordance) and carries the hint as a tooltip.
      const nav =
        k === "compare" && compareAvailable && !comparing ? { onClick: enterCompare, title: m.compareAction, ariaLabel: m.compareAction }
        : k === "visualize" && comparing ? { onClick: exitCompare, title: m.view, ariaLabel: undefined }
        : null;
      return nav
        ? h("button", { key: k, type: "button", onClick: nav.onClick, title: nav.title, "aria-label": nav.ariaLabel, style: { ...s, ...railStepBtnStyle } }, inner)
        : h("span", { key: k, style: s }, inner);
    }),
  );

  // --- leading cap (colorbar, corpus-only) ---
  // EMPTY by default (wild) so the pill's left edge is clean and the text sits on the
  // baseline. Under a corpus posture that opted in the icon channel (wn3r6aex), it is the
  // VALUE-DERIVED colorbar — a vertical bar the width the colorbar has in the
  // visualization. ABSOLUTELY positioned (out of the flex flow) so it can be full-height
  // WITHOUT dragging the pill's baseline: the text stays the baseline anchor.
  const leadingCap = gate.icon && channels && !error
    ? h(
        "span",
        {
          "aria-hidden": true,
          style: { position: "absolute", insetBlock: 0, insetInlineStart: 0, width: "1.25em", overflow: "hidden" },
        },
        colorbarIcon(channels),
      )
    : null;

  // --- pill text (type + optional role caption + label) ---
  // Built from the STRUCTURED characterization axes:
  //  - `type`  = entropyType (scheme ?? encoding), the primary token.
  //  - `role`  = the closed-enum semantic role, shown as a caption at the SAME size as
  //              the type (differs only in color) when the recognizer asserted one.
  //  - `label` = first-party host text (or the gated mnemonic).
  // Always rendered — even with no visible text — so the pill always has a text
  // baseline to sit on the surrounding line.
  const textBlock = h(
    "span",
    { style: { display: "inline-flex", gap: "0.4em", whiteSpace: "nowrap", alignItems: "baseline" } },
    showTypeText && type
      ? h("span", { key: "type", style: { opacity: 0.62 } }, type)
      : null,
    showTypeText && type && role
      ? h("span", { key: "role", style: pillRoleStyle }, role)
      : null,
    shownLabel
      ? h("span", { key: "label", style: labelIsMnemonic ? mnemonicStyle : undefined }, shownLabel)
      : null,
    // Zero-width-space baseline anchor when nothing else is shown (typeSignal icon/none
    // with no label) — without it the pill has no baseline and drops below the line.
    shownParts.length ? null : h("span", { key: "anchor", "aria-hidden": true }, "​"),
  );

  const pillButton = h(
    "button",
    {
      ref: pillRef,
      type: "button",
      onClick: () => (isOpen ? collapse() : openExpand()),
      onKeyDown: (e: ReactKeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && (e.key === "c" || e.key === "C")) { e.preventDefault(); doCopy("value"); }
        else if (e.key === "ArrowDown") { e.preventDefault(); openMenu(); }
      },
      // No "View visualization" hover hint — the pointer cursor already signals
      // clickability. The tooltip previews the value instead (both postures; see above).
      title: valuePreview,
      "aria-label": ariaLabel,
      "aria-expanded": isOpen,
      // outline:none — focus is shown by the pill body's :focus-within outline (below),
      // so the button doesn't draw a second, inner ring.
      style: {
        display: "inline-flex", alignItems: "baseline",
        font: "inherit", color: "inherit", background: "none", border: "none",
        padding: 0, margin: 0, cursor: "pointer", maxWidth: "100%", outline: "none",
      },
    },
    textBlock,
  );

  // --- trailing role glyph (un-gated) ---
  // The value's semantic role as a small monochrome icon on the trailing edge (after the
  // kebab). Un-gated: it shows the TYPE the pill already discloses, not the value — so no
  // value-identity bits. Shown when `typeSignal === "icon"` (the default).
  const roleGlyph = showRoleGlyph
    ? h(
        "span",
        {
          // Clicking the icon expands the pill, exactly like clicking its body — same
          // pointer cursor, same effect. aria-hidden (no extra tab stop): keyboard/AT
          // reach the same action through the pill button.
          "aria-hidden": true,
          onClick: () => (isOpen ? collapse() : openExpand()),
          style: { opacity: 0.72, display: "inline-flex", alignItems: "center", flex: "0 0 auto", cursor: "pointer" },
        },
        RoleGlyph({ role }),
      )
    : null;

  const kebab = h(
    "button",
    {
      type: "button",
      className: "entviz-pill__kebab",
      onClick: () => (menuOpen ? setMenuOpen(false) : openMenu()),
      onKeyDown: (e: ReactKeyboardEvent) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); openMenu(); }
      },
      "aria-haspopup": "menu",
      "aria-expanded": menuOpen,
      "aria-controls": menuOpen ? menuId : undefined,
      "aria-label": m.actions,
      style: {
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        font: "inherit", color: "inherit", background: "none", border: "none",
        padding: "0 0.05em", margin: 0, cursor: "pointer", flex: "0 0 auto",
        opacity: menuOpen ? 0.85 : undefined,
      },
    },
    "⋮",
  );

  const pillBody = h(
    "span",
    {
      className: "entviz-pill__body",
      style: {
        // position:relative anchors the absolutely-positioned leading colorbar cap.
        position: "relative",
        display: "inline-flex", alignItems: "center", gap: cssVar("gap", "0.35em"),
        font: "inherit", color: "currentColor",
        paddingBlock: 0,
        // Reserve the colorbar cap's width (~1.25em) + a ~0.45em gap to the text when
        // present; else a small leading pad.
        paddingInlineStart: leadingCap ? "1.7em" : "0.4em",
        paddingInlineEnd: "0.4em",
        ...cornerCss,
        // Clip the colorbar cap's leading corners to the pill radius; cap the width so a
        // long label clips instead of blowing out the line.
        overflow: "hidden",
        border: cssVar("border", "1px solid color-mix(in srgb, currentColor 25%, transparent)"),
        background: autoBg ?? cssVar("bg", "color-mix(in srgb, currentColor 6%, transparent)"),
        // Persistent highlight ring (box-shadow so it coexists with the hover/focus
        // outline). Host-colorable via --entviz-pill-highlight; off unless `highlight`.
        boxShadow: highlight
          ? cssVar("highlight", "0 0 0 2px color-mix(in srgb, currentColor 45%, transparent)")
          : undefined,
        whiteSpace: "nowrap", maxWidth: maxWidth ?? "24em", lineHeight: 1.25,
        // The visible chrome (type, role, label/mnemonic, ⋮, role glyph) is NOT selectable,
        // so a text selection sweeping the pill contributes only the value (from the hidden
        // selectable span in the wrapper), not the chrome glyphs. (D)
        userSelect: "none",
        WebkitUserSelect: "none",
      },
    },
    leadingCap,
    pillButton,
    kebab,
    roleGlyph,
  );

  const menu = menuOpen
    ? toPortal(
        h(
          "span",
          { ref: menuFloat.ref, id: menuId, role: "menu", dir: dirAttr, "aria-label": m.actions, onKeyDown: onMenuKey, style: { ...menuStyle, ...menuFloat.style } },
          ACTIONS.map(([kind, lbl, fn]) =>
            h("button", { key: kind, role: "menuitem", type: "button", onClick: fn, style: menuItemStyle }, lbl),
          ),
        ),
        wrapRef.current,
      )
    : null;

  // Popover body by lifecycle state. Visualize = a STANDARD <Entviz> with its
  // STANDARD toolbar (size ladder, shape picker, copy/export kebab). Compare =
  // the STANDARD <EntvizCompare> — so every comparison affordance (paste / file /
  // drop / URL acquisition, the verdict machine, the guided walk, the voice
  // ceremony) comes along unchanged; the pill only adds the rail + the deliberate,
  // reference-requiring entry into it.
  const popoverBody = error
    ? h("span", { style: { color: cssVar("error", "#b00020"), fontFamily: "ui-monospace, monospace", fontSize: 12 } }, error)
    : comparing
      ? [rail, h(EntvizCompare, { key: "cmp", value, targetAr, fontSizePt, note, locale, layout: "auto" })]
      // alignSelf centers the (content-width) visualization within the popover's
      // left-aligned column — the rail spans wider, so without this the glyph hugs
      // the left. (Its own toolbar is centered under it by Entviz's wrapper.)
      : [rail, h(Entviz, { key: "viz", value, targetAr, fontSizePt, note, controls: true, messages: m, style: { alignSelf: "center" } })];

  const popover = isOpen
    ? toPortal(
        // Full-viewport flex overlay that CENTERS the popover on screen. It's
        // pointer-events:none so it never intercepts page clicks (the popover is
        // non-modal and doesn't close on outside-click); only the dialog itself is
        // interactive. Centering here (rather than translate on the dialog) leaves the
        // dialog's transform free for the grow animation.
        h(
          "span",
          { style: popOverlayStyle },
          h(
            "span",
            {
              ref: popRef,
              role: "dialog",
              // Keeps an SR virtual cursor from wandering into the background page while
              // the popover is open, without a focus trap — compatible with the non-modal
              // design (two popovers may coexist). (A11Y-F2)
              "aria-modal": "true",
              dir: dirAttr,
              "aria-label": ariaLabel,
              "aria-describedby": error ? undefined : descId,
              className: "entviz-pill__pop",
              style: popoverStyle,
            },
            // Explicit close, top-trailing corner — not everyone knows outside-click/Escape.
            h("button", { key: "close", type: "button", onClick: collapse, "aria-label": m.close ?? "Close", title: m.close ?? "Close", style: popCloseStyle }, "✕"),
            popoverBody,
            // §9 accessible per-channel description (visually hidden; referenced by the dialog).
            channels
              ? h("span", { id: descId, style: srOnly }, a11yDescription(channels, m, type))
              : null,
          ),
        ),
        wrapRef.current,
      )
    : null;

  return h(
    "span",
    {
      ref: wrapRef,
      dir: dirAttr,
      className: className ? `entviz-pill__wrap ${className}` : "entviz-pill__wrap",
      // "baseline" seats the pill's TEXT on the surrounding line's baseline. This works
      // now that the leading cap (colorbar) is absolutely positioned — it no longer drags
      // the flex baseline down, so the text (first in-flow item) is the anchor.
      style: { position: "relative", display: "inline-flex", verticalAlign: "baseline", ...style },
      onMouseEnter: (e: ReactMouseEvent<HTMLSpanElement>) => e.currentTarget.classList.add("entviz-pill--hover"),
      onMouseLeave: (e: ReactMouseEvent<HTMLSpanElement>) => e.currentTarget.classList.remove("entviz-pill--hover"),
    },
    pillBody,
    // Hidden but SELECTABLE copy of the raw value (D): a text selection sweeping the
    // paragraph includes this (the visible chrome is user-select:none), so Ctrl/Cmd+C
    // yields the value, not the type/label/⋮. aria-hidden so it adds no SR noise.
    h("span", { "aria-hidden": true, style: selectableValueStyle }, value),
    menu,
    popover,
    h("span", { "aria-live": "polite", style: srOnly }, toast),
    toast ? h("span", { style: { ...toastStyle, [rtl ? "left" : "right"]: 0 } }, toast) : null,
  );
}

// The pill's kebab-reveal + popover-grow CSS. Injected ONCE into <head> rather than
// rendered as a <style> child — a <style> is not phrasing content, so it would be
// invalid inside the prose <p> the inline pill routinely lives in. Global rules apply
// to the portaled popover just the same.
const PILL_CSS = `
.entviz-pill__kebab { opacity: 0; transition: opacity .12s; }
.entviz-pill--hover .entviz-pill__kebab,
.entviz-pill__kebab:focus-visible { opacity: 0.7; }
.entviz-pill__body { transition: outline-color .12s, border-color .12s; }
.entviz-pill--hover .entviz-pill__body {
  outline: 2px solid var(--entviz-pill-hover-outline, color-mix(in srgb, currentColor 45%, transparent));
  outline-offset: 1px;
}
.entviz-pill__wrap:focus-within .entviz-pill__body {
  outline: 2px solid var(--entviz-pill-focus-outline, color-mix(in srgb, currentColor 80%, transparent));
  outline-offset: 1px;
}
@keyframes entviz-pill-grow { from { transform: scale(.72); } to { transform: none; } }
.entviz-pill__pop { animation: entviz-pill-grow .26s cubic-bezier(.2,.85,.25,1); transform-origin: var(--entviz-pill-pop-origin, 50% 50%); }
@media (prefers-reduced-motion: reduce) { .entviz-pill__pop { animation-duration: 1ms; } }
`;
function useInjectStyles(): void {
  useLayoutEffect(() => {
    if (typeof document === "undefined" || document.getElementById("entviz-pill-styles")) return;
    const el = document.createElement("style");
    el.id = "entviz-pill-styles";
    el.textContent = PILL_CSS;
    document.head.appendChild(el);
  }, []);
}

// The role caption (key / signature / digest / address / identifier): a small,
// low-emphasis token beside the type. Dimmer + smaller than the type so it reads
// as a secondary, redundant recognition cue — never competing with the primary
// entropy type.
// The role caption sits at the SAME size as the type and surrounding text — it is
// distinguished only by color (a lighter ink), never by size or baseline.
const pillRoleStyle: CSSProperties = {
  opacity: 0.42,
  alignSelf: "center",
};

// The auto-mnemonic (mmtxrg4w): monospace so its value-derived characters line up
// across pills and read as a recognition anchor rather than prose. A hair of
// letter-spacing helps the eye lock onto individual glyphs.
const mnemonicStyle: CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  letterSpacing: "0.02em",
};

const srOnly: CSSProperties = {
  position: "absolute",
  clip: "rect(0 0 0 0)",
  width: 1,
  height: 1,
  overflow: "hidden",
};
// Visually hidden like srOnly, but explicitly SELECTABLE so a text selection over the
// pill copies the raw value (the visible chrome is user-select:none). (D)
const selectableValueStyle: CSSProperties = {
  ...srOnly,
  userSelect: "text",
  WebkitUserSelect: "text",
};
const menuStyle: CSSProperties = {
  zIndex: 30, display: "flex", flexDirection: "column", minWidth: 210,
  background: "var(--entviz-pill-menu-bg, #fff)", color: "var(--entviz-pill-menu-fg, #1a1a2e)",
  border: "var(--entviz-pill-menu-border, 1px solid #ddd)", borderRadius: 8,
  boxShadow: "0 6px 24px rgba(0,0,0,.14)", padding: 4, font: "13px system-ui, sans-serif",
};
const menuItemStyle: CSSProperties = {
  textAlign: "start", background: "none", border: "none", borderRadius: 6,
  padding: "7px 10px", cursor: "pointer", font: "inherit", color: "inherit",
};
// Full-viewport centering layer for the popover. position:fixed + inset:0 with a
// flex center pins the popover to the middle of the screen regardless of where the
// inline pill sits; the padding keeps a gutter at every edge. pointer-events:none so
// the layer is click-through (the popover is non-modal — it doesn't close on
// outside-click), while the dialog re-enables pointer events for itself.
const popOverlayStyle: CSSProperties = {
  position: "fixed", inset: 0, zIndex: 30,
  display: "flex", alignItems: "center", justifyContent: "center",
  padding: 12, pointerEvents: "none",
};
const popoverStyle: CSSProperties = {
  pointerEvents: "auto",
  // Own containing block for the absolutely-positioned ✕ (popCloseStyle). Without
  // it, the close button resolves against the next positioned ancestor — the fixed,
  // full-viewport overlay — EXCEPT while the grow animation's transform is live
  // (a transform is itself a containing block). That made the ✕ pin to the popover
  // corner only for the .26s animation, then jump out to the screen corner. Pinning
  // it here keeps the button in the corner whether or not a transform is active.
  position: "relative",
  display: "flex", flexDirection: "column", gap: 10, alignItems: "start",
  background: "var(--entviz-pill-popover-bg, #fff)", border: "var(--entviz-pill-popover-border, 1px solid #e6e6f0)",
  borderRadius: 12, padding: 14, boxShadow: "0 8px 30px rgba(0,0,0,.16)", font: "13px system-ui, sans-serif",
  // Responsive: never exceed the (padded) viewport; scroll tall content (e.g. the
  // compare surface on a phone or a short window). Width caps so the compare state
  // isn't enormous on desktop yet fits a narrow screen (where <EntvizCompare
  // layout="auto"> then stacks). maxHeight is 100% of the overlay's padded box.
  maxWidth: "min(720px, 100%)", maxHeight: "100%", overflowY: "auto",
};
// --- disclosure-lifecycle chrome styles ------------------------------------
const railStyle: CSSProperties = {
  display: "flex", alignItems: "center", gap: 8, fontSize: 11, letterSpacing: "0.08em",
  textTransform: "uppercase", marginBottom: 2,
};
const railSepStyle: CSSProperties = { width: 12, height: 1, background: "currentColor", opacity: 0.25 };
function railDotStyle(active: boolean): CSSProperties {
  return { width: 6, height: 6, borderRadius: "50%", background: "currentColor", opacity: active ? 1 : 0.3 };
}
// The clickable rail steps (Compare / Visualize navigation): bare buttons styled
// as links. The default is the CSS system color `LinkText` — the host's actual
// hyperlink color for the current color-scheme, so it stays legible in dark mode
// instead of a hard-coded blue. A host can still override with the var.
const railStepBtnStyle: CSSProperties = {
  font: "inherit", letterSpacing: "inherit", textTransform: "inherit",
  background: "none", border: "none", padding: 0, margin: 0, cursor: "pointer",
  // Full opacity: it's an actionable link, so it must NOT inherit the 0.5 dimming
  // the inactive (non-interactive) steps use — that dimming is half of why it read
  // as "barely visible" on a dark theme.
  opacity: 1,
  color: "var(--entviz-pill-compare-fg, LinkText)",
};
// The popover's explicit close (✕), pinned to the top-trailing corner (RTL-aware).
const popCloseStyle: CSSProperties = {
  // ≥24×24 px hit target (WCAG 2.5.8, AA) — the ✕ is the only reliable dismiss on
  // touch (Escape/outside-click aren't touch gestures). (A11Y-F5)
  position: "absolute", top: 6, insetInlineEnd: 6, zIndex: 1,
  width: 24, height: 24, display: "inline-flex", alignItems: "center", justifyContent: "center",
  font: "inherit", fontSize: 14, lineHeight: 1, color: "currentColor", opacity: 0.55,
  background: "none", border: "none", borderRadius: 6, cursor: "pointer",
};
const toastStyle: CSSProperties = {
  position: "absolute", top: "100%", marginTop: 6, zIndex: 35,
  background: "var(--entviz-pill-toast-bg, #1a1a2e)", color: "var(--entviz-pill-toast-fg, #fff)",
  borderRadius: 6, padding: "5px 9px", fontSize: 11, whiteSpace: "nowrap", font: "11px system-ui, sans-serif",
};

export default EntvizPill;

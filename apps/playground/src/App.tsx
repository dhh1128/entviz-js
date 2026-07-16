import { useMemo, useState } from "react";
import { EntvizPill, SUPPORTED_LOCALES } from "@entviz/react";
import { render as renderEntviz, SPEC_VERSION, CORNER_TOKENS, DEFAULT_CORNER_MAP, type CornerToken, type TrustAssumption } from "@entviz/core";
// Version badges read straight from source of truth so they never drift: the spec
// revision from the core renderer, the package versions from their manifests.
import corePkg from "../../../packages/core/package.json";
import reactPkg from "../../../packages/react/package.json";

// Footer documentation links (terse, link-forward). The entviz spec, paper, and
// threat model live in the sister reference repo; the JS API + this playground are
// published from entviz-js.
const DOC_LINKS: [string, string][] = [
  ["Spec", "https://dhh1128.github.io/entviz/spec/"],
  ["Paper", "https://dhh1128.github.io/entviz/entviz-paper/"],
  ["Integration guide", "https://dhh1128.github.io/entviz/integration-guide/"],
  ["JS API", "https://dhh1128.github.io/entviz-js/api/"],
  ["Source", "https://github.com/dhh1128/entviz-js"],
  ["Threat model", "https://dhh1128.github.io/entviz/threat-model/"],
];

// Showcase inputs spanning the parsers the port supports (hex/UUID/ETH/text).
const PRESETS: { label: string; value: string }[] = [
  { label: "CESR pubkey (role: key)", value: "DKxy2sgzfplyr_tgwIxS19f2OchFHtLwPWD3v4oYimBx" },
  { label: "hex (64 digits)", value: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" },
  { label: "UUID", value: "550e8400-e29b-41d4-a716-446655440000" },
  { label: "ETH (EIP-55)", value: "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed" },
  { label: "text → base64url", value: "The quick brown fox jumps over the lazy dog" },
  // A real 2048-bit RSA public key (base64 DER of the SubjectPublicKeyInfo — public,
  // no secret). >512 bits, so it renders as a fingerprint; classifies as base64. This
  // is the default so the "pubkey" pill label matches the value.
  { label: "RSA-2048 public key", value: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAv6PUUaSriz8CO7cvdTC9VHXbB/cONdugWSsMVsP5UBm73e2HPWVNxN1UsiXxC8ELPBODBPZWeI8Z05geCMed0Qm4CI6DgJEV53jp5fAUZPG7PSMXRCMK3CIfUrkw6SyRW8MrXI7JA24qPLpkSR+dNkb1rd+6Y4t+LFBa6qSqceQV8aXnZ48DzkW6YJ8wU6P357TqRn3Oi5SCSsN8+IYQ43Benu/HcS0ZMQIsjnr0K66dnI+PbVRr+t/TsPN+ioYIPWjs2pJciDLuhTyvXC2IyRIMUkogPiF0hIGaAF1oLJ34nmJj4Vkh+Pkh9/+DPAfkjW+jAaBBRDDoyzik/Pj0jwIDAQAB" },
];

// The controls sidebar is tabbed so it doesn't run tall as the prop surface grows.
// Value = what the entropy IS; Theme = the host environment; Pill = how the pill
// renders. (A "Corpus" tab joins these as the trust-gated recognition channels land.)
type TabId = "value" | "theme" | "pill" | "corpus";
const TABS: [TabId, string][] = [["value", "Value"], ["theme", "Theme"], ["pill", "Pill"], ["corpus", "Corpus"]];

// A fixed CESR Ed25519 signature (role: signature) for the app card's second pill,
// so two DIFFERENT roles are on screen at once — with "by role" corners, the key
// and the signature take visibly different shapes.
const SIG = "0B" + "Kx9Rn2Vw8Lm4Gs6Hd1Jb5Fc0Ea".repeat(4).slice(0, 86);

function randomHex(bytes: number): string {
  const u8 = new Uint8Array(bytes);
  crypto.getRandomValues(u8);
  return Array.from(u8, (b) => b.toString(16).padStart(2, "0")).join("");
}

const mono = '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const sans = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const serif = 'Georgia, "Iowan Old Style", "Times New Roman", serif';

// A host app sets its OWN typography/colors, plus a handful of `--entviz-*` custom
// properties, and the components inherit the rest. These four "ambient themes"
// demonstrate that adaptation — the SAME <EntvizPill> looks native in each.
type Palette = { name: string; scheme: "light" | "dark"; font: string; bg: string; panel: string; fg: string; accent: string; border: string; muted: string };
const PALETTES: Palette[] = [
  { name: "Acme (light)", scheme: "light", font: sans, bg: "#f6f7f9", panel: "#ffffff", fg: "#1f2733", accent: "#2f6bff", border: "#d5dae2", muted: "#8a93a2" },
  { name: "Midnight (dark)", scheme: "dark", font: sans, bg: "#0f1218", panel: "#1a1f2b", fg: "#c7cdd9", accent: "#8b7dff", border: "#2d3440", muted: "#7a8494" },
  { name: "Gazette (serif)", scheme: "light", font: serif, bg: "#f4eee1", panel: "#fbf7ee", fg: "#2a2620", accent: "#9a3b2e", border: "#ddd2bd", muted: "#8a7f6d" },
  { name: "Terminal (mono)", scheme: "dark", font: mono, bg: "#0a0e0a", panel: "#101610", fg: "#b9d3b0", accent: "#57d977", border: "#243024", muted: "#6f8a6b" },
];

// Map a palette to the component CSS custom properties a host would set. Anything
// omitted falls back to the components' own defaults (or currentColor).
function evzVars(p: Palette): Record<string, string> {
  const b1 = `1px solid ${p.border}`;
  return {
    // <Entviz> toolbar (size ladder, shape picker, copy/export kebab)
    // Only the ACCENT is themed; the toolbar button surface/border use the
    // component's own currentColor-adaptive defaults so they stay readable on dark.
    "--entviz-ctl-active": p.accent,
    "--entviz-menu-bg": p.panel, "--entviz-menu-fg": p.fg, "--entviz-menu-border": b1,
    "--entviz-toast-bg": p.fg, "--entviz-toast-fg": p.bg,
    // <EntvizPill> chrome
    "--entviz-pill-popover-bg": p.panel, "--entviz-pill-popover-border": b1,
    "--entviz-pill-menu-bg": p.panel, "--entviz-pill-menu-fg": p.fg, "--entviz-pill-menu-border": b1,
    "--entviz-pill-toast-bg": p.fg, "--entviz-pill-toast-fg": p.bg,
    // NB: deliberately NOT setting --entviz-pill-compare-fg, so the rail links use
    // their default `LinkText` (the host's current-mode hyperlink color). The card's
    // `colorScheme` below is what lets that adapt to the dark palettes.
    // <EntvizCompare> / walk (reached by drilling into the pill)
    "--entviz-compare-action": p.accent, "--entviz-compare-neutral": p.muted,
    "--entviz-compare-placeholder": p.border, "--entviz-compare-placeholder-fg": p.muted,
    "--entviz-compare-input-border": b1,
    "--entviz-walk-btn": p.border, "--entviz-walk-btn-bg": p.panel, "--entviz-walk-track": p.border,
  };
}

export function App() {
  // Default to a CESR Ed25519 public key so the first/third pills show a real role
  // ("cesr · key") out of the box, matching the "public key" narrative in the card.
  const DEFAULT = PRESETS[0];
  const [draft, setDraft] = useState(DEFAULT.value);
  const [value, setValue] = useState(DEFAULT.value);
  const [fontSizePt, setFontSizePt] = useState(12);
  const [note, setNote] = useState("");
  const [locale, setLocale] = useState(""); // "" = auto-detect from the browser
  // Blank by default: with no host label, the pill shows only the type + role, which
  // TRACK the value (unlike a hardcoded string). A label is opt-in host text, and —
  // when set — it wins over the gated mnemonic.
  const [pillLabel, setPillLabel] = useState("");
  const [showType, setShowType] = useState(true);
  const [showIcon, setShowIcon] = useState(true);
  // "" = default (round); "role" = apply DEFAULT_CORNER_MAP (shape follows the value's
  // role); a token = force that one shape on every pill (for eyeballing the geometry).
  const [corner, setCorner] = useState<CornerToken | "" | "role">("role");
  // Corpus recognition (this.i ujdwjtex): the host-declared trust posture + which
  // gated channels it opts in. `wild` (default) keeps everything value-derived off.
  const [posture, setPosture] = useState<"wild" | "corpus">("wild");
  const [mnemonicOn, setMnemonicOn] = useState(true);
  const [autoColorOn, setAutoColorOn] = useState(true);
  const [iconOn, setIconOn] = useState(true);
  const [themeIdx, setThemeIdx] = useState(0);
  const [tab, setTab] = useState<TabId>("value");

  // The TrustAssumption a real host would attach to a same-origin set of values.
  // In the wild posture we pass nothing at all — the maximum-safety default.
  const trust: TrustAssumption | undefined =
    posture === "corpus"
      ? { posture: "corpus", mnemonic: mnemonicOn, autoColor: autoColorOn, icon: iconOn }
      : undefined;

  const opts = { fontSizePt, note: note || null };
  const theme = PALETTES[themeIdx];

  // Surface the renderer's error (bad note, etc.) so invalid inputs are visible;
  // the pill itself also fails closed to an "unrenderable" state.
  const error = useMemo(() => {
    try {
      renderEntviz(value, opts);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }, [value, fontSizePt, note]);

  const build = () => setValue(draft.trim());
  const surprise = () => {
    const v = randomHex(32);
    setDraft(v);
    setValue(v);
  };

  // The corner picker drives EITHER a role-map (shape follows role) or a forced
  // single shape — never both, so `extra` (e.g. the sig pill's own value) still wins.
  const cornerProps =
    corner === "role" ? { cornerMap: DEFAULT_CORNER_MAP } : { corner: corner || undefined };

  const pill = (extra: Partial<React.ComponentProps<typeof EntvizPill>> = {}) => (
    <EntvizPill
      value={value}
      label={pillLabel || undefined}
      showType={showType}
      showIcon={showIcon}
      {...cornerProps}
      trust={trust}
      fontSizePt={fontSizePt}
      note={note || null}
      locale={locale || undefined}
      onCompare={() => console.log("pill: entered compare")}
      onError={(m) => console.warn("pill:", m)}
      {...extra}
    />
  );

  return (
    <div style={{ fontFamily: sans, color: "#1a1a2e", maxWidth: 980, margin: "0 auto", padding: "32px 20px 64px" }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, margin: "0 0 4px", letterSpacing: -0.5 }}>
          entviz <span style={{ color: ACCENT }}>playground</span>
        </h1>
        <p style={{ margin: 0, color: "#555", fontSize: 14 }}>
          An entviz enters the page as a compact <code style={{ fontFamily: mono }}>&lt;EntvizPill/&gt;</code>. Click it
          to <b>Visualize</b> the full render, then <b>Compare</b> it against a reference — all in one place. The app is
          on the left; tweak its inputs and switch the host theme on the right to watch the components adapt.
        </p>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 1fr) minmax(260px, 340px)", gap: 28, alignItems: "start" }}>
        {/* Showcase — the pill, inside a switchable ambient host theme. Placed FIRST so
            the thing the user actually plays with is where they read first (left/top),
            and the controls that drive it sit alongside on the right. */}
        <section>
          {/* The card represents a HOST APPLICATION — so it holds only app content
              (prose with the pill in situ), never instructions the real app wouldn't
              show. As the lead element it needs no separating top margin. */}
          <div style={{ ...evzVars(theme), colorScheme: theme.scheme, background: theme.bg, color: theme.fg, fontFamily: theme.font, borderRadius: 14, padding: "30px 28px", margin: "0 0 16px", border: "1px solid rgba(0,0,0,.08)" } as React.CSSProperties}>
            <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", opacity: 0.55, marginBottom: 16 }}>
              ▦ your application
            </div>
            <p style={{ fontSize: 18, lineHeight: 1.8, margin: 0, maxWidth: "52ch" }}>
              When a peer shares their public key {pill()}, pin it the first time you see it — then, before you
              trust the message they sign with it {pill({ value: SIG })}, confirm both are the
              very ones you expect.
            </p>
            {/* Mute the prose with a translucent TEXT color, not `opacity`: the pill
                lives in this paragraph, and element opacity would dim its whole
                subtree — including the position:fixed menu, which then reads as
                semi-transparent over the page. */}
            <p style={{ fontSize: 13, color: "color-mix(in srgb, currentColor 65%, transparent)", marginTop: 22 }}>
              The same key, shown without its badge: {pill({ showIcon: false })}.
            </p>
          </div>

          {error ? (
            <div style={{ marginTop: 12, color: "#b00020", fontFamily: mono, fontSize: 12, lineHeight: 1.5, border: "1px solid #f3c2c2", background: "#fff5f5", borderRadius: 8, padding: "8px 10px" }}>
              <b>render rejected:</b> {error} — the pill falls back to an “unrenderable” state.
            </div>
          ) : null}

          {/* Docs footer — lives in the LEFT column, under the (short) app card, to
              use the vertical space the (tall) controls sidebar leaves opposite it.
              Terse + link-forward: one line of orientation, then the doc links, then
              the exact spec/package versions this playground is built against. */}
          <hr style={{ border: 0, borderTop: "1px solid #e3e6ef", margin: "26px 0 16px" }} />
          <p style={{ fontSize: 13, color: "#555", lineHeight: 1.6, margin: "0 0 10px" }}>
            entviz renders a high-entropy value as a comparable SVG diagram.{" "}
            <code style={{ fontFamily: mono }}>@entviz/react</code> wraps the certified{" "}
            <code style={{ fontFamily: mono }}>@entviz/core</code> renderer with UI (pill, compare, walk).
          </p>
          <nav style={{ fontSize: 13, marginBottom: 10 }}>
            {DOC_LINKS.map(([label, href], i) => (
              <span key={href}>
                {i > 0 ? <span style={{ color: "#c3c8d4", margin: "0 8px" }}>·</span> : null}
                <a href={href} target="_blank" rel="noopener noreferrer" style={docLink}>{label}</a>
              </span>
            ))}
          </nav>
          <div style={{ fontSize: 12, color: "#8a93a2" }}>
            entviz spec {SPEC_VERSION} · <code style={{ fontFamily: mono }}>@entviz/core</code> {corePkg.version} ·{" "}
            <code style={{ fontFamily: mono }}>@entviz/react</code> {reactPkg.version}
          </div>
        </section>

        {/* Controls — the host theme + entropy + how the entviz/pill renders. The theme
            leads (it re-skins the card to the left); the render inputs follow. Rendered
            as a bordered, subtly-tinted SIDEBAR so it reads as "the knobs", visually
            distinct from the themed host-app card on the left. */}
        <section style={sidebarStyle}>
          <div style={sidebarCaption}>Playground controls</div>
          <div role="tablist" aria-label="Playground controls" style={tabBar}>
            {TABS.map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                style={tab === id ? tabActive : tabBtn}>
                {label}
              </button>
            ))}
          </div>

          {tab === "value" ? (
            <>
              <label style={labelStyle}>Entropy</label>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") build(); }}
                spellCheck={false}
                rows={3}
                style={{ width: "100%", boxSizing: "border-box", fontFamily: mono, fontSize: 13, padding: 10, borderRadius: 8, border: "1px solid #ccc", resize: "vertical" }}
              />
              <div style={{ display: "flex", gap: 8, margin: "8px 0 4px", flexWrap: "wrap" }}>
                <button onClick={build} style={primaryBtn} title="⌘↵ / Ctrl+Enter">Build</button>
                <button onClick={surprise} style={ghostBtn}>Randomize</button>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
                {PRESETS.map((p) => (
                  <button key={p.label} onClick={() => { setDraft(p.value); setValue(p.value); }} style={chip}>
                    {p.label}
                  </button>
                ))}
              </div>

              <label style={labelStyle}>
                Note <span style={{ fontWeight: 400, color: "#888" }}>(≤10 printable-ASCII chars; never hashed)</span>
              </label>
              <input type="text" value={note} maxLength={20} placeholder="e.g. git"
                onChange={(e) => setNote(e.target.value)}
                style={{ width: "100%", boxSizing: "border-box", fontFamily: mono, fontSize: 13, padding: "8px 10px", borderRadius: 8, border: "1px solid #ccc", marginBottom: 16 }} />

              <label style={labelStyle}>
                Pill label <span style={{ fontWeight: 400, color: "#888" }}>(first-party host text — trusted, unlike the note)</span>
              </label>
              <input type="text" value={pillLabel} placeholder="e.g. signing-key"
                onChange={(e) => setPillLabel(e.target.value)}
                style={{ width: "100%", boxSizing: "border-box", fontSize: 13, padding: "8px 10px", borderRadius: 8, border: "1px solid #ccc" }} />
            </>
          ) : null}

          {tab === "theme" ? (
            <>
              <label style={labelStyle}>
                Ambient host theme <span style={{ fontWeight: 400, color: "#888" }}>— the components ship no fonts/colors; they inherit the host's type + a few <code style={{ fontFamily: mono }}>--entviz-*</code> vars</span>
              </label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
                {PALETTES.map((p, i) => (
                  <button key={p.name} onClick={() => setThemeIdx(i)}
                    style={i === themeIdx ? themeBtnActive : themeBtn}>
                    {p.name}
                  </button>
                ))}
              </div>

              <label style={labelStyle}>
                Font size <span style={{ fontWeight: 400, color: "#888" }}>({fontSizePt}pt — the initial render size; also adjustable inside the pill)</span>
              </label>
              <input type="range" min={6} max={30} step={2} value={fontSizePt}
                onChange={(e) => setFontSizePt(Number(e.target.value))}
                style={{ width: "100%", marginBottom: 16, accentColor: ACCENT }} />

              <label style={labelStyle}>
                Pill locale <span style={{ fontWeight: 400, color: "#888" }}>(chrome only — never the value; RTL mirrors chrome)</span>
              </label>
              <select value={locale} onChange={(e) => setLocale(e.target.value)} style={selectStyle}>
                <option value="">auto (browser)</option>
                {SUPPORTED_LOCALES.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </>
          ) : null}

          {tab === "pill" ? (
            <>
              <label style={checkRow}>
                <input type="checkbox" checked={showType} onChange={(e) => setShowType(e.target.checked)} />
                Show type label
              </label>
              <label style={checkRow}>
                <input type="checkbox" checked={showIcon} onChange={(e) => setShowIcon(e.target.checked)} />
                Show badge icon
              </label>

              <label style={{ ...labelStyle, marginTop: 16 }}>
                Corner shape <span style={{ fontWeight: 400, color: "#888" }}>(this.i <code style={{ fontFamily: mono }}>gk37dm5n</code> — a gestalt cue for the value's <i>type</i>; carries no identity bits, so it needs no trust posture)</span>
              </label>
              <select value={corner} onChange={(e) => setCorner(e.target.value as CornerToken | "" | "role")} style={selectStyle}>
                <option value="">default (round)</option>
                <option value="role">▸ by role (digest·sig·key…)</option>
                {CORNER_TOKENS.map((t) => <option key={t} value={t}>force: {t}</option>)}
              </select>
              <p style={{ fontSize: 12, color: "#8a93a2", margin: "2px 0 0", lineHeight: 1.5 }}>
                <b>by role</b> applies <code style={{ fontFamily: mono }}>DEFAULT_CORNER_MAP</code> so each entropy category takes a distinct
                shape — the key and the signature in the card above differ. The <b>force</b> options pin one shape on every pill for eyeballing the geometry.
              </p>
            </>
          ) : null}

          {tab === "corpus" ? (
            <>
              <label style={labelStyle}>
                Trust posture <span style={{ fontWeight: 400, color: "#888" }}>(this.i <code style={{ fontFamily: mono }}>ujdwjtex</code> — HOST-declared, per value; <b>never</b> an end-user toggle)</span>
              </label>
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                <button onClick={() => setPosture("wild")} style={posture === "wild" ? themeBtnActive : themeBtn}>
                  wild (adversarial)
                </button>
                <button onClick={() => setPosture("corpus")} style={posture === "corpus" ? themeBtnActive : themeBtn}>
                  corpus (trusted)
                </button>
              </div>
              <p style={{ fontSize: 12, color: "#8a93a2", margin: "0 0 16px", lineHeight: 1.5 }}>
                <b>wild</b> is the default: the pill carries <i>zero identity bits</i> — no value ever leaks.
                <b> corpus</b> opts a same-origin, already-trusted set of values into the recognition aids below.
                A real app sets this in code for values it vouches for; the only runtime way a value earns it is a
                completed formal comparison (earned promotion, v2) — never a click.
              </p>

              <div style={{ opacity: posture === "corpus" ? 1 : 0.4, transition: "opacity .15s" }}>
                <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8a93a2", fontWeight: 600, margin: "0 0 8px" }}>
                  Gated channels
                </div>
                <label style={checkRow}>
                  <input type="checkbox" checked={mnemonicOn} disabled={posture !== "corpus"}
                    onChange={(e) => setMnemonicOn(e.target.checked)} />
                  Mnemonic label <span style={{ fontWeight: 400, color: "#888" }}>— 4 value chars + 4 fingerprint chars (<code style={{ fontFamily: mono }}>mmtxrg4w</code>)</span>
                </label>
                <label style={checkRow}>
                  <input type="checkbox" checked={autoColorOn} disabled={posture !== "corpus"}
                    onChange={(e) => setAutoColorOn(e.target.checked)} />
                  Auto-color tint <span style={{ fontWeight: 400, color: "#888" }}>— value → 1 of 16 hues, painted faintly (<code style={{ fontFamily: mono }}>tgowi7go</code>)</span>
                </label>
                <label style={checkRow}>
                  <input type="checkbox" checked={iconOn} disabled={posture !== "corpus"}
                    onChange={(e) => setIconOn(e.target.checked)} />
                  Colorbar icon <span style={{ fontWeight: 400, color: "#888" }}>— the 2×2 badge becomes a value-derived mini-colorbar (<code style={{ fontFamily: mono }}>wn3r6aex</code>)</span>
                </label>
                <p style={{ fontSize: 12, color: "#8a93a2", margin: "6px 0 0", lineHeight: 1.5 }}>
                  With <b>corpus</b> on, each pill shows e.g. <code style={{ fontFamily: mono }}>DKxy2sgz…19f2…imBx</code>, a faint hue, and a mini-colorbar
                  leading cap — recognition anchors, never verification claims (two matching pills still route through Compare). The two card pills
                  differ in value, so all three channels differ. Flip to <b>wild</b> and every value-derived cue vanishes (zero identity bits).
                </p>
              </div>
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}

// One accent and one control system for the whole page: every button shares the
// same height, font, radius, and border; ACCENT is the ONLY brand color (title,
// primary action, selected theme, slider). No more three blues and two heights.
const ACCENT = "#6c63ff";
const controlBase: React.CSSProperties = {
  font: "inherit", fontSize: 13, fontWeight: 600, lineHeight: 1,
  padding: "8px 14px", borderRadius: 8, cursor: "pointer",
  border: "1px solid #d8dae6", background: "#fff", color: "#3a3a4a",
};
const labelStyle: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 600, margin: "0 0 6px", color: "#333" };
// filled accent = the emphasized control (primary action; selected theme)
const primaryBtn: React.CSSProperties = { ...controlBase, background: ACCENT, borderColor: ACCENT, color: "#fff" };
const themeBtnActive: React.CSSProperties = primaryBtn;
// outlined = every secondary control (Randomize, inactive theme)
const ghostBtn: React.CSSProperties = controlBase;
const themeBtn: React.CSSProperties = controlBase;
// same control, pill-shaped + lighter, for the quick-fill preset tags
const chip: React.CSSProperties = { ...controlBase, fontWeight: 500, borderRadius: 999 };
// footer doc links — the one accent, no underline until hover (browser default)
const docLink: React.CSSProperties = { color: ACCENT, textDecoration: "none", fontWeight: 600 };
// the controls sidebar: a bordered, subtly-tinted panel that signals "config surface",
// set apart from the host-app card on the left.
const sidebarStyle: React.CSSProperties = {
  background: "#f7f8fb", border: "1px solid #e3e6ef", borderRadius: 12, padding: 18,
};
const sidebarCaption: React.CSSProperties = {
  fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase",
  color: "#8a93a2", fontWeight: 600, marginBottom: 16,
};
// Tab bar for the controls sidebar — a row of segmented buttons over a hairline.
const tabBar: React.CSSProperties = {
  display: "flex", gap: 4, marginBottom: 18, borderBottom: "1px solid #e3e6ef", paddingBottom: 0,
};
const tabBtn: React.CSSProperties = {
  font: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer",
  padding: "7px 12px", border: "none", borderBottom: "2px solid transparent",
  background: "none", color: "#8a93a2", marginBottom: -1,
};
const tabActive: React.CSSProperties = { ...tabBtn, color: ACCENT, borderBottom: `2px solid ${ACCENT}` };
// Shared <select> styling (locale, corner shape).
const selectStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", fontSize: 13, padding: "8px 10px",
  borderRadius: 8, border: "1px solid #ccc", marginBottom: 4, background: "#fff",
};
// A checkbox + label row.
const checkRow: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 400,
  color: "#333", margin: "0 0 10px",
};

import { useMemo, useState } from "react";
import { EntvizPill, SUPPORTED_LOCALES } from "@entviz/react";
import { render as renderEntviz } from "@entviz/core";

// Showcase inputs spanning the parsers the port supports (hex/UUID/ETH/text).
const PRESETS: { label: string; value: string }[] = [
  { label: "hex (256-bit)", value: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" },
  { label: "UUID", value: "550e8400-e29b-41d4-a716-446655440000" },
  { label: "ETH (EIP-55)", value: "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed" },
  { label: "text → base64url", value: "The quick brown fox jumps over the lazy dog" },
];

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
type Palette = { name: string; font: string; bg: string; panel: string; fg: string; accent: string; border: string; muted: string };
const PALETTES: Palette[] = [
  { name: "Acme (light)", font: sans, bg: "#f6f7f9", panel: "#ffffff", fg: "#1f2733", accent: "#2f6bff", border: "#d5dae2", muted: "#8a93a2" },
  { name: "Midnight (dark)", font: sans, bg: "#0f1218", panel: "#1a1f2b", fg: "#c7cdd9", accent: "#8b7dff", border: "#2d3440", muted: "#7a8494" },
  { name: "Gazette (serif)", font: serif, bg: "#f4eee1", panel: "#fbf7ee", fg: "#2a2620", accent: "#9a3b2e", border: "#ddd2bd", muted: "#8a7f6d" },
  { name: "Terminal (mono)", font: mono, bg: "#0a0e0a", panel: "#101610", fg: "#b9d3b0", accent: "#57d977", border: "#243024", muted: "#6f8a6b" },
];

// Map a palette to the component CSS custom properties a host would set. Anything
// omitted falls back to the components' own defaults (or currentColor).
function evzVars(p: Palette): Record<string, string> {
  const b1 = `1px solid ${p.border}`;
  return {
    // <Entviz> toolbar (size ladder, shape picker, copy/export kebab)
    "--entviz-ctl": p.border, "--entviz-ctl-bg": p.panel, "--entviz-ctl-active": p.accent,
    "--entviz-menu-bg": p.panel, "--entviz-menu-fg": p.fg, "--entviz-menu-border": b1,
    "--entviz-toast-bg": p.fg, "--entviz-toast-fg": p.bg,
    // <EntvizPill> chrome
    "--entviz-pill-popover-bg": p.panel, "--entviz-pill-popover-border": b1,
    "--entviz-pill-menu-bg": p.panel, "--entviz-pill-menu-fg": p.fg, "--entviz-pill-menu-border": b1,
    "--entviz-pill-toast-bg": p.fg, "--entviz-pill-toast-fg": p.bg, "--entviz-pill-compare-fg": p.accent,
    // <EntvizCompare> / walk (reached by drilling into the pill)
    "--entviz-compare-action": p.accent, "--entviz-compare-neutral": p.muted,
    "--entviz-compare-placeholder": p.border, "--entviz-compare-placeholder-fg": p.muted,
    "--entviz-compare-input-border": b1,
    "--entviz-walk-btn": p.border, "--entviz-walk-btn-bg": p.panel, "--entviz-walk-track": p.border,
  };
}

export function App() {
  const [draft, setDraft] = useState(PRESETS[0].value);
  const [value, setValue] = useState(PRESETS[0].value);
  const [fontSizePt, setFontSizePt] = useState(12);
  const [note, setNote] = useState("");
  const [locale, setLocale] = useState(""); // "" = auto-detect from the browser
  const [pillLabel, setPillLabel] = useState("");
  const [showType, setShowType] = useState(true);
  const [themeIdx, setThemeIdx] = useState(0);

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

  const pill = (extra: Partial<React.ComponentProps<typeof EntvizPill>> = {}) => (
    <EntvizPill
      value={value}
      label={pillLabel || undefined}
      showType={showType}
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
          entviz <span style={{ color: "#6c63ff" }}>playground</span>
        </h1>
        <p style={{ margin: 0, color: "#555", fontSize: 14, maxWidth: "70ch" }}>
          An entviz enters the page as a compact <code style={{ fontFamily: mono }}>&lt;EntvizPill/&gt;</code>. Click it
          to <b>Visualize</b> the full render, then <b>Compare</b> it against a reference — all in one place. Tweak the
          inputs on the left; switch the host theme on the right to watch the components adapt.
        </p>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 340px) minmax(300px, 1fr)", gap: 28, alignItems: "start" }}>
        {/* Controls — entropy + how the entviz/pill renders */}
        <section>
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
            <button onClick={build} style={primaryBtn}>Build ⌘↵</button>
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
            Font size <span style={{ fontWeight: 400, color: "#888" }}>({fontSizePt}pt — the initial render size; also adjustable inside the pill)</span>
          </label>
          <input type="range" min={6} max={30} step={2} value={fontSizePt}
            onChange={(e) => setFontSizePt(Number(e.target.value))}
            style={{ width: "100%", marginBottom: 16 }} />

          <label style={labelStyle}>
            Note <span style={{ fontWeight: 400, color: "#888" }}>(≤10 printable-ASCII chars; never hashed)</span>
          </label>
          <input type="text" value={note} maxLength={20} placeholder="e.g. git"
            onChange={(e) => setNote(e.target.value)}
            style={{ width: "100%", boxSizing: "border-box", fontFamily: mono, fontSize: 13, padding: "8px 10px", borderRadius: 8, border: "1px solid #ccc", marginBottom: 16 }} />

          <label style={labelStyle}>
            Pill locale <span style={{ fontWeight: 400, color: "#888" }}>(chrome only — never the value; RTL mirrors chrome)</span>
          </label>
          <select value={locale} onChange={(e) => setLocale(e.target.value)}
            style={{ width: "100%", boxSizing: "border-box", fontSize: 13, padding: "8px 10px", borderRadius: 8, border: "1px solid #ccc", marginBottom: 16 }}>
            <option value="">auto (browser)</option>
            {SUPPORTED_LOCALES.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>

          <label style={labelStyle}>
            Pill label <span style={{ fontWeight: 400, color: "#888" }}>(first-party host text — trusted, unlike the note)</span>
          </label>
          <input type="text" value={pillLabel} placeholder="e.g. signing-key"
            onChange={(e) => setPillLabel(e.target.value)}
            style={{ width: "100%", boxSizing: "border-box", fontSize: 13, padding: "8px 10px", borderRadius: 8, border: "1px solid #ccc", marginBottom: 10 }} />
          <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 8, fontWeight: 400 }}>
            <input type="checkbox" checked={showType} onChange={(e) => setShowType(e.target.checked)} />
            Show type label
          </label>
        </section>

        {/* Showcase — the pill, inside a switchable ambient host theme */}
        <section>
          <label style={labelStyle}>
            Ambient host theme <span style={{ fontWeight: 400, color: "#888" }}>— the components ship no fonts/colors; they inherit the host's type + a few <code style={{ fontFamily: mono }}>--entviz-*</code> vars</span>
          </label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            {PALETTES.map((p, i) => (
              <button key={p.name} onClick={() => setThemeIdx(i)}
                style={i === themeIdx ? themeBtnActive : themeBtn}>
                {p.name}
              </button>
            ))}
          </div>

          <div style={{ ...evzVars(theme), background: theme.bg, color: theme.fg, fontFamily: theme.font, borderRadius: 14, padding: "30px 28px", border: "1px solid rgba(0,0,0,.08)" } as React.CSSProperties}>
            <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", opacity: 0.55, marginBottom: 16 }}>
              ▦ your application
            </div>
            <p style={{ fontSize: 18, lineHeight: 1.8, margin: 0, maxWidth: "52ch" }}>
              Before you rotate it, save your signing key {pill()} to your secret store — then confirm the
              one you restore later is the very same key.
            </p>
            <p style={{ fontSize: 13, opacity: 0.65, marginTop: 22 }}>
              Click the pill → <b>Visualize</b> the full render → <b>“Compare against a reference…”</b>. Everything
              below inherits this theme. Also shown without its badge: {pill({ showIcon: false })}.
            </p>
          </div>

          {error ? (
            <div style={{ marginTop: 12, color: "#b00020", fontFamily: mono, fontSize: 12, lineHeight: 1.5, border: "1px solid #f3c2c2", background: "#fff5f5", borderRadius: 8, padding: "8px 10px" }}>
              <b>render rejected:</b> {error} — the pill falls back to an “unrenderable” state.
            </div>
          ) : null}

          <p style={{ fontSize: 12.5, color: "#666", lineHeight: 1.6, marginTop: 18, maxWidth: "60ch" }}>
            The lifecycle is <b>Cite · Visualize · Compare</b>: the pill cites the value inline; expanding visualizes the
            spec-locked glyph with its size/shape/copy controls; and “Compare” opens the full comparison surface
            (paste / drop / click-the-rect to upload / URL, machine verdict, guided walk, and voice ceremony) in place.
          </p>
        </section>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 600, margin: "0 0 6px", color: "#333" };
const primaryBtn: React.CSSProperties = { background: "#6c63ff", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer" };
const ghostBtn: React.CSSProperties = { background: "#fff", color: "#6c63ff", border: "1px solid #6c63ff", borderRadius: 8, padding: "8px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer" };
const chip: React.CSSProperties = { background: "#eef0ff", color: "#3b34b0", border: "none", borderRadius: 999, padding: "5px 11px", fontSize: 12, cursor: "pointer" };
const themeBtn: React.CSSProperties = { background: "#fff", color: "#444", border: "1px solid #ccc", borderRadius: 8, padding: "6px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" };
const themeBtnActive: React.CSSProperties = { ...themeBtn, background: "#1a1a2e", color: "#fff", borderColor: "#1a1a2e" };

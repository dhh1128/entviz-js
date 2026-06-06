/**
 * <Entviz /> — a React component that renders a high-entropy value as an entviz
 * SVG, making it trivial to drop a comparable visual fingerprint into any web
 * or mobile UI. A thin wrapper over the certified @entviz/core renderer.
 */
import React from "react";
import { render, type RenderOptions } from "@entviz/core";

export interface EntvizProps {
  /** The high-entropy value to visualize (key, hash, UUID, address, …). */
  value: string;
  /** Target aspect ratio W/H (default 1.0). */
  targetAr?: number;
  /** Reference font size in points (default 12). */
  fontSizePt?: number;
  /** Optional out-of-band caption (≤8 ASCII alphanumerics). */
  note?: string | null;
  /** Extra props applied to the wrapping element (className, style, …). */
  className?: string;
  style?: React.CSSProperties;
  /** Accessible label; defaults to a generic description. */
  title?: string;
  /** Called with the error message if rendering throws (e.g. bad note). */
  onError?: (message: string) => void;
}

/**
 * Renders the entviz inline (dangerouslySetInnerHTML is safe here: the SVG is
 * produced entirely by our own renderer, which escapes all text content, and
 * never embeds caller markup). The root <svg> carries a viewBox, so the entviz
 * scales responsively to the wrapper's width.
 */
export function Entviz(props: EntvizProps): React.ReactElement {
  const { value, targetAr, fontSizePt, note, className, style, title, onError } = props;
  const svg = React.useMemo(() => {
    const opts: RenderOptions = { targetAr, fontSizePt, note };
    try {
      return render(value, opts);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (onError) onError(msg);
      return null;
    }
  }, [value, targetAr, fontSizePt, note, onError]);

  if (svg === null) {
    return React.createElement("span", { className, style, role: "img", "aria-label": title ?? "entviz (render error)" });
  }
  return React.createElement("span", {
    className,
    style,
    role: "img",
    "aria-label": title ?? "entviz fingerprint",
    dangerouslySetInnerHTML: { __html: svg },
  });
}

export default Entviz;

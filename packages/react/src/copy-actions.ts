/**
 * Shared clipboard/export mechanics for the entviz UI (the inline <EntvizPill>
 * and the <Entviz controls> toolbar). Only the raw clipboard writes and the
 * SVG→PNG rasterization live here; each caller owns its own labels/toasts so it
 * can localize (the pill) or stay English-only (the toolbar). Isomorphic-safe:
 * touches only browser APIs (navigator.clipboard, canvas, Image), no node deps.
 */
import { comparisonText, render, type RenderOptions } from "@entviz/core";

export type CopyKind = "value" | "comparison" | "image" | "svg";

// Rasterize an entviz SVG to a 2× PNG blob via an offscreen canvas.
export async function rasterizeToPng(svg: string): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("image decode failed"));
      img.src = url;
    });
    const w = img.naturalWidth || 200;
    const hgt = img.naturalHeight || 200;
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = w * scale;
    canvas.height = hgt * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    return await new Promise<Blob>((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/png"),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Write the requested representation of an entviz to the clipboard. Throws on
 * any failure (unclassifiable value, denied clipboard, decode error) so callers
 * fail closed — a copy either lands or reports failure, never silently no-ops.
 * `render`/`comparisonText` are recomputed from source rather than trusting a
 * possibly-stale prerendered `svg`, except for image/svg which need the markup.
 */
export async function copyEntviz(
  kind: CopyKind,
  args: { value: string; opts: RenderOptions; svg: string | null },
): Promise<void> {
  const { value, opts, svg } = args;
  if (kind === "value") {
    await navigator.clipboard.writeText(value);
  } else if (kind === "comparison") {
    await navigator.clipboard.writeText(comparisonText(value, opts));
  } else if (kind === "svg") {
    await navigator.clipboard.writeText(svg ?? render(value, opts));
  } else {
    const blob = await rasterizeToPng(svg ?? render(value, opts));
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
  }
}

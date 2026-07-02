/**
 * Raster-engine calibration harness (comparison-design §6.3) — NOT shipped; a dev
 * page served by Vite at /calibrate.html. It rasterizes a real entviz through the
 * browser canvas (with anti-aliasing) at a ladder of pixel sizes and runs the core
 * rasterCompare against the SAME value (want: no visible difference) and a
 * DIFFERENT value of the same shape (want: different), so we can read off the
 * smallest reliable size and confirm the tolerances against real pixels.
 */
import { render, rasterCompare, type Raster } from "@entviz/core";

const SAME = "550e8400-e29b-41d4-a716-446655440000";
const DIFF = "ffffffff-ffff-4fff-afff-ffffffffffff"; // same 6-cell shape, different content

function rasterAt(svg: string, targetW: number): Promise<Raster> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error("decode failed"));
    img.onload = () => {
      const aspect = (img.naturalHeight || 1) / (img.naturalWidth || 1);
      const w = targetW;
      const h = Math.round(targetW * aspect);
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      resolve({ rgba: ctx.getImageData(0, 0, w, h).data, w, h });
    };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
}

const show = (v: { state: string; similar?: boolean; reason?: string }): string =>
  v.state + (v.similar ? "·similar" : "") + (v.reason ? ` (${v.reason})` : "");

(async () => {
  const out = document.getElementById("out")!;
  try {
    const svg = render(SAME);
    const lines: string[] = [];
    for (const W of [30, 40, 50, 60, 70, 80, 100, 140, 200, 300]) {
      const r = await rasterAt(svg, W);
      const same = rasterCompare(r, SAME);
      const diff = rasterCompare(r, DIFF);
      const ok = same.state === "unknown" && same.similar && diff.state === "different";
      lines.push(`W=${String(W).padStart(3)} (${r.w}x${r.h})  same=${show(same).padEnd(48)} diff=${show(diff).padEnd(28)} ${ok ? "OK" : "--"}`);
    }
    out.textContent = lines.join("\n");
  } catch (e) {
    out.textContent = "ERROR: " + (e instanceof Error ? e.message : String(e));
  }
  document.body.setAttribute("data-done", "1");
})();

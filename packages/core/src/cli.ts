/**
 * Conformance CLI: reads one corpus vector's input.json on stdin, writes the
 * entviz SVG to stdout (exit 0) for a render vector, or exits non-zero for a
 * rejected input — the contract in the entviz repo's compliance/README.md.
 *
 *   echo '{"entropy":"...","params":{...},"expect":"render"}' | node cli.ts
 */
import { render } from "./entviz.ts";

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

const main = async () => {
  const raw = await readStdin();
  const req = JSON.parse(raw);
  const p = req.params ?? {};
  try {
    const svg = render(req.entropy, {
      targetAr: p.target_ar ?? 1.0,
      fontSizePt: p.font_size_pt ?? 12,
      note: p.note ?? null,
    });
    process.stdout.write(svg);
    process.exit(0);
  } catch (e) {
    process.stderr.write(String(e instanceof Error ? e.message : e) + "\n");
    process.exit(1);
  }
};

main();

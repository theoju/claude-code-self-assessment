// Static previews of the archify diagrams, for surfaces that cannot run the
// interactive HTML (the GitHub README). Each archify .html carries its
// diagram as one server-rendered inline <svg> styled by the page's CSS
// variables; this lifts that SVG out, embeds the CSS, and pins a theme, so
// the result renders standalone through an <img> or <picture>.
//
//   node scripts/diagram-previews.mjs   # every docs/site-src/diagrams/*.html
//
// Writes <name>.preview.light.svg and <name>.preview.dark.svg beside each
// source. Re-run after `archify deliver` re-renders a diagram.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIAGRAMS = join(ROOT, "docs", "site-src", "diagrams");

export const THEMES = ["light", "dark"];

export function toPreviewSvg(html, theme) {
  const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
    .map((m) => m[1])
    .join("\n")
    // Embedded webfonts are most of the bytes, and GitHub's image proxy
    // renders the SVG in isolation anyway; fall back to the system stack.
    .replace(/@font-face\s*\{[^}]*\}/g, "")
    // The page paints the canvas via `body { background: var(--bg) }`; a
    // standalone SVG has no body, so paint the root and carry the font stack.
    .concat(
      "\nsvg{background:var(--bg);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}",
    );

  const start = html.indexOf("<svg");
  const end = html.indexOf("</svg>", start);
  if (start === -1 || end === -1) {
    throw new Error("no inline <svg> found — is this an archify HTML diagram?");
  }
  const svg = html.slice(start, end + "</svg>".length);

  return svg
    .replace(
      /^<svg\b/,
      `<svg xmlns="http://www.w3.org/2000/svg" data-theme="${theme}"`,
    )
    .replace(/(<svg\b[^>]*>)/, `$1<style><![CDATA[${css}]]></style>`);
}

function main() {
  const sources = readdirSync(DIAGRAMS).filter((f) => f.endsWith(".html"));
  for (const file of sources) {
    const html = readFileSync(join(DIAGRAMS, file), "utf8");
    const base = file.replace(/\.html$/, "");
    for (const theme of THEMES) {
      const out = join(DIAGRAMS, `${base}.preview.${theme}.svg`);
      writeFileSync(out, toPreviewSvg(html, theme));
      console.log(`wrote ${out}`);
    }
  }
}

if (
  import.meta.url === `file://${process.argv[1] || ""}` ||
  import.meta.url === process.argv[1]
) {
  main();
}

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DIAGRAMS, THEMES, toPreviewSvg } from "../diagram-previews.mjs";

const html = `<html><head>
<style>
/* SIL OPEN FONT LICENSE Version 1.1 — applies to the embedded font below */
@font-face { font-family: 'JetBrains Mono'; src: url(data:font/woff2;base64,AAAA); }
:root, [data-theme="dark"] { --bg: #0b1120; }
[data-theme="light"] { --bg: #f8fafc; }
.c-backend { fill: var(--backend-fill); }
</style></head><body>
<div class="toolbar">…</div>
<svg viewBox="0 0 10 10" role="img"><rect class="c-backend" width="4" height="4"/></svg>
<script>/* interactive runtime */</script>
</body></html>`;

describe("toPreviewSvg", () => {
  it("lifts the inline svg out of the page and makes it standalone", () => {
    const svg = toPreviewSvg(html, "light");
    expect(
      svg.startsWith(
        '<svg xmlns="http://www.w3.org/2000/svg" data-theme="light" viewBox="0 0 10 10"',
      ),
    ).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain('<rect class="c-backend"');
    expect(svg).not.toContain("toolbar");
    expect(svg).not.toContain("<script");
  });

  it("embeds the theme CSS but drops the webfonts", () => {
    const svg = toPreviewSvg(html, "dark");
    expect(svg).toContain('data-theme="dark"');
    expect(svg).toContain("--bg: #f8fafc");
    expect(svg).toContain("svg{background:var(--bg)");
    expect(svg).not.toContain("@font-face");
    expect(svg).not.toContain("FONT LICENSE");
  });

  it("fails loudly on a page with no inline svg", () => {
    expect(() => toPreviewSvg("<html><style></style></html>", "light")).toThrow(
      /no inline <svg>/,
    );
  });

  it("does not duplicate an xmlns the source svg already declares", () => {
    const svg = toPreviewSvg(
      html.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" '),
      "light",
    );
    expect(svg.match(/xmlns=/g)).toHaveLength(1);
  });

  it("copies `$` in the CSS literally instead of as a replace pattern", () => {
    const svg = toPreviewSvg(
      html.replace(
        ".c-backend {",
        () => '.c-backend::after { content: "$&$1"; }\n.c-backend {',
      ),
      "light",
    );
    expect(svg).toContain('content: "$&$1"');
  });
});

// The README embeds the committed previews; an `archify deliver` re-render
// without `node scripts/diagram-previews.mjs` would leave them stale.
describe("committed diagram previews", () => {
  const sources = readdirSync(DIAGRAMS).filter((f) => f.endsWith(".html"));

  it("exist for at least one diagram", () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  for (const file of sources) {
    for (const theme of THEMES) {
      const preview = file.replace(/\.html$/, `.preview.${theme}.svg`);
      it(`${preview} matches ${file} — run node scripts/diagram-previews.mjs if not`, () => {
        const html = readFileSync(join(DIAGRAMS, file), "utf8");
        const committed = readFileSync(join(DIAGRAMS, preview), "utf8");
        expect(toPreviewSvg(html, theme) === committed).toBe(true);
      });
    }
  }
});

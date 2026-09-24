import { describe, it, expect } from "vitest";
import { toPreviewSvg } from "../diagram-previews.mjs";

const html = `<html><head>
<style>
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
  });

  it("fails loudly on a page with no inline svg", () => {
    expect(() => toPreviewSvg("<html><style></style></html>", "light")).toThrow(
      /no inline <svg>/,
    );
  });
});

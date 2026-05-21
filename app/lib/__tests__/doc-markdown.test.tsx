import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { renderDocMarkdown } from "../doc-markdown";

function render(md: string): string {
  return renderToStaticMarkup(<>{renderDocMarkdown(md)}</>);
}

describe("renderDocMarkdown", () => {
  it("renders H1 (which the boris renderer does not)", () => {
    const html = render("# Title\n");
    expect(html).toContain("<h1>");
    expect(html).toContain("Title");
  });

  it("renders H2, H3, H4 like the boris renderer", () => {
    const html = render("## Two\n### Three\n#### Four\n");
    expect(html).toContain("<h2>");
    expect(html).toContain("<h3>");
    expect(html).toContain("<h4>");
  });

  it("renders horizontal rules from --- lines", () => {
    const html = render("text\n\n---\n\nmore text\n");
    expect(html).toContain("<hr/>");
  });

  it("renders GFM tables — header, separator, body rows", () => {
    const md = [
      "| Stage | What it does |",
      "| ----- | ------------ |",
      "| 1 | First |",
      "| 2 | Second |",
    ].join("\n");
    const html = render(md);
    expect(html).toContain("<table>");
    expect(html).toContain("<thead>");
    expect(html).toContain("<th>Stage</th>");
    expect(html).toContain("<th>What it does</th>");
    expect(html).toContain("<tbody>");
    expect(html).toContain("<td>1</td>");
    expect(html).toContain("<td>First</td>");
    expect(html).toContain("<td>2</td>");
    expect(html).toContain("<td>Second</td>");
  });

  it("does not treat a single pipe line as a table without a separator", () => {
    const html = render("| not | a table |\nbody text\n");
    expect(html).not.toContain("<table>");
  });

  it("renders inline formatting inside table cells", () => {
    const md = [
      "| Signal | Source |",
      "| ------ | ------ |",
      "| `hasShipCommand` | File exists |",
    ].join("\n");
    const html = render(md);
    expect(html).toContain("<code>hasShipCommand</code>");
  });

  it("renders unordered lists", () => {
    const html = render("- one\n- two\n");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("<li>two</li>");
  });

  it("renders ordered lists from numbered items", () => {
    const html = render("1. first\n2. second\n3. third\n");
    expect(html).toContain("<ol>");
    expect(html).toContain("<li>first</li>");
    expect(html).toContain("<li>second</li>");
    expect(html).toContain("<li>third</li>");
  });

  it("merges indented continuation lines into the previous list item", () => {
    const html = render(
      "1. first line of item\n   continued here\n2. second item\n",
    );
    expect(html).toContain("<ol>");
    expect(html).toContain("first line of item continued here");
    expect(html).toContain("<li>second item</li>");
  });

  it("flushes an open ul before starting an ol (and vice versa)", () => {
    const html = render("- bullet\n\n1. numbered\n");
    expect(html).toContain("<ul>");
    expect(html).toContain("<ol>");
    // Order: ul first, ol second
    expect(html.indexOf("<ul>")).toBeLessThan(html.indexOf("<ol>"));
  });

  it("renders fenced code blocks", () => {
    const html = render("```bash\nls -la\n```\n");
    expect(html).toContain('<pre><code class="lang-bash">');
    expect(html).toContain("ls -la");
  });

  it("renders inline links, bold, italic, code", () => {
    const html = render(
      "See [docs](./x.md) **bold** *italic* `code` in a paragraph.\n",
    );
    expect(html).toContain('<a href="./x.md"');
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain("<code>code</code>");
  });

  it("escapes raw HTML (React's default) — no XSS via inline injection", () => {
    const html = render("This has <script>alert(1)</script> in it.\n");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("handles the realistic ship-pattern.md structure end-to-end", () => {
    const md = [
      "# `/ship` — recommended personal shipping command",
      "",
      "Some intro paragraph.",
      "",
      "## The 8-stage chain",
      "",
      "| # | Stage | What it does |",
      "| - | ----- | ------------ |",
      "| 0 | Pre-flight | Detect repo |",
      "| 1 | Test | Run tests |",
      "",
      "---",
      "",
      "## Where to start",
      "",
      "- Read the spec",
      "- Author your own",
    ].join("\n");
    const html = render(md);
    expect(html).toContain("<h1>");
    expect(html).toContain("<h2>");
    expect(html).toContain("<table>");
    expect(html).toContain("<hr/>");
    expect(html).toContain("<ul>");
  });
});

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  getTipContent,
  listTipNumbers,
  renderMarkdown,
  siteHomepage,
} from "../boris-content";

describe("boris-content snapshot", () => {
  it("contains all 75 sections from the boris skill", () => {
    const ns = listTipNumbers();
    expect(ns.length).toBe(75);
    expect(ns[0]).toBe(1);
    expect(ns[ns.length - 1]).toBe(75);
  });

  it("getTipContent returns title, body, and volume/tab from the index", () => {
    const t = getTipContent(7);
    expect(t).not.toBeNull();
    expect(t!.title).toMatch(/Hook/);
    expect(t!.contentMd.length).toBeGreaterThan(50);
    expect(t!.volume).toBe(1);
    expect(t!.tab).toBe(9);
    expect(t!.label).toBe("hooks");
  });

  it("returns null for an unknown tip", () => {
    expect(getTipContent(999)).toBeNull();
  });

  it("siteHomepage exposes the upstream root", () => {
    expect(siteHomepage()).toBe("https://howborisusesclaudecode.com");
  });
});

describe("renderMarkdown", () => {
  it("renders headings, paragraphs, lists, code blocks, and inline formatting", () => {
    const md = [
      "### A heading",
      "",
      "Some **bold** text and `code` and a [link](https://example.com).",
      "",
      "- item one",
      "- item *two*",
      "",
      "```bash",
      "echo hi",
      "```",
    ].join("\n");
    const html = renderToStaticMarkup(<>{renderMarkdown(md)}</>);
    expect(html).toContain("<h3>A heading</h3>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<code>code</code>");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>item one</li>");
    expect(html).toContain("<em>two</em>");
    expect(html).toContain("<pre>");
    expect(html).toContain("echo hi");
  });

  it("escapes raw HTML in source so it can't inject markup", () => {
    const html = renderToStaticMarkup(
      <>{renderMarkdown("This has <script>alert(1)</script> in it.")}</>
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

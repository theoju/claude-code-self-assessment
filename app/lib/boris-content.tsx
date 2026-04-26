import type { ReactNode } from "react";
import contentJson from "@/app/data/boris-tips-content.json";

export interface BorisTipContent {
  n: number;
  title: string;
  contentMd: string;
  topic: string;
  volume: number | null;
  tab: number | null;
  label: string | null;
}

const TIPS = (contentJson as { tips: Record<string, BorisTipContent> }).tips;
const SITE = (contentJson as { site: string }).site;

export function getTipContent(n: number): BorisTipContent | null {
  return TIPS[String(n)] ?? null;
}

export function listTipNumbers(): number[] {
  return Object.keys(TIPS)
    .map((k) => parseInt(k, 10))
    .sort((a, b) => a - b);
}

export function siteHomepage(): string {
  return SITE;
}

/**
 * Tiny markdown → React converter for the subset boris uses: H3-H4, paragraphs,
 * unordered lists, fenced code blocks, inline code, bold, italic, links.
 * Returns ReactNode so JSX renders it natively (no raw HTML injection).
 */
export function renderMarkdown(md: string): ReactNode[] {
  const lines = md.split("\n");
  const blocks: ReactNode[] = [];
  let key = 0;
  let inCode = false;
  let codeLang = "";
  let codeBuf: string[] = [];
  let listBuf: string[] = [];
  let paraBuf: string[] = [];

  const flushPara = () => {
    if (paraBuf.length) {
      blocks.push(<p key={key++}>{renderInline(paraBuf.join(" "), key)}</p>);
      paraBuf = [];
    }
  };
  const flushList = () => {
    if (listBuf.length) {
      const items = listBuf;
      listBuf = [];
      blocks.push(
        <ul key={key++}>
          {items.map((item, i) => (
            <li key={i}>{renderInline(item, key + i)}</li>
          ))}
        </ul>
      );
    }
  };

  for (const raw of lines) {
    if (inCode) {
      if (/^```/.test(raw)) {
        const lang = codeLang;
        const body = codeBuf.join("\n");
        blocks.push(
          <pre key={key++}>
            <code className={lang ? `lang-${lang}` : undefined}>{body}</code>
          </pre>
        );
        inCode = false;
        codeBuf = [];
        codeLang = "";
      } else {
        codeBuf.push(raw);
      }
      continue;
    }
    const fence = raw.match(/^```(\w+)?/);
    if (fence) {
      flushPara();
      flushList();
      inCode = true;
      codeLang = fence[1] ?? "";
      continue;
    }

    const heading = raw.match(/^(#{2,4})\s+(.+)$/);
    if (heading) {
      flushPara();
      flushList();
      const level = heading[1].length;
      const text = heading[2];
      const Tag = (`h${level}` as unknown) as keyof React.JSX.IntrinsicElements;
      blocks.push(<Tag key={key++}>{renderInline(text, key)}</Tag>);
      continue;
    }

    const listItem = raw.match(/^\s*[-*]\s+(.+)$/);
    if (listItem) {
      flushPara();
      listBuf.push(listItem[1]);
      continue;
    }

    if (/^\s*$/.test(raw)) {
      flushPara();
      flushList();
      continue;
    }

    flushList();
    paraBuf.push(raw.trim());
  }
  flushPara();
  flushList();
  return blocks;
}

/** Inline markdown: **bold**, *italic*, `code`, [link](url). */
export function renderInline(text: string, baseKey: number): ReactNode[] {
  const re = /(\[[^\]]+\]\([^)]+\))|(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)/g;
  const parts: ReactNode[] = [];
  let last = 0;
  let key = baseKey * 1000;
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0;
    if (start > last) parts.push(text.slice(last, start));
    const tok = m[0];
    if (tok.startsWith("`")) {
      parts.push(<code key={key++}>{tok.slice(1, -1)}</code>);
    } else if (tok.startsWith("**")) {
      parts.push(<strong key={key++}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith("[")) {
      const linkM = tok.match(/^\[([^\]]+)\]\(([^)]+)\)$/)!;
      parts.push(
        <a
          key={key++}
          href={linkM[2]}
          target="_blank"
          rel="noreferrer"
          className="underline decoration-dotted underline-offset-2"
        >
          {linkM[1]}
        </a>
      );
    } else if (tok.startsWith("*")) {
      parts.push(<em key={key++}>{tok.slice(1, -1)}</em>);
    }
    last = start + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

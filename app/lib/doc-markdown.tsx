import type { ReactNode } from "react";
import { renderInline } from "./boris-content";

// Superset of renderMarkdown for in-repo documentation pages. Adds: H1,
// GFM tables, and horizontal rules. The original renderer is calibrated
// for Boris tip content (H2-H4 only, no tables) and stays unchanged.

export function renderDocMarkdown(md: string): ReactNode[] {
  const lines = md.split("\n");
  const blocks: ReactNode[] = [];
  let key = 0;
  let inCode = false;
  let codeLang = "";
  let codeBuf: string[] = [];
  let listBuf: string[] = [];
  let listKind: "ul" | "ol" = "ul";
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
      const kind = listKind;
      listBuf = [];
      const Tag = kind === "ol" ? "ol" : "ul";
      blocks.push(
        <Tag key={key++}>
          {items.map((item, i) => (
            <li key={i}>{renderInline(item, key + i)}</li>
          ))}
        </Tag>,
      );
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];

    if (inCode) {
      if (/^```/.test(raw)) {
        const lang = codeLang;
        const body = codeBuf.join("\n");
        blocks.push(
          <pre key={key++}>
            <code className={lang ? `lang-${lang}` : undefined}>{body}</code>
          </pre>,
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

    // Horizontal rule (--- on its own line)
    if (/^\s*---+\s*$/.test(raw)) {
      flushPara();
      flushList();
      blocks.push(<hr key={key++} />);
      continue;
    }

    // GFM table — header line, then separator (|---|---|), then body rows
    if (/^\s*\|.+\|\s*$/.test(raw)) {
      const next = lines[i + 1] ?? "";
      if (/^\s*\|[\s\-:|]+\|\s*$/.test(next)) {
        flushPara();
        flushList();
        const headerCells = parseRow(raw);
        const bodyRows: string[][] = [];
        let j = i + 2;
        while (j < lines.length && /^\s*\|.+\|\s*$/.test(lines[j])) {
          bodyRows.push(parseRow(lines[j]));
          j++;
        }
        blocks.push(
          <table key={key++}>
            <thead>
              <tr>
                {headerCells.map((cell, c) => (
                  <th key={c}>{renderInline(cell, key + c)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c}>{renderInline(cell, key + r * 100 + c)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>,
        );
        i = j - 1;
        continue;
      }
    }

    const heading = raw.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushPara();
      flushList();
      const level = heading[1].length;
      const text = heading[2];
      const Tag = `h${level}` as unknown as keyof React.JSX.IntrinsicElements;
      blocks.push(<Tag key={key++}>{renderInline(text, key)}</Tag>);
      continue;
    }

    const ulItem = raw.match(/^\s*[-*]\s+(.+)$/);
    if (ulItem) {
      flushPara();
      if (listBuf.length && listKind !== "ul") flushList();
      listKind = "ul";
      listBuf.push(ulItem[1]);
      continue;
    }
    const olItem = raw.match(/^\s*\d+\.\s+(.+)$/);
    if (olItem) {
      flushPara();
      if (listBuf.length && listKind !== "ol") flushList();
      listKind = "ol";
      listBuf.push(olItem[1]);
      continue;
    }
    // Continuation line for the last list item: indented under it.
    if (listBuf.length && /^\s{2,}\S/.test(raw)) {
      listBuf[listBuf.length - 1] += " " + raw.trim();
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

function parseRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((c) => c.trim());
}

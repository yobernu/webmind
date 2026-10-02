import type { ReactNode } from "react";

/**
 * A small Markdown subset for model answers: paragraphs, fenced code, inline
 * code, bold, bullet and numbered lists. Produces React elements only, so no
 * HTML from the model is ever injected.
 */

export type Block =
  | { kind: "paragraph"; text: string }
  | { kind: "code"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] };

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;

export function parseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let paragraph: string[] = [];

  const flush = () => {
    if (paragraph.length) blocks.push({ kind: "paragraph", text: paragraph.join("\n") });
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trimStart().startsWith("```")) {
      flush();
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) code.push(lines[i++]);
      blocks.push({ kind: "code", text: code.join("\n") });
      continue;
    }

    const bullet = BULLET.exec(line);
    const numbered = NUMBERED.exec(line);
    if (bullet || numbered) {
      flush();
      const ordered = Boolean(numbered && !bullet);
      const pattern = ordered ? NUMBERED : BULLET;
      const items: string[] = [];
      while (i < lines.length) {
        const match = pattern.exec(lines[i]);
        if (!match) break;
        items.push(match[1]);
        i++;
      }
      i--;
      blocks.push({ kind: "list", ordered, items });
      continue;
    }

    if (!line.trim()) {
      flush();
      continue;
    }

    paragraph.push(line);
  }

  flush();
  return blocks;
}

/** Inline `code` and **bold**; everything else is text. */
export function renderInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /(`[^`\n]+`|\*\*[^*\n]+\*\*)/g;
  let last = 0;
  let key = 0;

  for (const match of text.matchAll(pattern)) {
    const at = match.index ?? 0;
    if (at > last) parts.push(text.slice(last, at));
    const token = match[0];
    parts.push(
      token.startsWith("`") ? (
        <code key={key++}>{token.slice(1, -1)}</code>
      ) : (
        <strong key={key++}>{token.slice(2, -2)}</strong>
      ),
    );
    last = at + token.length;
  }

  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

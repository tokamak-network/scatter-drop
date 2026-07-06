/**
 * Plain-text helpers for operator-authored markdown — the stripping half of
 * markdown handling (components/Markdown.tsx is the rendering half).
 */

/**
 * First paragraph of a markdown body as plain text. Destinations that render
 * text literally (calendar `details`/`body` fields, .ics DESCRIPTION) would
 * otherwise show raw `**`/`#`/`[label](url)` syntax.
 */
export function mdFirstParagraph(md: string): string {
  const para = md.trim().split(/\n\s*\n/, 1)[0] ?? "";
  return para
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // images → alt text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links → label
    .replace(/^#{1,6}\s+/gm, "") // heading marks
    .replace(/^>\s?/gm, "") // blockquote marks
    .replace(/[`*_~]/g, "") // emphasis/code marks
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Plain-text helpers for operator-authored markdown — the stripping half of
 * markdown handling (components/Markdown.tsx is the rendering half).
 */

/**
 * First paragraph of a markdown body as plain text. Destinations that render
 * text literally (calendar `details`/`body` fields, .ics DESCRIPTION) would
 * otherwise show raw `**`/`#`/`[label](url)` syntax.
 *
 * Angle brackets are stripped: some calendar composers (Google) render a
 * subset of HTML in a saved event's description, so leaving raw `<a href>`
 * from the operator's body intact would allow link-label spoofing. Removing
 * `<`/`>` makes the result genuinely plain text — markdown links are already
 * reduced to their label, so raw HTML must not be the stronger vector.
 */
export function mdFirstParagraph(md: string): string {
  const para = md.trim().split(/\n\s*\n/, 1)[0] ?? "";
  return para
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // images → alt text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links → label
    .replace(/^#{1,6}\s+/gm, "") // heading marks
    .replace(/^>\s?/gm, "") // blockquote marks
    .replace(/[`*_~<>]/g, "") // emphasis/code marks + HTML angle brackets
    .replace(/\s+/g, " ")
    .trim();
}

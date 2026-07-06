"use client";

import { memo, type ReactNode } from "react";
import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Hoisted so their identities are stable across renders — fresh props would
// make ReactMarkdown re-run the whole unified parse on every parent re-render.
const remarkPlugins = [remarkGfm];

const linkCls = "text-sky-500 hover:text-sky-400 underline underline-offset-2 transition";

// Headings demote one level (the page owns the real <h1>) and differ only in
// tag + classes.
const h = (Tag: "h2" | "h3" | "h4" | "h5" | "h6", cls: string) =>
  function Heading({ children }: { children?: ReactNode }) {
    return <Tag className={cls}>{children}</Tag>;
  };

const components: Components = {
  h1: h("h2", "text-base font-bold text-slate-100 pt-2"),
  h2: h("h3", "text-[15px] font-bold text-slate-100 pt-2"),
  h3: h("h4", "text-sm font-bold text-slate-200 pt-1"),
  h4: h("h5", "text-sm font-semibold text-slate-200"),
  h5: h("h6", "text-sm font-semibold text-slate-300"),
  // h5/h6 both land on <h6> — there is no h7, and a real heading element
  // keeps the outline navigable for screen readers.
  h6: h("h6", "text-sm font-semibold text-slate-400"),
  // In-app links keep client-side routing; everything else (including
  // protocol-relative //host, which "/" alone would misclassify) opens in a
  // new tab with an opener guard.
  a: ({ href = "", children }) => {
    const internal = (href.startsWith("/") && !href.startsWith("//")) || href.startsWith("#");
    return internal ? (
      <Link href={href} className={linkCls}>
        {children}
      </Link>
    ) : (
      <a href={href} target="_blank" rel="noopener noreferrer" className={linkCls}>
        {children}
      </a>
    );
  },
  ul: ({ children }) => <ul className="list-disc pl-5 space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1">{children}</ol>,
  // Inline chrome only — inside <pre> it is neutralized by the [&_code]
  // variants below, so bare ``` fences (no language tag) don't double-box.
  code: ({ className, children }) => (
    <code
      className={`${className ?? ""} bg-slate-950 border border-slate-800 rounded px-1 py-0.5 font-mono text-xs text-slate-200`}
    >
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="bg-slate-950 border border-slate-800 rounded-lg p-3 overflow-x-auto font-mono text-xs text-slate-200 [&_code]:bg-transparent [&_code]:border-0 [&_code]:p-0">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-slate-700 pl-3 text-slate-400">{children}</blockquote>
  ),
  hr: () => <hr className="border-slate-800" />,
  // Images are disabled: operator markdown must not trigger remote requests
  // (tracking pixels). The alt text renders in place so content isn't lost.
  img: ({ alt }) => (alt ? <span className="text-slate-500 italic">[image: {alt}]</span> : null),
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table className="text-xs border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-slate-800 bg-slate-950 px-2 py-1 text-left font-semibold text-slate-200">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="border border-slate-800 px-2 py-1">{children}</td>,
};

/**
 * Markdown body renderer for operator-authored content (announcements).
 * Raw HTML is NOT rendered (react-markdown's default) so operator input
 * cannot inject markup; links open in a new tab with an opener guard.
 * Styling is a minimal dark-theme prose mapping — headings, lists, code,
 * links, quotes and GFM tables — matching the app's slate palette.
 */
export const Markdown = memo(function Markdown({ children }: { children: string }) {
  return (
    <div className="text-sm text-slate-300 leading-relaxed space-y-3 break-words">
      <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
});

"use client";
import Link from "next/link";
import { memo, useMemo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { splitMarkdownBlocks } from "./markdown-blocks";

/**
 * Markdown for chat answers, cheap to stream: the text is split into top-level blocks and each
 * block is memoised on its source, so while tokens arrive only the last block re-parses.
 * Internal links (/people/…) navigate client-side; external links open in a new tab.
 */

const components: Components = {
  a: ({ href, children }) =>
    href?.startsWith("/") ? (
      <Link href={href} className="chat-link">
        {children}
      </Link>
    ) : (
      <a href={href} target="_blank" rel="noreferrer noopener" className="chat-link">
        {children}
      </a>
    ),
};

const plugins = [remarkGfm];

const Block = memo(function Block({ source }: { source: string }) {
  return (
    <ReactMarkdown remarkPlugins={plugins} components={components}>
      {source}
    </ReactMarkdown>
  );
});

/** While streaming, a link whose URL hasn't fully arrived shows as its label, not as raw markdown. */
const OPEN_LINK = /\[([^\]\n]*)\]\([^)\s]*$/;

export const MemoMarkdown = memo(function MemoMarkdown({ text, streaming = false }: { text: string; streaming?: boolean }) {
  const blocks = useMemo(() => splitMarkdownBlocks(streaming ? text.replace(OPEN_LINK, "$1") : text), [text, streaming]);
  return (
    <div className="prose-chat">
      {blocks.map((source, i) => (
        <Block key={i} source={source} />
      ))}
    </div>
  );
});

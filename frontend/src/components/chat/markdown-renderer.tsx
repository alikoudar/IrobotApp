"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import type { Components } from "react-markdown";

const components: Components = {
  h1: ({ children, ...props }) => (
    <h1 className="text-xl text-beac-noir font-semibold my-2" {...props}>{children}</h1>
  ),
  h2: ({ children, ...props }) => (
    <h2 className="text-lg text-beac-noir font-semibold my-2" {...props}>{children}</h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 className="text-base text-beac-noir font-semibold my-1.5" {...props}>{children}</h3>
  ),
  h4: ({ children, ...props }) => (
    <h4 className="text-sm text-beac-noir font-semibold my-1" {...props}>{children}</h4>
  ),
  p: ({ children, ...props }) => (
    <p className="my-1.5 leading-relaxed text-sm" {...props}>{children}</p>
  ),
  ul: ({ children, ...props }) => (
    <ul className="list-disc pl-5 my-2 space-y-1" {...props}>{children}</ul>
  ),
  ol: ({ children, ...props }) => (
    <ol className="list-decimal pl-5 my-2 space-y-1" {...props}>{children}</ol>
  ),
  li: ({ children, ...props }) => (
    <li className="text-sm leading-relaxed" {...props}>{children}</li>
  ),
  a: ({ children, href, ...props }) => (
    <a
      href={href}
      className="text-beac-bleue hover:text-beac-bleue-dark underline"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    >
      {children}
    </a>
  ),
  hr: ({ ...props }) => (
    <hr className="my-4 border-gray-200" {...props} />
  ),
  table: ({ children, ...props }) => (
    <div className="overflow-x-auto my-2">
      <table className="w-full border-collapse text-sm" {...props}>
        {children}
      </table>
    </div>
  ),
  th: ({ children, ...props }) => (
    <th className="bg-beac-bleue text-white p-2 text-left font-semibold border border-gray-200" {...props}>
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td className="border border-gray-200 p-2" {...props}>
      {children}
    </td>
  ),
  tr: ({ children, ...props }) => (
    <tr className="even:bg-black/[0.03]" {...props}>
      {children}
    </tr>
  ),
  img: ({ src, alt, ...props }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt || ""} className="max-w-full rounded-lg my-2" {...props} />
  ),
  pre: ({ children, ...props }) => (
    <pre className="bg-beac-noir text-gray-200 p-3 rounded-lg overflow-x-auto my-2 text-sm" {...props}>
      {children}
    </pre>
  ),
  code: ({ children, className, ...props }) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return <code className={className} {...props}>{children}</code>;
    }
    return (
      <code className="bg-black/[0.06] px-1.5 py-0.5 rounded text-[0.85em]" {...props}>
        {children}
      </code>
    );
  },
  blockquote: ({ children, ...props }) => (
    <blockquote className="border-l-3 border-beac-bleue pl-3 my-2 text-muted-foreground" {...props}>
      {children}
    </blockquote>
  ),
};

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeHighlight]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

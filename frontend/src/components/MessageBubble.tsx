import * as convoApi from "../api/conversations";
import React, { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

type WebSource = convoApi.WebSource;

function nodeToText(node: React.ReactNode): string {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeToText).join("");
  if (React.isValidElement(node)) return nodeToText((node as any).props.children);
  return "";
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function normalizeLatexDelimiters(input: string) {
  let s = input;

  s = s.replace(/\\\(([\s\S]*?)\\\)/g, (_m, inner) => `$${inner}$`);

  s = s.replace(/\\\[([\s\S]*?)\\\]/g, (_m, inner) => `$$\n${inner}\n$$`);

  return s;
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  const codeText = useMemo(() => {
    const childArray = React.Children.toArray(children);

    const codeEl = childArray.find(
      (c) => React.isValidElement(c) && (c as any).type === "code"
    ) as React.ReactElement | undefined;

    const raw = codeEl ? nodeToText((codeEl as any).props.children) : nodeToText(children);
    return raw.replace(/\n$/, "");
  }, [children]);

  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(codeText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = codeText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    }
  };

  return (
    <div className="my-3 relative">
      <button
        onClick={onCopy}
        className="absolute right-2 top-2 z-10 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-zinc-100 hover:bg-black/60 transition"
        title="Copy code"
        type="button"
      >
        {copied ? "Copied" : "Copy"}
      </button>

      <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/40 p-4 text-sm leading-relaxed">
        {children}
      </pre>
    </div>
  );
}

function Markdown({ children }: { children: string }) {
  const normalized = useMemo(() => normalizeLatexDelimiters(children), [children]);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex, rehypeHighlight]}
      components={{
        a: ({ ...props }) => (
          <a
            {...props}
            target="_blank"
            rel="noreferrer"
            className="text-sky-300 hover:text-sky-200 underline underline-offset-2"
          />
        ),
        p: ({ ...props }) => <p {...props} className="my-2" />,
        ul: ({ ...props }) => <ul {...props} className="my-2 list-disc pl-6" />,
        ol: ({ ...props }) => <ol {...props} className="my-2 list-decimal pl-6" />,
        li: ({ ...props }) => <li {...props} className="my-1" />,
        blockquote: ({ ...props }) => (
          <blockquote
            {...props}
            className="my-2 border-l-2 border-white/15 pl-4 text-zinc-200/90"
          />
        ),
        hr: () => <hr className="my-4 border-white/10" />,
        table: ({ ...props }) => (
          <div className="my-3 overflow-x-auto">
            <table {...props} className="w-full border-collapse text-sm" />
          </div>
        ),
        th: ({ ...props }) => (
          <th {...props} className="border border-white/10 bg-white/5 px-3 py-2 text-left" />
        ),
        td: ({ ...props }) => <td {...props} className="border border-white/10 px-3 py-2" />,

        code: ({ className, children, ...props }) => {
          const cls = className ?? "";
          if (cls.includes("language-math") || cls.includes("math-inline") || cls.includes("math-display")) {
            return (
              <code {...props} className={className}>
                {children}
              </code>
            );
          }

          const isBlock = !!className;
          if (!isBlock) {
            return (
              <code
                {...props}
                className="rounded-md bg-white/10 px-1.5 py-0.5 text-[0.95em] text-zinc-100"
              >
                {children}
              </code>
            );
          }

          return (
            <code {...props} className={className}>
              {children}
            </code>
          );
        },
        pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
      }}
    >
      {normalized}
    </ReactMarkdown>
  );
}

function SourcesPanel({ sources }: { sources: WebSource[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-xs text-zinc-400 hover:text-zinc-200 transition select-none"
        aria-expanded={open}
      >
        <span className="inline-block w-3 text-center">{open ? "▾" : "▸"}</span>
        <span>Sources</span>
        <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5">
          {sources.length}
        </span>
      </button>

      {open && (
        <div className="mt-2 rounded-xl border border-white/10 bg-white/5 p-3">
          <ol className="space-y-2 text-xs text-zinc-200">
            {sources.map((s, i) => (
              <li key={`${s.url}-${i}`} className="leading-snug">
                <div className="flex items-baseline gap-2">
                  <span className="text-zinc-500">[{i + 1}]</span>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sky-300 hover:text-sky-200 underline underline-offset-2"
                  >
                    {s.title || s.url}
                  </a>
                </div>

                <div className="mt-0.5 text-zinc-400">{getDomain(s.url)}</div>

                {s.description ? <div className="mt-1 text-zinc-300/90">{s.description}</div> : null}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

export default function MessageBubble({ message }: { message: convoApi.MessageDTO }) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="w-full flex justify-end">
        <div
          className={[
            "max-w-[46rem] rounded-2xl px-4 py-3 text-sm leading-relaxed",
            "bg-white/5 border border-white/10 text-zinc-100",
            "shadow-[0_10px_25px_rgba(0,0,0,0.35)]",
          ].join(" ")}
        >
          <Markdown>{message.content}</Markdown>
        </div>
      </div>
    );
  }

  const sources = Array.isArray(message.sources) ? message.sources : [];

  return (
    <div className="w-full flex justify-start">
      <div className="max-w-[46rem] w-full">
        <div className="flex gap-3">
          <div className="mt-1 w-[3px] rounded-full bg-white/10" />
          <div className="text-sm leading-relaxed text-zinc-100 w-full">
            <Markdown>{message.content || "…"}</Markdown>

            {message.role === "assistant" && sources.length > 0 ? <SourcesPanel sources={sources} /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

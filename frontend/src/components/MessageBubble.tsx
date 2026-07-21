import * as convoApi from "../api/conversations";
import React, { useEffect, useMemo, useRef, useState } from "react";
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

function getSafeSourceUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function citationTextToNodes(text: string, sources: WebSource[]): React.ReactNode {
  if (sources.length === 0) return text;

  const citationPattern = /\[((?:\d+\s*,\s*)*\d+)\]/g;
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = citationPattern.exec(text)) !== null) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));

    const numbers = match[1].split(",").map((value) => Number.parseInt(value.trim(), 10));
    const linkedSources = numbers.map((number) => {
      const source = sources[number - 1];
      const href = source ? getSafeSourceUrl(source.url) : null;
      return { number, source, href };
    });

    if (linkedSources.some(({ source, href }) => !source || !href)) {
      nodes.push(match[0]);
    } else {
      linkedSources.forEach(({ number, source, href }, index) => {
        if (index > 0) nodes.push(" ");
        nodes.push(
          <a
            key={`citation-${match!.index}-${number}-${index}`}
            href={href!}
            target="_blank"
            rel="noreferrer"
            title={`${source!.title || "Source"} — ${getDomain(source!.url)}`}
            aria-label={`Open source ${number}: ${source!.title || getDomain(source!.url)}`}
            className="mx-0.5 inline-flex -translate-y-px items-center rounded-md border border-sky-300/15 bg-sky-300/[0.07] px-1 py-0.5 text-[0.72em] font-semibold leading-none text-sky-300 no-underline transition hover:border-sky-300/30 hover:bg-sky-300/[0.13] hover:text-sky-200"
          >
            [{number}]
          </a>
        );
      });
    }

    cursor = citationPattern.lastIndex;
  }

  if (cursor === 0) return text;
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

function renderCitationChildren(node: React.ReactNode, sources: WebSource[]): React.ReactNode {
  if (sources.length === 0) return node;
  if (typeof node === "string") return citationTextToNodes(node, sources);
  if (Array.isArray(node)) {
    return node.map((child) => renderCitationChildren(child, sources));
  }
  if (!React.isValidElement(node)) return node;

  if (typeof node.type === "string" && ["a", "code", "pre"].includes(node.type)) {
    return node;
  }

  const props = node.props as { children?: React.ReactNode };
  if (props.children == null) return node;

  return React.cloneElement(
    node as React.ReactElement<{ children?: React.ReactNode }>,
    undefined,
    renderCitationChildren(props.children, sources)
  );
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

function Markdown({ children, sources = [] }: { children: string; sources?: WebSource[] }) {
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
        p: ({ children: paragraphChildren, ...props }) => (
          <p {...props} className="my-2">
            {renderCitationChildren(paragraphChildren, sources)}
          </p>
        ),
        ul: ({ ...props }) => <ul {...props} className="my-2 list-disc pl-6" />,
        ol: ({ ...props }) => <ol {...props} className="my-2 list-decimal pl-6" />,
        li: ({ children: listItemChildren, ...props }) => (
          <li {...props} className="my-1">
            {renderCitationChildren(listItemChildren, sources)}
          </li>
        ),
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
        th: ({ children: headingChildren, ...props }) => (
          <th {...props} className="border border-white/10 bg-white/5 px-3 py-2 text-left">
            {renderCitationChildren(headingChildren, sources)}
          </th>
        ),
        td: ({ children: cellChildren, ...props }) => (
          <td {...props} className="border border-white/10 px-3 py-2">
            {renderCitationChildren(cellChildren, sources)}
          </td>
        ),

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

function formatThinkingDuration(durationMs: number | null | undefined): string {
  if (durationMs == null) return "Thought";

  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `Thought for ${totalSeconds} ${totalSeconds === 1 ? "second" : "seconds"}`;
  }

  const minuteText = `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  if (seconds === 0) return `Thought for ${minuteText}`;

  return `Thought for ${minuteText} and ${seconds} ${seconds === 1 ? "second" : "seconds"}`;
}

function ThinkingPanel({
  thinking,
  active,
  durationMs,
}: {
  thinking: string;
  active: boolean;
  durationMs?: number | null;
}) {
  const [manuallyOpen, setManuallyOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const open = active || manuallyOpen;

  useEffect(() => {
    if (!active || !open) return;
    const content = contentRef.current;
    if (!content) return;

    const frame = window.requestAnimationFrame(() => {
      content.scrollTop = content.scrollHeight;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [active, open, thinking]);

  return (
    <div className="mb-3 overflow-hidden rounded-xl border border-white/[0.08] bg-zinc-950/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
      <button
        type="button"
        onClick={() => {
          if (!active) setManuallyOpen((value) => !value);
        }}
        className={[
          "flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-xs transition",
          active
            ? "cursor-default text-zinc-300"
            : "text-zinc-400 hover:bg-white/[0.025] hover:text-zinc-200",
        ].join(" ")}
        aria-expanded={open}
        aria-disabled={active}
      >
        <span className="relative flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.035]">
          <span
            className={[
              "h-1.5 w-1.5 rounded-full",
              active
                ? "animate-pulse bg-zinc-200 shadow-[0_0_8px_rgba(228,228,231,0.55)]"
                : "bg-zinc-500",
            ].join(" ")}
          />
        </span>

        <span className="font-medium">
          {active ? "Thinking…" : formatThinkingDuration(durationMs)}
        </span>

        {!active && (
          <svg
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
            className={[
              "ml-auto h-3.5 w-3.5 text-zinc-600 transition-transform duration-200",
              open ? "rotate-180" : "",
            ].join(" ")}
          >
            <path
              d="m6 8 4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>

      {open && (
        <div
          ref={contentRef}
          className="max-h-64 overflow-y-auto overscroll-contain border-t border-white/[0.06] bg-black/10 px-4 py-3 text-[13px] leading-relaxed text-zinc-400"
        >
          <Markdown>{thinking}</Markdown>
        </div>
      )}
    </div>
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
  const thinking = typeof message.thinking === "string" ? message.thinking.trim() : "";
  const answerStarted = message.content.trim().length > 0;

  return (
    <div className="w-full flex justify-start">
      <div className="max-w-[46rem] w-full">
        <div className="flex gap-3">
          <div className="mt-1 w-[3px] rounded-full bg-white/10" />
          <div className="text-sm leading-relaxed text-zinc-100 w-full">
            {thinking ? (
              <ThinkingPanel
                thinking={thinking}
                active={!answerStarted}
                durationMs={message.thinkingDurationMs}
              />
            ) : null}

            {answerStarted ? (
              <Markdown sources={sources}>{message.content}</Markdown>
            ) : thinking ? (
              <div className="animate-pulse py-1 text-xs text-zinc-500">Preparing answer…</div>
            ) : (
              <Markdown>…</Markdown>
            )}

            {message.role === "assistant" && sources.length > 0 ? <SourcesPanel sources={sources} /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

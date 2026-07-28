import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import Button from "./Button";
import Textarea from "./TextArea";
import {
  formatFileSize,
  IMAGE_ACCEPT,
  MAX_IMAGE_COUNT,
  MAX_TOTAL_IMAGE_BYTES,
  prepareImageUpload,
  type AttachmentUpload,
} from "../attachments";

type WebSearchMode = "auto" | "force";
type ThinkingMode = "auto" | "force";

function ThinkingIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <path
        d="M9 18h6M10 21h4M8.2 15.2A7 7 0 1 1 15.8 15.2C14.8 16 14.3 16.5 14 18h-4c-.3-1.5-.8-2-1.8-2.8Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Composer({
  disabled,
  onSend,
  onStop,
  streaming,
}: {
  disabled?: boolean;
  streaming: boolean;
  onSend: (
    text: string,
    attachments: AttachmentUpload[],
    webSearch: WebSearchMode,
    thinking: ThinkingMode
  ) => void;
  onStop: () => void;
}) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<AttachmentUpload[]>([]);
  const [preparingFiles, setPreparingFiles] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [forceWebSearch, setForceWebSearch] = useState(false);
  const [forceThinking, setForceThinking] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const plusBtnRef = useRef<HTMLButtonElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    taRef.current?.focus();
  }, []);

  useEffect(() => {
    if (disabled) return;
    if (!streaming) {
      const t = window.setTimeout(() => taRef.current?.focus(), 0);
      return () => window.clearTimeout(t);
    }
  }, [streaming, disabled]);

  useEffect(() => {
    if (!menuOpen) return;

    const onDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;

      if (menuRef.current?.contains(target)) return;
      if (plusBtnRef.current?.contains(target)) return;

      setMenuOpen(false);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };

    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (disabled) return;

    const isEditableTarget = (el: EventTarget | null) => {
      if (!el || !(el as HTMLElement).tagName) return false;
      const node = el as HTMLElement;
      const tag = node.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return true;
      if (node.isContentEditable) return true;
      return false;
    };

    const handler = (e: KeyboardEvent) => {
      if (disabled) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;
      if (e.key.length !== 1) return;
      if (streaming) return;

      const ta = taRef.current;
      if (!ta) return;

      e.preventDefault();
      ta.focus();

      const start = ta.selectionStart ?? text.length;
      const end = ta.selectionEnd ?? text.length;

      const next = text.slice(0, start) + e.key + text.slice(end);
      setText(next);

      requestAnimationFrame(() => {
        try {
          ta.selectionStart = ta.selectionEnd = start + 1;
        } catch {}
      });
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [disabled, streaming, text]);

  const addFiles = useCallback(
    async (files: File[]) => {
      if (disabled || streaming || preparingFiles || files.length === 0) return;

      const openSlots = MAX_IMAGE_COUNT - attachments.length;
      if (openSlots <= 0) {
        toast.error(`You can attach up to ${MAX_IMAGE_COUNT} images`);
        return;
      }

      if (files.length > openSlots) {
        toast.error(`Only the first ${openSlots} image${openSlots === 1 ? "" : "s"} were added`);
      }

      setPreparingFiles(true);
      try {
        const prepared: AttachmentUpload[] = [];
        for (const file of files.slice(0, openSlots)) {
          try {
            prepared.push(await prepareImageUpload(file));
          } catch (error) {
            toast.error(error instanceof Error ? error.message : `Could not add ${file.name}`);
          }
        }

        if (prepared.length === 0) return;

        const totalBytes =
          attachments.reduce((sum, attachment) => sum + attachment.size, 0) +
          prepared.reduce((sum, attachment) => sum + attachment.size, 0);

        if (totalBytes > MAX_TOTAL_IMAGE_BYTES) {
          toast.error("Attached images must total less than 20 MB");
          return;
        }

        setAttachments((current) => [...current, ...prepared]);
        setMenuOpen(false);
      } finally {
        setPreparingFiles(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [attachments, disabled, preparingFiles, streaming]
  );

  useEffect(() => {
    if (disabled || streaming) {
      setDragActive(false);
      return;
    }

    let dragDepth = 0;
    const containsFiles = (event: DragEvent) =>
      Array.from(event.dataTransfer?.types ?? []).includes("Files");

    const onDragEnter = (event: DragEvent) => {
      if (!containsFiles(event)) return;
      event.preventDefault();
      dragDepth += 1;
      setDragActive(true);
    };

    const onDragOver = (event: DragEvent) => {
      if (!containsFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      setDragActive(true);
    };

    const onDragLeave = (event: DragEvent) => {
      if (!containsFiles(event)) return;
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0 || event.relatedTarget === null) setDragActive(false);
    };

    const onDrop = (event: DragEvent) => {
      if (!containsFiles(event)) return;
      event.preventDefault();
      dragDepth = 0;
      setDragActive(false);
      void addFiles(Array.from(event.dataTransfer?.files ?? []));
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);

    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [addFiles, disabled, streaming]);

  const send = () => {
    const t = text.trim();
    if ((!t && attachments.length === 0) || preparingFiles) return;

    onSend(
      t,
      attachments,
      forceWebSearch ? "force" : "auto",
      forceThinking ? "force" : "auto"
    );
    setText("");
    setAttachments([]);
    setForceWebSearch(false);
    setForceThinking(false);
    setMenuOpen(false);

    requestAnimationFrame(() => taRef.current?.focus());
  };

  return (
    <div className="shrink-0">
      <div className="mx-auto max-w-5xl px-6 py-5">
        <div
          className={[
            "relative rounded-2xl border bg-zinc-900/40 px-3 py-3 backdrop-blur",
            "shadow-[0_10px_30px_rgba(0,0,0,0.35)] transition",
            dragActive
              ? "border-sky-400/60 bg-sky-400/[0.06] ring-2 ring-sky-400/15"
              : "border-zinc-800/70",
          ].join(" ")}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={IMAGE_ACCEPT}
            multiple
            className="sr-only"
            onChange={(event) => void addFiles(Array.from(event.target.files ?? []))}
          />

          {dragActive && (
            <div className="pointer-events-none absolute inset-0 z-40 grid place-items-center rounded-2xl bg-zinc-950/90 backdrop-blur-sm">
              <div className="rounded-xl border border-sky-400/30 bg-sky-400/10 px-5 py-3 text-sm font-medium text-sky-100">
                Drop images to attach
              </div>
            </div>
          )}

          {attachments.length > 0 && (
            <div
              className="mb-3 flex gap-2 overflow-x-auto pb-1"
              aria-label={`${attachments.length} selected image${attachments.length === 1 ? "" : "s"}`}
            >
              {attachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className="group relative h-24 w-32 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/30"
                >
                  <img
                    src={attachment.previewUrl}
                    alt={attachment.name}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-2 pb-1.5 pt-5">
                    <div className="truncate text-[11px] text-zinc-100">{attachment.name}</div>
                    <div className="text-[10px] text-zinc-400">{formatFileSize(attachment.size)}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setAttachments((current) =>
                        current.filter((candidate) => candidate.id !== attachment.id)
                      )
                    }
                    className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full border border-white/15 bg-black/70 text-sm text-white opacity-90 transition hover:bg-black"
                    aria-label={`Remove ${attachment.name}`}
                    title="Remove image"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-3">
            <div className="relative flex items-end">
              <button
                ref={plusBtnRef}
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                disabled={disabled || streaming || preparingFiles}
                className={[
                  "mr-1 flex items-center justify-center",
                  "h-10 w-10 rounded-full",
                  "border border-white/10 bg-white/5",
                  "hover:bg-white/10 transition",
                  disabled || streaming || preparingFiles ? "opacity-60 cursor-not-allowed" : "",
                ].join(" ")}
                title="Tools"
                aria-label="Open tools menu"
                aria-expanded={menuOpen}
              >
                <span className="text-lg font-medium text-zinc-200 leading-none">
                  +
                </span>
              </button>

              {menuOpen && (
                <div
                  ref={menuRef}
                  className="absolute bottom-12 left-0 z-50 w-64 overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/80 backdrop-blur shadow-[0_20px_60px_rgba(0,0,0,0.55)]"
                >
                  <div className="px-3 py-2 text-xs text-zinc-400">
                    Tools
                  </div>
                  <div className="h-px bg-white/10" />

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={preparingFiles || attachments.length >= MAX_IMAGE_COUNT}
                    className="w-full px-3 py-3 text-left transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base text-zinc-300" aria-hidden="true">▧</span>
                      <div>
                        <div className="text-sm text-zinc-100">
                          {preparingFiles ? "Preparing images…" : "Upload images"}
                        </div>
                        <div className="mt-0.5 text-[11px] text-zinc-400">
                          PNG, JPEG, WebP or GIF
                        </div>
                      </div>
                    </div>
                  </button>

                  <div className="h-px bg-white/10" />

                  <button
                    type="button"
                    onClick={() => setForceWebSearch((v) => !v)}
                    aria-pressed={forceWebSearch}
                    className="w-full px-3 py-3 text-left hover:bg-white/5 transition"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-200">🌐</span>
                        <span className="text-sm text-zinc-100">
                          Web search
                        </span>
                      </div>

                      <span
                        className={[
                          "inline-flex h-5 w-9 items-center rounded-full border transition",
                          forceWebSearch
                            ? "bg-white/15 border-white/20"
                            : "bg-white/5 border-white/10",
                        ].join(" ")}
                      >
                        <span
                          className={[
                            "inline-block h-4 w-4 rounded-full bg-white/80 shadow transition",
                            forceWebSearch
                              ? "translate-x-4"
                              : "translate-x-1",
                          ].join(" ")}
                        />
                      </span>
                    </div>

                    <div className="mt-1 text-[11px] text-zinc-400">
                      {forceWebSearch
                        ? "Always search for next message"
                        : "Model decides automatically"}
                    </div>
                  </button>

                  <div className="h-px bg-white/10" />

                  <button
                    type="button"
                    onClick={() => setForceThinking((v) => !v)}
                    aria-pressed={forceThinking}
                    className="w-full px-3 py-3 text-left hover:bg-white/5 transition"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-300"><ThinkingIcon /></span>
                        <span className="text-sm text-zinc-100">Think harder</span>
                      </div>

                      <span
                        className={[
                          "inline-flex h-5 w-9 items-center rounded-full border transition",
                          forceThinking
                            ? "bg-white/15 border-white/20"
                            : "bg-white/5 border-white/10",
                        ].join(" ")}
                      >
                        <span
                          className={[
                            "inline-block h-4 w-4 rounded-full bg-white/80 shadow transition",
                            forceThinking ? "translate-x-4" : "translate-x-1",
                          ].join(" ")}
                        />
                      </span>
                    </div>

                    <div className="mt-1 text-[11px] text-zinc-400">
                      {forceThinking
                        ? "Use reasoning for next message"
                        : "Model decides automatically"}
                    </div>
                  </button>
                </div>
              )}
            </div>

            <Textarea
              ref={taRef}
              rows={1}
              value={text}
              maxHeightPx={520}
              disabled={disabled || streaming}
              placeholder={streaming ? "Generating…" : "Message XanderGPT…"}
              onChange={(e) => setText(e.target.value)}
              onPaste={(event) => {
                const itemFiles = Array.from(event.clipboardData.items)
                  .filter(
                    (item) => item.kind === "file" && item.type.startsWith("image/")
                  )
                  .map((item) => item.getAsFile())
                  .filter((file): file is File => file !== null);
                const imageFiles =
                  itemFiles.length > 0
                    ? itemFiles
                    : Array.from(event.clipboardData.files).filter((file) =>
                        file.type.startsWith("image/")
                      );

                if (imageFiles.length === 0) return;
                event.preventDefault();
                void addFiles(imageFiles);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              className="min-h-[56px] border-0 bg-transparent focus:border-0 focus:ring-0"
            />

            {streaming ? (
              <Button variant="outline" onClick={onStop}>
                Stop
              </Button>
            ) : (
              <Button
                onClick={send}
                disabled={
                  disabled ||
                  preparingFiles ||
                  (!text.trim() && attachments.length === 0)
                }
              >
                Send
              </Button>
            )}
          </div>

          {forceWebSearch && (
            <div className="mt-2 flex items-center gap-2 text-[11px] text-zinc-400">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-white/60" />
              Web search enabled
            </div>
          )}

          {forceThinking && (
            <div className="mt-2 flex items-center gap-2 text-[11px] text-zinc-400">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-violet-300/80" />
              Thinking enabled for next message
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

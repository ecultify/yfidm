"use client";

import { useEffect, useRef } from "react";
import { Bold, Italic, Link2, List, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Small dependency-free rich text editor built on contenteditable. Outputs HTML
 * (which is exactly what the Freshdesk reply endpoint wants), so the agent can
 * add bold/italic text, bullet lists, labelled links, and images by URL without
 * writing markup by hand.
 *
 * It seeds its DOM from `value` whenever `resetKey` changes (used to clear after
 * sending, or to insert a template), and reports edits via `onChange`. Using
 * resetKey instead of fully controlling innerHTML avoids fighting the caret on
 * every keystroke.
 *
 * document.execCommand is deprecated but still works in every current browser
 * and keeps this free of editor dependencies.
 */

function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  return /^(https?:|mailto:|tel:)/i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** True when the HTML has no visible text and no media. */
export function isEmptyHtml(html: string): boolean {
  if (/<(img|br)\b/i.test(html)) return false;
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").trim().length === 0;
}

function ToolbarButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      // onMouseDown (not onClick) so the editor doesn't lose its selection.
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      title={title}
      aria-label={title}
      className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  );
}

export function RichEditor({
  value,
  onChange,
  resetKey,
  placeholder,
  className,
}: {
  value: string;
  onChange: (html: string) => void;
  /** Bump to re-seed the editor DOM from `value` (clear / insert template). */
  resetKey: number;
  placeholder?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Re-seed the editable DOM only when resetKey changes, not on every render.
  useEffect(() => {
    const el = ref.current;
    if (el && el.innerHTML !== value) el.innerHTML = value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const emit = () => {
    const el = ref.current;
    if (el) onChange(el.innerHTML);
  };

  const exec = (command: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    emit();
  };

  const addLink = () => {
    const url = normalizeUrl(window.prompt("Link URL (https://…)") ?? "");
    if (!url) return;
    const sel = window.getSelection();
    const hasSelection =
      sel &&
      !sel.isCollapsed &&
      ref.current?.contains(sel.anchorNode ?? null);
    ref.current?.focus();
    if (hasSelection) {
      document.execCommand("createLink", false, url);
    } else {
      const label = window.prompt("Link text", url) || url;
      document.execCommand(
        "insertHTML",
        false,
        `<a href="${escapeAttr(url)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`,
      );
    }
    emit();
  };

  const addImage = () => {
    const url = (window.prompt("Image URL (https://…)") ?? "").trim();
    if (!url) return;
    ref.current?.focus();
    document.execCommand(
      "insertHTML",
      false,
      `<img src="${escapeAttr(url)}" alt="" style="max-width:100%;height:auto" />`,
    );
    emit();
  };

  const empty = isEmptyHtml(value);

  return (
    <div className={cn("rounded-lg border bg-transparent", className)}>
      <div className="flex items-center gap-0.5 border-b px-1.5 py-1">
        <ToolbarButton title="Bold" onClick={() => exec("bold")}>
          <Bold className="size-4" />
        </ToolbarButton>
        <ToolbarButton title="Italic" onClick={() => exec("italic")}>
          <Italic className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Bulleted list"
          onClick={() => exec("insertUnorderedList")}
        >
          <List className="size-4" />
        </ToolbarButton>
        <ToolbarButton title="Insert link" onClick={addLink}>
          <Link2 className="size-4" />
        </ToolbarButton>
        <ToolbarButton title="Insert image by URL" onClick={addImage}>
          <ImageIcon className="size-4" />
        </ToolbarButton>
      </div>

      <div className="relative">
        {empty && placeholder && (
          <div className="pointer-events-none absolute left-3 top-2.5 text-sm text-muted-foreground">
            {placeholder}
          </div>
        )}
        <div
          ref={ref}
          role="textbox"
          aria-multiline="true"
          aria-label={placeholder}
          contentEditable
          suppressContentEditableWarning
          onInput={emit}
          className="prose prose-sm max-w-none px-3 py-2.5 text-sm outline-none dark:prose-invert min-h-40 [&_a]:text-primary [&_a]:underline"
        />
      </div>
    </div>
  );
}

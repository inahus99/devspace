import { Eye, Pencil } from "lucide-react";
import { type ClipboardEvent, useEffect, useId, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api";
import { type UploadTarget, uploadFile } from "@/lib/queries";
import { cn } from "@/lib/utils";

export function MarkdownView({ source, className, empty }: { source: string; className?: string; empty?: string }) {
  if (!source.trim()) return empty ? <p className="text-sm text-muted-foreground italic">{empty}</p> : null;
  return (
    <div className={cn("doc text-sm leading-6", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {children}
            </a>
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}

/** Auto-growing textarea. */
export function AutoTextarea({
  value,
  onChange,
  className,
  minRows = 3,
  ...rest
}: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value"> & {
  value: string;
  onChange: (v: string) => void;
  minRows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={minRows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30",
        className,
      )}
      {...rest}
    />
  );
}

/** Insert text at the textarea cursor and return the new value. */
function insertAtCursor(el: HTMLTextAreaElement, text: string): string {
  const { selectionStart: s, selectionEnd: e, value } = el;
  return value.slice(0, s) + text + value.slice(e);
}

/**
 * Markdown long-form field with Write / Preview toggle.
 * Pasting an image uploads it (when `uploadTarget` is given) and inserts a Markdown image.
 */
export function MarkdownField({
  label,
  value,
  onChange,
  placeholder,
  mono,
  minRows = 4,
  uploadTarget,
  defaultMode,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  minRows?: number;
  uploadTarget?: UploadTarget;
  defaultMode?: "write" | "preview";
}) {
  const id = useId();
  const [mode, setMode] = useState<"write" | "preview">(defaultMode ?? (value.trim() ? "preview" : "write"));

  const onPaste = async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (!uploadTarget) return;
    const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    e.preventDefault();
    const el = e.currentTarget;
    for (const file of files) {
      try {
        const a = await toast.promise(uploadFile(file, uploadTarget), { loading: "Uploading image…", success: "Image uploaded", error: (err) => errorMessage(err) }).unwrap();
        onChange(insertAtCursor(el, `![${a.fileName}](${a.url})\n`));
      } catch {
        /* toast shown */
      }
    }
  };

  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between">
        {label ? (
          <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
            {label}
          </label>
        ) : (
          <span />
        )}
        <div className="flex rounded-md border p-0.5 text-2xs">
          <button
            type="button"
            onClick={() => setMode("write")}
            className={cn("flex items-center gap-1 rounded px-1.5 py-0.5", mode === "write" ? "bg-accent text-foreground" : "text-muted-foreground")}
          >
            <Pencil className="size-3" /> Write
          </button>
          <button
            type="button"
            onClick={() => setMode("preview")}
            className={cn("flex items-center gap-1 rounded px-1.5 py-0.5", mode === "preview" ? "bg-accent text-foreground" : "text-muted-foreground")}
          >
            <Eye className="size-3" /> Preview
          </button>
        </div>
      </div>
      {mode === "write" ? (
        <AutoTextarea
          id={id}
          value={value}
          onChange={onChange}
          placeholder={placeholder ?? "Markdown supported"}
          minRows={minRows}
          onPaste={onPaste}
          className={cn(mono && "font-mono text-[13px]")}
        />
      ) : (
        <div
          className="min-h-16 cursor-text rounded-md border border-transparent px-3 py-2 hover:border-border"
          onClick={() => setMode("write")}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && setMode("write")}
          aria-label={`Edit ${label ?? "text"}`}
        >
          <MarkdownView source={value} empty={placeholder ?? "Nothing yet — click to write."} />
        </div>
      )}
    </div>
  );
}

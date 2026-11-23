import { Check, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** A small textarea for a short note. Ctrl+Enter saves, Esc cancels; saving it empty or unchanged just closes it. */
export function InlineNoteEditor({
  initial = "",
  pending,
  onSave,
  onCancel,
  placeholder,
  allowEmpty = false,
  maxLength = 2000,
  className = "",
  onPasteFiles,
}: {
  /** Images pasted into the box (Ctrl+V a screenshot). */
  onPasteFiles?: (files: File[]) => void;
  initial?: string;
  pending: boolean;
  onSave: (body: string) => Promise<void>;
  onCancel: () => void;
  placeholder?: string;
  /** Saving it empty clears the note (instead of just closing). */
  allowEmpty?: boolean;
  maxLength?: number;
  className?: string;
}) {
  const [body, setBody] = useState(initial);
  const save = () => {
    const text = body.trim();
    if (text === initial.trim()) return onCancel();
    if (!text && !allowEmpty) return onCancel();
    void onSave(text);
  };
  return (
    <div className={className}>
      <textarea
        autoFocus
        value={body}
        maxLength={maxLength}
        rows={3}
        onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
        onChange={(e) => setBody(e.target.value)}
        onPaste={(e) => {
          if (!onPasteFiles) return;
          const files = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/"));
          if (!files.length) return;
          e.preventDefault();
          onPasteFiles(files);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            save();
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          }
        }}
        placeholder={placeholder}
        className="w-full resize-y rounded-md border bg-background px-2.5 py-1.5 text-xs leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      />
      <div className="mt-1 flex items-center justify-end gap-1">
        <span className="mr-auto text-[10px] text-muted-foreground">Ctrl+Enter to save · Esc to cancel</span>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onCancel}>
          <X /> Cancel
        </Button>
        <Button size="sm" className="h-6 px-2 text-xs" onClick={save} disabled={pending}>
          <Check /> Save
        </Button>
      </div>
    </div>
  );
}

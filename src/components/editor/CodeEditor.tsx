import { Check, Copy } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import { LANGUAGES, languageLabel } from "@shared/constants";
import { Spinner } from "@/components/common/states";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

// Monaco is large; load it only when a code editor is on screen.
const MonacoEditor = lazy(async () => {
  await import("./monaco");
  return import("@monaco-editor/react");
});

/** Monaco language id for our language ids. */
function monacoLang(id: string): string {
  if (id === "shell") return "shell";
  return id;
}

function useIsDark() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.classList.contains("dark")));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  } catch {
    toast.error("Couldn't access the clipboard");
  }
}

export function CopyButton({ text, className }: { text: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await copyText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
      className={cn("inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground", className)}
      aria-label="Copy code"
    >
      {done ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
      {done ? "Copied" : "Copy"}
    </button>
  );
}

export function LanguageSelect({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" className={cn("h-7 w-[130px] text-xs", className)} aria-label="Language">
        <SelectValue>{languageLabel(value)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {LANGUAGES.map((l) => (
          <SelectItem key={l.id} value={l.id}>
            {l.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Monaco-based code editor with a header bar (language + copy).
 * `height` may be a number (px) or "auto" (grows with content up to maxHeight).
 */
export function CodeEditor({
  value,
  onChange,
  language,
  onLanguageChange,
  readOnly,
  height = 320,
  maxHeight = 640,
  className,
  title,
  actions,
}: {
  value: string;
  onChange?: (v: string) => void;
  language: string;
  onLanguageChange?: (v: string) => void;
  readOnly?: boolean;
  height?: number | "auto";
  maxHeight?: number;
  className?: string;
  title?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const dark = useIsDark();
  const lines = value.split("\n").length;
  const computed = height === "auto" ? Math.min(Math.max(lines * 19 + 24, 120), maxHeight) : height;
  return (
    <div className={cn("overflow-hidden rounded-xl border bg-card shadow-soft", className)}>
      <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-2 py-1">
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          {onLanguageChange && !readOnly ? (
            <LanguageSelect value={language} onChange={onLanguageChange} />
          ) : (
            <span className="px-1.5 font-medium">{languageLabel(language)}</span>
          )}
          {title}
        </div>
        <div className="flex items-center gap-1">
          {actions}
          <CopyButton text={value} />
        </div>
      </div>
      <Suspense
        fallback={
          <div className="flex items-center justify-center" style={{ height: computed }}>
            <Spinner />
          </div>
        }
      >
        <MonacoEditor
          height={computed}
          language={monacoLang(language)}
          value={value}
          theme={dark ? "devspace-dark" : "devspace-light"}
          onChange={(v) => onChange?.(v ?? "")}
          loading={<Spinner />}
          options={{
            readOnly,
            minimap: { enabled: false },
            fontSize: 13,
            lineHeight: 19,
            fontFamily: "'JetBrains Mono Variable', ui-monospace, Menlo, Consolas, monospace",
            fontLigatures: true,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            padding: { top: 10, bottom: 10 },
            renderLineHighlight: readOnly ? "none" : "line",
            scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8, alwaysConsumeMouseWheel: false },
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            wordWrap: "off",
            contextmenu: true,
            guides: { indentation: true },
          }}
        />
      </Suspense>
    </div>
  );
}

import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import Image from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { common, createLowlight } from "lowlight";
import {
  Bold, Code, Columns3, Eye, FileCode2, Heading1, Heading2, Heading3, ImagePlus, Italic, Link2, List, ListChecks, ListOrdered,
  Minus, Paperclip, Quote, Redo2, Replace, Rows3, Strikethrough, Table2, Trash2, Undo2,
} from "lucide-react";
import { marked } from "marked";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Lightbox } from "@/components/common/Attachments";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

const lowlight = createLowlight(common);

export interface RichContent {
  json: unknown;
  html: string;
  text: string;
}

export type Uploader = (file: File) => Promise<{ url: string; fileName: string; kind: string }>;

/** Heuristic: plain-text clipboard content that is clearly Markdown. */
function looksLikeMarkdown(text: string): boolean {
  return /(^|\n)(#{1,6} |[-*+] |\d+\. |> |```|\|.+\|)|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)/.test(text);
}

function collectImages(editor: Editor): { src: string; alt?: string }[] {
  const out: { src: string; alt?: string }[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === "image" && node.attrs.src) out.push({ src: node.attrs.src as string, alt: (node.attrs.alt as string) ?? "" });
  });
  return out;
}

export function RichEditor({
  initialContent,
  onChange,
  onUpload,
  placeholder = "Start writing… paste screenshots, type # for headings, ``` for code, [] for checklists",
  editorRef,
}: {
  initialContent: unknown;
  onChange: (content: RichContent) => void;
  onUpload: Uploader;
  placeholder?: string;
  editorRef?: (editor: Editor | null) => void;
}) {
  const [viewer, setViewer] = useState<{ images: { src: string; alt?: string }[]; index: number } | null>(null);
  const uploadRef = useRef(onUpload);
  uploadRef.current = onUpload;
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  const uploadAndInsert = async (editor: Editor, files: File[], pos?: number) => {
    for (const file of files) {
      try {
        const a = await toast
          .promise(uploadRef.current(file), {
            loading: `Uploading ${file.name || "image"}…`,
            success: "Uploaded",
            error: (err) => `Upload failed: ${errorMessage(err)}`,
          })
          .unwrap();
        const chain = editor.chain().focus();
        if (a.kind === "image") {
          const node = { type: "image", attrs: { src: a.url, alt: a.fileName } };
          if (pos !== undefined) chain.insertContentAt(pos, node).run();
          else chain.insertContent(node).run();
        } else {
          chain.insertContent([{ type: "text", text: `📎 ${a.fileName}`, marks: [{ type: "link", attrs: { href: a.url } }] }, { type: "text", text: " " }]).run();
        }
      } catch {
        /* toast already shown */
      }
    }
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: "https", HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" } },
      }),
      CodeBlockLowlight.configure({ lowlight, defaultLanguage: "plaintext" }),
      Image.configure({ inline: false, allowBase64: false }),
      TableKit.configure({ table: { resizable: true } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder }),
    ],
    content: (initialContent as object | string | null) ?? "",
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: { class: "doc ProseMirror", "aria-label": "Note content", spellcheck: "true" },
      handlePaste: (view, event) => {
        const ed = editorInstance.current;
        if (!ed) return false;
        const files = Array.from(event.clipboardData?.files ?? []);
        if (files.length) {
          event.preventDefault();
          void uploadAndInsert(ed, files);
          return true;
        }
        const html = event.clipboardData?.getData("text/html");
        const text = event.clipboardData?.getData("text/plain") ?? "";
        if (!html && text && looksLikeMarkdown(text) && !ed.isActive("codeBlock")) {
          event.preventDefault();
          const rendered = marked.parse(text, { async: false, gfm: true }) as string;
          ed.chain().focus().insertContent(rendered).run();
          return true;
        }
        void view;
        return false;
      },
      handleDrop: (view, event, _slice, moved) => {
        const ed = editorInstance.current;
        if (moved || !ed) return false;
        const files = Array.from(event.dataTransfer?.files ?? []);
        if (!files.length) return false;
        event.preventDefault();
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        void uploadAndInsert(ed, files, pos);
        return true;
      },
      handleDoubleClickOn: (_view, _pos, node) => {
        const ed = editorInstance.current;
        if (node.type.name !== "image" || !ed) return false;
        const images = collectImages(ed);
        setViewer({ images, index: Math.max(0, images.findIndex((i) => i.src === node.attrs.src)) });
        return true;
      },
    },
    onUpdate: ({ editor: ed }) => {
      changeRef.current({ json: ed.getJSON(), html: ed.getHTML(), text: ed.getText({ blockSeparator: "\n" }) });
    },
  });
  const editorInstance = useRef<Editor | null>(null);
  editorInstance.current = editor;

  useEffect(() => {
    registerUploader(editor, (f) => uploadRef.current(f));
    editorRef?.(editor);
    return () => editorRef?.(null);
  }, [editor, editorRef]);

  if (!editor) return null;
  return (
    <div className="relative">
      <Toolbar editor={editor} onUploadFiles={(files) => void uploadAndInsert(editor, files)} onView={() => {
        const images = collectImages(editor);
        const src = editor.getAttributes("image").src as string | undefined;
        setViewer({ images, index: Math.max(0, images.findIndex((i) => i.src === src)) });
      }} />
      <div className="px-1 pt-4">
        <EditorContent editor={editor} />
      </div>
      {viewer ? <Lightbox images={viewer.images} index={viewer.index} onIndex={(i) => setViewer({ ...viewer, index: i })} onClose={() => setViewer(null)} /> : null}
    </div>
  );
}

function TB({ label, active, disabled, onClick, children }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          aria-pressed={active}
          className={cn(
            "flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40",
            active && "bg-accent text-foreground",
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

const Sep = () => <span className="mx-1 h-4 w-px bg-border" aria-hidden />;

const CODE_LANGS = ["plaintext", "cpp", "java", "python", "javascript", "typescript", "go", "sql", "json", "xml", "css", "bash", "rust", "kotlin", "yaml"];

function Toolbar({ editor, onUploadFiles, onView }: { editor: Editor; onUploadFiles: (files: File[]) => void; onView: () => void }) {
  const imageInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const c = () => editor.chain().focus();
  const imageSelected = editor.isActive("image");
  const inTable = editor.isActive("table");
  const inCode = editor.isActive("codeBlock");

  const setLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", prev ?? "https://");
    if (url === null) return;
    if (url.trim() === "") c().extendMarkRange("link").unsetLink().run();
    else c().extendMarkRange("link").setLink({ href: url.trim() }).run();
  };

  return (
    <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center gap-0.5 border-b bg-background/95 px-1 py-1 backdrop-blur">
      <TB label="Undo (Ctrl+Z)" onClick={() => c().undo().run()} disabled={!editor.can().undo()}>
        <Undo2 className="size-4" />
      </TB>
      <TB label="Redo (Ctrl+Shift+Z)" onClick={() => c().redo().run()} disabled={!editor.can().redo()}>
        <Redo2 className="size-4" />
      </TB>
      <Sep />
      <TB label="Heading 1" active={editor.isActive("heading", { level: 1 })} onClick={() => c().toggleHeading({ level: 1 }).run()}>
        <Heading1 className="size-4" />
      </TB>
      <TB label="Heading 2" active={editor.isActive("heading", { level: 2 })} onClick={() => c().toggleHeading({ level: 2 }).run()}>
        <Heading2 className="size-4" />
      </TB>
      <TB label="Heading 3" active={editor.isActive("heading", { level: 3 })} onClick={() => c().toggleHeading({ level: 3 }).run()}>
        <Heading3 className="size-4" />
      </TB>
      <Sep />
      <TB label="Bold (Ctrl+B)" active={editor.isActive("bold")} onClick={() => c().toggleBold().run()}>
        <Bold className="size-4" />
      </TB>
      <TB label="Italic (Ctrl+I)" active={editor.isActive("italic")} onClick={() => c().toggleItalic().run()}>
        <Italic className="size-4" />
      </TB>
      <TB label="Strikethrough" active={editor.isActive("strike")} onClick={() => c().toggleStrike().run()}>
        <Strikethrough className="size-4" />
      </TB>
      <TB label="Inline code (Ctrl+E)" active={editor.isActive("code")} onClick={() => c().toggleCode().run()}>
        <Code className="size-4" />
      </TB>
      <TB label="Link" active={editor.isActive("link")} onClick={setLink}>
        <Link2 className="size-4" />
      </TB>
      <Sep />
      <TB label="Bullet list" active={editor.isActive("bulletList")} onClick={() => c().toggleBulletList().run()}>
        <List className="size-4" />
      </TB>
      <TB label="Numbered list" active={editor.isActive("orderedList")} onClick={() => c().toggleOrderedList().run()}>
        <ListOrdered className="size-4" />
      </TB>
      <TB label="Checklist" active={editor.isActive("taskList")} onClick={() => c().toggleTaskList().run()}>
        <ListChecks className="size-4" />
      </TB>
      <TB label="Quote" active={editor.isActive("blockquote")} onClick={() => c().toggleBlockquote().run()}>
        <Quote className="size-4" />
      </TB>
      <TB label="Code block" active={inCode} onClick={() => c().toggleCodeBlock().run()}>
        <FileCode2 className="size-4" />
      </TB>
      <TB label="Divider" onClick={() => c().setHorizontalRule().run()}>
        <Minus className="size-4" />
      </TB>
      <TB label="Insert table" active={inTable} onClick={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
        <Table2 className="size-4" />
      </TB>
      <Sep />
      <TB label="Insert image (or paste / drop)" onClick={() => imageInput.current?.click()}>
        <ImagePlus className="size-4" />
      </TB>
      <TB label="Attach file" onClick={() => fileInput.current?.click()}>
        <Paperclip className="size-4" />
      </TB>

      {inCode ? (
        <>
          <Sep />
          <select
            aria-label="Code language"
            className="h-7 rounded border bg-background px-1.5 text-xs"
            value={(editor.getAttributes("codeBlock").language as string) || "plaintext"}
            onChange={(e) => c().updateAttributes("codeBlock", { language: e.target.value }).run()}
          >
            {CODE_LANGS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </>
      ) : null}

      {inTable ? (
        <>
          <Sep />
          <TB label="Add row below" onClick={() => c().addRowAfter().run()}>
            <Rows3 className="size-4" />
          </TB>
          <TB label="Add column right" onClick={() => c().addColumnAfter().run()}>
            <Columns3 className="size-4" />
          </TB>
          <TB label="Delete row" onClick={() => c().deleteRow().run()}>
            <span className="text-[10px] font-semibold">−R</span>
          </TB>
          <TB label="Delete column" onClick={() => c().deleteColumn().run()}>
            <span className="text-[10px] font-semibold">−C</span>
          </TB>
          <TB label="Delete table" onClick={() => c().deleteTable().run()}>
            <Trash2 className="size-4" />
          </TB>
        </>
      ) : null}

      {imageSelected ? (
        <>
          <Sep />
          <span className="px-1 text-xs text-muted-foreground">Image</span>
          <TB label="View full size" onClick={onView}>
            <Eye className="size-4" />
          </TB>
          <TB label="Replace image" onClick={() => replaceInput.current?.click()}>
            <Replace className="size-4" />
          </TB>
          <TB label="Remove image" onClick={() => c().deleteSelection().run()}>
            <Trash2 className="size-4" />
          </TB>
        </>
      ) : null}

      <input
        ref={imageInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) onUploadFiles(files);
        }}
      />
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) onUploadFiles(files);
        }}
      />
      <input
        ref={replaceInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          // Replacing = upload new, swap the selected node's src.
          onUploadReplace(editor, file);
        }}
      />
    </div>
  );
}

/** Replacement uses the same uploader registered on the editor instance. */
function onUploadReplace(editor: Editor, file: File) {
  const uploader = (editor.storage as unknown as { devspaceUpload?: Uploader }).devspaceUpload;
  if (!uploader) return;
  void toast
    .promise(uploader(file), { loading: "Replacing image…", success: "Image replaced", error: (err) => errorMessage(err) })
    .unwrap()
    .then((a) => editor.chain().focus().updateAttributes("image", { src: a.url, alt: a.fileName }).run())
    .catch(() => {});
}

/** Register the uploader so toolbar actions (replace) can reach it. */
export function registerUploader(editor: Editor | null, upload: Uploader) {
  if (editor) (editor.storage as unknown as { devspaceUpload?: Uploader }).devspaceUpload = upload;
}

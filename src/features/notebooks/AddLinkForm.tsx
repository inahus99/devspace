import { Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Paste a link and press Enter (or +) to add it. Adds https:// when it's missing. */
export function AddLinkForm({ pending, onAdd }: { pending: boolean; onAdd: (url: string) => Promise<boolean> }) {
  const [url, setUrl] = useState("");
  return (
    <form
      className="mb-2 flex gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        const v = url.trim();
        if (!v) return;
        void onAdd(/^[a-z]+:\/\//i.test(v) ? v : `https://${v}`).then((ok) => ok && setUrl(""));
      }}
    >
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Paste a link to add"
        aria-label="Link address"
        className={cn("h-7 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring")}
      />
      <Button type="submit" size="icon" variant="secondary" className="size-7" disabled={pending || !url.trim()} aria-label="Add link">
        {pending ? <Loader2 className="animate-spin" /> : <Plus />}
      </Button>
    </form>
  );
}

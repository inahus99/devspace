import { Archive, BookOpen, Binary, CalendarDays, Code2, Download, FileJson, FileText, Loader2, Monitor, Moon, Sun } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { passwordChangeSchema } from "@shared/schemas";
import { Field } from "@/components/common/fields";
import { Page, PageHeader, Section } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type Theme, useTheme } from "@/hooks/useTheme";
import { api, downloadUrl, errorMessage } from "@/lib/api";
import { useMe, useUpdateProfile } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { lastBackupLabel, useBackup } from "./backup";

export default function SettingsPage() {
  return (
    <Page className="max-w-3xl">
      <PageHeader title="Settings" description="Your profile, preferences and data." />
      <div className="space-y-5">
        <ProfileSection />
        <AppearanceSection />
        <ExportSection />
        <PasswordSection />
      </div>
    </Page>
  );
}

function ProfileSection() {
  const { data: me } = useMe();
  const update = useUpdateProfile();
  const [name, setName] = useState(me?.displayName ?? "");
  const [goal, setGoal] = useState(String(me?.settings?.dailyGoalMinutes ?? 60));
  useEffect(() => {
    setName(me?.displayName ?? "");
    setGoal(String(me?.settings?.dailyGoalMinutes ?? 60));
  }, [me]);
  return (
    <Section title="Profile">
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const minutes = Math.max(0, Math.min(1440, Number(goal) || 0));
          update.mutate({ displayName: name.trim(), settings: { dailyGoalMinutes: minutes } }, { onSuccess: () => toast.success("Profile saved") });
        }}
      >
        <Field label="Display name" htmlFor="name">
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </Field>
        <Field label="Email">
          <Input value={me?.email ?? ""} disabled />
        </Field>
        <Field label="Daily study goal (minutes)" htmlFor="goal">
          <Input id="goal" type="number" min={0} max={1440} value={goal} onChange={(e) => setGoal(e.target.value)} />
        </Field>
        <Field label="Week starts on">
          <Select
            value={String(me?.settings?.weekStartsOn ?? 1)}
            onValueChange={(v) => update.mutate({ settings: { weekStartsOn: v === "0" ? 0 : 1 } })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Monday</SelectItem>
              <SelectItem value="0">Sunday</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Button type="submit" size="sm" disabled={update.isPending}>
            Save profile
          </Button>
        </div>
      </form>
    </Section>
  );
}

function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const options: [Theme, string, typeof Sun][] = [
    ["light", "Light", Sun],
    ["dark", "Dark", Moon],
    ["system", "System", Monitor],
  ];
  return (
    <Section title="Appearance">
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Theme">
        {options.map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={theme === value}
            onClick={() => setTheme(value)}
            className={cn("flex items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-sm transition-colors", theme === value ? "border-brand/50 bg-brand-soft" : "hover:bg-accent")}
          >
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </div>
    </Section>
  );
}

function ExportRow({ icon: Icon, title, description, actions }: { icon: typeof FileText; title: string; description: string; actions: { label: string; path: string }[] }) {
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="flex gap-1.5">
        {actions.map((a) => (
          <Button key={a.path} size="sm" variant="outline" onClick={() => downloadUrl(a.path)}>
            <Download /> {a.label}
          </Button>
        ))}
      </div>
    </li>
  );
}

function ExportSection() {
  const backup = useBackup();
  return (
    <Section title="Export & backup" bodyClassName="py-1">
      <ul className="divide-y">
        <li className="flex flex-wrap items-center gap-3 py-3">
          <Archive className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Full backup</p>
            <p className="text-xs text-muted-foreground">
              Everything in one .zip, laid out like your workspaces and folders: notes as Markdown, code, drawings, links, files, book PDFs and a
              complete JSON copy of every record. Keep it on your computer or a drive you trust.
            </p>
            <p className={cn("mt-1 text-xs", backup.overdue ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>{lastBackupLabel(backup.last)}</p>
          </div>
          <Button size="sm" onClick={backup.download}>
            <Download /> Download backup
          </Button>
        </li>
        <ExportRow
          icon={FileJson}
          title="Data backup (JSON)"
          description="Every record in a documented format (devspace-backup v1) — see README inside the archive."
          actions={[{ label: "JSON", path: "/export/backup.json" }]}
        />
        <ExportRow icon={FileText} title="Notes" description="All notes as Markdown files with front-matter, organised by workspace and folder." actions={[{ label: "Markdown .zip", path: "/export/notes.zip" }]} />
        <ExportRow icon={Code2} title="Code snippets" description="Each snippet as a file in its original language." actions={[{ label: "Source .zip", path: "/export/snippets.zip" }]} />
        <ExportRow
          icon={Binary}
          title="DSA problems"
          description="Problems with metadata; JSON includes every solution."
          actions={[
            { label: "CSV", path: "/export/dsa.csv" },
            { label: "JSON", path: "/export/dsa.json" },
          ]}
        />
        <ExportRow
          icon={BookOpen}
          title="Books"
          description="Bookshelf with progress; JSON includes highlights and reading history."
          actions={[
            { label: "CSV", path: "/export/books.csv" },
            { label: "JSON", path: "/export/books.json" },
          ]}
        />
        <ExportRow icon={CalendarDays} title="Activities" description="Every planned and completed activity with times." actions={[{ label: "CSV", path: "/export/activities.csv" }]} />
      </ul>
    </Section>
  );
}

function PasswordSection() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = passwordChangeSchema.safeParse({ currentPassword: current, newPassword: next });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/password", parsed.data);
      toast.success("Password changed. Other sessions were signed out.");
      setCurrent("");
      setNext("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title="Password">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field label="Current password" htmlFor="cur">
          <Input id="cur" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        </Field>
        <Field label="New password" htmlFor="new" error={error}>
          <Input id="new" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        </Field>
        <div className="sm:col-span-2">
          <Button type="submit" size="sm" variant="outline" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            Change password
          </Button>
        </div>
      </form>
    </Section>
  );
}

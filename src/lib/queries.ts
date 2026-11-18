import { keepPreviousData, type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  ActivityInput,
  BookInput,
  DsaProblemInput,
  DsaSolutionInput,
  LldInput,
  NoteInput,
  ResourceInput,
  SnippetInput,
  WorkspaceInput,
} from "@shared/schemas";
import type {
  ActivityWithLink,
  Attachment,
  Book,
  BookHighlight,
  CodeSnippet,
  DashboardResponse,
  DsaProblem,
  DsaSolution,
  Folder,
  LldExercise,
  Note,
  NoteSummary,
  ReadingLog,
  Resource,
  SearchResult,
  StatsResponse,
  Tag,
  User,
  UserSettings,
  Workspace,
  WorkspaceSummary,
} from "@shared/types";
import { api, errorMessage } from "./api";

type Params = Record<string, string | number | boolean | undefined | null>;

// ---------------------------------------------------------------------------
// Generic owned-entity hooks
// ---------------------------------------------------------------------------

export interface Entities {
  notes: { list: NoteSummary; item: Note; input: NoteInput };
  snippets: { list: CodeSnippet; item: CodeSnippet; input: SnippetInput };
  resources: { list: Resource; item: Resource; input: ResourceInput };
  dsa: { list: DsaProblem; item: DsaProblem; input: DsaProblemInput };
  lld: { list: LldExercise; item: LldExercise; input: LldInput };
  books: { list: Book; item: Book; input: BookInput };
  activities: { list: ActivityWithLink; item: ActivityWithLink; input: ActivityInput };
}
export type EntityName = keyof Entities;

const PATHS: Record<EntityName, string> = {
  notes: "/notes",
  snippets: "/snippets",
  resources: "/resources",
  dsa: "/dsa/problems",
  lld: "/lld",
  books: "/books",
  activities: "/activities",
};

/** Data derived from many entities; refreshed after any write. */
function invalidateDerived(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: ["insights"] });
  void qc.invalidateQueries({ queryKey: ["search"] });
}

export function useList<E extends EntityName>(entity: E, params?: Params, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [entity, "list", params ?? {}],
    queryFn: () => api.get<Entities[E]["list"][]>(PATHS[entity], params),
    placeholderData: keepPreviousData,
    enabled: opts?.enabled ?? true,
  });
}

export function useItem<E extends EntityName>(entity: E, id: string | undefined) {
  return useQuery({
    queryKey: [entity, "item", id],
    queryFn: () => api.get<Entities[E]["item"]>(`${PATHS[entity]}/${id}`),
    enabled: !!id,
  });
}

export function useCreate<E extends EntityName>(entity: E, opts?: { silent?: boolean }) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Entities[E]["input"]) => api.post<Entities[E]["item"]>(PATHS[entity], input),
    onSuccess: (row) => {
      qc.setQueryData([entity, "item", (row as { id: string }).id], row);
      void qc.invalidateQueries({ queryKey: [entity, "list"] });
      if (entity !== "activities") void qc.invalidateQueries({ queryKey: ["activities"] });
      invalidateDerived(qc);
    },
    onError: (err) => {
      if (!opts?.silent) toast.error(errorMessage(err));
    },
  });
}

export function useUpdate<E extends EntityName>(entity: E, opts?: { silent?: boolean }) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: Partial<Entities[E]["input"]> & { id: string }) =>
      api.patch<Entities[E]["item"]>(`${PATHS[entity]}/${id}`, patch),
    onSuccess: (row) => {
      qc.setQueryData([entity, "item", (row as { id: string }).id], row);
      void qc.invalidateQueries({ queryKey: [entity, "list"] });
      if (entity !== "activities") void qc.invalidateQueries({ queryKey: ["activities"] });
      invalidateDerived(qc);
    },
    onError: (err) => {
      if (!opts?.silent) toast.error(errorMessage(err));
    },
  });
}

export function useDelete(entity: EntityName) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`${PATHS[entity]}/${id}`),
    onSuccess: (_r, id) => {
      qc.removeQueries({ queryKey: [entity, "item", id] });
      void qc.invalidateQueries({ queryKey: [entity, "list"] });
      void qc.invalidateQueries({ queryKey: ["activities"] });
      void qc.invalidateQueries({ queryKey: ["attachments"] });
      invalidateDerived(qc);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        return (await api.get<{ user: User }>("/auth/me")).user;
      } catch (err) {
        if ((err as { status?: number }).status === 401) return null;
        throw err;
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useAuthStatus() {
  return useQuery({
    queryKey: ["auth-status"],
    queryFn: () => api.get<{ registrationOpen: boolean }>("/auth/status"),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { displayName?: string; settings?: Partial<UserSettings> }) =>
      api.patch<{ user: User }>("/auth/profile", input),
    onSuccess: ({ user }) => qc.setQueryData(["me"], user),
    onError: (err) => toast.error(errorMessage(err)),
  });
}

// ---------------------------------------------------------------------------
// Workspaces & folders
// ---------------------------------------------------------------------------

export function useWorkspaces() {
  return useQuery({ queryKey: ["workspaces"], queryFn: () => api.get<Workspace[]>("/workspaces"), staleTime: 60_000 });
}

/** Lookup map from the cached workspace list. */
export function useWorkspaceMap(): Map<string, Workspace> {
  const { data } = useWorkspaces();
  return new Map((data ?? []).map((w) => [w.id, w]));
}

export function useCreateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: WorkspaceInput) => api.post<Workspace>("/workspaces", input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["workspaces"] });
      invalidateDerived(qc);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useUpdateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: Partial<WorkspaceInput> & { id: string; archived?: boolean }) =>
      api.patch<Workspace>(`/workspaces/${id}`, patch),
    onSuccess: (ws) => {
      qc.setQueryData<Workspace[]>(["workspaces"], (old) => old?.map((w) => (w.id === ws.id ? ws : w)));
      invalidateDerived(qc);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useDeleteWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/workspaces/${id}`),
    onSuccess: () => {
      // Everything can change when a workspace (and its contents) disappears.
      void qc.invalidateQueries();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useReorderWorkspaces() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => api.post("/workspaces/reorder", { ids }),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: ["workspaces"] });
      const prev = qc.getQueryData<Workspace[]>(["workspaces"]);
      if (prev) {
        const byId = new Map(prev.map((w) => [w.id, w]));
        const reordered = ids.map((id, i) => ({ ...byId.get(id)!, position: i })).filter((w) => w.id);
        const rest = prev.filter((w) => !ids.includes(w.id));
        qc.setQueryData(["workspaces"], [...reordered, ...rest]);
      }
      return { prev };
    },
    onError: (err, _ids, ctx) => {
      if (ctx?.prev) qc.setQueryData(["workspaces"], ctx.prev);
      toast.error(errorMessage(err));
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["workspaces"] }),
  });
}

/** All folders for the user (small); filter per workspace on the client. */
export function useFolders() {
  return useQuery({ queryKey: ["folders"], queryFn: () => api.get<Folder[]>("/folders"), staleTime: 60_000 });
}

export function useWorkspaceFolders(workspaceId: string | undefined | null): Folder[] {
  const { data } = useFolders();
  return (data ?? []).filter((f) => f.workspaceId === workspaceId);
}

export function useCreateFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { workspaceId: string; parentId?: string | null; name: string }) => api.post<Folder>("/folders", input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["folders"] }),
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useUpdateFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...patch
    }: { id: string; name?: string; parentId?: string | null; position?: number; bannerUrl?: string | null; bannerPosition?: number }) =>
      api.patch<Folder>(`/folders/${id}`, patch),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["folders"] }),
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useDeleteFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/folders/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["folders"] });
      // Items inside move to the workspace root.
      for (const e of Object.keys(PATHS)) void qc.invalidateQueries({ queryKey: [e] });
      void qc.invalidateQueries({ queryKey: ["attachments"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

export function useAttachments(params: Params, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["attachments", params],
    queryFn: () => api.get<Attachment[]>("/attachments", params),
    enabled: opts?.enabled ?? true,
  });
}

export type UploadTarget = {
  workspaceId?: string | null;
  folderId?: string | null;
  noteId?: string;
  dsaProblemId?: string;
  lldExerciseId?: string;
  bookId?: string;
  label?: string;
};

export async function uploadFile(file: File, target: UploadTarget): Promise<Attachment> {
  const form = new FormData();
  for (const [k, v] of Object.entries(target)) if (v) form.append(k, v);
  form.append("file", file, file.name || "pasted-image.png");
  return api.upload<Attachment>("/attachments", form);
}

export function useUpload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, target }: { file: File; target: UploadTarget }) => uploadFile(file, target),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["attachments"] }),
    onError: (err) => toast.error(`Upload failed: ${errorMessage(err)}`),
  });
}

export function useUpdateAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; label?: string; folderId?: string | null }) =>
      api.patch<Attachment>(`/attachments/${id}`, patch),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["attachments"] }),
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useDeleteAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/attachments/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["attachments"] }),
    onError: (err) => toast.error(errorMessage(err)),
  });
}

// ---------------------------------------------------------------------------
// DSA solutions & revision
// ---------------------------------------------------------------------------

export function useSolutions(problemId: string | undefined) {
  return useQuery({
    queryKey: ["dsa", "solutions", problemId],
    queryFn: () => api.get<DsaSolution[]>(`/dsa/problems/${problemId}/solutions`),
    enabled: !!problemId,
  });
}

export function useSolutionMutations(problemId: string) {
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: ["dsa", "solutions", problemId] });
  const onError = (err: unknown) => toast.error(errorMessage(err));
  return {
    create: useMutation({
      mutationFn: (input: Omit<DsaSolutionInput, "problemId">) => api.post<DsaSolution>("/dsa/solutions", { ...input, problemId }),
      onSuccess: refresh,
      onError,
    }),
    update: useMutation({
      mutationFn: ({ id, ...patch }: Partial<Omit<DsaSolutionInput, "problemId">> & { id: string }) =>
        api.patch<DsaSolution>(`/dsa/solutions/${id}`, patch),
      onSuccess: refresh,
      onError,
    }),
    remove: useMutation({ mutationFn: (id: string) => api.delete(`/dsa/solutions/${id}`), onSuccess: refresh, onError }),
  };
}

export function useReviewProblem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, date, success }: { id: string; date: string; success: boolean }) =>
      api.post<DsaProblem>(`/dsa/problems/${id}/review`, { date, success }),
    onSuccess: (row) => {
      void qc.invalidateQueries({ queryKey: ["dsa", "item", row.id] });
      void qc.invalidateQueries({ queryKey: ["dsa", "list"] });
      invalidateDerived(qc);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

// ---------------------------------------------------------------------------
// Books
// ---------------------------------------------------------------------------

export function useBookProgress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, currentPage, date }: { id: string; currentPage: number; date: string }) =>
      api.post<Book>(`/books/${id}/progress`, { currentPage, date }),
    onSuccess: (row) => {
      void qc.invalidateQueries({ queryKey: ["books"] });
      void qc.invalidateQueries({ queryKey: ["reading-logs", row.id] });
      invalidateDerived(qc);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useReadingLogs(bookId: string | undefined) {
  return useQuery({
    queryKey: ["reading-logs", bookId],
    queryFn: () => api.get<ReadingLog[]>(`/books/${bookId}/logs`),
    enabled: !!bookId,
  });
}

export function useDeleteReadingLog(bookId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/books/logs/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["reading-logs", bookId] });
      invalidateDerived(qc);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useHighlights(bookId: string | undefined) {
  return useQuery({
    queryKey: ["highlights", bookId],
    queryFn: () => api.get<BookHighlight[]>(`/books/${bookId}/highlights`),
    enabled: !!bookId,
  });
}

export function useHighlightMutations(bookId: string) {
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: ["highlights", bookId] });
  const onError = (err: unknown) => toast.error(errorMessage(err));
  return {
    create: useMutation({
      mutationFn: (input: { content: string; page?: number | null; note?: string }) =>
        api.post<BookHighlight>(`/books/${bookId}/highlights`, input),
      onSuccess: refresh,
      onError,
    }),
    update: useMutation({
      mutationFn: ({ id, ...patch }: { id: string; content?: string; page?: number | null; note?: string }) =>
        api.patch<BookHighlight>(`/books/highlights/${id}`, patch),
      onSuccess: refresh,
      onError,
    }),
    remove: useMutation({ mutationFn: (id: string) => api.delete(`/books/highlights/${id}`), onSuccess: refresh, onError }),
  };
}

// ---------------------------------------------------------------------------
// Insights, search, tags
// ---------------------------------------------------------------------------

export function useDashboard() {
  return useQuery({ queryKey: ["insights", "dashboard"], queryFn: () => api.get<DashboardResponse>("/insights/dashboard") });
}

export function useStats(params: { from: string; to: string; workspaceId?: string }) {
  return useQuery({
    queryKey: ["insights", "stats", params],
    queryFn: () => api.get<StatsResponse>("/insights/stats", params),
    placeholderData: keepPreviousData,
  });
}

export function useWorkspaceSummaries() {
  return useQuery({
    queryKey: ["insights", "workspace-summaries"],
    queryFn: () => api.get<WorkspaceSummary[]>("/insights/workspace-summaries"),
  });
}

export function useSearch(q: string) {
  const term = q.trim();
  return useQuery({
    queryKey: ["search", term],
    queryFn: () => api.get<SearchResult[]>("/search", { q: term }),
    enabled: term.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
}

export function useTags() {
  return useQuery({ queryKey: ["tags"], queryFn: () => api.get<Tag[]>("/tags"), staleTime: 60_000 });
}

import { useQueryClient } from "@tanstack/react-query";
import { lazy, type ReactNode, Suspense, useEffect } from "react";
import { createBrowserRouter, Navigate, Outlet, RouterProvider, useLocation } from "react-router";
import { Toaster } from "sonner";
import { ConfirmHost } from "@/components/common/ConfirmDialog";
import { FullPageSpinner } from "@/components/common/states";
import { AppShell } from "@/components/layout/AppShell";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LoginPage } from "@/features/auth/LoginPage";
import { ThemeSync } from "@/hooks/useTheme";
import { setUnauthorizedHandler } from "@/lib/api";
import { devspaceHref, isExternalHref, isNotesApp, notesHref, notesSeparate, canSingleSignOn, startSingleSignOn } from "@/lib/app";
import { useMe } from "@/lib/queries";

const DashboardPage = lazy(() => import("@/features/dashboard/DashboardPage"));
const WorkspacesPage = lazy(() => import("@/features/workspaces/WorkspacesPage"));
const WorkspacePage = lazy(() => import("@/features/workspaces/WorkspacePage"));
const NotePage = lazy(() => import("@/features/notes/NotePage"));
const SnippetPage = lazy(() => import("@/features/snippets/SnippetPage"));
const DiagramPage = lazy(() => import("@/features/diagrams/DiagramPage"));
const BookReaderPage = lazy(() => import("@/features/books/BookReaderPage"));
const NotebooksApp = lazy(() => import("@/features/notebooks/NotebooksApp"));
const NotesShell = lazy(() => import("@/features/notebooks/NotebooksApp").then((m) => ({ default: m.NotesShell })));
const WorkspaceTopLevel = lazy(() => import("@/features/notebooks/NotebooksApp").then((m) => ({ default: m.WorkspaceTopLevel })));
const NotesPage = lazy(() => import("@/features/notebooks/NotebooksApp").then((m) => ({ default: m.NotesPage })));
const DsaProblemPage = lazy(() => import("@/features/dsa/DsaProblemPage"));
const LldExercisePage = lazy(() => import("@/features/lld/LldExercisePage"));
const ResourceLibraryPage = lazy(() => import("@/features/resources/ResourceLibraryPage"));
const BookshelfPage = lazy(() => import("@/features/books/BookshelfPage"));
const BookPage = lazy(() => import("@/features/books/BookPage"));
const CalendarPage = lazy(() => import("@/features/calendar/CalendarPage"));
const AnalyticsPage = lazy(() => import("@/features/analytics/AnalyticsPage"));
const SettingsPage = lazy(() => import("@/features/settings/SettingsPage"));
const NotFoundPage = lazy(() => import("@/features/misc/NotFoundPage"));

function RequireAuth() {
  const { data: user, isLoading } = useMe();
  const location = useLocation();
  if (isLoading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return (
    <AppShell>
      <Suspense fallback={<FullPageSpinner />}>
        <Outlet />
      </Suspense>
    </AppShell>
  );
}

/** Signed-in pages that bring their own full-screen layout (the Notebooks app). */
function RequireAuthBare() {
  const { data: user, isLoading } = useMe();
  const location = useLocation();
  // The Notes app signs in through DevSpace (single sign-on) when it can.
  const sso = !isLoading && !user && canSingleSignOn();
  useEffect(() => {
    if (sso) startSingleSignOn();
  }, [sso]);
  if (isLoading || sso) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Outlet />
    </Suspense>
  );
}

function Root() {
  const qc = useQueryClient();
  useEffect(() => {
    // Session expired mid-use: drop the cached user so the guard redirects to login.
    setUnauthorizedHandler(() => qc.setQueryData(["me"], null));
  }, [qc]);
  return (
    <TooltipProvider delayDuration={300}>
      <ThemeSync />
      <Outlet />
      <ConfirmHost />
      <Toaster position="bottom-right" richColors closeButton toastOptions={{ className: "text-sm" }} />
    </TooltipProvider>
  );
}

/** Sends an address that belongs to the other app (Notes ↔ DevSpace) there. */
function OtherApp({ to }: { to: "notes" | "devspace" }) {
  const { pathname, search, hash } = useLocation();
  const href = to === "notes" ? notesHref(pathname + search + hash) : devspaceHref(pathname + search + hash);
  useEffect(() => {
    if (isExternalHref(href)) window.location.replace(href);
  }, [href]);
  return isExternalHref(href) ? <FullPageSpinner /> : <NotFoundPage />;
}

/** Full-screen pages of the Notes app, without DevSpace's sidebar. */
function Screen({ children }: { children: ReactNode }) {
  return <div className="flex h-dvh min-h-0 flex-col bg-background text-foreground">{children}</div>;
}

/** The Notes app: notebooks, drawings and the book reader. */
const notesRoutes = [
  {
    element: <Root />,
    children: [
      { path: "/login", element: <LoginPage /> },
      {
        element: <RequireAuthBare />,
        children: [
          { index: true, element: <Navigate to="/notebooks" replace /> },
          {
            // Folders on the left; notebooks, notes, code and links on the right.
            element: <NotesShell />,
            children: [
              { path: "notebooks", element: <NotebooksApp /> },
              { path: "notebooks/:folderId", element: <NotebooksApp /> },
              { path: "notebooks/w/:workspaceId", element: <WorkspaceTopLevel /> },
              { path: "notes/:id", element: <NotesPage><NotePage /></NotesPage> },
              { path: "snippets/:id", element: <NotesPage><SnippetPage /></NotesPage> },
              { path: "resources", element: <NotesPage><ResourceLibraryPage /></NotesPage> },
            ],
          },
          { path: "diagrams/:id", element: <Screen><DiagramPage /></Screen> },
          { path: "books/:id/read", element: <Screen><BookReaderPage /></Screen> },
          { path: "*", element: <OtherApp to="devspace" /> },
        ],
      },
    ],
  },
];

// When the Notes app runs separately, its pages in DevSpace forward there.
const toNotes = <OtherApp to="notes" />;

const devspaceRoutes = [
  {
    element: <Root />,
    children: [
      { path: "/login", element: <LoginPage /> },
      {
        element: <RequireAuthBare />,
        children: [
          notesSeparate
            ? { path: "notebooks/*", element: toNotes }
            : {
                element: <NotesShell />,
                children: [
                  { path: "notebooks", element: <NotebooksApp /> },
                  { path: "notebooks/:folderId", element: <NotebooksApp /> },
                  { path: "notebooks/w/:workspaceId", element: <WorkspaceTopLevel /> },
                ],
              },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: "workspaces", element: <WorkspacesPage /> },
          { path: "w/:id", element: <WorkspacePage /> },
          { path: "notes/:id", element: notesSeparate ? toNotes : <NotePage /> },
          { path: "snippets/:id", element: notesSeparate ? toNotes : <SnippetPage /> },
          { path: "diagrams/:id", element: notesSeparate ? toNotes : <DiagramPage /> },
          { path: "dsa/:id", element: <DsaProblemPage /> },
          { path: "lld/:id", element: <LldExercisePage /> },
          { path: "resources", element: notesSeparate ? toNotes : <ResourceLibraryPage /> },
          { path: "books", element: <BookshelfPage /> },
          { path: "books/:id", element: <BookPage /> },
          { path: "books/:id/read", element: notesSeparate ? toNotes : <BookReaderPage /> },
          // The daily planner was folded into the calendar's Day view; keep old links working.
          { path: "planner", element: <PlannerRedirect /> },
          { path: "calendar", element: <CalendarPage /> },
          { path: "analytics", element: <AnalyticsPage /> },
          { path: "settings", element: <SettingsPage /> },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
];

const router = createBrowserRouter(isNotesApp ? notesRoutes : devspaceRoutes);

export function App() {
  return <RouterProvider router={router} />;
}

function PlannerRedirect() {
  const { search } = useLocation();
  const date = new URLSearchParams(search).get("date");
  return <Navigate to={date ? `/calendar?view=day&date=${date}` : "/calendar?view=day"} replace />;
}

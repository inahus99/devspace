import { useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useEffect } from "react";
import { createBrowserRouter, Navigate, Outlet, RouterProvider, useLocation } from "react-router";
import { Toaster } from "sonner";
import { ConfirmHost } from "@/components/common/ConfirmDialog";
import { FullPageSpinner } from "@/components/common/states";
import { AppShell } from "@/components/layout/AppShell";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LoginPage } from "@/features/auth/LoginPage";
import { ThemeSync } from "@/hooks/useTheme";
import { setUnauthorizedHandler } from "@/lib/api";
import { useMe } from "@/lib/queries";

const DashboardPage = lazy(() => import("@/features/dashboard/DashboardPage"));
const WorkspacesPage = lazy(() => import("@/features/workspaces/WorkspacesPage"));
const WorkspacePage = lazy(() => import("@/features/workspaces/WorkspacePage"));
const NotePage = lazy(() => import("@/features/notes/NotePage"));
const SnippetPage = lazy(() => import("@/features/snippets/SnippetPage"));
const DiagramPage = lazy(() => import("@/features/diagrams/DiagramPage"));
const BookReaderPage = lazy(() => import("@/features/books/BookReaderPage"));
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

const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: "/login", element: <LoginPage /> },
      {
        element: <RequireAuth />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: "workspaces", element: <WorkspacesPage /> },
          { path: "w/:id", element: <WorkspacePage /> },
          { path: "notes/:id", element: <NotePage /> },
          { path: "snippets/:id", element: <SnippetPage /> },
          { path: "diagrams/:id", element: <DiagramPage /> },
          { path: "dsa/:id", element: <DsaProblemPage /> },
          { path: "lld/:id", element: <LldExercisePage /> },
          { path: "resources", element: <ResourceLibraryPage /> },
          { path: "books", element: <BookshelfPage /> },
          { path: "books/:id", element: <BookPage /> },
          { path: "books/:id/read", element: <BookReaderPage /> },
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
]);

export function App() {
  return <RouterProvider router={router} />;
}

function PlannerRedirect() {
  const { search } = useLocation();
  const date = new URLSearchParams(search).get("date");
  return <Navigate to={date ? `/calendar?view=day&date=${date}` : "/calendar?view=day"} replace />;
}

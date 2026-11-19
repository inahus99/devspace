import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { loginSchema, registerSchema } from "@shared/schemas";
import type { User } from "@shared/types";
import { Field } from "@/components/common/fields";
import { FullPageSpinner } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/api";
import { useAuthStatus, useMe } from "@/lib/queries";

export function LoginPage() {
  const { data: me, isLoading } = useMe();
  const { data: status } = useAuthStatus();
  const [mode, setMode] = useState<"login" | "register" | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  if (isLoading) return <FullPageSpinner />;
  if (me) return <Navigate to={from} replace />;

  // First visit to an empty instance → create the owner account.
  const effective = mode ?? (status?.registrationOpen ? "register" : "login");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const schema = effective === "login" ? loginSchema : registerSchema;
    const parsed = schema.safeParse({ email, password, displayName: displayName || undefined });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const { user } = await api.post<{ user: User }>(effective === "login" ? "/auth/login" : "/auth/register", parsed.data);
      qc.setQueryData(["me"], user);
      navigate(from, { replace: true });
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <img src="/favicon.svg" alt="" className="size-10" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{effective === "login" ? "Sign in to DevSpace" : "Create your DevSpace"}</h1>
            <p className="text-sm text-muted-foreground">Your personal developer learning OS</p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-xl border bg-card p-6" noValidate>
          {effective === "register" ? (
            <Field label="Name" htmlFor="name" error={errors.displayName}>
              <Input id="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="name" />
            </Field>
          ) : null}
          <Field label="Email" htmlFor="email" error={errors.email}>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus />
          </Field>
          <Field label="Password" htmlFor="password" error={errors.password}>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={effective === "login" ? "current-password" : "new-password"}
            />
          </Field>
          {formError ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {formError}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? <Loader2 className="animate-spin" /> : null}
            {effective === "login" ? "Sign in" : "Create account"}
          </Button>
        </form>
        {status?.registrationOpen ? (
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {effective === "login" ? "New here? " : "Already have an account? "}
            <button type="button" className="font-medium text-foreground hover:underline" onClick={() => setMode(effective === "login" ? "register" : "login")}>
              {effective === "login" ? "Create an account" : "Sign in"}
            </button>
          </p>
        ) : null}
      </div>
    </div>
  );
}

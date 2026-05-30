"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { MessageCircleMore } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";

export default function InvitePage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [status, setStatus] = useState<"loading" | "valid" | "invalid" | "done">(
    "loading",
  );
  const [invitee, setInvitee] = useState<{ name: string; email: string } | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch(
        `/api/auth/accept-invite?token=${encodeURIComponent(token)}`,
      );
      if (!res.ok) {
        setStatus("invalid");
        return;
      }
      setInvitee((await res.json()) as { name: string; email: string });
      setStatus("valid");
    })();
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/auth/accept-invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not set password");
        return;
      }
      setStatus("done");
      setTimeout(() => router.replace("/login"), 1500);
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-sm rounded-2xl border bg-background p-6 shadow-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground">
            <MessageCircleMore className="size-5" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight">Join Unibox</h1>
        </div>

        {status === "loading" && (
          <p className="text-center text-sm text-muted-foreground">Checking your invite...</p>
        )}

        {status === "invalid" && (
          <div className="text-center">
            <p className="text-sm text-destructive">
              This invite link is invalid or has expired.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Ask your admin to send a new one.
            </p>
          </div>
        )}

        {status === "done" && (
          <p className="text-center text-sm text-green-600">
            Password set! Redirecting you to sign in...
          </p>
        )}

        {status === "valid" && invitee && (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-center text-sm text-muted-foreground">
              Setting up the account for{" "}
              <span className="font-medium text-foreground">{invitee.name}</span>
              <br />
              <span className="text-xs">{invitee.email}</span>
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="password">Choose a password</Label>
              <PasswordInput
                id="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">Confirm password</Label>
              <PasswordInput
                id="confirm"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? "Saving..." : "Set password & continue"}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Trash2, UserPlus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { ManagedUser, UserRole } from "@/lib/auth/types";

type AvatarChoice = "male" | "female";

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-background p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      {description && (
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Toggle<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-lg border border-border/70 bg-muted/40 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-3 py-1 text-xs font-medium transition-colors",
            value === o.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ChangePassword() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < 8) return toast.error("New password must be at least 8 characters");
    if (next !== confirm) return toast.error("Passwords don't match");
    setSaving(true);
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) return void toast.error(data.error ?? "Could not change password");
      toast.success("Password updated");
      setCurrent("");
      setNext("");
      setConfirm("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-3 sm:max-w-md">
      <div className="space-y-1.5">
        <Label htmlFor="current">Current password</Label>
        <Input id="current" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="new">New password</Label>
        <Input id="new" type="password" value={next} onChange={(e) => setNext(e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm">Confirm new password</Label>
        <Input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      </div>
      <div>
        <Button type="submit" disabled={saving} size="sm">
          {saving ? "Saving…" : "Update password"}
        </Button>
      </div>
    </form>
  );
}

function copy(text: string) {
  navigator.clipboard?.writeText(text);
  toast.success("Invite link copied");
}

function AddUser({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("agent");
  const [avatar, setAvatar] = useState<AvatarChoice>("female");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, role, avatar }),
      });
      const data = (await res.json()) as ManagedUser & { error?: string };
      if (!res.ok) return void toast.error(data.error ?? "Could not create user");
      onAdded();
      setName("");
      setEmail("");
      if (data.inviteUrl) {
        copy(data.inviteUrl);
        toast.success(`Invite created — link copied. Send it to ${data.name}.`);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="u-name">Name</Label>
        <Input id="u-name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Jane Doe" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="u-email">Email</Label>
        <Input id="u-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="jane@example.com" />
      </div>
      <div className="space-y-1.5">
        <Label>Role</Label>
        <div>
          <Toggle
            value={role}
            onChange={setRole}
            options={[
              { value: "agent", label: "Agent" },
              { value: "admin", label: "Admin" },
            ]}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Avatar</Label>
        <div>
          <Toggle
            value={avatar}
            onChange={setAvatar}
            options={[
              { value: "female", label: "Female" },
              { value: "male", label: "Male" },
            ]}
          />
        </div>
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" size="sm" disabled={saving} className="gap-1.5">
          <UserPlus className="size-3.5" />
          {saving ? "Creating…" : "Create user & generate invite"}
        </Button>
      </div>
    </form>
  );
}

export default function TeamPage() {
  const router = useRouter();
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    if (res.status === 403 || res.status === 401) {
      setIsAdmin(false);
      setUsers([]);
      return;
    }
    setIsAdmin(true);
    setUsers((await res.json()) as ManagedUser[]);
  }, []);

  useEffect(() => {
    // load() sets state only after its async fetch resolves (not synchronously).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const remove = async (u: ManagedUser) => {
    if (!confirm(`Remove ${u.name}? This can't be undone.`)) return;
    const res = await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) return void toast.error(data.error ?? "Could not remove user");
    toast.success(`${u.name} removed`);
    load();
  };

  const regenerate = async (u: ManagedUser) => {
    const res = await fetch(`/api/admin/users/${u.id}`, { method: "POST" });
    const data = (await res.json()) as { inviteUrl?: string; error?: string };
    if (!res.ok || !data.inviteUrl)
      return void toast.error(data.error ?? "Could not create invite");
    copy(data.inviteUrl);
  };

  return (
    <main className="mx-auto min-h-dvh max-w-3xl space-y-5 p-5 sm:p-8">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="size-8" onClick={() => router.push("/")}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
      </div>

      <Section title="Your account" description="Change your own password.">
        <ChangePassword />
      </Section>

      {isAdmin && (
        <>
          <Section
            title="Add a team member"
            description="Creates an account and an invite link. Send the link to the new member — they set their own password to join."
          >
            <AddUser onAdded={load} />
          </Section>

          <Section title="Team" description="Everyone with access to this inbox.">
            <div className="divide-y">
              {(users ?? []).map((u) => (
                <div key={u.id} className="flex items-center gap-3 py-2.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u.avatarUrl} alt="" className="size-9 rounded-full border bg-muted" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {u.name}
                      <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                        {u.role}
                      </span>
                      {u.status !== "active" && (
                        <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                          {u.status}
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                  </div>
                  {u.status === "invited" && (
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => regenerate(u)}>
                      <RefreshCw className="size-3.5" />
                      Invite link
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-destructive"
                    onClick={() => remove(u)}
                    aria-label={`Remove ${u.name}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          </Section>
        </>
      )}
    </main>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  RefreshCw,
  Trash2,
  UserPlus,
  Users,
  ShieldCheck,
  BarChart3,
  UserCircle,
  KeyRound,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { messageTime } from "@/lib/format";
import { inboxService } from "@/lib/services";
import { useCurrentUser } from "@/lib/hooks";
import type { ManagedUser, UserRole } from "@/lib/auth/types";

type AvatarChoice = "male" | "female";

interface GlobalActivity {
  id: number;
  conversationId: string;
  actorId: string | null;
  actorName: string;
  action: string;
  detail: string;
  createdAt: string;
}

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

function copy(text: string) {
  navigator.clipboard?.writeText(text);
  toast.success("Invite link copied");
}

// ---------------------------------------------------------------- Profile tab

function ProfileTab() {
  const me = useCurrentUser();
  return (
    <Section title="Your profile" description="How you appear to the rest of the team.">
      {me ? (
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={me.avatarUrl} alt="" className="size-16 rounded-full border bg-muted" />
          <div className="space-y-0.5">
            <p className="text-base font-semibold">{me.name}</p>
            <p className="text-sm text-muted-foreground">{me.email}</p>
            <span className="inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
              {me.role}
            </span>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Loading your profile.</p>
      )}
    </Section>
  );
}

// --------------------------------------------------------------- Security tab

function ChangePassword() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < 8) return toast.error("New password must be at least 8 characters");
    if (next !== confirm) return toast.error("Passwords do not match");
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
    <Section title="Change password" description="Update the password you use to sign in.">
      <form onSubmit={submit} className="grid gap-3 sm:max-w-md">
        <div className="space-y-1.5">
          <Label htmlFor="current">Current password</Label>
          <PasswordInput id="current" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new">New password</Label>
          <PasswordInput id="new" value={next} onChange={(e) => setNext(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm">Confirm new password</Label>
          <PasswordInput id="confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </div>
        <div>
          <Button type="submit" disabled={saving} size="sm">
            {saving ? "Saving" : "Update password"}
          </Button>
        </div>
      </form>
    </Section>
  );
}

// ------------------------------------------------------------------- Team tab

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
        toast.success(`Invite created and link copied. Send it to ${data.name}.`);
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
          <Toggle value={role} onChange={setRole} options={[{ value: "agent", label: "Agent" }, { value: "admin", label: "Admin" }]} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Avatar</Label>
        <div>
          <Toggle value={avatar} onChange={setAvatar} options={[{ value: "female", label: "Female" }, { value: "male", label: "Male" }]} />
        </div>
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" size="sm" disabled={saving} className="gap-1.5">
          <UserPlus className="size-3.5" />
          {saving ? "Creating" : "Create user and generate invite"}
        </Button>
      </div>
    </form>
  );
}

function TeamTab({
  users,
  reload,
}: {
  users: ManagedUser[];
  reload: () => void;
}) {
  const [pendingDelete, setPendingDelete] = useState<ManagedUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/users/${pendingDelete.id}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) return void toast.error(data.error ?? "Could not remove user");
      toast.success(`${pendingDelete.name} removed`);
      setPendingDelete(null);
      reload();
    } finally {
      setDeleting(false);
    }
  };

  const regenerate = async (u: ManagedUser) => {
    const res = await fetch(`/api/admin/users/${u.id}`, { method: "POST" });
    const data = (await res.json()) as { inviteUrl?: string; error?: string };
    if (!res.ok || !data.inviteUrl)
      return void toast.error(data.error ?? "Could not create invite");
    copy(data.inviteUrl);
  };

  return (
    <div className="space-y-5">
      <Section
        title="Add a team member"
        description="Creates an account and an invite link. Send the link to the new member so they can set their own password and join."
      >
        <AddUser onAdded={reload} />
      </Section>

      <Section title="Team" description="Everyone with access to this inbox.">
        <div className="divide-y">
          {users.map((u) => (
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
                onClick={() => setPendingDelete(u)}
                aria-label={`Remove ${u.name}`}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      </Section>

      <Dialog open={pendingDelete !== null} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove team member?</DialogTitle>
            <DialogDescription>
              {pendingDelete
                ? `${pendingDelete.name} (${pendingDelete.email}) will lose access immediately. This cannot be undone.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? "Removing" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// -------------------------------------------------------------- Analytics tab

function describeAction(a: GlobalActivity, nameById: Map<string, string>): string {
  switch (a.action) {
    case "reply":
      return "Replied";
    case "status_change":
      return `Set status to ${a.detail}`;
    case "assign":
      return a.detail === "unassigned"
        ? "Unassigned"
        : `Assigned to ${nameById.get(a.detail) ?? "a teammate"}`;
    case "tag_add":
      return `Added tag "${a.detail}"`;
    case "tag_remove":
      return `Removed tag "${a.detail}"`;
    case "note":
      return "Added a note";
    default:
      return a.action;
  }
}

function AnalyticsTab({
  activity,
  nameById,
  convNames,
}: {
  activity: GlobalActivity[];
  nameById: Map<string, string>;
  convNames: Map<string, string>;
}) {
  const summary = useMemo(() => {
    const map = new Map<string, { name: string; replies: number; total: number }>();
    for (const a of activity) {
      const key = a.actorId ?? a.actorName;
      const row = map.get(key) ?? { name: a.actorName || "Unknown", replies: 0, total: 0 };
      row.total += 1;
      if (a.action === "reply") row.replies += 1;
      map.set(key, row);
    }
    return [...map.values()].sort((x, y) => y.total - x.total);
  }, [activity]);

  return (
    <div className="space-y-5">
      <Section title="By agent" description="Total actions and replies per team member.">
        {summary.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {summary.map((s) => (
              <div key={s.name} className="rounded-lg border p-3">
                <p className="truncate text-sm font-medium">{s.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {s.replies} replies · {s.total} actions
                </p>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Activity log" description="Who did what, to which conversation, and when.">
        {activity.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Agent</th>
                  <th className="py-2 pr-3 font-medium">Action</th>
                  <th className="py-2 pr-3 font-medium">Conversation</th>
                  <th className="py-2 font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((a) => (
                  <tr key={a.id} className="border-b border-border/50">
                    <td className="py-2 pr-3 font-medium">{a.actorName || "Unknown"}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{describeAction(a, nameById)}</td>
                    <td className="max-w-[200px] truncate py-2 pr-3">
                      {convNames.get(a.conversationId) ?? a.conversationId}
                    </td>
                    <td className="whitespace-nowrap py-2 text-muted-foreground">
                      {messageTime(a.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

// ----------------------------------------------------------------- Page shell

export default function ProfilePage() {
  const router = useRouter();
  const me = useCurrentUser();
  const isAdmin = me?.role === "admin";

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [activity, setActivity] = useState<GlobalActivity[]>([]);
  const [convNames, setConvNames] = useState<Map<string, string>>(new Map());

  const loadUsers = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    if (res.ok) setUsers((await res.json()) as ManagedUser[]);
  }, []);

  const loadAnalytics = useCallback(async () => {
    const [actRes, convs] = await Promise.all([
      fetch("/api/admin/activity"),
      inboxService.listConversations().catch(() => []),
    ]);
    if (actRes.ok) setActivity((await actRes.json()) as GlobalActivity[]);
    setConvNames(new Map(convs.map((c) => [c.id, c.contact.displayName])));
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    // These fetch helpers only setState after their async requests resolve.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadUsers();
    void loadAnalytics();
  }, [isAdmin, loadUsers, loadAnalytics]);

  const nameById = useMemo(
    () => new Map(users.map((u) => [u.id, u.name])),
    [users],
  );

  return (
    <main className="mx-auto min-h-dvh max-w-3xl p-5 sm:p-8">
      <div className="mb-5 flex items-center gap-2">
        <Button variant="ghost" size="icon" className="size-8" onClick={() => router.push("/")}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-lg font-semibold tracking-tight">Profile and settings</h1>
      </div>

      <Tabs defaultValue="profile">
        <TabsList className="h-9">
          <TabsTrigger value="profile" className="gap-1.5">
            <UserCircle className="size-4" /> Profile
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-1.5">
            <KeyRound className="size-4" /> Security
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="team" className="gap-1.5">
              <Users className="size-4" /> Team
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="analytics" className="gap-1.5">
              <BarChart3 className="size-4" /> Analytics
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="profile" className="mt-4">
          <ProfileTab />
        </TabsContent>
        <TabsContent value="security" className="mt-4">
          <ChangePassword />
        </TabsContent>
        {isAdmin && (
          <TabsContent value="team" className="mt-4">
            <TeamTab users={users} reload={loadUsers} />
          </TabsContent>
        )}
        {isAdmin && (
          <TabsContent value="analytics" className="mt-4">
            <div className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5" /> Visible to admins only
            </div>
            <AnalyticsTab activity={activity} nameById={nameById} convNames={convNames} />
          </TabsContent>
        )}
      </Tabs>
    </main>
  );
}

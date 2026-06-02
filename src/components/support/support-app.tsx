"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Check,
  ChevronDown,
  FileText,
  LifeBuoy,
  Loader2,
  Mail,
  Pencil,
  Phone,
  Play,
  Plus,
  Send,
  StickyNote,
  Trash2,
  User,
} from "lucide-react";
import { ArrowLeftIcon } from "@/components/icons/arrow-left";
import { FileTextIcon } from "@/components/icons/file-text";
import { RefreshCWIcon } from "@/components/icons/refresh-cw";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { relativeTime, messageTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RichEditor, isEmptyHtml } from "./rich-editor";
import {
  STATUS_OPTIONS,
  useAddTicketNote,
  useBulkUpdateStatus,
  useCannedResponses,
  useCreateCanned,
  useDeleteCanned,
  useInfiniteTickets,
  useApplyQuickAction,
  useApplyQuickActionBulk,
  useQuickActions,
  useReplyToTicket,
  useTicket,
  useTicketCount,
  useUpdateCanned,
  useUpdateTicketStatus,
  type BulkStatusResult,
  type CannedResponse,
  type Labeled,
  type QuickAction,
  type QuickActionBulkResult,
  type StatusOption,
  type TicketConversation,
  type TicketSummary,
} from "@/lib/hooks/use-support";

// ── small shared bits ───────────────────────────────────────────────────────

const dateChipFmt = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function statusVariant(
  label: string,
): "default" | "secondary" | "outline" | "destructive" {
  switch (label) {
    case "Open":
      return "default";
    case "Pending":
      return "destructive";
    case "Resolved":
    case "Closed":
      return "secondary";
    default:
      return "outline";
  }
}

function StatusBadge({ value }: { value: Labeled }) {
  return <Badge variant={statusVariant(value.label)}>{value.label}</Badge>;
}

function PriorityBadge({ value }: { value: Labeled }) {
  const urgent = value.label === "Urgent" || value.label === "High";
  return <Badge variant={urgent ? "destructive" : "outline"}>{value.label}</Badge>;
}

/** Small locale-formatted date chip so the agent can date-scan the list. */
function DateChip({ iso }: { iso: string }) {
  const d = new Date(iso);
  return (
    <span
      title={d.toLocaleString()}
      className="rounded bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground"
    >
      {dateChipFmt.format(d)}
    </span>
  );
}

/** Minimal checkbox (no shadcn checkbox in this project). */
function CheckBox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={cn(
        "grid size-4 shrink-0 place-items-center rounded border transition-colors",
        checked
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-background hover:border-muted-foreground",
      )}
    >
      {checked && <Check className="size-3" strokeWidth={3} />}
    </button>
  );
}

/** Reusable status picker (single ticket + bulk). */
function StatusMenu({
  current,
  onPick,
  disabled,
  trigger,
}: {
  current?: string;
  onPick: (status: StatusOption) => void;
  disabled?: boolean;
  trigger: React.ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        {trigger}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Set status</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {STATUS_OPTIONS.map((s) => (
          <DropdownMenuItem key={s} onSelect={() => onPick(s)}>
            {s}
            {current === s && <Check className="ml-auto size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── ticket list (left pane) ─────────────────────────────────────────────────

function TicketRow({
  ticket,
  active,
  selected,
  onOpen,
  onToggleSelect,
}: {
  ticket: TicketSummary;
  active: boolean;
  selected: boolean;
  onOpen: () => void;
  onToggleSelect: (next: boolean) => void;
}) {
  return (
    <div
      className={cn(
        "flex w-full items-start gap-2.5 border-b px-3 py-3 transition-colors",
        active ? "bg-accent" : selected ? "bg-accent/40" : "hover:bg-accent/50",
      )}
    >
      <div className="pt-0.5">
        <CheckBox
          checked={selected}
          onChange={onToggleSelect}
          label={`Select ticket ${ticket.id}`}
        />
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 flex-col gap-1.5 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {ticket.subject}
          </span>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            #{ticket.id}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge value={ticket.status} />
          <PriorityBadge value={ticket.priority} />
          <span className="ml-auto">
            <DateChip iso={ticket.createdAt} />
          </span>
        </div>
      </button>
    </div>
  );
}

function BulkResultsDialog({
  result,
  onClose,
}: {
  result: BulkStatusResult | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={result !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bulk update result</DialogTitle>
          <DialogDescription>
            {result?.succeeded.length ?? 0} updated to {result?.targetStatus},{" "}
            {result?.failed.length ?? 0} failed.
          </DialogDescription>
        </DialogHeader>
        {result && result.failed.length > 0 && (
          <div className="max-h-60 space-y-1 overflow-y-auto rounded-md border p-2 text-sm">
            <p className="mb-1 font-medium text-destructive">
              Not changed (likely outside your agent scope):
            </p>
            {result.failed.map((f) => (
              <div key={f.id} className="flex justify-between">
                <span>#{f.id}</span>
                <span className="text-muted-foreground">
                  still {f.status.label}
                </span>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TicketList({
  selectedId,
  onSelect,
}: {
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteTickets();
  const count = useTicketCount();
  const bulk = useBulkUpdateStatus();
  const { data: quickActions = [] } = useQuickActions();
  const quickBulk = useApplyQuickActionBulk();
  const qcKeyRefetch = () => {
    refetch();
    count.refetch();
  };

  const tickets = data?.pages.flatMap((p) => p.tickets) ?? [];
  const total = count.data?.total ?? tickets.length;

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [results, setResults] = useState<BulkStatusResult | null>(null);
  const [confirmBulkAction, setConfirmBulkAction] = useState<QuickAction | null>(
    null,
  );
  const [qaResults, setQaResults] = useState<QuickActionBulkResult | null>(null);

  const applyQuickBulk = (action: QuickAction) => {
    const ids = [...selected];
    if (ids.length === 0) return;
    quickBulk.mutate(
      { ids, actionKey: action.key },
      {
        onSuccess: (res) => {
          setQaResults(res);
          setConfirmBulkAction(null);
          setSelected(new Set());
          const ok = res.results.filter((r) => r.propertyOk && r.replyOk).length;
          const bad = res.results.length - ok;
          if (bad === 0) toast.success(`${ok} ticket(s) done.`);
          else toast.warning(`${ok} done, ${bad} had issues.`);
        },
        onError: (e) => toast.error((e as Error).message),
      },
    );
  };

  // Tab + date filter. "Open" = no agent reply yet (needs a response);
  // "Replied" = an agent has answered. This keeps replied tickets (which jump
  // to the top by updated_at) from mixing with brand-new ones.
  const [tab, setTab] = useState<"open" | "replied">("open");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const inRange = (iso: string) => {
    const t = new Date(iso).getTime();
    if (from && t < new Date(`${from}T00:00:00`).getTime()) return false;
    if (to && t > new Date(`${to}T23:59:59`).getTime()) return false;
    return true;
  };

  const dated = tickets.filter((t) => inRange(t.createdAt));
  const openList = dated.filter((t) => !t.repliedByAgent);
  const repliedList = dated.filter((t) => t.repliedByAgent);
  const visible = tab === "open" ? openList : repliedList;

  const toggle = (id: number, next: boolean) =>
    setSelected((prev) => {
      const out = new Set(prev);
      if (next) out.add(id);
      else out.delete(id);
      return out;
    });

  // Infinite scroll: fetch the next page when the sentinel scrolls into view.
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const ob = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { root: scrollRef.current, rootMargin: "300px" },
    );
    ob.observe(el);
    return () => ob.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Tabs + date filter partition the lazily-loaded stream client-side, so a tab
  // can look empty until enough pages load. Keep pulling pages while the active
  // view is short and more pages exist.
  useEffect(() => {
    if (visible.length < 12 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [visible.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const applyBulk = (status: StatusOption) => {
    const ids = [...selected];
    if (ids.length === 0) return;
    const ok = window.confirm(
      `Change ${ids.length} ticket${ids.length === 1 ? "" : "s"} to "${status}"? ` +
        `This affects live tickets and can't be undone.`,
    );
    if (!ok) return;
    bulk.mutate(
      { ids, status },
      {
        onSuccess: (res) => {
          setResults(res);
          setSelected(new Set());
          if (res.failed.length === 0) {
            toast.success(`${res.succeeded.length} updated to ${status}.`);
          } else {
            toast.warning(
              `${res.succeeded.length} updated, ${res.failed.length} couldn't be changed.`,
            );
          }
        },
        onError: (e) => toast.error((e as Error).message),
      },
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
        <span className="text-sm font-semibold">Tickets</span>
        <span className="text-xs text-muted-foreground">{total}</span>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto size-7"
          onClick={qcKeyRefetch}
          aria-label="Refresh tickets"
        >
          <RefreshCWIcon size={16} className={cn(isFetching && "animate-spin")} />
        </Button>
      </div>

      {/* Open vs Replied tabs */}
      <div className="flex shrink-0 gap-1 border-b p-1.5">
        {([
          ["open", "Open", openList.length],
          ["replied", "Replied", repliedList.length],
        ] as const).map(([key, label, n]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
              tab === key
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/50",
            )}
          >
            {label}
            <span className="ml-1.5 tabular-nums opacity-70">
              {n}
              {hasNextPage ? "+" : ""}
            </span>
          </button>
        ))}
      </div>

      {/* Date filter (by created date) */}
      <div className="flex shrink-0 items-center gap-1.5 border-b px-3 py-2">
        <Input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          aria-label="From date"
          className="h-7 flex-1 text-xs"
        />
        <span className="text-xs text-muted-foreground">to</span>
        <Input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          aria-label="To date"
          className="h-7 flex-1 text-xs"
        />
        {(from || to) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => {
              setFrom("");
              setTo("");
            }}
          >
            Clear
          </Button>
        )}
      </div>

      {/* Bulk action bar (only when something is selected) */}
      {selected.size > 0 && (
        <div className="flex shrink-0 items-center gap-2 border-b bg-muted/40 px-3 py-2">
          <span className="text-xs font-medium">{selected.size} selected</span>
          <StatusMenu
            onPick={applyBulk}
            disabled={bulk.isPending}
            trigger={
              <Button size="sm" className="ml-auto h-7" disabled={bulk.isPending}>
                {bulk.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : null}
                Set status
                <ChevronDown className="size-3.5" />
              </Button>
            }
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild disabled={quickBulk.isPending}>
              <Button
                variant="outline"
                size="sm"
                className="h-7"
                disabled={quickBulk.isPending}
              >
                {quickBulk.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Play className="size-3.5" />
                )}
                Quick action
                <ChevronDown className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel>Apply to selected</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {quickActions.map((a) => (
                <DropdownMenuItem
                  key={a.key}
                  onSelect={() => setConfirmBulkAction(a)}
                  className="flex-col items-start gap-0.5"
                >
                  <span className="font-medium">{a.label}</span>
                  <span className="text-xs text-muted-foreground">{a.summary}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="sm"
            className="h-7"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </Button>
        </div>
      )}

      {/* Native scroll (not ScrollArea): Radix's viewport wraps content in a
          display:table element that grows to the widest row, defeating title
          truncation. A plain overflow container keeps rows at column width. */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {isLoading && (
          <div className="space-y-3 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        )}

        {isError && (
          <div className="p-4 text-sm text-destructive">
            {(error as Error)?.message ?? "Couldn't load tickets."}
          </div>
        )}

        {!isLoading && visible.length === 0 && !hasNextPage && !isFetchingNextPage && (
          <div className="p-6 text-center text-sm text-muted-foreground">
            {tab === "open"
              ? "No open tickets here."
              : "No replied tickets here."}
            {(from || to) && " Try widening the date range."}
          </div>
        )}

        {visible.map((t) => (
          <TicketRow
            key={t.id}
            ticket={t}
            active={t.id === selectedId}
            selected={selected.has(t.id)}
            onOpen={() => onSelect(t.id)}
            onToggleSelect={(next) => toggle(t.id, next)}
          />
        ))}

        {/* Sentinel + loading indicator for lazy paging */}
        <div ref={sentinelRef} />
        {(isFetchingNextPage || (visible.length === 0 && hasNextPage)) && (
          <div className="flex items-center justify-center gap-2 p-4 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Loading more…
          </div>
        )}
      </div>

      <BulkResultsDialog result={results} onClose={() => setResults(null)} />

      {/* Bulk quick-action confirm */}
      <Dialog
        open={confirmBulkAction !== null}
        onOpenChange={(o) => !o && setConfirmBulkAction(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply &ldquo;{confirmBulkAction?.label}&rdquo; to {selected.size} ticket(s)?</DialogTitle>
            <DialogDescription>
              {confirmBulkAction
                ? `This sets ${confirmBulkAction.summary} on ${selected.size} ticket(s) and sends a real email to each requester. It can't be undone.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmBulkAction(null)}
              disabled={quickBulk.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => confirmBulkAction && applyQuickBulk(confirmBulkAction)}
              disabled={quickBulk.isPending}
            >
              {quickBulk.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Play className="size-4" />
              )}
              Apply &amp; send to {selected.size}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk quick-action per-ticket results */}
      <Dialog open={qaResults !== null} onOpenChange={(o) => !o && setQaResults(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Result: {qaResults?.action}</DialogTitle>
            <DialogDescription>
              {qaResults
                ? `${qaResults.results.filter((r) => r.propertyOk && r.replyOk).length} fully done, ${qaResults.results.filter((r) => !(r.propertyOk && r.replyOk)).length} with issues.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {qaResults && (
            <div className="max-h-60 space-y-1 overflow-y-auto rounded-md border p-2 text-sm">
              {qaResults.results.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2">
                  <span>#{r.id}</span>
                  <span className="text-xs text-muted-foreground">
                    {r.propertyOk ? "status ✓" : "status ✗"} ·{" "}
                    {r.replyOk ? "reply ✓" : `reply ✗${r.error ? ` (${r.error})` : ""}`}
                  </span>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setQaResults(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── conversation thread ──────────────────────────────────────────────────────

function ConversationBubble({ c }: { c: TicketConversation }) {
  if (c.private) {
    return (
      <div className="rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-sm dark:border-amber-500/30 dark:bg-amber-500/10">
        <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
          <StickyNote className="size-3.5" /> Private note
          <span className="ml-auto font-normal text-muted-foreground">
            {messageTime(c.createdAt)}
          </span>
        </div>
        <div
          className="prose prose-sm max-w-none dark:prose-invert"
          dangerouslySetInnerHTML={{ __html: c.body }}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border p-3 text-sm",
        c.incoming ? "bg-muted/40" : "border-primary/20 bg-primary/5",
      )}
    >
      <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          {c.incoming ? "Requester" : "Agent reply"}
        </span>
        <span className="ml-auto">{messageTime(c.createdAt)}</span>
      </div>
      <div
        className="prose prose-sm max-w-none dark:prose-invert"
        dangerouslySetInnerHTML={{ __html: c.body }}
      />
    </div>
  );
}

// ── canned responses ─────────────────────────────────────────────────────────

/**
 * Turns what someone types in the box (plain text, like a Gmail compose) into
 * the HTML Freshdesk expects. Blank lines become paragraphs, single line breaks
 * become <br>, and any HTML characters they type are escaped so nothing breaks.
 */
function textToHtml(text: string): string {
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // <br><br> for paragraph breaks, not <p>: Freshdesk's email template zeroes
  // <p> margins, collapsing paragraph spacing. <br><br> renders a real gap.
  return text
    .replace(/\r\n/g, "\n")
    .trim()
    .split(/\n{2,}/)
    .map((para) => escape(para).replace(/\n/g, "<br>"))
    .join("<br><br>");
}

function CannedManager({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { data: templates = [] } = useCannedResponses();
  const createMut = useCreateCanned();
  const updateMut = useUpdateCanned();
  const deleteMut = useDeleteCanned();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const reset = () => {
    setEditingId(null);
    setTitle("");
    setBody("");
  };

  const startEdit = (t: CannedResponse) => {
    setEditingId(t.id);
    setTitle(t.title);
    setBody(t.body);
  };

  const save = () => {
    if (!title.trim() || !body.trim()) return;
    if (editingId) {
      updateMut.mutate(
        { id: editingId, title, body },
        {
          onSuccess: () => {
            toast.success("Template updated.");
            reset();
          },
          onError: (e) => toast.error((e as Error).message),
        },
      );
    } else {
      createMut.mutate(
        { title, body },
        {
          onSuccess: () => {
            toast.success("Template saved.");
            reset();
          },
          onError: (e) => toast.error((e as Error).message),
        },
      );
    }
  };

  const remove = (id: string) => {
    if (!window.confirm("Delete this template?")) return;
    deleteMut.mutate(id, {
      onSuccess: () => {
        toast.success("Template deleted.");
        if (editingId === id) reset();
      },
      onError: (e) => toast.error((e as Error).message),
    });
  };

  const busy = createMut.isPending || updateMut.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => (onOpenChange(o), o || reset())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Reply templates</DialogTitle>
          <DialogDescription>
            Your own reusable replies. Insert one into the reply box, then edit
            before sending.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-48 space-y-1.5 overflow-y-auto">
          {templates.length === 0 && (
            <p className="py-2 text-sm text-muted-foreground">
              No templates yet. Create one below.
            </p>
          )}
          {templates.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-2 rounded-md border px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{t.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {t.body}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={() => startEdit(t)}
                aria-label="Edit template"
              >
                <Pencil className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-destructive"
                onClick={() => remove(t.id)}
                aria-label="Delete template"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>

        <Separator />

        <div className="space-y-2">
          <p className="text-sm font-medium">
            {editingId ? "Edit template" : "New template"}
          </p>
          <Input
            placeholder="Title (e.g. Application received)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Textarea
            placeholder="Template text…"
            rows={4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            {editingId && (
              <Button variant="ghost" onClick={reset}>
                Cancel
              </Button>
            )}
            <Button onClick={save} disabled={!title.trim() || !body.trim() || busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {editingId ? "Save changes" : "Add template"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── composer (reply + note + templates) ──────────────────────────────────────

function Composer({
  ticketId,
  onOpenManage,
}: {
  ticketId: number;
  onOpenManage: () => void;
}) {
  // reply is HTML (from the rich editor); resetKey re-seeds the editor on
  // clear / template insert. note stays plain text (converted on send).
  const [reply, setReply] = useState("");
  const [resetKey, setResetKey] = useState(0);
  const [note, setNote] = useState("");
  const replyMut = useReplyToTicket(ticketId);
  const noteMut = useAddTicketNote(ticketId);
  const { data: templates = [] } = useCannedResponses();

  const insertTemplate = (t: CannedResponse) => {
    setReply((prev) =>
      isEmptyHtml(prev) ? textToHtml(t.body) : prev + textToHtml(t.body),
    );
    setResetKey((k) => k + 1);
  };

  const sendReply = () => {
    if (isEmptyHtml(reply)) return;
    const ok = window.confirm(
      "Send this reply? It emails the requester and can't be undone.",
    );
    if (!ok) return;
    replyMut.mutate(reply, {
      onSuccess: () => {
        setReply("");
        setResetKey((k) => k + 1);
        toast.success("Reply sent.");
      },
      onError: (e) => toast.error((e as Error).message),
    });
  };

  const addNote = () => {
    if (!note.trim()) return;
    noteMut.mutate(textToHtml(note), {
      onSuccess: () => {
        setNote("");
        toast.success("Note added.");
      },
      onError: (e) => toast.error((e as Error).message),
    });
  };

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium">Reply</p>
            <p className="text-xs text-muted-foreground">
              Write it like an email. Use the toolbar for links, lists, and
              images. It goes to the requester.
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 shrink-0">
                <FileText className="size-3.5" />
                Templates
                <ChevronDown className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-72 w-64 overflow-y-auto">
              <DropdownMenuLabel>Insert a template</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {templates.length === 0 && (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  No templates yet.
                </div>
              )}
              {templates.map((t) => (
                <DropdownMenuItem key={t.id} onSelect={() => insertTemplate(t)}>
                  <span className="truncate">{t.title}</span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onOpenManage}>
                <Plus className="size-4" /> Manage templates…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <RichEditor
          value={reply}
          onChange={setReply}
          resetKey={resetKey}
          placeholder="Hi there, thanks for getting in touch…"
        />
        <div className="flex justify-end">
          <Button
            onClick={sendReply}
            disabled={isEmptyHtml(reply) || replyMut.isPending}
          >
            {replyMut.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            {replyMut.isPending ? "Sending…" : "Send reply"}
          </Button>
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <div>
          <p className="text-sm font-medium">Internal note</p>
          <p className="text-xs text-muted-foreground">
            Private. Only your team sees this, never the requester.
          </p>
        </div>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={"Context for the team…"}
          rows={4}
        />
        <div className="flex justify-end">
          <Button
            variant="secondary"
            onClick={addNote}
            disabled={!note.trim() || noteMut.isPending}
          >
            {noteMut.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <StickyNote className="size-4" />
            )}
            {noteMut.isPending ? "Saving…" : "Add private note"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── ticket detail (right pane) ───────────────────────────────────────────────

function TicketDetailView({
  ticketId,
  onOpenManage,
}: {
  ticketId: number;
  onOpenManage: () => void;
}) {
  const { data: ticket, isLoading, isError, error } = useTicket(ticketId);
  const statusMut = useUpdateTicketStatus(ticketId);
  const { data: quickActions = [] } = useQuickActions();
  const quickActionMut = useApplyQuickAction(ticketId);
  const [confirmAction, setConfirmAction] = useState<QuickAction | null>(null);

  const runQuickAction = (a: QuickAction) => {
    quickActionMut.mutate(a.key, {
      onSuccess: () => {
        toast.success(`Applied "${a.label}".`);
        setConfirmAction(null);
      },
      onError: (e) => toast.error((e as Error).message),
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (isError || !ticket) {
    return (
      <div className="p-6 text-sm text-destructive">
        {(error as Error)?.message ?? "Couldn't load this ticket."}
      </div>
    );
  }

  const req = ticket.requester;

  const changeStatus = (status: StatusOption) => {
    if (status === ticket.status.label) return;
    statusMut.mutate(status, {
      onSuccess: () => toast.success(`Status set to ${status}.`),
      onError: (e) => toast.error((e as Error).message),
    });
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">{ticket.subject}</h2>
            <p className="text-xs text-muted-foreground">
              #{ticket.id} · {ticket.source.label} · updated{" "}
              {relativeTime(ticket.updatedAt)}
            </p>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <PriorityBadge value={ticket.priority} />
            <StatusMenu
              current={ticket.status.label}
              onPick={changeStatus}
              disabled={statusMut.isPending}
              trigger={
                <Button variant="outline" size="sm" className="h-7">
                  {statusMut.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : null}
                  {ticket.status.label}
                  <ChevronDown className="size-3.5" />
                </Button>
              }
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild disabled={quickActionMut.isPending}>
                <Button variant="outline" size="sm" className="h-7">
                  {quickActionMut.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Play className="size-3.5" />
                  )}
                  Quick action
                  <ChevronDown className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel>Quick actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {quickActions.length === 0 && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    No quick actions configured.
                  </div>
                )}
                {quickActions.map((a) => (
                  <DropdownMenuItem
                    key={a.key}
                    onSelect={() => setConfirmAction(a)}
                    className="flex-col items-start gap-0.5"
                  >
                    <span className="font-medium">{a.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {a.summary}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {req && (req.name || req.email || req.phone) && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {req.name && (
              <span className="flex items-center gap-1">
                <User className="size-3.5" /> {req.name}
              </span>
            )}
            {req.email && (
              <span className="flex items-center gap-1">
                <Mail className="size-3.5" /> {req.email}
              </span>
            )}
            {req.phone && (
              <span className="flex items-center gap-1">
                <Phone className="size-3.5" /> {req.phone}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Body: conversation on the left, reply/note composer on the right. */}
      <div className="flex min-h-0 flex-1">
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-3 p-4">
            {ticket.description && (
              <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                <div className="mb-1 text-xs font-medium">Original request</div>
                <div
                  className="prose prose-sm max-w-none dark:prose-invert"
                  dangerouslySetInnerHTML={{ __html: ticket.description }}
                />
              </div>
            )}

            {ticket.conversations.map((c) => (
              <ConversationBubble key={c.id} c={c} />
            ))}

            {ticket.conversations.length === 0 && !ticket.description && (
              <p className="text-sm text-muted-foreground">No messages yet.</p>
            )}
          </div>
        </ScrollArea>

        <div className="flex w-[420px] shrink-0 flex-col border-l bg-muted/10">
          <Composer ticketId={ticket.id} onOpenManage={onOpenManage} />
        </div>
      </div>

      <Dialog
        open={confirmAction !== null}
        onOpenChange={(o) => !o && setConfirmAction(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply &ldquo;{confirmAction?.label}&rdquo;?</DialogTitle>
            <DialogDescription>
              {confirmAction
                ? `This will set ${confirmAction.summary} on ticket #${ticket.id} and send a real email to ${ticket.requester?.email ?? "the requester"}. It can't be undone.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmAction(null)}
              disabled={quickActionMut.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => confirmAction && runQuickAction(confirmAction)}
              disabled={quickActionMut.isPending}
            >
              {quickActionMut.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Play className="size-4" />
              )}
              Apply &amp; send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── shell ────────────────────────────────────────────────────────────────────

export function SupportApp() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [manageOpen, setManageOpen] = useState(false);

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
        <Image
          src="/freshdesk.png"
          alt=""
          width={18}
          height={18}
          className="size-[18px]"
        />
        <span className="text-sm font-semibold">Freshdesk</span>
        <div className="ml-auto flex items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={() => setManageOpen(true)}>
            <FileTextIcon size={16} />
            Templates
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/">
              <ArrowLeftIcon size={16} />
              Back to inbox
            </Link>
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex w-[22rem] shrink-0 flex-col border-r">
          <TicketList selectedId={selectedId} onSelect={setSelectedId} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          {selectedId === null ? (
            <div className="flex h-full flex-1 flex-col items-center justify-center px-6 text-center">
              <LifeBuoy className="mb-3 size-10 text-muted-foreground/40" />
              <p className="text-sm font-medium">No ticket open</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Pick a ticket on the left to read it and reply.
              </p>
            </div>
          ) : (
            <TicketDetailView
              ticketId={selectedId}
              onOpenManage={() => setManageOpen(true)}
            />
          )}
        </div>
      </div>

      <CannedManager open={manageOpen} onOpenChange={setManageOpen} />
    </div>
  );
}

import { CircleDot, Clock, CheckCircle2, Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConversationStatus } from "@/lib/types";

export const STATUS_META: Record<
  ConversationStatus,
  { label: string; Icon: typeof CircleDot; className: string; dot: string }
> = {
  open: {
    label: "Open",
    Icon: CircleDot,
    className: "text-emerald-600 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  pending: {
    label: "Pending",
    Icon: Clock,
    className: "text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  resolved: {
    label: "Resolved",
    Icon: CheckCircle2,
    className: "text-zinc-500 dark:text-zinc-400",
    dot: "bg-zinc-400",
  },
  snoozed: {
    label: "Snoozed",
    Icon: Moon,
    className: "text-violet-600 dark:text-violet-400",
    dot: "bg-violet-500",
  },
};

export const STATUS_ORDER: ConversationStatus[] = [
  "open",
  "pending",
  "resolved",
  "snoozed",
];

export function StatusBadge({
  status,
  className,
}: {
  status: ConversationStatus;
  className?: string;
}) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background px-2 py-0.5 text-xs font-medium",
        meta.className,
        className,
      )}
    >
      <meta.Icon className="size-3" />
      {meta.label}
    </span>
  );
}

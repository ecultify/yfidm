import { format, formatDistanceToNowStrict, isToday, isYesterday } from "date-fns";

/** Compact relative time for list rows, e.g. "2m", "3h", "5d". */
export function relativeTime(iso: string): string {
  const d = new Date(iso);
  const distance = formatDistanceToNowStrict(d, { addSuffix: false });
  return distance
    .replace(/ seconds?/, "s")
    .replace(/ minutes?/, "m")
    .replace(/ hours?/, "h")
    .replace(/ days?/, "d")
    .replace(/ months?/, "mo")
    .replace(/ years?/, "y");
}

/** Friendly timestamp for message bubbles, e.g. "Today 14:32", "Mon 09:10". */
export function messageTime(iso: string): string {
  const d = new Date(iso);
  if (isToday(d)) return `Today ${format(d, "HH:mm")}`;
  if (isYesterday(d)) return `Yesterday ${format(d, "HH:mm")}`;
  return format(d, "MMM d, HH:mm");
}

/** Day divider label in a thread, e.g. "Today", "May 12, 2026". */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "MMMM d, yyyy");
}

/** Two-letter initials for avatar fallbacks. */
export function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

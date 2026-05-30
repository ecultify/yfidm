import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { tagColor } from "@/lib/tag-color";

interface TagPillProps {
  tag: string;
  onRemove?: () => void;
  className?: string;
}

/** A colored label. Pass `onRemove` to render an inline remove affordance. */
export function TagPill({ tag, onRemove, className }: TagPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        tagColor(tag),
        className,
      )}
    >
      {tag}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="-mr-0.5 rounded-full p-0.5 opacity-70 transition-opacity hover:opacity-100"
          aria-label={`Remove ${tag} tag`}
        >
          <X className="size-2.5" />
        </button>
      )}
    </span>
  );
}

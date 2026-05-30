import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { CHANNELS } from "@/lib/channel";
import { initials } from "@/lib/format";
import type { Channel } from "@/lib/types";

interface ChannelAvatarProps {
  name: string;
  avatarUrl?: string;
  channel: Channel;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZES = {
  sm: { avatar: "size-8", badge: "size-3.5 -right-0.5 -bottom-0.5", icon: "size-2" },
  md: { avatar: "size-10", badge: "size-4 -right-0.5 -bottom-0.5", icon: "size-2.5" },
  lg: { avatar: "size-12", badge: "size-5 -right-1 -bottom-1", icon: "size-3" },
};

/** Contact avatar with a small channel badge overlaid bottom-right. */
export function ChannelAvatar({
  name,
  avatarUrl,
  channel,
  size = "md",
  className,
}: ChannelAvatarProps) {
  const meta = CHANNELS[channel];
  const s = SIZES[size];
  return (
    <div className={cn("relative shrink-0", className)}>
      <Avatar className={cn(s.avatar, "border border-border/60")}>
        <AvatarImage src={avatarUrl} alt={name} />
        <AvatarFallback className="bg-muted text-xs font-medium text-muted-foreground">
          {initials(name)}
        </AvatarFallback>
      </Avatar>
      <span
        className={cn(
          "absolute grid place-items-center rounded-full ring-2 ring-background",
          s.badge,
          meta.badgeClass,
        )}
        aria-label={meta.label}
      >
        <meta.Icon className={cn(s.icon)} strokeWidth={2.5} />
      </span>
    </div>
  );
}

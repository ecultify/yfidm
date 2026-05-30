import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";
import type { Agent } from "@/lib/types";

interface AgentAvatarProps {
  agent: Agent | undefined;
  size?: "xs" | "sm" | "md";
  className?: string;
  ring?: boolean;
}

const SIZES = { xs: "size-5 text-[9px]", sm: "size-6 text-[10px]", md: "size-8 text-xs" };

export function AgentAvatar({ agent, size = "sm", className, ring }: AgentAvatarProps) {
  if (!agent) return null;
  return (
    <Avatar
      className={cn(
        SIZES[size],
        ring && "ring-2 ring-background",
        "border border-border/60",
        className,
      )}
    >
      <AvatarImage src={agent.avatarUrl} alt={agent.name} />
      <AvatarFallback className="bg-primary/10 font-medium text-primary">
        {initials(agent.name)}
      </AvatarFallback>
    </Avatar>
  );
}

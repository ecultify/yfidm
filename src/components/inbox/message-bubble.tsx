"use client";

import { Check, CheckCheck, Clock3, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { messageTime } from "@/lib/format";
import type { Message, MessageDeliveryStatus } from "@/lib/types";

function DeliveryIndicator({ status }: { status: MessageDeliveryStatus }) {
  switch (status) {
    case "sending":
      return <Clock3 className="size-3 animate-pulse" aria-label="Sending" />;
    case "sent":
      return <Check className="size-3" aria-label="Sent" />;
    case "delivered":
      return <CheckCheck className="size-3" aria-label="Delivered" />;
    case "read":
      return <CheckCheck className="size-3 text-sky-300" aria-label="Read" />;
    case "failed":
      return <AlertCircle className="size-3 text-red-300" aria-label="Failed to send" />;
  }
}

export function MessageBubble({ message }: { message: Message }) {
  // System events render inline, centered.
  if (message.authorType === "system") {
    return (
      <div className="flex justify-center py-1">
        <span className="rounded-full bg-muted px-3 py-1 text-[11px] text-muted-foreground">
          {message.body} · {messageTime(message.sentAt)}
        </span>
      </div>
    );
  }

  const outbound = message.direction === "outbound";
  const failed = message.deliveryStatus === "failed";

  return (
    <div className={cn("flex flex-col gap-1", outbound ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[78%] rounded-2xl px-3.5 py-2 text-[13.5px] leading-relaxed shadow-sm transition-all sm:max-w-[68%]",
          "animate-in fade-in-0 slide-in-from-bottom-1 duration-200",
          outbound
            ? failed
              ? "rounded-br-md bg-red-500/10 text-foreground ring-1 ring-red-500/30"
              : "rounded-br-md bg-primary text-primary-foreground"
            : "rounded-bl-md bg-muted text-foreground",
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.body}</p>
      </div>
      <div
        className={cn(
          "flex items-center gap-1 px-1 text-[10.5px] text-muted-foreground",
          outbound ? "flex-row-reverse" : "flex-row",
        )}
      >
        <span>{messageTime(message.sentAt)}</span>
        {outbound && (
          <span className={cn("flex items-center", failed ? "text-red-500" : "")}>
            <DeliveryIndicator status={message.deliveryStatus} />
          </span>
        )}
        {failed && <span className="text-red-500">Failed</span>}
      </div>
    </div>
  );
}

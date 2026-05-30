import type { Message } from "@/lib/types";

/**
 * Meta's Customer Service Window for Instagram messaging: a standard reply is
 * only permitted within 24h of the contact's most recent INBOUND message.
 * Outside it, Meta rejects the send.
 */
export const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Whether the 24h reply window is currently open for an Instagram thread,
 * derived from the timestamp of the last inbound (contact) message.
 *
 * When there is no inbound message loaded yet we return `true` (don't block) —
 * the server send still acts as the authoritative gate, and we avoid flashing a
 * "closed" notice before messages have loaded.
 * // TODO: Meta also forbids initiating a brand-new thread with no prior inbound
 * //       at all; revisit once we distinguish "no messages" from "old inbound".
 */
export function instagramReplyWindowOpen(
  messages: Message[],
  now: number = Date.now(),
): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].direction === "inbound") {
      return now - new Date(messages[i].sentAt).getTime() < REPLY_WINDOW_MS;
    }
  }
  return true;
}

"use client";

import { useQuery } from "@tanstack/react-query";
import { inboxService } from "@/lib/services";
import type { SessionUser } from "@/lib/auth/types";
import { queryKeys } from "./query-keys";

/** Lists all agents (for assignment dropdowns, avatars, etc.). */
export function useAgents() {
  return useQuery({
    queryKey: queryKeys.agents(),
    queryFn: () => inboxService.listAgents(),
    staleTime: Infinity,
  });
}

/** The currently authenticated user (or null while loading / logged out). */
export function useCurrentUser() {
  const { data } = useQuery<SessionUser | null>({
    queryKey: ["current-user"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me", { headers: { accept: "application/json" } });
      if (!res.ok) return null;
      const { user } = (await res.json()) as { user: SessionUser };
      return user;
    },
    staleTime: 5 * 60_000,
  });
  return data ?? null;
}

/** The id of the user currently using the app ("" until loaded). */
export function useCurrentAgentId() {
  return useCurrentUser()?.id ?? "";
}

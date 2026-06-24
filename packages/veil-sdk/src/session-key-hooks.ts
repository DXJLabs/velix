import { useCallback } from "react";
import useSWR, { mutate } from "swr";

import type { VeilSessionKeyManager } from "./session-key-manager";
import type { CreateVeilSessionInput, RefreshVeilSessionInput, VeilSessionRecord } from "./session-key-types";

export type VeilSessionKey = readonly ["veil-session", string];

export interface UseVeilSessionOptions {
  refreshInterval?: number;
}

export function getVeilSessionKey(manager: VeilSessionKeyManager): VeilSessionKey {
  return ["veil-session", manager.cacheKey];
}

export function formatSessionExpiresIn(expiresAt: number, now = Date.now()): string {
  const remainingMs = Math.max(0, expiresAt - now);
  const minutes = Math.ceil(remainingMs / 60_000);
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.ceil(minutes / 60);
  if (hours < 48) {
    return `${hours}h`;
  }

  return `${Math.ceil(hours / 24)}d`;
}

export function useVeilSession(manager: VeilSessionKeyManager, options: UseVeilSessionOptions = {}) {
  const key = getVeilSessionKey(manager);
  return useSWR<VeilSessionRecord | null>(
    key,
    () => manager.getActiveSession(),
    {
      refreshInterval: options.refreshInterval ?? 30_000,
      keepPreviousData: true,
    },
  );
}

export function useCreateVeilSession(manager: VeilSessionKeyManager) {
  const key = getVeilSessionKey(manager);

  return useCallback(
    async (input: CreateVeilSessionInput) => {
      const session = await manager.createSession(input);
      await mutate(key, session, { revalidate: false });
      return session;
    },
    [key, manager],
  );
}

export function useRevokeVeilSession(manager: VeilSessionKeyManager) {
  const key = getVeilSessionKey(manager);

  return useCallback(
    async (sessionId?: string) => {
      await manager.revokeSession(sessionId);
      await mutate(key, null, { revalidate: false });
    },
    [key, manager],
  );
}

export function useRefreshVeilSession(manager: VeilSessionKeyManager) {
  const key = getVeilSessionKey(manager);

  return useCallback(
    async (input: RefreshVeilSessionInput = {}) => {
      const session = await manager.refreshSession(input);
      await mutate(key, session, { revalidate: false });
      return session;
    },
    [key, manager],
  );
}

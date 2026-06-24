import { useCallback } from "react";
import useSWR, { mutate } from "swr";

import type { VeilClient } from "./client";
export {
  formatSessionExpiresIn,
  getVeilSessionKey,
  useCreateVeilSession,
  useRefreshVeilSession,
  useRevokeVeilSession,
  useVeilSession,
  type UseVeilSessionOptions,
  type VeilSessionKey,
} from "./session-key-hooks";
import { createOptimisticTimelineItem } from "./timeline";
import {
  VeilEventType,
  type OfferInput,
  type SendMessageInput,
  type SendPaymentMemoInput,
  type TimelineItem,
} from "./types";

export type TimelineKey = readonly ["veil-timeline", string, string];

export interface UseChannelTimelineOptions {
  refreshInterval?: number;
}

export function getTimelineKey(client: VeilClient, channelId: string): TimelineKey {
  return ["veil-timeline", client.cacheKey, channelId];
}

export function useChannelTimeline(
  client: VeilClient,
  channelId: string,
  options: UseChannelTimelineOptions = {},
) {
  const key = getTimelineKey(client, channelId);
  return useSWR<TimelineItem[]>(
    key,
    () => client.getTimeline({ channelId, decrypt: true }),
    {
      refreshInterval: options.refreshInterval ?? 2500,
      keepPreviousData: true,
    },
  );
}

export function useSendMessage(client: VeilClient, channelId: string) {
  const key = getTimelineKey(client, channelId);

  return useCallback(
    async (input: Omit<SendMessageInput, "channelId">) => {
      const optimistic = createOptimisticTimelineItem({
        channelId,
        eventType: VeilEventType.CHAT,
        payload: {
          kind: "chat",
          message: input.message,
          sender: input.sender ?? "you",
        },
      });

      await mutate<TimelineItem[]>(
        key,
        async (current = []) => {
          const stored = await client.sendMessage({ ...input, channelId });
          return [...current.filter((item) => item.eventId !== optimistic.eventId), stored];
        },
        {
          optimisticData: (current = []) => [...current, optimistic],
          rollbackOnError: true,
          revalidate: false,
        },
      );
    },
    [channelId, client, key],
  );
}

export function useCreateOffer(client: VeilClient, channelId: string) {
  const key = getTimelineKey(client, channelId);

  return useCallback(
    async (input: Omit<OfferInput, "channelId">) => {
      const optimistic = createOptimisticTimelineItem({
        channelId,
        eventType: VeilEventType.OFFER,
        payload: {
          kind: "offer",
          amount: input.amount,
          ...(input.currency ? { currency: input.currency } : {}),
          ...(input.terms ? { terms: input.terms } : {}),
          sender: input.sender ?? "seller",
        },
      });

      await mutate<TimelineItem[]>(
        key,
        async (current = []) => {
          const stored = await client.createOffer({ ...input, channelId });
          return [...current.filter((item) => item.eventId !== optimistic.eventId), stored];
        },
        {
          optimisticData: (current = []) => [...current, optimistic],
          rollbackOnError: true,
          revalidate: false,
        },
      );
    },
    [channelId, client, key],
  );
}

export function usePaymentMemo(client: VeilClient, channelId: string) {
  const key = getTimelineKey(client, channelId);

  return useCallback(
    async (input: Omit<SendPaymentMemoInput, "channelId">) => {
      const optimistic = createOptimisticTimelineItem({
        channelId,
        eventType: VeilEventType.PAYMENT_MEMO,
        payload: {
          kind: "payment_memo",
          memo: input.memo,
          ...(input.amount ? { amount: input.amount } : {}),
          ...(input.mode ? { mode: input.mode } : {}),
          sender: input.sender ?? "you",
        },
      });

      await mutate<TimelineItem[]>(
        key,
        async (current = []) => {
          const stored = await client.sendPaymentMemo({ ...input, channelId });
          return [...current.filter((item) => item.eventId !== optimistic.eventId), stored];
        },
        {
          optimisticData: (current = []) => [...current, optimistic],
          rollbackOnError: true,
          revalidate: false,
        },
      );
    },
    [channelId, client, key],
  );
}

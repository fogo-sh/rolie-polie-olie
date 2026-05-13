// TanStack Query hooks + invalidation helpers. Keeping the keys/configs here
// makes invalidation from mutations consistent and surface-area small.

import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  api,
  unwrap,
  type Guild,
  type GuildChannel,
  type GuildEmoji,
  type Mapping,
  type MessageInspect,
  type Me,
  type Role,
} from "./api.ts";

// --- Query keys ---

const queryKeys = {
  me: () => ["me"] as const,
  guilds: () => ["guilds"] as const,
  mappings: () => ["mappings"] as const,
  roles: (guildId: string) => ["roles", guildId] as const,
  emojis: (guildId: string) => ["emojis", guildId] as const,
  channels: (guildId: string) => ["channels", guildId] as const,
  messageInspect: (url: string) => ["message-inspect", url] as const,
};

// --- Queries ---

/**
 * Session check. `null` means unauthed; any non-null value means we have a
 * live session. We let the network call fail without retries on 401 so the
 * loader can switch to the login screen fast.
 */
export const meQuery = () =>
  queryOptions<Me | null>({
    queryKey: queryKeys.me(),
    queryFn: async () => {
      const res = await api.api.auth.me.$get();
      // Either 200 with the session, or 401 from requireAuth — anything else
      // is unexpected and treated as "not logged in" so the login screen
      // shows up rather than a blank page on transient errors.
      if (!res.ok) return null;
      const data = await res.json();
      return data as Me;
    },
    staleTime: 5 * 60_000,
    retry: false,
  });

export const guildsQuery = () =>
  queryOptions<Guild[]>({
    queryKey: queryKeys.guilds(),
    queryFn: () => api.api.guilds.$get().then(unwrap),
  });

export const mappingsQuery = () =>
  queryOptions<Mapping[]>({
    queryKey: queryKeys.mappings(),
    queryFn: () => api.api.mappings.$get({ query: {} }).then(unwrap),
  });

export const rolesQuery = (guildId: string) =>
  queryOptions<Role[]>({
    queryKey: queryKeys.roles(guildId),
    queryFn: () => api.api.guilds[":guildId"].roles.$get({ param: { guildId } }).then(unwrap),
    enabled: !!guildId,
  });

export const emojisQuery = (guildId: string) =>
  queryOptions<GuildEmoji[]>({
    queryKey: queryKeys.emojis(guildId),
    queryFn: () => api.api.guilds[":guildId"].emojis.$get({ param: { guildId } }).then(unwrap),
    enabled: !!guildId,
  });

export const channelsQuery = (guildId: string) =>
  queryOptions<GuildChannel[]>({
    queryKey: queryKeys.channels(guildId),
    queryFn: () => api.api.guilds[":guildId"].channels.$get({ param: { guildId } }).then(unwrap),
    enabled: !!guildId,
  });

const MESSAGE_URL_RE = /^https?:\/\/(?:[a-z]+\.)?discord\.com\/channels\/\d+\/\d+\/\d+$/i;

export const messageInspectQuery = (url: string) =>
  queryOptions<MessageInspect>({
    queryKey: queryKeys.messageInspect(url),
    queryFn: () => api.api.messages.inspect.$get({ query: { url } }).then(unwrap),
    enabled: MESSAGE_URL_RE.test(url),
    // Inspect results are cheap to recompute and the answer can change
    // (someone reacts to the message), so don't hold onto them.
    staleTime: 0,
  });

// --- Mutations ---

interface CreateMappingInput {
  message_url: string;
  emoji_key: string;
  role_id: string;
  mode: Mapping["mode"];
  enabled: boolean;
  add_reaction: boolean;
}

interface UpdateMappingInput {
  emoji_key?: string;
  role_id?: string;
  mode?: Mapping["mode"];
  enabled?: boolean;
}

export function useCreateMapping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMappingInput) => api.api.mappings.$post({ json: input }).then(unwrap),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.mappings() });
    },
  });
}

export function useUpdateMapping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: UpdateMappingInput }) =>
      api.api.mappings[":id"].$patch({ param: { id: String(id) }, json: patch }).then(unwrap),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.mappings() });
    },
  });
}

export function useDeleteMapping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.api.mappings[":id"].$delete({ param: { id: String(id) } }).then(unwrap),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.mappings() });
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.api.auth.logout.$post().then(unwrap),
    onSuccess: async () => {
      // Wipe every cached query so a fresh load after redirect re-checks auth.
      qc.clear();
    },
  });
}

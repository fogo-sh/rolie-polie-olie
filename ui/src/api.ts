import { hc, type ApplyGlobalResponse, type InferResponseType } from "hono/client";
import type { AppType } from "../../src/api.ts";

// All protected routes can return 401 from the requireAuth middleware. Hono
// can't infer middleware responses, so we declare it globally for the client.
type AppWithAuth = ApplyGlobalResponse<AppType, { 401: { json: { error: string } } }>;

// The session cookie is httpOnly and same-origin, so we just need to make sure
// fetch sends it along. `credentials: 'include'` is required because the hono
// client defaults to 'same-origin' which is fine here, but being explicit
// keeps things safe if the dev server proxy changes origin in the future.
export const api = hc<AppWithAuth>("/", {
  init: { credentials: "include" },
});

// Convenience type aliases inferred from the server routes. Each response is
// a union of success + error shapes, so we extract the array / object success
// shapes.
type ArrayOf<T> = Extract<T, readonly unknown[]>;

export type Guild = ArrayOf<InferResponseType<typeof api.api.guilds.$get>>[number];
export type Mapping = ArrayOf<InferResponseType<typeof api.api.mappings.$get>>[number];

type MeResponse = InferResponseType<typeof api.api.auth.me.$get>;
export type Me = Extract<MeResponse, { user_id: string }>;

export type Role = ArrayOf<
  InferResponseType<(typeof api.api.guilds)[":guildId"]["roles"]["$get"]>
>[number];

export type GuildEmoji = ArrayOf<
  InferResponseType<(typeof api.api.guilds)[":guildId"]["emojis"]["$get"]>
>[number];

export type GuildChannel = ArrayOf<
  InferResponseType<(typeof api.api.guilds)[":guildId"]["channels"]["$get"]>
>[number];

export type MessageInspect = Extract<
  InferResponseType<typeof api.api.messages.inspect.$get>,
  { channel_id: string }
>;
export type MessageReaction = MessageInspect["reactions"][number];

/**
 * Unwrap a hono RPC response: throws with the server-provided error message on
 * non-2xx, otherwise returns the parsed JSON body. The return type is narrowed
 * to the non-error branch of the response union.
 */
export async function unwrap<T extends Response>(
  res: T,
): Promise<Exclude<T extends { json: () => Promise<infer J> } ? J : never, { error: string }>> {
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // body wasn't JSON; keep default message
    }
    const err = new Error(message) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return (await res.json()) as never;
}

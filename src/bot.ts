import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  type Guild,
} from "discord.js";
import { getMappingsForMessage, upsertGuild } from "./db.js";
import { emojiKey } from "./emoji.js";

export function createBot() {
  const token = process.env.RPO_DISCORD_TOKEN;
  if (!token) throw new Error("RPO_DISCORD_TOKEN is required");

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
  });

  client.once(Events.ClientReady, (readyClient) => {
    console.log(`[bot] Logged in as ${readyClient.user.tag}`);
    for (const guild of readyClient.guilds.cache.values()) {
      upsertGuild(guild.id, guild.name);
    }
  });

  client.on(Events.GuildCreate, (guild: Guild) => {
    upsertGuild(guild.id, guild.name);
  });

  client.on(Events.GuildUpdate, (_, guild: Guild) => {
    upsertGuild(guild.id, guild.name);
  });

  client.on(Events.MessageReactionAdd, async (reaction, user) => {
    if (user.bot) return;
    try {
      if (reaction.partial) await reaction.fetch();
      if (reaction.message.partial) await reaction.message.fetch();

      const messageId = reaction.message.id;
      const key = emojiKey(reaction.emoji);

      const mappings = getMappingsForMessage(messageId);
      const matching = mappings.filter((m) => m.emoji_key === key && m.enabled);

      for (const mapping of matching) {
        const guild = reaction.message.guild;
        if (!guild) continue;
        try {
          const member = await guild.members.fetch(user.id);
          await member.roles.add(mapping.role_id);
          console.log(`[bot] Added role ${mapping.role_id} to ${user.tag}`);
        } catch (err) {
          console.error(`[bot] Failed to add role:`, err);
        }
      }
    } catch (err) {
      console.error("[bot] Error handling reaction add:", err);
    }
  });

  client.on(Events.MessageReactionRemove, async (reaction, user) => {
    if (user.bot) return;
    try {
      if (reaction.partial) await reaction.fetch();
      if (reaction.message.partial) await reaction.message.fetch();

      const messageId = reaction.message.id;
      const key = emojiKey(reaction.emoji);

      const mappings = getMappingsForMessage(messageId);
      const matching = mappings.filter(
        (m) =>
          m.emoji_key === key &&
          m.enabled &&
          (m.mode === "toggle" || m.mode === "remove-on-unreact")
      );

      for (const mapping of matching) {
        const guild = reaction.message.guild;
        if (!guild) continue;
        try {
          const member = await guild.members.fetch(user.id);
          await member.roles.remove(mapping.role_id);
          console.log(`[bot] Removed role ${mapping.role_id} from ${user.tag}`);
        } catch (err) {
          console.error(`[bot] Failed to remove role:`, err);
        }
      }
    } catch (err) {
      console.error("[bot] Error handling reaction remove:", err);
    }
  });

  return {
    client,
    start() {
      return client.login(token);
    },
  };
}

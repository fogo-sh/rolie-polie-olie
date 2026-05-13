import { Link, useFetcher } from "react-router";
import type { GuildChannel, Mapping, Role } from "../api.ts";
import { RoleSwatch } from "./ui.tsx";
import { EmojiDisplay } from "./EmojiDisplay.tsx";

interface Props {
  mapping: Mapping;
  /** Lookup map: roleId -> Role. Undefined when role isn't in current guild. */
  roleById: Map<string, Role>;
  /** Lookup map: channelId -> GuildChannel. */
  channelById: Map<string, GuildChannel>;
}

const MODE_BADGE: Record<Mapping["mode"], string> = {
  toggle: "bg-stone-800 text-amber-300 border-amber-700",
  "add-only": "bg-stone-800 text-stone-300 border-stone-600",
  "remove-on-unreact": "bg-stone-800 text-red-300 border-red-700",
};

export function MappingRow({ mapping, roleById, channelById }: Props) {
  const toggleFetcher = useFetcher();
  const deleteFetcher = useFetcher();

  // Optimistic enabled state derived from in-flight form submission.
  const enabled = toggleFetcher.formData
    ? toggleFetcher.formData.get("enabled") === "true"
    : !!mapping.enabled;

  // Hide the row immediately on delete submission.
  if (deleteFetcher.state !== "idle") return null;

  const role = roleById.get(mapping.role_id);
  const channel = channelById.get(mapping.channel_id);

  return (
    <div className="border-2 border-stone-700 p-4 space-y-2">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1 min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <EmojiDisplay emojiKey={mapping.emoji_key} />
            <span className="text-stone-500">→</span>
            {role ? (
              <span className="flex items-center gap-1.5 text-sm">
                <RoleSwatch color={role.color} />
                <span className="text-stone-200">{role.name}</span>
              </span>
            ) : (
              <span className="text-sm text-stone-400 font-mono">role {mapping.role_id}</span>
            )}
            <span className={`text-xs px-2 py-0.5 border ${MODE_BADGE[mapping.mode]}`}>
              {mapping.mode}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-stone-400">
            {channel && <span className="text-stone-500">#{channel.name}</span>}
            <a
              href={mapping.message_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-400 hover:underline truncate"
            >
              open in Discord ↗
            </a>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <toggleFetcher.Form method="post">
            <input type="hidden" name="intent" value="toggle-mapping" />
            <input type="hidden" name="id" value={mapping.id} />
            <input type="hidden" name="enabled" value={String(!enabled)} />
            <button
              type="submit"
              className={`text-xs px-2 py-1 border-2 ${
                enabled
                  ? "bg-amber-700 text-amber-100 border-amber-500 hover:bg-amber-600"
                  : "bg-stone-800 text-stone-400 border-stone-700 hover:bg-stone-700"
              }`}
            >
              {enabled ? "on" : "off"}
            </button>
          </toggleFetcher.Form>
          <Link
            to={`/?guild=${mapping.guild_id}&edit=${mapping.id}`}
            className="text-xs px-2 py-1 border-2 border-stone-700 bg-stone-800 text-stone-300 hover:bg-stone-700"
          >
            edit
          </Link>
          <deleteFetcher.Form
            method="post"
            onSubmit={(e) => {
              if (!confirm("Delete this mapping?")) e.preventDefault();
            }}
          >
            <input type="hidden" name="intent" value="delete-mapping" />
            <input type="hidden" name="id" value={mapping.id} />
            <button
              type="submit"
              className="text-xs px-2 py-1 border-2 border-red-700 bg-stone-800 text-red-300 hover:bg-red-900"
            >
              delete
            </button>
          </deleteFetcher.Form>
        </div>
      </div>
    </div>
  );
}

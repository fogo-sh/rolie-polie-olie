import { useFetcher } from "react-router";
import type { GuildChannel, Mapping, Role } from "../api.ts";
import { RoleSwatch } from "./ui.tsx";

interface Props {
  mapping: Mapping;
  /** Lookup map: roleId -> Role. Undefined when role isn't in current guild. */
  roleById: Map<string, Role>;
  /** Lookup map: channelId -> GuildChannel. */
  channelById: Map<string, GuildChannel>;
}

const MODE_BADGE: Record<Mapping["mode"], string> = {
  toggle: "bg-blue-900 text-blue-300",
  "add-only": "bg-green-900 text-green-300",
  "remove-on-unreact": "bg-orange-900 text-orange-300",
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
    <div className="border border-gray-700 rounded p-4 space-y-2">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1 min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg leading-none">{mapping.emoji_key}</span>
            <span className="text-gray-500">→</span>
            {role ? (
              <span className="flex items-center gap-1.5 text-sm">
                <RoleSwatch color={role.color} />
                <span className="text-gray-200">{role.name}</span>
              </span>
            ) : (
              <span className="text-sm text-gray-400 font-mono">
                role {mapping.role_id}
              </span>
            )}
            <span
              className={`text-xs px-2 py-0.5 rounded ${MODE_BADGE[mapping.mode]}`}
            >
              {mapping.mode}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            {channel && (
              <span className="text-gray-500">#{channel.name}</span>
            )}
            <a
              href={mapping.message_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-400 hover:underline truncate"
            >
              view message ↗
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
              className={`text-xs px-2 py-1 rounded ${
                enabled
                  ? "bg-green-800 text-green-300 hover:bg-green-700"
                  : "bg-gray-700 text-gray-400 hover:bg-gray-600"
              }`}
            >
              {enabled ? "Enabled" : "Disabled"}
            </button>
          </toggleFetcher.Form>
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
              className="text-xs px-2 py-1 rounded bg-red-900 text-red-300 hover:bg-red-800"
            >
              Delete
            </button>
          </deleteFetcher.Form>
        </div>
      </div>
    </div>
  );
}

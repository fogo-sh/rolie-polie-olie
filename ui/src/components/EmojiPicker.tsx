import { useState } from "react";
import type { GuildEmoji, MessageReaction } from "../api.ts";
import { inputClass } from "./ui.tsx";

interface Props {
  /** Name for the hidden input that carries the canonical emoji key. */
  name: string;
  /** Controlled value of the picker (the canonical emoji key). */
  value: string;
  /** Called when the user picks a different emoji. */
  onChange: (next: string) => void;
  /** Emojis already reacted to the loaded message, if any. */
  reactions?: MessageReaction[];
  /** All guild custom emojis available to the bot. */
  guildEmojis?: GuildEmoji[];
}

// Stable empty-array defaults so prop-equality short-circuits in memoised
// children (and so React Doctor doesn't flag a new reference per render).
const NO_REACTIONS: MessageReaction[] = [];
const NO_GUILD_EMOJIS: GuildEmoji[] = [];

/**
 * Renders a multi-source emoji picker with three input modes:
 *   1. Quick-pick pills for reactions already on the loaded message
 *   2. A searchable grid of the guild's custom emojis
 *   3. A free-text input for anything else (unicode or `<:name:id>` keys)
 *
 * The picker is fully controlled — owning components (e.g. a TanStack Form
 * field) hold the value and pass an onChange. The hidden input keeps the
 * value present in any native form submissions too.
 */
export function EmojiPicker({
  name,
  value,
  onChange,
  reactions = NO_REACTIONS,
  guildEmojis = NO_GUILD_EMOJIS,
}: Props) {
  // Inline custom search across guild emojis. Tiny query, so we filter
  // client-side; debouncing is unnecessary.
  const [query, setQuery] = useState("");

  const filteredGuild = query
    ? guildEmojis.filter((e) =>
        e.name.toLowerCase().includes(query.toLowerCase()),
      )
    : guildEmojis;

  const selectedReaction = reactions.find((r) => r.key === value);
  const selectedGuildEmoji = guildEmojis.find((e) => e.key === value);
  const selectedImage = selectedReaction?.url ?? selectedGuildEmoji?.url;

  return (
    <div className="space-y-3">
      <input type="hidden" name={name} value={value} required />

      {reactions.length > 0 && (
        <div>
          <div className="text-xs text-stone-400 mb-2">
            Already on the message. Pick one:
          </div>
          <div className="flex flex-wrap gap-2">
            {reactions.map((r) => (
              <EmojiChip
                key={r.key}
                selected={r.key === value}
                onClick={() => onChange(r.key)}
                imageUrl={r.url}
                label={r.name || r.key}
                badge={r.count > 1 ? r.count : undefined}
              />
            ))}
          </div>
        </div>
      )}

      {guildEmojis.length > 0 && (
        <details className="text-sm">
          <summary className="text-xs text-stone-400 cursor-pointer hover:text-stone-300">
            Server custom emojis ({guildEmojis.length})
          </summary>
          <div className="mt-2 space-y-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name"
              className={inputClass}
            />
            <div className="max-h-48 overflow-y-auto grid grid-cols-8 gap-1 p-1 bg-stone-950 border-2 border-stone-800">
              {filteredGuild.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => onChange(e.key)}
                  title={`:${e.name}:`}
                  className={`p-1.5 hover:bg-stone-800 border-2 ${
                    e.key === value
                      ? "border-amber-500 bg-stone-800"
                      : "border-transparent"
                  }`}
                >
                  <img
                    src={e.url}
                    alt={e.name}
                    className="size-6 mx-auto"
                  />
                </button>
              ))}
              {filteredGuild.length === 0 && (
                <div className="col-span-8 text-xs text-stone-500 text-center py-4">
                  Nothing matches.
                </div>
              )}
            </div>
          </div>
        </details>
      )}

      <details className="text-sm">
        <summary className="text-xs text-stone-400 cursor-pointer hover:text-stone-300">
          Type it instead
        </summary>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`mt-2 ${inputClass}`}
          placeholder="👍 or <:name:123456>"
        />
        <p className="text-xs text-stone-500 mt-1">
          Paste a unicode character, or a custom emoji in{" "}
          <code>&lt;:name:id&gt;</code> form (animated:{" "}
          <code>&lt;a:name:id&gt;</code>).
        </p>
      </details>

      {value && (
        <div className="text-xs flex items-center gap-2 text-stone-300">
          <span className="text-stone-500">Picked:</span>
          {selectedImage ? (
            <img src={selectedImage} alt="" className="size-5" />
          ) : (
            <span className="text-base">{value}</span>
          )}
          <code className="text-stone-400">{value}</code>
        </div>
      )}
    </div>
  );
}

function EmojiChip({
  selected,
  onClick,
  imageUrl,
  label,
  badge,
}: {
  selected: boolean;
  onClick: () => void;
  imageUrl: string | null;
  label: string;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2 py-1 text-sm border-2 ${
        selected
          ? "bg-amber-600 text-stone-950 border-amber-400"
          : "bg-stone-800 hover:bg-stone-700 text-stone-200 border-stone-700"
      }`}
    >
      {imageUrl ? (
        <img src={imageUrl} alt="" className="size-5" />
      ) : (
        <span className="text-base leading-none">{label}</span>
      )}
      {badge !== undefined && (
        <span className="text-xs text-stone-400">{badge}</span>
      )}
    </button>
  );
}

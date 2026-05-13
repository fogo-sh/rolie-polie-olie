import { useState } from "react";

const CUSTOM_EMOJI_RE = /^<(a)?:([^:]+):(\d+)>$/;

interface ParsedEmoji {
  kind: "custom" | "unicode";
  /** Image URL for custom emoji, null for unicode. */
  url: string | null;
  /** Human-friendly name (`:name:` for custom, the character for unicode). */
  display: string;
}

/**
 * Parse a stored emoji_key into something renderable.
 *
 * Custom:   `<:name:123>`  or `<a:name:123>`  → CDN image URL
 * Unicode:  raw character(s)                  → just shown as text
 */
export function parseEmojiKey(key: string): ParsedEmoji {
  const m = key.match(CUSTOM_EMOJI_RE);
  if (m) {
    const animated = m[1] === "a";
    const name = m[2];
    const id = m[3];
    return {
      kind: "custom",
      url: `https://cdn.discordapp.com/emojis/${id}.${animated ? "gif" : "png"}?size=32`,
      display: `:${name}:`,
    };
  }
  return { kind: "unicode", url: null, display: key };
}

/**
 * Render an emoji from its stored key, with click-to-copy. Clicking copies the
 * raw key (e.g. `<:name:123>`) to the clipboard and briefly shows "Copied".
 */
export function EmojiDisplay({
  emojiKey,
  className = "",
}: {
  emojiKey: string;
  className?: string;
}) {
  const parsed = parseEmojiKey(emojiKey);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(emojiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard unavailable (e.g. insecure context); silently no-op.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={`Click to copy: ${emojiKey}`}
      className={`group inline-flex items-center gap-1 px-1 -mx-1 hover:bg-stone-800 cursor-pointer ${className}`}
    >
      {parsed.kind === "custom" && parsed.url ? (
        <img src={parsed.url} alt={parsed.display} className="w-5 h-5" />
      ) : (
        <span className="text-lg leading-none">{parsed.display}</span>
      )}
      <span
        className={`text-[10px] uppercase tracking-wide transition-opacity ${
          copied
            ? "text-amber-400 opacity-100"
            : "text-stone-500 opacity-0 group-hover:opacity-100"
        }`}
      >
        {copied ? "copied" : "copy"}
      </span>
    </button>
  );
}

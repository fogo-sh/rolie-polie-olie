/**
 * Build the canonical emoji key used in the database and Discord API calls.
 *
 * - Unicode emoji: the raw character(s), e.g. "👍"
 * - Custom emoji:  "<:name:id>"
 * - Animated:      "<a:name:id>"
 *
 * Discord's `react()` and reaction-equality checks accept any of these forms.
 */
export function emojiKey(emoji: {
  id?: string | null;
  name?: string | null;
  animated?: boolean | null;
}): string {
  if (!emoji.id) return emoji.name ?? "";
  return `<${emoji.animated ? "a" : ""}:${emoji.name}:${emoji.id}>`;
}

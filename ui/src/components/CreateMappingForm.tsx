import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import {
  api,
  type GuildEmoji,
  type MessageInspect,
  type Role,
} from "../api.ts";
import { Field, inputClass, RoleSwatch } from "./ui.tsx";
import { EmojiPicker } from "./EmojiPicker.tsx";

interface Props {
  roles: Role[];
  guildEmojis: GuildEmoji[];
}

interface ActionResult {
  ok: boolean;
  error?: string;
}

const MESSAGE_URL_RE =
  /^https?:\/\/(?:[a-z]+\.)?discord\.com\/channels\/\d+\/\d+\/\d+$/i;

type InspectState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; data: MessageInspect }
  | { kind: "error"; message: string };

export function CreateMappingForm({ roles, guildEmojis }: Props) {
  const fetcher = useFetcher<ActionResult>();
  const isSubmitting = fetcher.state === "submitting";
  const formError = fetcher.data?.ok === false ? fetcher.data.error : undefined;

  const [messageUrl, setMessageUrl] = useState("");
  const [inspect, setInspect] = useState<InspectState>({ kind: "idle" });

  // Debounced live preview: ~400ms after the URL stops changing, inspect it.
  useEffect(() => {
    const trimmed = messageUrl.trim();
    if (!trimmed) {
      setInspect({ kind: "idle" });
      return;
    }
    if (!MESSAGE_URL_RE.test(trimmed)) {
      setInspect({ kind: "idle" });
      return;
    }

    let cancelled = false;
    setInspect({ kind: "loading" });
    const t = setTimeout(async () => {
      try {
        const res = await api.api.messages.inspect.$get({
          query: { url: trimmed },
        });
        if (cancelled) return;
        if (!res.ok) {
          const body = (await res.json()) as { error?: string };
          setInspect({
            kind: "error",
            message: body.error ?? `Failed (${res.status})`,
          });
          return;
        }
        const data = await res.json();
        setInspect({ kind: "ok", data });
      } catch (e) {
        if (cancelled) return;
        setInspect({
          kind: "error",
          message: e instanceof Error ? e.message : "Failed to load message",
        });
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [messageUrl]);

  // Reset the form after a successful submission. The loader-driven mappings
  // list will repopulate from the action's revalidation.
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) {
      setMessageUrl("");
      setInspect({ kind: "idle" });
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <section className="bg-stone-900 border-2 border-stone-700 p-6 space-y-4">
      <h2 className="text-lg font-semibold">New mapping</h2>
      {formError && (
        <div className="bg-stone-900 border-2 border-red-700 text-red-300 px-4 py-3 text-sm">
          {formError}
        </div>
      )}
      {/* keyed on fetcher.data so the form remounts after a successful create,
          clearing the emoji picker / role select to default values */}
      <fetcher.Form
        key={fetcher.data?.ok ? `ok-${Date.now()}` : "form"}
        method="post"
        className="space-y-4"
      >
        <input type="hidden" name="intent" value="create-mapping" />

        <Field label="Message link">
          <input
            type="text"
            name="message_url"
            required
            value={messageUrl}
            onChange={(e) => setMessageUrl(e.target.value)}
            className={inputClass}
            placeholder="https://discord.com/channels/123/456/789"
          />
          <InspectStatus state={inspect} />
        </Field>

        <Field label="Emoji">
          <EmojiPicker
            name="emoji_key"
            reactions={inspect.kind === "ok" ? inspect.data.reactions : []}
            guildEmojis={guildEmojis}
          />
        </Field>

        <Field label="Role">
          {roles.length === 0 ? (
            <p className="text-sm text-amber-400">
              No roles to show. The bot might not be in this server yet.
            </p>
          ) : (
            <RoleSelect roles={roles} />
          )}
        </Field>

        <Field label="Mode">
          <select name="mode" defaultValue="toggle" className={inputClass}>
            <option value="toggle">toggle: add on react, remove on unreact</option>
            <option value="add-only">add only: never takes the role back</option>
            <option value="remove-on-unreact">
              remove on unreact: only takes the role away
            </option>
          </select>
        </Field>

        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked
              className="w-4 h-4 accent-amber-500"
            />
            <span className="text-sm">Enabled</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              name="add_reaction"
              className="w-4 h-4 accent-amber-500"
            />
            <span className="text-sm">Have the bot react too</span>
          </label>
        </div>

        <button
          type="submit"
          disabled={isSubmitting || roles.length === 0}
          className="bg-amber-600 hover:bg-amber-500 text-stone-950 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-2 text-sm font-medium border-2 border-amber-400"
        >
          {isSubmitting ? "Saving" : "Save mapping"}
        </button>
      </fetcher.Form>
    </section>
  );
}

function InspectStatus({ state }: { state: InspectState }) {
  switch (state.kind) {
    case "idle":
      return null;
    case "loading":
      return <p className="text-xs text-stone-500 mt-1">Checking the link</p>;
    case "error":
      return <p className="text-xs text-red-400 mt-1">{state.message}</p>;
    case "ok": {
      const n = state.data.reactions.length;
      return (
        <p className="text-xs text-amber-400 mt-1">
          Found it in{" "}
          <span className="text-stone-300">#{state.data.channel_name}</span>
          {n > 0 && `. ${n} reaction${n === 1 ? "" : "s"} already there.`}
        </p>
      );
    }
  }
}

/**
 * Native <select> elements can't render arbitrary HTML, so the color swatch
 * lives in a small companion preview next to the dropdown.
 */
function RoleSelect({ roles }: { roles: Role[] }) {
  const [selectedId, setSelectedId] = useState(roles[0]?.id ?? "");
  const selected = roles.find((r) => r.id === selectedId);
  return (
    <div className="flex items-center gap-2">
      {selected && <RoleSwatch color={selected.color} />}
      <select
        name="role_id"
        required
        className={inputClass}
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
      >
        {roles.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
    </div>
  );
}

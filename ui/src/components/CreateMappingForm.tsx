import { useForm, useStore } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router";
import { messageInspectQuery, useCreateMapping, useUpdateMapping } from "../queries.ts";
import { Field, inputClass, RoleSwatch } from "./ui.tsx";
import { EmojiPicker } from "./EmojiPicker.tsx";
import type { GuildEmoji, Mapping, MessageInspect, Role } from "../api.ts";

interface Props {
  roles: Role[];
  guildEmojis: GuildEmoji[];
  /** If set, the form is in edit mode and prefilled from this mapping. */
  editing?: Mapping;
}

type Mode = Mapping["mode"];

interface FormValues {
  message_url: string;
  emoji_key: string;
  role_id: string;
  mode: Mode;
  enabled: boolean;
  add_reaction: boolean;
}

const MESSAGE_URL_RE = /^https?:\/\/(?:[a-z]+\.)?discord\.com\/channels\/\d+\/\d+\/\d+$/i;

export function CreateMappingForm({ roles, guildEmojis, editing }: Props) {
  const isEdit = !!editing;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const guildParam = searchParams.get("guild") ?? editing?.guild_id ?? "";

  const createMapping = useCreateMapping();
  const updateMapping = useUpdateMapping();
  const mutationError = isEdit ? updateMapping.error : createMapping.error;

  const form = useForm({
    defaultValues: {
      message_url: editing?.message_url ?? "",
      emoji_key: editing?.emoji_key ?? "",
      role_id: editing?.role_id ?? roles[0]?.id ?? "",
      mode: (editing?.mode ?? "toggle") as Mode,
      enabled: editing ? !!editing.enabled : true,
      add_reaction: false,
    } as FormValues,
    onSubmit: async ({ value, formApi }) => {
      if (isEdit) {
        await updateMapping.mutateAsync({
          id: editing!.id,
          patch: {
            emoji_key: value.emoji_key,
            role_id: value.role_id,
            mode: value.mode,
            enabled: value.enabled,
          },
        });
        // Drop ?edit so we land back on the list view.
        navigate(guildParam ? `/?guild=${guildParam}` : "/");
      } else {
        await createMapping.mutateAsync(value);
        formApi.reset();
      }
    },
  });

  // Watch the message_url field so the inspect query reruns as the user types.
  const messageUrlValue = useStore(form.store, (s) => s.values.message_url);
  const inspect = useQuery(messageInspectQuery(messageUrlValue.trim()));

  return (
    <section className="bg-stone-900 border-2 border-stone-700 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{isEdit ? "Edit mapping" : "New mapping"}</h2>
        {isEdit && (
          <Link
            to={guildParam ? `/?guild=${guildParam}` : "/"}
            className="text-xs text-stone-400 hover:text-stone-200 underline"
          >
            cancel
          </Link>
        )}
      </div>

      {mutationError && (
        <div
          role="alert"
          className="bg-stone-900 border-2 border-red-700 text-red-300 px-4 py-3 text-sm"
        >
          {mutationError instanceof Error ? mutationError.message : "Something went wrong"}
        </div>
      )}

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
      >
        <form.Field
          name="message_url"
          validators={{
            onChange: ({ value }) =>
              !value
                ? "Message link is required"
                : !MESSAGE_URL_RE.test(value)
                  ? "Must be a Discord message link"
                  : undefined,
          }}
        >
          {(field) => (
            <Field id="message-url" label="Message link">
              {isEdit ? (
                <div className="text-sm font-mono text-stone-400 break-all">
                  {field.state.value}
                </div>
              ) : (
                <input
                  id="message-url"
                  type="text"
                  className={inputClass}
                  placeholder="https://discord.com/channels/123/456/789"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              )}
              <InspectStatus state={inspectStatusFromQuery(messageUrlValue, inspect)} />
            </Field>
          )}
        </form.Field>

        <form.Field
          name="emoji_key"
          validators={{
            onChange: ({ value }) => (!value ? "Emoji is required" : undefined),
          }}
        >
          {(field) => (
            <Field id="emoji-key" label="Emoji">
              <EmojiPicker
                name="emoji_key"
                value={field.state.value}
                onChange={field.handleChange}
                reactions={inspect.data?.reactions ?? []}
                guildEmojis={guildEmojis}
              />
            </Field>
          )}
        </form.Field>

        <form.Field name="role_id">
          {(field) =>
            roles.length === 0 ? (
              <Field id="role-id" label="Role">
                <p className="text-sm text-amber-400">
                  No roles to show. The bot might not be in this server yet.
                </p>
              </Field>
            ) : (
              <Field id="role-id" label="Role">
                <RoleSelect
                  roles={roles}
                  value={field.state.value || roles[0].id}
                  onChange={field.handleChange}
                />
              </Field>
            )
          }
        </form.Field>

        <form.Field name="mode">
          {(field) => (
            <Field id="mode" label="Mode">
              <select
                id="mode"
                className={inputClass}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value as Mode)}
              >
                <option value="toggle">toggle: add on react, remove on unreact</option>
                <option value="add-only">add only: never takes the role back</option>
                <option value="remove-on-unreact">
                  remove on unreact: only takes the role away
                </option>
              </select>
            </Field>
          )}
        </form.Field>

        <div className="flex items-center gap-6">
          <form.Field name="enabled">
            {(field) => (
              <Checkbox
                id="enabled"
                label="Enabled"
                checked={field.state.value}
                onChange={field.handleChange}
              />
            )}
          </form.Field>
          {!isEdit && (
            <form.Field name="add_reaction">
              {(field) => (
                <Checkbox
                  id="add-reaction"
                  label="Have the bot react too"
                  checked={field.state.value}
                  onChange={field.handleChange}
                />
              )}
            </form.Field>
          )}
        </div>

        <form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting] as const}>
          {([canSubmit, isSubmitting]) => (
            <button
              type="submit"
              disabled={!canSubmit || roles.length === 0}
              className="bg-amber-600 hover:bg-amber-500 text-stone-950 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-2 text-sm font-medium border-2 border-amber-400"
            >
              {isSubmitting ? "Saving" : isEdit ? "Save changes" : "Save mapping"}
            </button>
          )}
        </form.Subscribe>
      </form>
    </section>
  );
}

// --- helpers ---

type InspectStatusKind =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; data: MessageInspect }
  | { kind: "error"; message: string };

function inspectStatusFromQuery(
  url: string,
  q: { isFetching: boolean; data: MessageInspect | undefined; error: Error | null },
): InspectStatusKind {
  if (!url || !MESSAGE_URL_RE.test(url)) return { kind: "idle" };
  if (q.isFetching && !q.data) return { kind: "loading" };
  if (q.error) {
    return {
      kind: "error",
      message: q.error instanceof Error ? q.error.message : "Failed to load",
    };
  }
  if (q.data) return { kind: "ok", data: q.data };
  return { kind: "idle" };
}

function InspectStatus({ state }: { state: InspectStatusKind }) {
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
          Found it in <span className="text-stone-300">#{state.data.channel_name}</span>
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
function RoleSelect({
  roles,
  value,
  onChange,
}: {
  roles: Role[];
  value: string;
  onChange: (next: string) => void;
}) {
  const selected = roles.find((r) => r.id === value);
  return (
    <div className="flex items-center gap-2">
      {selected && <RoleSwatch color={selected.color} />}
      <select
        id="role-id"
        required
        className={inputClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
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

function Checkbox({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 cursor-pointer">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-amber-500"
      />
      <span className="text-sm">{label}</span>
    </label>
  );
}

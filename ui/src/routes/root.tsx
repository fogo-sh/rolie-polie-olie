import {
  Form,
  useFetcher,
  useLoaderData,
  useNavigation,
  redirect,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  type RouteObject,
} from "react-router";
import {
  api,
  unwrap,
  type Guild,
  type Mapping,
  type Me,
  type Role,
} from "../api.ts";

interface AuthedData {
  authed: true;
  user: Me;
  guilds: Guild[];
  mappings: Mapping[];
  roles: Role[];
  selectedGuild: string;
  error?: string;
}

interface UnauthedData {
  authed: false;
  loginError?: string;
}

type LoaderData = AuthedData | UnauthedData;

const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  not_authorized: "Your Discord account isn't on the admin allowlist.",
  invalid_state: "Login session expired. Please try again.",
  missing_params: "Discord didn't return a code. Please try again.",
  token_exchange_failed: "Couldn't exchange the OAuth code with Discord.",
  user_fetch_failed: "Couldn't fetch your Discord profile.",
};

async function loader({ request }: LoaderFunctionArgs): Promise<LoaderData> {
  const url = new URL(request.url);
  const loginErrorCode = url.searchParams.get("login_error");
  const loginError = loginErrorCode
    ? (LOGIN_ERROR_MESSAGES[loginErrorCode] ?? loginErrorCode)
    : undefined;

  // Check session.
  const meRes = await api.api.auth.me.$get();
  if (!meRes.ok) {
    return { authed: false, loginError };
  }
  const me = await meRes.json();

  const selectedGuildParam = url.searchParams.get("guild") ?? "";

  try {
    const [guilds, mappings] = await Promise.all([
      api.api.guilds.$get().then(unwrap),
      api.api.mappings.$get({ query: {} }).then(unwrap),
    ]);

    const selectedGuild =
      selectedGuildParam || (guilds.length > 0 ? guilds[0].id : "");

    let roles: Role[] = [];
    if (selectedGuild) {
      try {
        const res = await api.api.guilds[":guildId"].roles.$get({
          param: { guildId: selectedGuild },
        });
        if (res.ok) roles = await res.json();
      } catch {
        // Roles fetch failures are non-fatal; the form just won't have options.
      }
    }

    return {
      authed: true,
      user: me,
      guilds,
      mappings,
      roles,
      selectedGuild,
    };
  } catch (e) {
    return {
      authed: true,
      user: me,
      guilds: [],
      mappings: [],
      roles: [],
      selectedGuild: "",
      error: e instanceof Error ? e.message : "Failed to load data",
    };
  }
}

interface ActionResult {
  ok: boolean;
  error?: string;
}

async function action({ request }: ActionFunctionArgs): Promise<ActionResult | Response> {
  const formData = await request.formData();
  const intent = formData.get("intent");

  switch (intent) {
    case "logout": {
      await api.api.auth.logout.$post();
      return redirect("/");
    }

    case "create-mapping": {
      try {
        await api.api.mappings
          .$post({
            json: {
              message_url: String(formData.get("message_url") ?? ""),
              emoji_key: String(formData.get("emoji_key") ?? ""),
              role_id: String(formData.get("role_id") ?? ""),
              mode: formData.get("mode") as
                | "toggle"
                | "add-only"
                | "remove-on-unreact",
              enabled: formData.get("enabled") === "on",
              add_reaction: formData.get("add_reaction") === "on",
            },
          })
          .then(unwrap);
        return { ok: true };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "Failed to create mapping",
        };
      }
    }

    case "toggle-mapping": {
      const id = Number(formData.get("id"));
      const enabled = formData.get("enabled") === "true";
      await api.api.mappings[":id"]
        .$patch({ param: { id: String(id) }, json: { enabled } })
        .then(unwrap);
      return { ok: true };
    }

    case "delete-mapping": {
      const id = Number(formData.get("id"));
      await api.api.mappings[":id"]
        .$delete({ param: { id: String(id) } })
        .then(unwrap);
      return { ok: true };
    }

    default:
      return { ok: false, error: `Unknown intent: ${intent}` };
  }
}

function Layout({
  user,
  children,
}: {
  user?: Me;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-indigo-400">roliep-polie-olie</h1>
          <p className="text-sm text-gray-400">Discord reaction-role manager</p>
        </div>
        {user && (
          <div className="flex items-center gap-3 text-sm">
            <div className="flex items-center gap-2">
              {user.avatar && (
                <img
                  src={`https://cdn.discordapp.com/avatars/${user.user_id}/${user.avatar}.png?size=32`}
                  alt=""
                  className="w-7 h-7 rounded-full"
                />
              )}
              <span className="text-gray-300">{user.username}</span>
            </div>
            <Form method="post">
              <input type="hidden" name="intent" value="logout" />
              <button
                type="submit"
                className="text-xs px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 border border-gray-700"
              >
                Sign out
              </button>
            </Form>
          </div>
        )}
      </header>
      <main className="max-w-4xl mx-auto px-6 py-8 space-y-8">{children}</main>
    </div>
  );
}

function LoginScreen({ loginError }: { loginError?: string }) {
  return (
    <Layout>
      <section className="bg-gray-900 rounded-lg p-8 space-y-4 text-center">
        <h2 className="text-lg font-semibold">Sign in</h2>
        <p className="text-sm text-gray-400">
          Sign in with Discord to manage reaction-role mappings.
        </p>
        {loginError && (
          <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded text-sm">
            {loginError}
          </div>
        )}
        <a
          href="/api/auth/discord/login"
          className="inline-block bg-indigo-600 hover:bg-indigo-500 px-6 py-2 rounded text-sm font-medium"
        >
          Continue with Discord
        </a>
      </section>
    </Layout>
  );
}

function GuildList({
  guilds,
  selectedGuild,
}: {
  guilds: Guild[];
  selectedGuild: string;
}) {
  return (
    <section className="bg-gray-900 rounded-lg p-6 space-y-3">
      <h2 className="text-lg font-semibold">Connected Guilds</h2>
      {guilds.length === 0 ? (
        <p className="text-gray-400 text-sm">
          No guilds found. Add the bot to a server first.
        </p>
      ) : (
        <div className="space-y-2">
          {guilds.map((g) => {
            const isSelected = selectedGuild === g.id;
            return (
              <Form
                method="get"
                key={g.id}
                replace
                className={`flex items-center justify-between p-3 rounded border cursor-pointer transition-colors ${
                  isSelected
                    ? "border-indigo-500 bg-indigo-900/20"
                    : "border-gray-700 hover:border-gray-600"
                }`}
              >
                <input type="hidden" name="guild" value={g.id} />
                <button type="submit" className="flex-1 text-left">
                  <div className="font-medium">{g.name}</div>
                  <div className="text-xs text-gray-400">{g.id}</div>
                </button>
                {isSelected && (
                  <span className="text-xs text-indigo-400">Selected</span>
                )}
              </Form>
            );
          })}
        </div>
      )}
    </section>
  );
}

function CreateMappingForm({ roles }: { roles: Role[] }) {
  const fetcher = useFetcher<ActionResult>();
  const isSubmitting = fetcher.state === "submitting";
  const formError = fetcher.data?.ok === false ? fetcher.data.error : undefined;

  return (
    <section className="bg-gray-900 rounded-lg p-6 space-y-4">
      <h2 className="text-lg font-semibold">Create Reaction-Role Mapping</h2>
      {formError && (
        <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded text-sm">
          {formError}
        </div>
      )}
      <fetcher.Form method="post" className="space-y-4">
        <input type="hidden" name="intent" value="create-mapping" />

        <Field label="Discord Message URL">
          <input
            type="text"
            name="message_url"
            required
            className={inputClass}
            placeholder="https://discord.com/channels/123/456/789"
          />
        </Field>

        <Field
          label="Emoji"
          hint={
            <>
              For unicode: paste the emoji. For custom: use{" "}
              <code>&lt;:name:id&gt;</code> format.
            </>
          }
        >
          <input
            type="text"
            name="emoji_key"
            required
            className={inputClass}
            placeholder="👍 or <:custom:123456>"
          />
        </Field>

        <Field label="Role">
          {roles.length === 0 ? (
            <p className="text-sm text-yellow-400">
              No roles available. Make sure the bot has access to this guild.
            </p>
          ) : (
            <select name="role_id" required className={inputClass}>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field label="Mode">
          <select name="mode" defaultValue="toggle" className={inputClass}>
            <option value="toggle">Toggle (add on react, remove on unreact)</option>
            <option value="add-only">Add only (never removes role)</option>
            <option value="remove-on-unreact">Remove on unreact</option>
          </select>
        </Field>

        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked
              className="w-4 h-4 accent-indigo-500"
            />
            <span className="text-sm">Enabled</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              name="add_reaction"
              className="w-4 h-4 accent-indigo-500"
            />
            <span className="text-sm">Add bot reaction to message</span>
          </label>
        </div>

        <button
          type="submit"
          disabled={isSubmitting || roles.length === 0}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-2 rounded text-sm font-medium"
        >
          {isSubmitting ? "Creating..." : "Create Mapping"}
        </button>
      </fetcher.Form>
    </section>
  );
}

function MappingRow({ mapping }: { mapping: Mapping }) {
  const toggleFetcher = useFetcher();
  const deleteFetcher = useFetcher();

  // Optimistic enabled state.
  const enabled = toggleFetcher.formData
    ? toggleFetcher.formData.get("enabled") === "true"
    : !!mapping.enabled;

  // Hide the row immediately on delete submission.
  if (deleteFetcher.state !== "idle") return null;

  return (
    <div className="border border-gray-700 rounded p-4 space-y-2">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg">{mapping.emoji_key}</span>
            <span className="text-sm text-gray-400">→ role {mapping.role_id}</span>
            <span
              className={`text-xs px-2 py-0.5 rounded ${
                mapping.mode === "toggle"
                  ? "bg-blue-900 text-blue-300"
                  : mapping.mode === "add-only"
                    ? "bg-green-900 text-green-300"
                    : "bg-orange-900 text-orange-300"
              }`}
            >
              {mapping.mode}
            </span>
          </div>
          <a
            href={mapping.message_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-indigo-400 hover:underline truncate block"
          >
            {mapping.message_url}
          </a>
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

function MappingsList({ mappings }: { mappings: Mapping[] }) {
  return (
    <section className="bg-gray-900 rounded-lg p-6 space-y-3">
      <h2 className="text-lg font-semibold">Reaction-Role Mappings</h2>
      {mappings.length === 0 ? (
        <p className="text-gray-400 text-sm">No mappings yet.</p>
      ) : (
        <div className="space-y-2">
          {mappings.map((m) => (
            <MappingRow key={m.id} mapping={m} />
          ))}
        </div>
      )}
    </section>
  );
}

function Component() {
  const data = useLoaderData() as LoaderData;
  const navigation = useNavigation();
  const isLoading = navigation.state === "loading";

  if (!data.authed) {
    return <LoginScreen loginError={data.loginError} />;
  }

  const { user, guilds, mappings, roles, selectedGuild, error } = data;

  return (
    <Layout user={user}>
      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {isLoading && <p className="text-gray-400">Loading...</p>}

      {!isLoading && (
        <>
          <GuildList guilds={guilds} selectedGuild={selectedGuild} />
          {selectedGuild && <CreateMappingForm roles={roles} />}
          <MappingsList mappings={mappings} />
        </>
      )}
    </Layout>
  );
}

const inputClass =
  "w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-1">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  );
}

export const rootRoute: RouteObject = {
  path: "/",
  loader,
  action,
  Component,
};

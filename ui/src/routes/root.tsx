import {
  Form,
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
  type GuildChannel,
  type GuildEmoji,
  type Mapping,
  type Me,
  type Role,
} from "../api.ts";
import { CreateMappingForm } from "../components/CreateMappingForm.tsx";
import { MappingRow } from "../components/MappingRow.tsx";

interface AuthedData {
  authed: true;
  user: Me;
  guilds: Guild[];
  mappings: Mapping[];
  roles: Role[];
  guildEmojis: GuildEmoji[];
  channels: GuildChannel[];
  selectedGuild: string;
  /** When the URL has ?edit=<id>, the mapping being edited. */
  editing?: Mapping;
  error?: string;
}

interface UnauthedData {
  authed: false;
  loginError?: string;
}

type LoaderData = AuthedData | UnauthedData;

const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  not_authorized: "Your Discord account isn't on the allowlist for this bot.",
  invalid_state: "That login link expired. Try again.",
  missing_params: "Discord didn't send back a code. Try again.",
  token_exchange_failed: "Discord rejected the login. Try again.",
  user_fetch_failed: "Couldn't read your Discord profile. Try again.",
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
  const editIdParam = url.searchParams.get("edit");
  const editId = editIdParam ? Number(editIdParam) : null;

  try {
    const [guilds, mappings] = await Promise.all([
      api.api.guilds.$get().then(unwrap),
      api.api.mappings.$get({ query: {} }).then(unwrap),
    ]);

    // If we're editing, the mapping's guild wins over the query param so the
    // right roles/emojis/channels load even if the user navigated via a bare
    // /?edit=<id> URL.
    const editing =
      editId !== null ? mappings.find((m) => m.id === editId) : undefined;
    const selectedGuild =
      editing?.guild_id ||
      selectedGuildParam ||
      (guilds.length > 0 ? guilds[0].id : "");

    let roles: Role[] = [];
    let guildEmojis: GuildEmoji[] = [];
    let channels: GuildChannel[] = [];

    if (selectedGuild) {
      // Load guild-scoped reference data in parallel. Each is non-fatal —
      // if any fails, that part of the UI just won't decorate.
      const [rolesRes, emojisRes, channelsRes] = await Promise.allSettled([
        api.api.guilds[":guildId"].roles.$get({
          param: { guildId: selectedGuild },
        }),
        api.api.guilds[":guildId"].emojis.$get({
          param: { guildId: selectedGuild },
        }),
        api.api.guilds[":guildId"].channels.$get({
          param: { guildId: selectedGuild },
        }),
      ]);
      if (rolesRes.status === "fulfilled" && rolesRes.value.ok) {
        roles = await rolesRes.value.json();
      }
      if (emojisRes.status === "fulfilled" && emojisRes.value.ok) {
        guildEmojis = await emojisRes.value.json();
      }
      if (channelsRes.status === "fulfilled" && channelsRes.value.ok) {
        channels = await channelsRes.value.json();
      }
    }

    return {
      authed: true,
      user: me,
      guilds,
      mappings,
      roles,
      guildEmojis,
      channels,
      selectedGuild,
      editing,
    };
  } catch (e) {
    return {
      authed: true,
      user: me,
      guilds: [],
      mappings: [],
      roles: [],
      guildEmojis: [],
      channels: [],
      selectedGuild: "",
      error: e instanceof Error ? e.message : "Failed to load data",
    };
  }
}

interface ActionResult {
  ok: boolean;
  error?: string;
}

async function action({
  request,
}: ActionFunctionArgs): Promise<ActionResult | Response> {
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

    case "update-mapping": {
      const id = Number(formData.get("id"));
      if (Number.isNaN(id)) {
        return { ok: false, error: "Missing mapping id" };
      }
      try {
        await api.api.mappings[":id"]
          .$patch({
            param: { id: String(id) },
            json: {
              emoji_key: String(formData.get("emoji_key") ?? ""),
              role_id: String(formData.get("role_id") ?? ""),
              mode: formData.get("mode") as
                | "toggle"
                | "add-only"
                | "remove-on-unreact",
              enabled: formData.get("enabled") === "on",
            },
          })
          .then(unwrap);
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "Failed to save changes",
        };
      }
      // Drop ?edit so the user lands back on the list view. Preserve ?guild
      // so the right guild stays selected.
      const url = new URL(request.url);
      const guildId = url.searchParams.get("guild") ?? "";
      return redirect(guildId ? `/?guild=${guildId}` : "/");
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
  busy = false,
  children,
}: {
  user?: Me;
  busy?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-stone-950 text-stone-100">
      <ProgressBar visible={busy} />
      <header className="border-b-2 border-stone-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <img src="/rpo.webp" alt="" className="w-12 h-16 object-cover" />
          <div>
            <h1 className="text-2xl font-bold text-amber-400">
              rolie-polie-olie
            </h1>
            <p className="text-sm text-stone-400">
              React to a message, get a role.
            </p>
          </div>
        </div>
        {user && (
          <div className="flex items-center gap-3 text-sm">
            <div className="flex items-center gap-2">
              {user.avatar && (
                <img
                  src={`https://cdn.discordapp.com/avatars/${user.user_id}/${user.avatar}.png?size=32`}
                  alt=""
                  className="w-7 h-7 border-2 border-stone-700"
                />
              )}
              <span className="text-stone-300">{user.username}</span>
            </div>
            <Form method="post">
              <input type="hidden" name="intent" value="logout" />
              <button
                type="submit"
                className="text-xs px-3 py-1.5 bg-stone-900 hover:bg-stone-800 border-2 border-stone-700"
              >
                Sign out
              </button>
            </Form>
          </div>
        )}
      </header>
      <main
        className={`max-w-4xl mx-auto px-6 py-8 space-y-8 transition-opacity duration-150 ${
          busy ? "opacity-60" : "opacity-100"
        }`}
        aria-busy={busy}
      >
        {children}
      </main>
    </div>
  );
}

/**
 * Indeterminate progress bar pinned to the top of the viewport. Stays
 * mounted but fades in/out so the activity hint doesn't flash for very
 * quick navigations.
 */
function ProgressBar({ visible }: { visible: boolean }) {
  return (
    <div
      aria-hidden
      className={`fixed top-0 left-0 right-0 h-0.5 bg-stone-800 overflow-hidden z-50 transition-opacity duration-150 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="rpo-progress-bar h-full w-1/4 bg-amber-500" />
    </div>
  );
}

function LoginScreen({ loginError }: { loginError?: string }) {
  return (
    <Layout>
      <section className="bg-stone-900 border-2 border-stone-700 p-8 space-y-4 text-center">
        <h2 className="text-lg font-semibold">Who are you?</h2>
        <p className="text-sm text-stone-400">
          Log in with Discord. The bot owner has to add your user ID to the
          allowlist before this works.
        </p>
        {loginError && (
          <div className="bg-stone-900 border-2 border-red-700 text-red-300 px-4 py-3 text-sm">
            {loginError}
          </div>
        )}
        <a
          href="/api/auth/discord/login"
          className="inline-block bg-amber-600 hover:bg-amber-500 text-stone-950 px-6 py-2 text-sm font-medium border-2 border-amber-400"
        >
          Log in with Discord
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
    <section className="bg-stone-900 border-2 border-stone-700 p-6 space-y-3">
      <h2 className="text-lg font-semibold">Servers</h2>
      {guilds.length === 0 ? (
        <p className="text-stone-400 text-sm">
          The bot isn't in any servers yet. Invite it to one and come back.
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
                className={`flex items-center justify-between p-3 border-2 cursor-pointer ${
                  isSelected
                    ? "border-amber-500 bg-stone-800"
                    : "border-stone-700 hover:border-stone-500"
                }`}
              >
                <input type="hidden" name="guild" value={g.id} />
                <button type="submit" className="flex-1 text-left">
                  <div className="font-medium">{g.name}</div>
                  <div className="text-xs text-stone-400">{g.id}</div>
                </button>
                {isSelected && (
                  <span className="text-xs text-amber-400">picked</span>
                )}
              </Form>
            );
          })}
        </div>
      )}
    </section>
  );
}

function MappingsList({
  mappings,
  roles,
  channels,
}: {
  mappings: Mapping[];
  roles: Role[];
  channels: GuildChannel[];
}) {
  const roleById = new Map(roles.map((r) => [r.id, r] as const));
  const channelById = new Map(channels.map((c) => [c.id, c] as const));

  return (
    <section className="bg-stone-900 border-2 border-stone-700 p-6 space-y-3">
      <h2 className="text-lg font-semibold">Mappings</h2>
      {mappings.length === 0 ? (
        <p className="text-stone-400 text-sm">Nothing here yet.</p>
      ) : (
        <div className="space-y-2">
          {mappings.map((m) => (
            <MappingRow
              key={m.id}
              mapping={m}
              roleById={roleById}
              channelById={channelById}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function Component() {
  const data = useLoaderData() as LoaderData;
  const navigation = useNavigation();
  // Treat both submissions and loader revalidations as "busy". The loader
  // returns the previous data while the next one resolves, so we keep the
  // current UI on screen and just hint that something is in flight with a
  // thin top-of-page bar plus a faded main area.
  const busy = navigation.state !== "idle";

  if (!data.authed) {
    return <LoginScreen loginError={data.loginError} />;
  }

  const {
    user,
    guilds,
    mappings,
    roles,
    guildEmojis,
    channels,
    selectedGuild,
    editing,
    error,
  } = data;

  return (
    <Layout user={user} busy={busy}>
      {error && (
        <div className="bg-stone-900 border-2 border-red-700 text-red-300 px-4 py-3">
          {error}
        </div>
      )}

      <GuildList guilds={guilds} selectedGuild={selectedGuild} />
      {selectedGuild && (
        <CreateMappingForm
          roles={roles}
          guildEmojis={guildEmojis}
          editing={editing}
        />
      )}
      <MappingsList mappings={mappings} roles={roles} channels={channels} />
    </Layout>
  );
}

export const rootRoute: RouteObject = {
  path: "/",
  loader,
  action,
  Component,
};

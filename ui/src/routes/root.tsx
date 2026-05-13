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
          <h1 className="text-2xl font-bold text-indigo-400">
            rolie-polie-olie
          </h1>
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
    <section className="bg-gray-900 rounded-lg p-6 space-y-3">
      <h2 className="text-lg font-semibold">Reaction-Role Mappings</h2>
      {mappings.length === 0 ? (
        <p className="text-gray-400 text-sm">No mappings yet.</p>
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
  const isLoading = navigation.state === "loading";

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
    error,
  } = data;

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
          {selectedGuild && (
            <CreateMappingForm roles={roles} guildEmojis={guildEmojis} />
          )}
          <MappingsList mappings={mappings} roles={roles} channels={channels} />
        </>
      )}
    </Layout>
  );
}

export const rootRoute: RouteObject = {
  path: "/",
  loader,
  action,
  Component,
};

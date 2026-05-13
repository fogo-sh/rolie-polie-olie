import {
  Form,
  useLoaderData,
  useSearchParams,
  type LoaderFunctionArgs,
  type RouteObject,
} from "react-router";
import { useIsFetching, useQuery } from "@tanstack/react-query";
import {
  emojisQuery,
  channelsQuery,
  guildsQuery,
  mappingsQuery,
  meQuery,
  rolesQuery,
  useLogout,
} from "../queries.ts";
import type { Guild, GuildChannel, Mapping, Me, Role } from "../api.ts";
import { CreateMappingForm } from "../components/CreateMappingForm.tsx";
import { MappingRow } from "../components/MappingRow.tsx";

interface LoaderData {
  loginError?: string;
}

const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  not_authorized: "Your Discord account isn't on the allowlist for this bot.",
  invalid_state: "That login link expired. Try again.",
  missing_params: "Discord didn't send back a code. Try again.",
  token_exchange_failed: "Discord rejected the login. Try again.",
  user_fetch_failed: "Couldn't read your Discord profile. Try again.",
};

// Loader only carries URL-derived state. All API data is fetched with
// useQuery inside the component so it can be cached/refetched/mutated
// independently across navigations.
async function loader({ request }: LoaderFunctionArgs): Promise<LoaderData> {
  const code = new URL(request.url).searchParams.get("login_error");
  return {
    loginError: code ? (LOGIN_ERROR_MESSAGES[code] ?? code) : undefined,
  };
}

function Component() {
  const { loginError } = useLoaderData() as LoaderData;
  const me = useQuery(meQuery());

  // Render the login screen while the auth probe is in flight too — there's
  // no useful UI to show without a session, and the alternative is a blank
  // page during page load.
  if (!me.data) {
    return <LoginScreen loginError={loginError} />;
  }

  return <AuthedApp me={me.data} />;
}

function AuthedApp({ me }: { me: Me }) {
  const [searchParams] = useSearchParams();
  const guildIdParam = searchParams.get("guild") ?? "";
  const editIdParam = searchParams.get("edit");

  const guilds = useQuery(guildsQuery());
  const mappings = useQuery(mappingsQuery());

  // If editing, the mapping's guild wins — that way a bare /?edit=<id>
  // URL still loads the right guild's roles/emojis/channels.
  const editing =
    editIdParam !== null && mappings.data
      ? mappings.data.find((m) => m.id === Number(editIdParam))
      : undefined;
  const selectedGuild =
    editing?.guild_id ||
    guildIdParam ||
    (guilds.data && guilds.data.length > 0 ? guilds.data[0].id : "");

  const roles = useQuery(rolesQuery(selectedGuild));
  const emojis = useQuery(emojisQuery(selectedGuild));
  const channels = useQuery(channelsQuery(selectedGuild));

  // Any query/mutation in flight counts as busy. Drives the top progress bar.
  const busy = useIsFetching() > 0;

  const fatalError = guilds.error ?? mappings.error;

  return (
    <Layout user={me} busy={busy}>
      {fatalError && (
        <div className="bg-stone-900 border-2 border-red-700 text-red-300 px-4 py-3">
          {fatalError instanceof Error ? fatalError.message : "Failed to load"}
        </div>
      )}

      <GuildList guilds={guilds.data ?? []} selectedGuild={selectedGuild} />
      {selectedGuild && (
        // Key on the editing target so transitioning between create-mode and
        // any specific edit (or between two different edits) remounts the
        // form. That blows away leftover field state, the inspect query
        // result, and the mutation error from the previous instance — much
        // simpler than wiring a form.reset() effect for every edge case.
        <CreateMappingForm
          key={editing ? `edit-${editing.id}` : "create"}
          roles={roles.data ?? []}
          guildEmojis={emojis.data ?? []}
          editing={editing}
        />
      )}
      <MappingsList
        mappings={mappings.data ?? []}
        roles={roles.data ?? []}
        channels={channels.data ?? []}
      />
    </Layout>
  );
}

// --- Layout pieces ---

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
            <h1 className="text-2xl font-semibold text-amber-400">rolie-polie-olie</h1>
            <p className="text-sm text-stone-400">React to a message, get a role.</p>
          </div>
        </div>
        {user && <UserChip user={user} />}
      </header>
      <main className="max-w-4xl mx-auto px-6 py-8 space-y-8" aria-busy={busy}>
        {children}
      </main>
    </div>
  );
}

function UserChip({ user }: { user: Me }) {
  const logout = useLogout();
  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="flex items-center gap-2">
        {user.avatar && (
          <img
            src={`https://cdn.discordapp.com/avatars/${user.user_id}/${user.avatar}.png?size=32`}
            alt=""
            className="size-7 border-2 border-stone-700"
          />
        )}
        <span className="text-stone-300">{user.username}</span>
      </div>
      <button
        type="button"
        onClick={() => {
          logout.mutate(undefined, {
            onSettled: () => {
              // Hard reload so we land back at the login screen with a clean
              // state, including any cached queries cleared by the mutation.
              window.location.assign("/");
            },
          });
        }}
        disabled={logout.isPending}
        className="text-xs px-3 py-1.5 bg-stone-900 hover:bg-stone-800 border-2 border-stone-700 disabled:opacity-50"
      >
        {logout.isPending ? "Signing out…" : "Sign out"}
      </button>
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
          Log in with Discord. The bot owner has to add your user ID to the allowlist before this
          works.
        </p>
        {loginError && (
          <div
            role="alert"
            className="bg-stone-900 border-2 border-red-700 text-red-300 px-4 py-3 text-sm"
          >
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

function GuildList({ guilds, selectedGuild }: { guilds: Guild[]; selectedGuild: string }) {
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
                {isSelected && <span className="text-xs text-amber-400">picked</span>}
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
            <MappingRow key={m.id} mapping={m} roleById={roleById} channelById={channelById} />
          ))}
        </div>
      )}
    </section>
  );
}

export const rootRoute: RouteObject = {
  path: "/",
  loader,
  Component,
};

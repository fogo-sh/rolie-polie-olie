import { useState, useEffect, useCallback } from "react";

const API_BASE = "";

interface Guild {
  id: string;
  name: string;
  created_at: string;
}

interface Role {
  id: string;
  name: string;
  color: string;
  position: number;
}

interface RoleMapping {
  id: number;
  guild_id: string;
  channel_id: string;
  message_id: string;
  message_url: string;
  emoji_key: string;
  role_id: string;
  mode: "toggle" | "add-only" | "remove-on-unreact";
  enabled: number;
  created_at: string;
}

function useApi(token: string) {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const get = async (path: string) => {
    const res = await fetch(`${API_BASE}${path}`, { headers });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    return res.json();
  };

  const post = async (path: string, body: unknown) => {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    return res.json();
  };

  const patch = async (path: string, body: unknown) => {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    return res.json();
  };

  const del = async (path: string) => {
    const res = await fetch(`${API_BASE}${path}`, { method: "DELETE", headers });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    return res.json();
  };

  return { get, post, patch, del };
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("admin_token") ?? "");
  const [tokenInput, setTokenInput] = useState(token);
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [mappings, setMappings] = useState<RoleMapping[]>([]);
  const [selectedGuild, setSelectedGuild] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Create mapping form state
  const [formMessageUrl, setFormMessageUrl] = useState("");
  const [formEmoji, setFormEmoji] = useState("");
  const [formRoleId, setFormRoleId] = useState("");
  const [formMode, setFormMode] = useState<"toggle" | "add-only" | "remove-on-unreact">("toggle");
  const [formEnabled, setFormEnabled] = useState(true);
  const [formAddReaction, setFormAddReaction] = useState(false);
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  const api = useApi(token);

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const [g, m] = await Promise.all([
        api.get("/api/guilds"),
        api.get("/api/mappings"),
      ]);
      setGuilds(g);
      setMappings(m);
      if (g.length > 0 && !selectedGuild) {
        setSelectedGuild(g[0].id);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [token, selectedGuild]);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!selectedGuild || !token) return;
    api.get(`/api/guilds/${selectedGuild}/roles`)
      .then((r: Role[]) => {
        setRoles(r);
        if (r.length > 0) setFormRoleId(r[0].id);
      })
      .catch(() => setRoles([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGuild, token]);

  const handleSetToken = () => {
    localStorage.setItem("admin_token", tokenInput);
    setToken(tokenInput);
  };

  const handleCreateMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setFormLoading(true);
    try {
      await api.post("/api/mappings", {
        message_url: formMessageUrl,
        emoji_key: formEmoji,
        role_id: formRoleId,
        mode: formMode,
        enabled: formEnabled,
        add_reaction: formAddReaction,
      });
      setFormMessageUrl("");
      setFormEmoji("");
      setFormMode("toggle");
      setFormEnabled(true);
      setFormAddReaction(false);
      await loadData();
    } catch (e: unknown) {
      let msg = e instanceof Error ? e.message : "Failed to create mapping";
      try {
        const parsed = JSON.parse(msg.replace(/^\d+: /, ""));
        msg = parsed.error ?? msg;
      } catch {
        // keep original message
      }
      setFormError(msg);
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteMapping = async (id: number) => {
    if (!confirm("Delete this mapping?")) return;
    try {
      await api.del(`/api/mappings/${id}`);
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete mapping");
    }
  };

  const handleToggleEnabled = async (mapping: RoleMapping) => {
    try {
      await api.patch(`/api/mappings/${mapping.id}`, {
        enabled: !mapping.enabled,
      });
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update mapping");
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 px-6 py-4">
        <h1 className="text-2xl font-bold text-indigo-400">roliep-polie-olie</h1>
        <p className="text-sm text-gray-400">Discord reaction-role manager</p>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {/* Token setup */}
        <section className="bg-gray-900 rounded-lg p-6 space-y-3">
          <h2 className="text-lg font-semibold">Admin Token</h2>
          <div className="flex gap-2">
            <input
              type="password"
              className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Enter ADMIN_TOKEN"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSetToken()}
            />
            <button
              onClick={handleSetToken}
              className="bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded text-sm font-medium"
            >
              Set Token
            </button>
          </div>
          {token && <p className="text-xs text-green-400">✓ Token is set</p>}
        </section>

        {error && (
          <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {loading && <p className="text-gray-400">Loading...</p>}

        {token && !loading && (
          <>
            {/* Guilds */}
            <section className="bg-gray-900 rounded-lg p-6 space-y-3">
              <h2 className="text-lg font-semibold">Connected Guilds</h2>
              {guilds.length === 0 ? (
                <p className="text-gray-400 text-sm">No guilds found. Add the bot to a server first.</p>
              ) : (
                <div className="space-y-2">
                  {guilds.map((g) => (
                    <div
                      key={g.id}
                      className={`flex items-center justify-between p-3 rounded border cursor-pointer transition-colors ${
                        selectedGuild === g.id
                          ? "border-indigo-500 bg-indigo-900/20"
                          : "border-gray-700 hover:border-gray-600"
                      }`}
                      onClick={() => setSelectedGuild(g.id)}
                    >
                      <div>
                        <div className="font-medium">{g.name}</div>
                        <div className="text-xs text-gray-400">{g.id}</div>
                      </div>
                      {selectedGuild === g.id && (
                        <span className="text-xs text-indigo-400">Selected</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Create Mapping Form */}
            {selectedGuild && (
              <section className="bg-gray-900 rounded-lg p-6 space-y-4">
                <h2 className="text-lg font-semibold">Create Reaction-Role Mapping</h2>
                {formError && (
                  <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded text-sm">
                    {formError}
                  </div>
                )}
                <form onSubmit={handleCreateMapping} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Discord Message URL
                    </label>
                    <input
                      type="text"
                      required
                      className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="https://discord.com/channels/123/456/789"
                      value={formMessageUrl}
                      onChange={(e) => setFormMessageUrl(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Emoji
                    </label>
                    <input
                      type="text"
                      required
                      className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="👍 or <:custom:123456>"
                      value={formEmoji}
                      onChange={(e) => setFormEmoji(e.target.value)}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      For unicode: paste the emoji. For custom: use &lt;:name:id&gt; format.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Role
                    </label>
                    {roles.length === 0 ? (
                      <p className="text-sm text-yellow-400">No roles available. Make sure the bot has access to this guild.</p>
                    ) : (
                      <select
                        required
                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        value={formRoleId}
                        onChange={(e) => setFormRoleId(e.target.value)}
                      >
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Mode
                    </label>
                    <select
                      className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      value={formMode}
                      onChange={(e) => setFormMode(e.target.value as typeof formMode)}
                    >
                      <option value="toggle">Toggle (add on react, remove on unreact)</option>
                      <option value="add-only">Add only (never removes role)</option>
                      <option value="remove-on-unreact">Remove on unreact</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formEnabled}
                        onChange={(e) => setFormEnabled(e.target.checked)}
                        className="w-4 h-4 accent-indigo-500"
                      />
                      <span className="text-sm">Enabled</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formAddReaction}
                        onChange={(e) => setFormAddReaction(e.target.checked)}
                        className="w-4 h-4 accent-indigo-500"
                      />
                      <span className="text-sm">Add bot reaction to message</span>
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={formLoading || roles.length === 0}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-2 rounded text-sm font-medium"
                  >
                    {formLoading ? "Creating..." : "Create Mapping"}
                  </button>
                </form>
              </section>
            )}

            {/* Existing Mappings */}
            <section className="bg-gray-900 rounded-lg p-6 space-y-3">
              <h2 className="text-lg font-semibold">Reaction-Role Mappings</h2>
              {mappings.length === 0 ? (
                <p className="text-gray-400 text-sm">No mappings yet.</p>
              ) : (
                <div className="space-y-2">
                  {mappings.map((m) => (
                    <div key={m.id} className="border border-gray-700 rounded p-4 space-y-2">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-lg">{m.emoji_key}</span>
                            <span className="text-sm text-gray-400">→ role {m.role_id}</span>
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              m.mode === "toggle" ? "bg-blue-900 text-blue-300" :
                              m.mode === "add-only" ? "bg-green-900 text-green-300" :
                              "bg-orange-900 text-orange-300"
                            }`}>
                              {m.mode}
                            </span>
                          </div>
                          <a
                            href={m.message_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-indigo-400 hover:underline truncate block"
                          >
                            {m.message_url}
                          </a>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => handleToggleEnabled(m)}
                            className={`text-xs px-2 py-1 rounded ${
                              m.enabled
                                ? "bg-green-800 text-green-300 hover:bg-green-700"
                                : "bg-gray-700 text-gray-400 hover:bg-gray-600"
                            }`}
                          >
                            {m.enabled ? "Enabled" : "Disabled"}
                          </button>
                          <button
                            onClick={() => handleDeleteMapping(m.id)}
                            className="text-xs px-2 py-1 rounded bg-red-900 text-red-300 hover:bg-red-800"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

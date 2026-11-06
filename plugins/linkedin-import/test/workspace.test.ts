import { afterEach, describe, expect, it } from "bun:test";
import {
  createMockAuthBackend,
  createPluginHarness,
  type PluginTestHarness,
} from "@brains/plugins/test";
import {
  studioWorkspaceRegisterContract,
  internalFullScope,
  type AccountSettingsBackend,
  type AccountSettingsStorageIdentity,
  type AuthBackend,
  type StoredAccountSettings,
  type StudioWorkspaceActor,
  type StudioWorkspaceRegistration,
} from "@brains/plugins";
import { computeContentHash } from "@brains/utils/hash";
import { z } from "@brains/utils/zod";
import { LinkedInImportPlugin } from "../src/plugin";
import type { LinkedInFetch } from "../src/lib/linkedin-client";
import profileSnapshot from "./fixtures/profile-snapshot.json" with { type: "json" };

const harnesses: PluginTestHarness<LinkedInImportPlugin>[] = [];
afterEach(async () => {
  for (const harness of harnesses.splice(0)) await harness.reset();
});

const oauth = {
  clientId: "client-1",
  clientSecret: "secret-1",
  redirectUri: "https://brain.test/linkedin/oauth/callback",
};
const ownerProfile =
  "---\nname: Ada M.\nemail: ada@example.com\n---\n\nMy own story.\n";
const future = "2099-01-01T00:00:00.000Z";
const broker = {
  url: "https://connect.test",
  instanceId: "ada",
  secret: "s".repeat(40),
  returnUri: "https://brain.test/linkedin/oauth/broker/return",
};

type Session = Awaited<ReturnType<AuthBackend["resolveSession"]>>;

function session(overrides: Partial<NonNullable<Session>> = {}): Session {
  return {
    userId: "owner",
    personId: "person-owner",
    displayName: "Ada",
    role: "admin",
    status: "active",
    permissionLevel: "admin",
    isAnchor: true,
    ...overrides,
  };
}

function actor(
  overrides: Partial<StudioWorkspaceActor> = {},
): StudioWorkspaceActor {
  return {
    interfaceType: "studio",
    userId: "owner",
    actor: { kind: "user", userId: "owner" },
    userPermissionLevel: "admin",
    visibilityScope: "restricted",
    isAnchor: true,
    ...overrides,
  };
}

class MemoryBackend implements AccountSettingsBackend {
  readonly records = new Map<string, StoredAccountSettings>();

  private key(identity: AccountSettingsStorageIdentity): string {
    return JSON.stringify([
      identity.packageName,
      identity.definitionId,
      identity.actorId,
    ]);
  }

  async read(
    identity: AccountSettingsStorageIdentity,
  ): Promise<StoredAccountSettings | null> {
    return this.records.get(this.key(identity)) ?? null;
  }

  async list(): Promise<never[]> {
    return [];
  }

  async write(
    identity: AccountSettingsStorageIdentity,
    values: StoredAccountSettings["values"],
  ): Promise<StoredAccountSettings> {
    const stored = {
      values,
      revision: (this.records.get(this.key(identity))?.revision ?? 0) + 1,
    };
    this.records.set(this.key(identity), stored);
    return stored;
  }

  async delete(identity: AccountSettingsStorageIdentity): Promise<boolean> {
    return this.records.delete(this.key(identity));
  }

  async deleteActor(): Promise<number> {
    return 0;
  }
}

interface LinkedInCalls {
  authorizations: string[];
  exchanges: number;
  brokerStates: string[];
  redemptions: number;
}

function linkedIn(calls: LinkedInCalls, status = 200): LinkedInFetch {
  return async (input, init): Promise<Response> => {
    const url = new URL(String(input));
    if (url.pathname === "/oauth-broker/authorizations") {
      calls.brokerStates.push(
        z
          .object({ brainState: z.string() })
          .parse(JSON.parse(String(init?.body))).brainState,
      );
      return Response.json({
        authorizationUrl:
          "https://www.linkedin.com/oauth/v2/authorization?state=broker-state",
      });
    }
    if (url.pathname === "/oauth-broker/grants/redeem") {
      calls.redemptions++;
      return Response.json({
        provider: "linkedin",
        credential: { accessToken: "member-token", expiresAt: future },
      });
    }
    if (url.pathname === "/oauth/v2/accessToken") {
      calls.exchanges++;
      return Response.json({ access_token: "member-token", expires_in: 3600 });
    }
    calls.authorizations.push(
      new Headers(init?.headers).get("Authorization") ?? "",
    );
    if (status !== 200) return new Response("Unauthorized", { status });
    if (url.searchParams.get("start") !== "0") {
      return new Response("No data found for this memberId", { status: 404 });
    }
    return url.searchParams.get("domain") === "POSITIONS"
      ? Response.json({
          elements: [
            {
              snapshotDomain: "POSITIONS",
              snapshotData: [
                { "Company Name": "SENTINEL Corp", "Started On": "Mar 2019" },
              ],
            },
          ],
        })
      : Response.json(profileSnapshot);
  };
}

interface Fixture {
  plugin: LinkedInImportPlugin;
  workspace: StudioWorkspaceRegistration | undefined;
  calls: LinkedInCalls;
  backend: MemoryBackend;
  view(query?: Record<string, string>): Promise<string>;
  act(request: Record<string, unknown>): Promise<unknown>;
  get(path: string): Promise<Response>;
  profile(): Promise<string | undefined>;
  setProfile(content: string): void;
  setSession(next: Session): void;
}

async function fixture(
  options: {
    oauth?: boolean;
    mode?: "direct" | "broker" | "both";
    token?: { accessToken: string; expiresAt?: string };
    linkedInStatus?: number;
  } = {},
): Promise<Fixture> {
  // A log context keeps the shell this fixture seeds; install would replace it.
  const harness = createPluginHarness<LinkedInImportPlugin>({
    logContext: "linkedin-import-test",
  });
  harnesses.push(harness);
  const shell = harness.getMockShell();
  const backend = new MemoryBackend();
  shell.getAccountSettingsRegistry().bindBackend(backend);
  let current: Session = session();
  shell
    .getAuthRegistry()
    .bindBackend(
      createMockAuthBackend({ resolveSession: async () => current }),
    );
  const setProfile = (content: string): void =>
    shell.addEntities([
      {
        id: "anchor-profile",
        entityType: "anchor-profile",
        content,
        metadata: {},
        contentHash: computeContentHash(content),
        visibility: "public",
        created: "2026-11-01T00:00:00.000Z",
        updated: "2026-11-01T00:00:00.000Z",
      },
    ]);
  setProfile(ownerProfile);
  const workspaces: StudioWorkspaceRegistration[] = [];
  shell
    .getMessageBus()
    .subscribe<StudioWorkspaceRegistration>(
      studioWorkspaceRegisterContract.name,
      (message) => {
        workspaces.push(message.payload);
        return { success: true, data: { workspaceUrl: "/studio/linkedin" } };
      },
    );
  const calls: LinkedInCalls = {
    authorizations: [],
    exchanges: 0,
    brokerStates: [],
    redemptions: 0,
  };
  const connection =
    options.oauth === false
      ? {}
      : options.mode === "broker"
        ? { broker }
        : options.mode === "both"
          ? { oauth, broker }
          : { oauth };
  const plugin = new LinkedInImportPlugin(connection, {
    fetch: linkedIn(calls, options.linkedInStatus),
  });
  await harness.installPlugin(plugin);
  await plugin.finalizeRegistration();
  if (options.token) {
    const registry = shell.getAccountSettingsRegistry();
    const registration = registry
      .listRegistrations()
      .find((registered) => registered.ownerPluginId === "linkedin-import");
    if (!registration) throw new Error("No LinkedIn account settings");
    await registry.save(registration.id, "owner", options.token);
  }
  const workspace = workspaces.find(
    (registered) => registered.id === "linkedin-import:linkedin",
  );
  const signal = (): AbortSignal => new AbortController().signal;
  return {
    plugin,
    workspace,
    calls,
    backend,
    view: async (query = {}): Promise<string> =>
      JSON.stringify(await workspace?.dataProvider(actor(), query, signal())),
    act: async (request): Promise<unknown> => {
      if (!workspace?.actionHandler) throw new Error("No LinkedIn workspace");
      return workspace.actionHandler(request, actor(), signal());
    },
    get: async (path): Promise<Response> => {
      const url = new URL(path, "https://brain.test");
      const route = plugin
        .getWebRoutes()
        .find((candidate) => candidate.path === url.pathname);
      if (!route) return new Response("Not found", { status: 404 });
      return route.handler(new Request(url), { remoteAddress: "127.0.0.1" });
    },
    profile: async (): Promise<string | undefined> =>
      (
        await shell.getEntityService().getEntity({
          entityType: "anchor-profile",
          id: "anchor-profile",
          visibilityScope: internalFullScope("test reads the anchor profile"),
        })
      )?.content,
    setProfile,
    setSession: (next): void => {
      current = next;
    },
  };
}

const prepared = z.object({ token: z.string(), summary: z.string() });

async function connect(state: Fixture): Promise<Response> {
  const start = await state.get("/linkedin/oauth/start");
  const consent = new URL(start.headers.get("Location") ?? "");
  const issued = consent.searchParams.get("state") ?? "";
  return state.get(`/linkedin/oauth/callback?code=code-1&state=${issued}`);
}

async function importProfile(state: Fixture): Promise<unknown> {
  const confirmation = prepared.parse(
    await state.act({ actionId: "import-profile", input: {}, mode: "prepare" }),
  );
  return state.act({
    actionId: "import-profile",
    input: {},
    confirmationToken: confirmation.token,
  });
}

describe("LinkedIn workspace", () => {
  it("registers nothing without OAuth settings", async () => {
    const state = await fixture({ oauth: false });

    expect(state.workspace).toBeUndefined();
    expect(state.plugin.getWebRoutes()).toEqual([]);
  });

  it("belongs to the Anchor alone", async () => {
    const { workspace } = await fixture();
    if (!workspace) throw new Error("No LinkedIn workspace");

    expect(workspace.label).toBe("LinkedIn");
    expect(workspace.permission).toBe("admin");
    expect(await workspace.accessHandler(actor())).toBe(true);
    expect(await workspace.accessHandler(actor({ isAnchor: false }))).toBe(
      false,
    );
    expect(
      await workspace.accessHandler(actor({ userPermissionLevel: "trusted" })),
    ).toBe(false);
    expect(
      workspace.dataProvider(
        actor({ isAnchor: false }),
        {},
        new AbortController().signal,
      ),
    ).rejects.toThrow("data loader failed");
  });

  it("offers a disconnected Anchor the way to connect", async () => {
    const state = await fixture();

    const shown = await state.view();
    expect(shown).toContain("https://brain.test/linkedin/oauth/start");
    expect(shown).not.toContain("import-profile");
    expect(state.calls.authorizations).toEqual([]);
  });

  it("sends only the Anchor to LinkedIn's consent page", async () => {
    const state = await fixture();

    const start = await state.get("/linkedin/oauth/start");
    expect(start.status).toBe(302);
    const consent = new URL(start.headers.get("Location") ?? "");
    expect(consent.origin + consent.pathname).toBe(
      "https://www.linkedin.com/oauth/v2/authorization",
    );
    expect(consent.searchParams.get("client_id")).toBe("client-1");
    expect(consent.searchParams.get("state")).toBeTruthy();

    state.setSession(session({ isAnchor: false }));
    expect((await state.get("/linkedin/oauth/start")).status).toBe(403);
    state.setSession(undefined);
    expect((await state.get("/linkedin/oauth/start")).status).toBe(401);
  });

  it("stores the token from LinkedIn's callback and returns to the workspace", async () => {
    const state = await fixture();

    const callback = await connect(state);

    expect(callback.status).toBe(303);
    expect(callback.headers.get("Location")).toBe(
      "/studio/linkedin?connection=connected",
    );
    expect(state.calls.exchanges).toBe(1);
    const shown = await state.view({ connection: "connected" });
    expect(shown).toContain("import-profile");
    expect(shown).toContain("Advisor helping climate-tech founders");
    expect(shown).not.toContain("member-token");
    expect(new Set(state.calls.authorizations)).toEqual(
      new Set(["Bearer member-token"]),
    );
  });

  it("refuses a replayed state and a state from another session", async () => {
    const state = await fixture();
    const start = await state.get("/linkedin/oauth/start");
    const issued =
      new URL(start.headers.get("Location") ?? "").searchParams.get("state") ??
      "";

    state.setSession(session({ userId: "someone-else" }));
    const foreign = await state.get(
      `/linkedin/oauth/callback?code=code-1&state=${issued}`,
    );
    expect(foreign.headers.get("Location")).toBe(
      "/studio/linkedin?connection=failed",
    );

    state.setSession(session());
    const replayed = await state.get(
      `/linkedin/oauth/callback?code=code-1&state=${issued}`,
    );
    expect(replayed.headers.get("Location")).toBe(
      "/studio/linkedin?connection=failed",
    );
    expect(state.calls.exchanges).toBe(0);
    expect(state.backend.records.size).toBe(0);
  });

  it("comes back with a notice when the owner declines consent", async () => {
    const state = await fixture();
    const start = await state.get("/linkedin/oauth/start");
    const issued =
      new URL(start.headers.get("Location") ?? "").searchParams.get("state") ??
      "";

    const declined = await state.get(
      `/linkedin/oauth/callback?error=user_cancelled_authorize&state=${issued}`,
    );

    expect(declined.headers.get("Location")).toBe(
      "/studio/linkedin?connection=declined",
    );
    expect(await state.view({ connection: "declined" })).toContain(
      "LinkedIn connection was declined",
    );
    expect(state.backend.records.size).toBe(0);
  });

  it("asks for a new connection once the token has expired", async () => {
    const state = await fixture({
      token: {
        accessToken: "old-token",
        expiresAt: "2020-01-01T00:00:00.000Z",
      },
    });

    const shown = await state.view();
    expect(shown).toContain("expired");
    expect(shown).toContain("https://brain.test/linkedin/oauth/start");
    expect(shown).not.toContain("import-profile");
  });

  it("forgets the token on disconnect", async () => {
    const state = await fixture({
      token: { accessToken: "member-token", expiresAt: future },
    });

    await state.act({ actionId: "disconnect", input: {} });

    expect(state.backend.records.size).toBe(0);
    expect(await state.view()).toContain(
      "https://brain.test/linkedin/oauth/start",
    );
  });

  it("lets the Anchor inspect the rich domains' shapes without member values", async () => {
    const state = await fixture({
      token: { accessToken: "member-token", expiresAt: future },
    });
    expect(await state.view()).toContain("inspect-shapes");

    const { shapes } = z
      .object({ shapes: z.string() })
      .parse(await state.act({ actionId: "inspect-shapes", input: {} }));

    const parsed = z
      .record(z.string(), z.object({ recordsRead: z.number() }))
      .parse(JSON.parse(shapes));
    expect(Object.keys(parsed)).toEqual([
      "SKILLS",
      "POSITIONS",
      "EDUCATION",
      "CERTIFICATIONS",
    ]);
    expect(parsed["POSITIONS"]?.recordsRead).toBe(1);
    expect(parsed["SKILLS"]?.recordsRead).toBe(0);
    expect(shapes).toContain("Company Name");
    expect(shapes).toContain("<month-year>");
    expect(shapes).not.toContain("SENTINEL");
  });

  it("previews each field: filled, kept, or already the same", async () => {
    const shown = await (
      await fixture({
        token: { accessToken: "member-token", expiresAt: future },
      })
    ).view();

    expect(shown).toContain("Advisor helping climate-tech founders");
    expect(shown).toContain("Climate Technology");
    expect(shown).toContain("Ada M.");
    expect(shown).toContain("Fill");
    expect(shown).toContain("Keep yours");
    expect(shown).toContain("import-profile");
  });

  it("imports after confirmation, keeping what the owner wrote", async () => {
    const state = await fixture({
      token: { accessToken: "member-token", expiresAt: future },
    });

    const confirmation = prepared.parse(
      await state.act({
        actionId: "import-profile",
        input: {},
        mode: "prepare",
      }),
    );
    expect(confirmation.summary).toContain("headline");
    expect(await state.profile()).toBe(ownerProfile);

    await state.act({
      actionId: "import-profile",
      input: {},
      confirmationToken: confirmation.token,
    });

    const content = (await state.profile()) ?? "";
    expect(content).toContain("name: Ada M.");
    expect(content).toContain(
      "headline: Advisor helping climate-tech founders build resilient software",
    );
    expect(content).toContain("industry: Climate Technology");
    expect(content).toContain("location: Rotterdam, Netherlands");
    expect(content).toContain("My own story.");
    expect(content).not.toContain("I build resilient software systems");
  });

  it("refuses a confirmation once the profile has changed", async () => {
    const state = await fixture({
      token: { accessToken: "member-token", expiresAt: future },
    });
    const confirmation = prepared.parse(
      await state.act({
        actionId: "import-profile",
        input: {},
        mode: "prepare",
      }),
    );
    const edited = "---\nname: Ada Morgan\n---\n\nEdited meanwhile.\n";
    state.setProfile(edited);

    expect(
      state.act({
        actionId: "import-profile",
        input: {},
        confirmationToken: confirmation.token,
      }),
    ).rejects.toThrow("stale");
    expect(await state.profile()).toBe(edited);
  });

  it("asks to reconnect when LinkedIn refuses the token", async () => {
    const state = await fixture({
      token: { accessToken: "revoked", expiresAt: future },
      linkedInStatus: 401,
    });

    const shown = await state.view();
    expect(shown).toContain("LinkedIn refused");
    expect(shown).toContain("https://brain.test/linkedin/oauth/start");
    expect(shown).not.toContain("import-profile");
    expect(importProfile(state)).rejects.toThrow();
    expect(await state.profile()).toBe(ownerProfile);
  });

  describe("through the managed broker", () => {
    const grant = "g".repeat(43);

    async function started(state: Fixture): Promise<string> {
      const start = await state.get("/linkedin/oauth/start");
      expect(start.status).toBe(302);
      expect(start.headers.get("Location")).toBe(
        "https://www.linkedin.com/oauth/v2/authorization?state=broker-state",
      );
      return state.calls.brokerStates.at(-1) ?? "";
    }

    it("connects with the grant the broker returns", async () => {
      const state = await fixture({ mode: "broker" });
      const brainState = await started(state);

      const back = await state.get(
        `/linkedin/oauth/broker/return?provider=linkedin&state=${brainState}&grant=${grant}`,
      );

      expect(back.status).toBe(303);
      expect(back.headers.get("Location")).toBe(
        "/studio/linkedin?connection=connected",
      );
      expect(state.calls.redemptions).toBe(1);
      expect(state.calls.exchanges).toBe(0);
      expect(await state.view()).toContain("import-profile");
      expect(new Set(state.calls.authorizations)).toEqual(
        new Set(["Bearer member-token"]),
      );
    });

    it("reports a declined consent without redeeming", async () => {
      const state = await fixture({ mode: "broker" });
      const brainState = await started(state);

      const back = await state.get(
        `/linkedin/oauth/broker/return?provider=linkedin&state=${brainState}&error=provider_denied`,
      );

      expect(back.headers.get("Location")).toBe(
        "/studio/linkedin?connection=declined",
      );
      expect(state.calls.redemptions).toBe(0);
    });

    it("redeems nothing for a state from another session", async () => {
      const state = await fixture({ mode: "broker" });
      const brainState = await started(state);
      state.setSession(session({ userId: "someone-else" }));

      const back = await state.get(
        `/linkedin/oauth/broker/return?provider=linkedin&state=${brainState}&grant=${grant}`,
      );

      expect(back.headers.get("Location")).toBe(
        "/studio/linkedin?connection=failed",
      );
      expect(state.calls.redemptions).toBe(0);
      expect(state.backend.records.size).toBe(0);
    });

    it("refuses both a direct app and a broker", () => {
      expect(fixture({ mode: "both" })).rejects.toThrow("either");
    });
  });
});

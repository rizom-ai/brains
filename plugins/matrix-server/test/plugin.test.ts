import { describe, expect, it } from "bun:test";
import {
  instantiatePluginPackageDefinition,
  type Plugin,
  type WebRouteDefinition,
} from "@brains/plugins";
import {
  createMockAuthBackend,
  createMockShell,
  registerAll,
} from "@brains/plugins/test";
import {
  a2aPeerTrustChangedChannel,
  type ProvisionOAuthClientInput,
} from "@brains/contracts";
import { createMatrixServerPackage } from "../src";
import packageJson from "../package.json";

const CONFIG = {
  homeserverUrl: "http://homeserver.internal:8008",
  serverName: "brain.example.com",
  botUserId: "@_brain:brain.example.com",
  botPassword: "bot-password-0123456789",
  registrationToken: "registration-token-0123456789",
  oidcClientSecret: "client-secret-0123456789abcdefghijkl",
};

type Fetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

async function installed(
  options: { executionOnly?: boolean; fetch?: Fetch } = {},
): Promise<{
  plugins: Plugin[];
  routes: WebRouteDefinition[];
  provisioned: ProvisionOAuthClientInput[];
}> {
  const shell = createMockShell();
  const provisioned: ProvisionOAuthClientInput[] = [];
  shell.getAuthRegistry().bindBackend(
    createMockAuthBackend({
      provisionOAuthClient: async (input) => {
        provisioned.push(input);
      },
    }),
  );
  const plugins = instantiatePluginPackageDefinition(
    createMatrixServerPackage({
      fetch:
        options.fetch ??
        (async (): Promise<Response> => Response.json({ access_token: "t" })),
    }),
    CONFIG,
    { name: packageJson.name, version: packageJson.version },
    { pluginId: "matrix-server" },
  );
  await registerAll(shell, plugins, options);
  return {
    plugins,
    routes: plugins.flatMap((plugin) => plugin.getWebRoutes?.() ?? []),
    provisioned,
  };
}

describe("the matrix-server plugin", () => {
  it("serves discovery and forwards the homeserver's paths, all public", async () => {
    const { routes } = await installed();

    expect(
      routes.map(
        ({ method, path, match, public: open }) =>
          `${method ?? "GET"} ${path} ${match ?? "exact"} ${String(open)}`,
      ),
    ).toEqual([
      "GET /.well-known/matrix/server exact true",
      "GET /.well-known/matrix/client exact true",
      ...["/_matrix", "/_tuwunel"].flatMap((path) =>
        ["GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS"].map(
          (method) => `${method} ${path} prefix true`,
        ),
      ),
    ]);
  });

  it("serves nothing in the job worker", async () => {
    const { routes } = await installed({ executionOnly: true });

    expect(routes).toEqual([]);
  });

  it("provisions the homeserver's sign-in client and checks the bot when the brain is ready", async () => {
    const requests: string[] = [];
    const { plugins, provisioned } = await installed({
      fetch: async (input) => {
        requests.push(new URL(String(input)).pathname);
        return Response.json({ access_token: "t" });
      },
    });

    await Promise.all(
      plugins.map((plugin) => plugin.ready?.() ?? Promise.resolve()),
    );

    expect(provisioned).toEqual([
      {
        clientId: "matrix-homeserver",
        clientSecret: CONFIG.oidcClientSecret,
        clientName: "Matrix homeserver",
        redirectUris: [
          "https://brain.example.com/_matrix/client/unstable/login/sso/callback/matrix-homeserver",
        ],
        identityClaim: {
          type: "matrix",
          subjectPrefix: "@",
          subjectSuffix: ":brain.example.com",
        },
      },
    ]);
    expect(requests).toEqual(["/_matrix/client/v3/login"]);
  });
});

describe("rooms for trusted peers, as the plugin hears them", () => {
  it("opens the peer's room when its trust is granted, and closes it on a revoke", async () => {
    const requests: string[] = [];
    const shell = createMockShell();
    shell
      .getAuthRegistry()
      .bindBackend(
        createMockAuthBackend({ provisionOAuthClient: async () => undefined }),
      );
    const plugins = instantiatePluginPackageDefinition(
      createMatrixServerPackage({
        fetch: async (input, init) => {
          const path = decodeURIComponent(new URL(String(input)).pathname);
          requests.push(`${init?.method ?? "GET"} ${path}`);
          if (path.includes("/directory/room/")) {
            return requests.some((request) => request.endsWith("/createRoom"))
              ? Response.json({ room_id: "!peer:brain.example.com" })
              : Response.json({ errcode: "M_NOT_FOUND" }, { status: 404 });
          }
          if (path.endsWith("/createRoom")) {
            return Response.json({ room_id: "!peer:brain.example.com" });
          }
          return Response.json({ access_token: "t" });
        },
      }),
      CONFIG,
      { name: packageJson.name, version: packageJson.version },
      { pluginId: "matrix-server" },
    );
    await registerAll(shell, plugins);
    const bus = shell.getMessageBus();

    await bus.send({
      type: a2aPeerTrustChangedChannel.name,
      payload: { domain: "team.rizom.ai", level: "trusted" },
      sender: "agent-discovery",
      broadcast: true,
    });
    await bus.send({
      type: a2aPeerTrustChangedChannel.name,
      payload: { domain: "team.rizom.ai", level: "public" },
      sender: "agent-discovery",
      broadcast: true,
    });

    expect(requests.filter((request) => !request.endsWith("/login"))).toEqual([
      "GET /_matrix/client/v3/directory/room/#team-rizom-ai:brain.example.com",
      "POST /_matrix/client/v3/createRoom",
      "GET /_matrix/client/v3/directory/room/#team-rizom-ai:brain.example.com",
      "POST /_matrix/client/v3/rooms/!peer:brain.example.com/kick",
      "PUT /_matrix/client/v3/rooms/!peer:brain.example.com/state/m.room.server_acl/",
    ]);
  });
});

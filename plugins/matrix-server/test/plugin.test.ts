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
import type { ProvisionOAuthClientInput } from "@brains/contracts";
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

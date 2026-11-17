import { describe, expect, it } from "bun:test";
import { WEBDAV_INTERACTION_ID } from "@brains/contracts";
import {
  instantiatePluginPackageDefinition,
  type Plugin,
  type WebRouteDefinition,
} from "@brains/plugins";
import {
  createMockAuthBackend,
  createMockShell,
  registerAll,
  type MockShell,
} from "@brains/plugins/test";
import webdavPackage from "../src";
import packageJson from "../package.json";

function plugins(): Plugin[] {
  return instantiatePluginPackageDefinition(
    webdavPackage,
    {},
    { name: packageJson.name, version: packageJson.version },
    { pluginId: "webdav" },
  );
}

async function installed(
  options: { executionOnly?: boolean } = {},
): Promise<{ shell: MockShell; routes: WebRouteDefinition[] }> {
  const shell = createMockShell();
  const installedPlugins = plugins();
  await registerAll(shell, installedPlugins, options);
  return {
    shell,
    routes: installedPlugins.flatMap((plugin) => plugin.getWebRoutes?.() ?? []),
  };
}

function propfind(routes: WebRouteDefinition[]): Promise<Response> {
  const route = routes.find((candidate) => candidate.method === "PROPFIND");
  if (!route) throw new Error("No PROPFIND route");
  return Promise.resolve(
    route.handler(
      new Request("https://brain.example/dav/", {
        method: "PROPFIND",
        headers: { depth: "0", authorization: "Basic ZGF2LWlkOnNlY3JldA==" },
      }),
    ),
  );
}

describe("the WebDAV plugin's registered surface", () => {
  it("serves the drive on /dav and offers it as the webdav interaction to trusted people", async () => {
    const { shell, routes } = await installed();
    expect(
      routes.map(({ path, match, method, public: open, preview }) => [
        path,
        match,
        method,
        open,
        preview,
      ]),
    ).toEqual(
      ["OPTIONS", "GET", "HEAD", "PROPFIND"].map((method) => [
        "/dav",
        "prefix",
        method,
        true,
        undefined,
      ]),
    );
    expect(shell.listInteractions()).toEqual([
      expect.objectContaining({
        id: WEBDAV_INTERACTION_ID,
        href: "/dav/",
        kind: "protocol",
        visibility: "trusted",
      }),
    ]);
  });

  it("registers nothing on a job worker", async () => {
    const { shell, routes } = await installed({ executionOnly: true });
    expect(routes).toEqual([]);
    expect(shell.listInteractions()).toEqual([]);
  });

  it("challenges every request while the brain runs without auth", async () => {
    const { routes } = await installed();
    expect((await propfind(routes)).status).toBe(401);
  });

  it("admits the person the brain's auth resolves the app password to", async () => {
    const { shell, routes } = await installed();
    const seen: Request[] = [];
    shell.getAuthRegistry().bindBackend(
      createMockAuthBackend({
        resolveAppPassword: async (request) => {
          seen.push(request);
          return {
            principal: {
              userId: "usr_1",
              personId: "prsn_1",
              displayName: "Mira",
              role: "trusted",
              status: "active",
              permissionLevel: "trusted",
              isAnchor: false,
            },
            access: "read",
            appPasswordId: "pw_1",
          };
        },
      }),
    );

    const response = await propfind(routes);
    expect(response.status).toBe(207);
    expect(await response.text()).toContain("<D:href>/dav/</D:href>");
    expect(seen).toHaveLength(1);
  });
});

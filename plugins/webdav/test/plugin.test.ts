import { describe, expect, it } from "bun:test";
import {
  WEBDAV_INTERACTION_ID,
  recordConflictContract,
} from "@brains/contracts";
import {
  BaseEntityAdapter,
  instantiatePluginPackageDefinition,
  type BaseEntity,
  type Plugin,
  type WebRouteDefinition,
} from "@brains/plugins";
import {
  baseEntitySchema,
  createMockAuthBackend,
  createMockShell,
  registerAll,
  type MockShell,
} from "@brains/plugins/test";
import { getErrorMessage } from "@brains/utils/error";
import { z } from "@brains/utils/zod";
import webdavPackage from "../src";
import packageJson from "../package.json";

class PlainAdapter extends BaseEntityAdapter<BaseEntity> {
  constructor(entityType: string) {
    super({
      entityType,
      purpose: "A type the drive's start check looks for",
      schema: baseEntitySchema,
      frontmatterSchema: z.object({}),
    });
  }
  public override toMarkdown(entity: BaseEntity): string {
    return entity.content;
  }
  public fromMarkdown(markdown: string): Partial<BaseEntity> {
    return { content: markdown };
  }
}

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
      [
        "OPTIONS",
        "GET",
        "HEAD",
        "PROPFIND",
        "PUT",
        "DELETE",
        "MOVE",
        "COPY",
        "PROPPATCH",
        "MKCOL",
        "LOCK",
        "UNLOCK",
      ].map((method) => ["/dav", "prefix", method, true, undefined]),
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

describe("the WebDAV plugin and the conflict type", () => {
  const finalized = async (types: string[]): Promise<string> => {
    const shell = createMockShell();
    for (const type of types) {
      shell
        .getEntityRegistry()
        .registerEntityType(type, baseEntitySchema, new PlainAdapter(type));
    }
    const installedPlugins = plugins();
    await registerAll(shell, installedPlugins);
    return Promise.all(
      installedPlugins.map(async (plugin) => plugin.finalizeRegistration?.()),
    ).then(
      () => "",
      (error: unknown) => getErrorMessage(error),
    );
  };

  it("refuses to start in a brain that cannot keep a losing save", async () => {
    expect(await finalized([])).toContain('needs the "conflict" entity type');
  });

  it("starts in a brain that has the conflict type", async () => {
    expect(await finalized(["conflict"])).toBe("");
  });
});

describe("the WebDAV plugin and a held losing save", () => {
  const conflictId = "note:held:20261120T120000Z";
  const authorization = "Basic ZGF2LWlkOnNlY3JldA==";
  const route = (
    routes: WebRouteDefinition[],
    method: string,
  ): ((body?: string) => Promise<Response>) => {
    const found = routes.find((candidate) => candidate.method === method);
    if (!found) throw new Error(`No ${method} route`);
    return async (body) =>
      found.handler(
        new Request("http://localhost/dav/held.md", {
          method,
          headers: { authorization },
          ...(body !== undefined ? { body } : {}),
        }),
      );
  };
  const note = (content: string, contentHash: string): BaseEntity => ({
    id: "held",
    entityType: "note",
    content,
    contentHash,
    visibility: "public",
    metadata: {},
    created: "2026-11-20T12:00:00.000Z",
    updated: "2026-11-20T12:00:00.000Z",
  });

  it("names the conflict the brain keeps it as, and is shown back until that conflict is gone", async () => {
    const shell = createMockShell();
    for (const type of ["note", "conflict"]) {
      shell
        .getEntityRegistry()
        .registerEntityType(type, baseEntitySchema, new PlainAdapter(type));
    }
    shell.addEntities([note("Mine before", "hash-before")]);
    shell.getMessageBus().subscribe(recordConflictContract.name, async () => {
      shell.addEntities([
        {
          ...note("kept", "hash-conflict"),
          id: conflictId,
          entityType: "conflict",
        },
      ]);
      return { success: true, data: { conflictId, created: true } };
    });
    shell.getAuthRegistry().bindBackend(
      createMockAuthBackend({
        resolveAppPassword: async () => ({
          principal: {
            userId: "usr_1",
            personId: "prsn_1",
            displayName: "Mira",
            role: "admin",
            status: "active",
            permissionLevel: "admin",
            isAnchor: false,
          },
          access: "write",
          appPasswordId: "pw_1",
        }),
      }),
    );
    const installedPlugins = plugins();
    await registerAll(shell, installedPlugins);
    const routes = installedPlugins.flatMap(
      (plugin) => plugin.getWebRoutes?.() ?? [],
    );
    const get = route(routes, "GET");
    const put = route(routes, "PUT");

    await get();
    shell.addEntities([note("Newer, from Studio", "hash-newer")]);
    const save = await put("Mine after");
    const held = await (await get()).text();
    await shell
      .getEntityService()
      .deleteEntity({ entityType: "conflict", id: conflictId });
    const settled = await (await get()).text();

    expect(save.status).toBe(204);
    expect(held).toBe("Mine after");
    expect(settled).toBe("Newer, from Studio");
  });
});

describe("the WebDAV plugin and a person's Obsidian folder", () => {
  const authorization = "Basic ZGF2LWlkOnNlY3JldA==";

  /** The drive as one brain process serves it, over the given shell. */
  async function served(
    shell: MockShell,
  ): Promise<
    (method: string, path: string, body?: string) => Promise<Response>
  > {
    const installedPlugins = plugins();
    await registerAll(shell, installedPlugins);
    const routes = installedPlugins.flatMap(
      (plugin) => plugin.getWebRoutes?.() ?? [],
    );
    return async (method, path, body) => {
      const found = routes.find((candidate) => candidate.method === method);
      if (!found) throw new Error(`No ${method} route`);
      return found.handler(
        new Request(`http://localhost${path}`, {
          method,
          headers: { authorization },
          ...(body !== undefined ? { body } : {}),
        }),
      );
    };
  }

  it("keeps it in the brain's own state, so another process finds it", async () => {
    const shell = createMockShell();
    shell
      .getEntityRegistry()
      .registerEntityType(
        "conflict",
        baseEntitySchema,
        new PlainAdapter("conflict"),
      );
    shell.getAuthRegistry().bindBackend(
      createMockAuthBackend({
        resolveAppPassword: async () => ({
          principal: {
            userId: "usr_1",
            personId: "prsn_1",
            displayName: "Mira",
            role: "trusted",
            status: "active",
            permissionLevel: "trusted",
            isAnchor: false,
          },
          access: "write",
          appPasswordId: "pw_1",
        }),
      }),
    );

    const first = await served(shell);
    expect(
      (await first("PUT", "/dav/.obsidian/plugins/calendar/data.json", "{}"))
        .status,
    ).toBe(201);
    expect(
      (await first("PUT", "/dav/.obsidian/workspace.json", '{"tabs":1}'))
        .status,
    ).toBe(201);

    // The brain restarts: a new plugin instance over the same stored state.
    const second = await served(shell);
    const workspace = await second("GET", "/dav/.obsidian/workspace.json");
    expect(workspace.status).toBe(200);
    expect(await workspace.text()).toBe('{"tabs":1}');
    expect(
      (await second("GET", "/dav/.obsidian/plugins/calendar/data.json")).status,
    ).toBe(200);

    expect(
      (await second("DELETE", "/dav/.obsidian/workspace.json")).status,
    ).toBe(204);
    const third = await served(shell);
    expect((await third("GET", "/dav/.obsidian/workspace.json")).status).toBe(
      404,
    );
  });
});

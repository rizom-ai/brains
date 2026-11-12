import { describe, expect, it, spyOn } from "bun:test";
import {
  ENTITY_CHANNELS,
  consoleJumpDestinationsContract,
} from "@brains/contracts";
import {
  baseEntitySchema,
  studioOverviewContributionRegisterContract,
  studioOverviewContributionUnregisterContract,
  studioWorkspaceRegisterContract,
  studioWorkspaceUnregisterContract,
  type Plugin,
  type PluginCapabilities,
} from "@brains/plugins";
import {
  createMockShell,
  createTestEntityAdapter,
  type MockShell,
} from "@brains/plugins/test";
import { EntityRegistry } from "@brains/entity-service";
import { createSilentLogger } from "@brains/test-utils";
import { createStudioPlugins } from "./studio-plugins";

interface Installed {
  shell: MockShell;
  plugins: Plugin[];
  capabilities: PluginCapabilities[];
}

/** One brain process with a note type, with or without browser chat. */
async function installed(
  options: { executionOnly?: boolean; webChat?: boolean } = {},
): Promise<Installed> {
  const shell = createMockShell({ domain: "brain.test" });
  // The brain's own registry, which holds grouping sources.
  const registry = EntityRegistry.createFresh(createSilentLogger());
  spyOn(shell, "getEntityRegistry").mockReturnValue(registry);
  // The entity service answers for the registry it stores through.
  spyOn(shell.getEntityService(), "getEntityTypes").mockImplementation(() =>
    registry.getAllEntityTypes(),
  );
  shell
    .getEntityRegistry()
    .registerEntityType(
      "note",
      baseEntitySchema,
      createTestEntityAdapter("note"),
    );
  if (options.webChat)
    spyOn(shell, "getPluginPackageName").mockImplementation((id) =>
      id === "web-chat" ? "@brains/web-chat" : undefined,
    );
  const plugins = createStudioPlugins();
  const capabilities: PluginCapabilities[] = [];
  for (const plugin of plugins) {
    capabilities.push(
      await plugin.register(
        shell,
        options.executionOnly ? { executionOnly: true } : undefined,
      ),
    );
  }
  return { shell, plugins, capabilities };
}

/**
 * What Studio registers, pinned as its service class registered it: the
 * editor's routes, its endpoints and ways in, the Inbox follow-ups it
 * offers, its answers to the workspace and jump contracts, the activity it
 * hears, and the grouping definitions type it owns: the class registered
 * the type once every plugin had registered; the package installs it as
 * its own plugin, grouping-definitions, and installs the definitions
 * source and its validators once every plugin has registered.
 */
describe("the Studio package's registered surface", () => {
  it("is the grouping-definitions type and the studio service, with no tools and the editor's routes", async () => {
    const { plugins, capabilities } = await installed();
    expect(
      plugins.map(({ id, type, packageName, dependencies }) => [
        id,
        type,
        packageName,
        dependencies ?? [],
      ]),
    ).toEqual([
      ["grouping-definitions", "entity", "@brains/studio", []],
      ["studio", "service", "@brains/studio", []],
    ]);
    expect(capabilities.flatMap(({ tools }) => tools)).toEqual([]);
    expect(capabilities.flatMap(({ resources }) => resources)).toEqual([]);
    const routes = plugins.flatMap((plugin) => plugin.getWebRoutes?.() ?? []);
    expect(
      routes.map(
        ({ method, path, match }) =>
          `${method ?? "GET"} ${path} ${match ?? "exact"}`,
      ),
    ).toEqual([
      "GET /chat exact",
      "GET /studio exact",
      "GET /studio/entities prefix",
      "GET /studio/groups prefix",
      "GET /studio/workspaces prefix",
      "GET /studio/assets prefix",
      "GET /studio/api/types exact",
      "GET /studio/api/workspace exact",
      "POST /studio/api/workspace exact",
      "GET /studio/api/members exact",
      "GET /studio/api/schema exact",
      "GET /studio/api/images exact",
      "POST /studio/api/destination exact",
      "GET /studio/api/groups/catalog exact",
      "GET /studio/api/groups/members exact",
      "GET /studio/api/groups/usage exact",
      "GET /studio/api/hierarchy exact",
      "GET /studio/api/entities exact",
      "PUT /studio/api/entities exact",
      "POST /studio/api/entities exact",
      "DELETE /studio/api/entities exact",
      "POST /studio/api/upload exact",
      "POST /studio/api/assist exact",
      "GET /studio/api/agents exact",
      "POST /studio/api/ask-agent exact",
      "GET /studio/api/sync-status exact",
    ]);
    // Every one public, answered by the editor's own session gate.
    expect(routes.every((route) => route.public === true)).toBe(true);
    for (const plugin of plugins)
      expect(plugin.getApiRoutes?.() ?? []).toEqual([]);
  });

  it("offers Studio, and Chat with browser chat, as endpoints and ways in", async () => {
    for (const webChat of [false, true]) {
      const { shell } = await installed({ webChat });
      expect(
        shell
          .listEndpoints()
          .map(({ label, url, visibility }) => [label, url, visibility]),
      ).toEqual([
        ...(webChat ? [["Chat", "/chat", "trusted"]] : []),
        ["Studio", "/studio", "public"],
      ]);
      expect(
        (await shell.getAppInfo()).interactions
          .filter(({ pluginId }) => pluginId === "studio")
          .map(({ id, href, kind }) => [id, href, kind]),
      ).toEqual([
        ...(webChat ? [["chat", "/chat", "human"]] : []),
        ["studio", "/studio", "admin"],
      ]);
      shell.getInboxFollowUpRegistry().finalize();
      expect(
        shell
          .getInboxFollowUpRegistry()
          .listKinds()
          .map(({ kind }) => kind)
          .sort(),
      ).toEqual(
        [
          ...(webChat ? ["discuss-in-chat"] : []),
          "capture-as-note",
          "open-entity",
        ].sort(),
      );
    }
  });

  it("answers the workspace and jump contracts and hears entity and job activity", async () => {
    for (const executionOnly of [false, true]) {
      const { shell } = await installed({ executionOnly });
      const bus = shell.getMessageBus();
      const count = (name: string): number => bus.getHandlerCount(name);
      const expected = executionOnly ? 0 : 1;
      expect({
        executionOnly,
        jump: count(consoleJumpDestinationsContract.name),
        register: count(studioWorkspaceRegisterContract.name),
        unregister: count(studioWorkspaceUnregisterContract.name),
        contribute: count(studioOverviewContributionRegisterContract.name),
        withdraw: count(studioOverviewContributionUnregisterContract.name),
        jobProgress: count("job-progress"),
        created: count(ENTITY_CHANNELS.created),
        updated: count(ENTITY_CHANNELS.updated),
        deleted: count(ENTITY_CHANNELS.deleted),
      }).toEqual({
        executionOnly,
        jump: expected,
        register: expected,
        unregister: expected,
        contribute: expected,
        withdraw: expected,
        jobProgress: expected,
        created: expected,
        updated: expected,
        deleted: expected,
      });
    }
  });

  it("owns the grouping definitions type, and its source once every plugin has registered", async () => {
    const { shell, plugins } = await installed();
    const registry = shell.getEntityRegistry();
    expect(registry.hasEntityType("grouping-definitions")).toBe(true);
    expect(registry.getGroupingSourceType()).toBeUndefined();
    expect(
      registry.getPersistValidator("grouping-definitions"),
    ).toBeUndefined();
    expect(registry.getPersistValidator("note")).toBeUndefined();
    for (const plugin of plugins) await plugin.finalizeRegistration?.();
    expect(registry.getGroupingSourceType()).toBe("grouping-definitions");
    expect(registry.getEntityTypeConfig("grouping-definitions")).toMatchObject({
      classification: "system",
      embeddable: false,
      projectionSource: false,
      actionPolicy: {
        create: "admin",
        update: "admin",
        delete: "admin",
        publish: "never",
      },
    });
    expect(registry.getPersistValidator("grouping-definitions")).toBeFunction();
    // And keeps every grouping contributor's grouping fields valid on write.
    expect(registry.getPersistValidator("note")).toBeFunction();
  });
});

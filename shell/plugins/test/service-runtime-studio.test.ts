import { describe, expect, it, spyOn } from "bun:test";
import { z } from "@brains/utils/zod";
import type { CreateResult, EntityHierarchyPage } from "@brains/entity-service";
import { createMockShell, type MockShell } from "../src/test/mock-shell";
import { createTempDataDir } from "../src/test/temp-dir";
import { baseEntitySchema, createTestEntityAdapter } from "../test";
import { EntityRegistry } from "@brains/entity-service";
import { createSilentLogger } from "@brains/test-utils";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  serviceRuntime,
  type Plugin,
  type ServiceRuntime,
} from "../src";

/**
 * A first-party service converted from a class reaches what Studio's
 * service class did through its context: the Inbox follow-ups it offers,
 * the brain's readiness and channel descriptors, the editor's reads and
 * writes, the shared upload store, and the members it may assign.
 */

async function runtimeOn(
  shell: MockShell,
  executionOnly = false,
  id = "probe",
): Promise<{ runtime: ServiceRuntime; plugin: Plugin }> {
  let runtime: ServiceRuntime | undefined;
  const [plugin] = instantiatePluginPackageDefinition(
    defineServicePlugin({
      id,
      config: z.object({}),
      setup: (context) => {
        runtime = serviceRuntime(context);
        return {};
      },
    }),
    {},
    { name: `@brains/${id}`, version: "0.1.0" },
    { pluginId: id },
  );
  if (!plugin) throw new Error("No plugin");
  await plugin.register(
    shell,
    executionOnly ? { executionOnly: true } : undefined,
  );
  if (!runtime) throw new Error("Setup did not run");
  return { runtime, plugin };
}

describe("a first-party service reaching what Studio's class did", () => {
  it("offers an Inbox follow-up kind under its plugin id, as its class registered one", async () => {
    const shell = createMockShell();
    const { runtime } = await runtimeOn(shell);
    runtime.inboxFollowUpKind({
      kind: "open-entity",
      label: "Open source entity",
      priority: 30,
      mode: "universal",
      permissionLevel: "trusted",
      applies: () => true,
      resolve: () => ({ href: "/studio/entities/note/a" }),
    });
    const registry = shell.getInboxFollowUpRegistry();
    registry.finalize();
    expect(
      registry.listKinds().map(({ kind, label }) => [kind, label]),
    ).toEqual([["open-entity", "Open source entity"]]);
    // Under the plugin id: taking the plugin's kinds off takes it off.
    registry.unregisterPlugin("probe");
    expect(registry.listKinds()).toEqual([]);
  });

  it("reads the brain's readiness, as its class read context.readiness", async () => {
    const shell = createMockShell();
    const { runtime } = await runtimeOn(shell);
    expect(await runtime.readiness()).toEqual(
      await shell.getRuntimeReadiness(),
    );
  });

  it("lists the channel descriptors other packages registered, as its class did", async () => {
    const shell = createMockShell();
    const channels = shell.getChannelRegistry();
    channels.registerDescriptor("test-email", {
      type: "email",
      displayName: "Email",
      subjectLabel: "Email address",
    });
    channels.finalize();
    const { runtime } = await runtimeOn(shell);
    expect(runtime.channelDescriptors()).toEqual(channels.listDescriptors());
    expect(runtime.channelDescriptors().map(({ type }) => type)).toEqual([
      "email",
    ]);
  });

  it("reads a type's hierarchy and config and parses a document, as the editor did", async () => {
    const shell = createMockShell();
    const entities = shell.getEntityService();
    const { runtime } = await runtimeOn(shell);
    const request = {
      entityType: "note",
      visibilityScope: "public" as const,
    };
    const page: EntityHierarchyPage = {
      prefix: null,
      folders: [],
      entities: [],
      offset: 0,
      totalEntities: 0,
    };
    const query = spyOn(entities, "queryEntityHierarchy").mockResolvedValue(
      page,
    );
    expect(await runtime.entityReads.queryEntityHierarchy(request)).toBe(page);
    expect(query).toHaveBeenCalledWith(request);
    expect(runtime.entityReads.getEntityTypeConfig("note")).toEqual(
      entities.getEntityTypeConfig("note"),
    );
    expect(
      runtime.entityReads.deserializeEntity("---\ntitle: A\n---\nBody", "note"),
    ).toEqual(entities.deserializeEntity("---\ntitle: A\n---\nBody", "note"));
  });

  it("saves to the shared upload store and finds the handler a file's type promotes through, as Studio did", async () => {
    const shell = createMockShell({ dataDir: await createTempDataDir() });
    const handler = async (): Promise<CreateResult> => ({
      success: true,
      data: { entityId: "photo", status: "created" },
    });
    shell.getEntityRegistry().registerUploadSaveHandler({
      entityType: "image",
      mediaTypes: ["image/png"],
      handler,
    });
    const { runtime } = await runtimeOn(shell);
    expect(runtime.uploadSaveHandler("image/png")?.entityType).toBe("image");
    expect(runtime.uploadSaveHandler("text/plain")).toBeUndefined();

    const store = runtime.sharedUploads({ routePath: "/studio/api/uploads" });
    const saved = await store.save({
      filename: "a.png",
      mediaType: "image/png",
      content: Buffer.from("png"),
    });
    // The store create requests and promotion read: under upload.
    expect(saved.ref).toMatchObject({ kind: "upload", id: saved.id });
  });

  it("reaches the brain's groupings as Studio, and refuses them to any other package", async () => {
    const shell = createMockShell();
    const registry = EntityRegistry.createFresh(createSilentLogger());
    registry.registerEntityType(
      "grouping-definitions",
      baseEntitySchema,
      createTestEntityAdapter("grouping-definitions"),
    );
    spyOn(shell, "getEntityRegistry").mockReturnValue(registry);
    const entities = shell.getEntityService();
    const ready = spyOn(entities, "ensureGroupingsReady").mockResolvedValue(
      true,
    );
    const { runtime } = await runtimeOn(shell, false, "studio");
    const groupings = runtime.groupings();
    expect(groupings.getGroupings()).toEqual(registry.getGroupings());
    expect(await groupings.ensureGroupingsReady()).toBe(true);
    expect(ready).toHaveBeenCalled();
    let ensured = 0;
    groupings.registerGroupingSource({
      entityType: "grouping-definitions",
      ensureCurrent: async () => {
        ensured += 1;
      },
    });
    await groupings.ensureGroupingsCurrent();
    expect(ensured).toBe(1);

    const other = await runtimeOn(createMockShell(), false, "probe");
    expect(() => other.runtime.groupings()).toThrow(
      `Service "probe" cannot reach the brain's groupings: Studio owns them`,
    );
  });
});

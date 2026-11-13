import { describe, expect, it, spyOn } from "bun:test";
import type {
  BaseEntity,
  CreateResult,
  EntityHierarchyPage,
} from "@brains/entity-service";
import { createMockShell } from "../src/test/mock-shell";
import { createTempDataDir } from "../src/test/temp-dir";
import { baseEntitySchema, createTestEntityAdapter } from "../test";
import { EntityRegistry } from "@brains/entity-service";
import { createSilentLogger } from "@brains/test-utils";
import { deriveConsoleSurfaces } from "../src";
import { probeService } from "../src/test/probe-service-runtime";

/**
 * A first-party service converted from a class reaches what Studio's
 * service class did through its context: the Inbox follow-ups it offers,
 * the brain's readiness and channel descriptors, the editor's reads and
 * writes, the shared upload store, and the members it may assign.
 */

describe("a first-party service reaching what Studio's class did", () => {
  it("offers an Inbox follow-up kind under its plugin id, as its class registered one", async () => {
    const shell = createMockShell();
    const { runtime } = await probeService(shell);
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
    const readiness = await shell.getRuntimeReadiness();
    // One reading, so the comparison does not race the clock it stamps.
    const read = spyOn(shell, "getRuntimeReadiness").mockResolvedValue(
      readiness,
    );
    const { runtime } = await probeService(shell);
    expect(await runtime.readiness()).toBe(readiness);
    expect(read).toHaveBeenCalledTimes(1);
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
    const { runtime } = await probeService(shell);
    expect(runtime.channelDescriptors()).toEqual(channels.listDescriptors());
    expect(runtime.channelDescriptors().map(({ type }) => type)).toEqual([
      "email",
    ]);
  });

  it("reads a type's hierarchy and config and parses a document, as the editor did", async () => {
    const shell = createMockShell();
    const entities = shell.getEntityService();
    const { runtime } = await probeService(shell);
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
    const { runtime } = await probeService(shell);
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
    const { runtime } = await probeService(shell, { id: "studio" });
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

    const other = await probeService(createMockShell(), { id: "probe" });
    expect(() => other.runtime.groupings()).toThrow(
      `Service "probe" cannot reach the brain's groupings: Studio owns them`,
    );
  });

  it("keeps grouping fields valid on a contributing type or its own source type, and nowhere else", async () => {
    const shell = createMockShell();
    const registry = EntityRegistry.createFresh(createSilentLogger());
    registry.registerEntityType(
      "grouping-definitions",
      baseEntitySchema,
      createTestEntityAdapter("grouping-definitions"),
      { classification: "system" },
    );
    registry.registerEntityType(
      "note",
      baseEntitySchema,
      createTestEntityAdapter("note"),
    );
    registry.registerEntityType(
      "site-info",
      baseEntitySchema,
      createTestEntityAdapter("site-info", { isSingleton: true }),
    );
    spyOn(shell, "getEntityRegistry").mockReturnValue(registry);
    spyOn(shell.getEntityService(), "getEntityTypeConfig").mockImplementation(
      (type) => registry.getEntityTypeConfig(type),
    );
    const { runtime } = await probeService(shell, { id: "studio" });
    const groupings = runtime.groupings();
    const validator = async (): Promise<void> => {};
    groupings.registerGroupingSource({
      entityType: "grouping-definitions",
      ensureCurrent: async () => {},
    });
    groupings.registerPersistValidator("grouping-definitions", validator);
    groupings.registerPersistValidator("note", validator);
    expect(registry.getPersistValidator("grouping-definitions")).toBe(
      validator,
    );
    expect(registry.getPersistValidator("note")).toBe(validator);
    // A singleton contributes no grouping: nothing of Studio's guards it.
    expect(() =>
      groupings.registerPersistValidator("site-info", validator),
    ).toThrow(
      "Studio enforces groupings only on a contributing type or its grouping source: site-info is neither",
    );
  });

  it("reads what a type's adapter says of its records, and never the adapter itself", async () => {
    const shell = createMockShell();
    const registry = shell.getEntityRegistry();
    registry.registerEntityType(
      "note",
      baseEntitySchema,
      createTestEntityAdapter("note"),
    );
    const bodyless = createTestEntityAdapter("site-info", {
      isSingleton: true,
    });
    Object.assign(bodyless, {
      hasBody: false,
      metadataFromFrontmatter: true,
      getFolderTitles: (entity: { content: string }) => [entity.content],
    });
    registry.registerEntityType("site-info", baseEntitySchema, bodyless);
    const { runtime } = await probeService(shell);
    const shapes = runtime.entityShapes;
    expect(shapes.hasBody("note")).toBe(true);
    expect(shapes.hasBody("site-info")).toBe(false);
    expect(shapes.metadataFromFrontmatter("note")).toBe(false);
    expect(shapes.metadataFromFrontmatter("site-info")).toBe(true);
    expect(shapes.folderTitles("note")).toBeUndefined();
    expect(shapes.folderTitles("site-info")?.({ content: "Folder" })).toEqual([
      "Folder",
    ]);
    expect(shapes.isGroupingContributor("note")).toBe(
      shell.getEntityRegistry().isGroupingContributor("note"),
    );
    expect(Object.keys(shapes)).not.toContain("adapter");
  });

  it("names a record as its type's adapter names it, by the shared rule", async () => {
    const shell = createMockShell();
    const registry = shell.getEntityRegistry();
    const titled = createTestEntityAdapter("deck");
    Object.assign(titled, {
      displayTitle: (entity: { content: string }) => `Deck: ${entity.content}`,
    });
    registry.registerEntityType("deck", baseEntitySchema, titled);
    registry.registerEntityType(
      "note",
      baseEntitySchema,
      createTestEntityAdapter("note"),
    );
    const { runtime } = await probeService(shell);
    const record = (
      entityType: string,
      metadata: Record<string, unknown>,
    ): BaseEntity => ({
      id: "one",
      entityType,
      content: "Intro",
      contentHash: "",
      created: "2026-01-01T00:00:00.000Z",
      updated: "2026-01-01T00:00:00.000Z",
      visibility: "public" as const,
      metadata,
    });
    // The adapter's own title first, else the title its metadata holds.
    expect(runtime.entityShapes.displayTitle(record("deck", {}))).toBe(
      "Deck: Intro",
    );
    expect(
      runtime.entityShapes.displayTitle(record("note", { title: "Stored" })),
    ).toBe("Stored");
    expect(runtime.entityShapes.displayTitle(record("note", {}))).toBe(
      undefined,
    );
  });

  it("derives the console surfaces from the routes registered when asked, never handing them out", async () => {
    const shell = createMockShell();
    const { runtime } = await probeService(shell);
    const options = {
      activeId: "dashboard",
      permissionLevel: "admin",
      hasActiveSession: true,
    } as const;
    expect(runtime.consoleSurfaces(options)).toEqual(
      deriveConsoleSurfaces(shell.getPluginWebRoutes(), options),
    );
    expect(
      runtime.consoleSurfaces(options).some(({ id }) => id === "studio"),
    ).toBe(false);

    // A surface whose plugin registers later is offered once it has.
    shell.registerPlugin({
      id: "studio",
      version: "1.0.0",
      type: "service",
      packageName: "@brains/studio",
      register: async () => ({
        tools: [],
        resources: [],
        commands: [],
        handlers: [],
      }),
      getWebRoutes: () => [
        {
          path: "/studio",
          role: "studio",
          method: "GET",
          public: true,
          handler: async (): Promise<Response> => new Response("ok"),
        },
      ],
    });
    expect(runtime.consoleSurfaces(options)).toEqual(
      deriveConsoleSurfaces(shell.getPluginWebRoutes(), options),
    );
    expect(
      runtime.consoleSurfaces(options).find(({ id }) => id === "studio")?.href,
    ).toBe("/studio");
    expect(Object.keys(runtime)).not.toContain("webRoutes");
  });

  it("lists the members work can be assigned to, as its class read context.auth", async () => {
    const shell = createMockShell();
    const auth = shell.getAuthRegistry();
    const listed = spyOn(auth, "listAssignableMembers").mockResolvedValue([]);
    const { runtime } = await probeService(shell);
    expect(await runtime.assignableMembers()).toEqual([]);
    expect(listed).toHaveBeenCalledTimes(1);
  });
});

import { beforeEach, describe, expect, it } from "bun:test";
import { createSilentLogger, stubMethod } from "@brains/test-utils";
import {
  createPluginHarness,
  expectTemplateDataSourcesResolve,
} from "@brains/plugins/test";
import {
  bindPluginPackageMetadata,
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";
import { AtprotoProjectionRegistry } from "@brains/atproto-contracts";
import type {
  CreateExecutionContext,
  CreateInterceptor,
} from "@brains/plugins";
import linkPackage, { LINK_CAPTURE_JOB } from "../src";
import { createLinkContent } from "../src/lib/link-content";
import packageJson from "../package.json";

const PACKAGE_METADATA = {
  name: packageJson.name,
  version: packageJson.version,
};

function instantiate(config: object = {}): Plugin[] {
  bindPluginPackageMetadata(linkPackage, PACKAGE_METADATA);
  return instantiatePluginPackageDefinition(
    linkPackage,
    config,
    PACKAGE_METADATA,
  );
}

const executionContext: CreateExecutionContext = {
  interfaceType: "cli",
  actor: { kind: "user", userId: "tester" },
};

describe("link package", () => {
  // The projection registry is a singleton and stacks registrations.
  beforeEach(() => {
    AtprotoProjectionRegistry.resetInstance();
  });

  it("produces a service plugin for capture and an entity plugin for storage", () => {
    const plugins = instantiate();

    expect(plugins.map((plugin) => plugin.type)).toEqual(["service", "entity"]);
    expect(plugins.map((plugin) => plugin.id)).toEqual([
      `${packageJson.name}:capture`,
      `${packageJson.name}:link`,
    ]);
  });

  it("registers the entity type, its templates, and its data source", async () => {
    const plugins = instantiate();
    const entityPlugin = plugins.find((plugin) => plugin.type === "entity");
    if (!entityPlugin) throw new Error("Link entity plugin was not created");

    const harness = createPluginHarness({
      logger: createSilentLogger("link-package-test"),
    });
    await harness.installPlugin(entityPlugin);

    expect(harness.getEntityService().getEntityTypes()).toContain("link");
    const templateNames = [...harness.getTemplates().keys()];
    for (const name of ["extraction", "link-list", "link-detail"]) {
      expect(templateNames.some((template) => template.includes(name))).toBe(
        true,
      );
    }
    expect([...harness.getDataSources().keys()]).toContain(
      `${packageJson.name}:entities`,
    );
    // A template carries its data source id as a string and the registry
    // looks it up by exact match, so a stale id type-checks and fails only
    // when something renders.
    expectTemplateDataSourcesResolve(harness);

    harness.reset();
  });

  // Moved off the deleted adapter class: the registry builds the adapter
  // from the entity's `markdown` codec now, so that is what the round-trip
  // has to go through.
  it("round-trips a link through the adapter the registry hands out", async () => {
    const plugins = instantiate();
    const entityPlugin = plugins.find((plugin) => plugin.type === "entity");
    if (!entityPlugin) throw new Error("Link entity plugin was not created");
    const harness = createPluginHarness({
      logger: createSilentLogger("link-codec-test"),
    });
    await harness.installPlugin(entityPlugin);
    const adapter = harness.getEntityRegistry().getAdapter("link");

    const content = createLinkContent({
      status: "draft",
      title: "Test Article",
      url: "https://example.com/test",
      domain: "example.com",
      capturedAt: "2025-01-30T10:00:00.000Z",
      source: { ref: "cli:local", label: "CLI" },
      summary: "Test summary",
    });
    const entity = adapter.schema.parse({
      id: "test-id",
      entityType: "link",
      content,
      visibility: "public",
      metadata: { status: "draft", title: "Test Article" },
      contentHash: "hash",
      created: "2025-01-30T10:00:00.000Z",
      updated: "2025-01-30T10:00:00.000Z",
    });

    expect(adapter.toMarkdown(entity)).toContain("Test summary");
    // Only the two fields the codec indexes come back as metadata; the rest
    // stay in the content's frontmatter and are carried forward on write.
    expect(adapter.fromMarkdown(content).metadata).toEqual({
      status: "draft",
      title: "Test Article",
    });
    expect(adapter.extractMetadata(entity)).toEqual({
      status: "draft",
      title: "Test Article",
    });

    harness.reset();
  });

  it("exposes no tools — capture is reached through system_create", async () => {
    const plugins = instantiate();
    const entityPlugin = plugins.find((plugin) => plugin.type === "entity");
    if (!entityPlugin) throw new Error("Link entity plugin was not created");

    const harness = createPluginHarness({
      logger: createSilentLogger("link-tools-test"),
    });
    const capabilities = await harness.installPlugin(entityPlugin);

    expect(capabilities.tools).toHaveLength(0);
    harness.reset();
  });

  it("registers its atproto projection and releases it on shutdown", async () => {
    const plugins = instantiate();
    const entityPlugin = plugins.find((plugin) => plugin.type === "entity");
    if (!entityPlugin) throw new Error("Link entity plugin was not created");

    const harness = createPluginHarness({
      logger: createSilentLogger("link-atproto-test"),
    });
    await harness.installPlugin(entityPlugin);

    expect(
      AtprotoProjectionRegistry.getInstance().get("link")?.collection,
    ).toBe("ai.rizom.brain.link");

    await entityPlugin.shutdown?.();
    expect(AtprotoProjectionRegistry.getInstance().get("link")).toBeUndefined();

    harness.reset();
  });

  it("routes a create request to the capture job the package declares", async () => {
    const plugins = instantiate();
    const entityPlugin = plugins.find((plugin) => plugin.type === "entity");
    if (!entityPlugin) throw new Error("Link entity plugin was not created");

    const harness = createPluginHarness({
      logger: createSilentLogger("link-create-test"),
    });
    let interceptor: CreateInterceptor | undefined;
    const registry = harness.getEntityRegistry();
    stubMethod(registry, "registerCreateInterceptor", (_type, registered) => {
      interceptor = registered;
    });

    const enqueued: string[] = [];
    const shell = harness.getMockShell();
    const jobQueue = shell.getJobQueueService();
    stubMethod(jobQueue, "enqueue", async ({ type }) => {
      enqueued.push(type);
      return "job-1";
    });
    shell.getJobQueueService = (): typeof jobQueue => jobQueue;

    await harness.installPlugin(entityPlugin);
    if (!interceptor) throw new Error("Create interceptor was not registered");

    const handled = await interceptor(
      { entityType: "link", prompt: "save https://example.com" },
      executionContext,
    );

    expect(enqueued).toEqual([
      `${packageJson.name}:capture:${LINK_CAPTURE_JOB}`,
    ]);
    // Create is asynchronous: the runtime reports the job it queued rather
    // than claiming an entity that does not exist yet.
    expect(handled).toMatchObject({
      kind: "handled",
      result: { success: true, data: { status: "generating" } },
    });

    harness.reset();
  });

  it("refuses an upload, which is not a URL", async () => {
    const plugins = instantiate();
    const entityPlugin = plugins.find((plugin) => plugin.type === "entity");
    if (!entityPlugin) throw new Error("Link entity plugin was not created");

    const harness = createPluginHarness({
      logger: createSilentLogger("link-upload-test"),
    });
    let interceptor: CreateInterceptor | undefined;
    const registry = harness.getEntityRegistry();
    stubMethod(registry, "registerCreateInterceptor", (_type, registered) => {
      interceptor = registered;
    });

    await harness.installPlugin(entityPlugin);
    if (!interceptor) throw new Error("Create interceptor was not registered");

    expect(
      await interceptor(
        { entityType: "link", from: { kind: "upload", id: "upload-1" } },
        executionContext,
      ),
    ).toMatchObject({ kind: "handled", result: { success: false } });

    harness.reset();
  });
});

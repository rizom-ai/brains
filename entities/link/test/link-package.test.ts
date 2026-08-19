import { beforeEach, describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
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
import linkPackage, { LINK_CAPTURE_JOB } from "../src";
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
    let interceptor:
      | ((input: unknown, executionContext: unknown) => Promise<unknown>)
      | undefined;
    const registry = harness.getEntityRegistry();
    registry.registerCreateInterceptor = ((
      _entityType: string,
      registered: typeof interceptor,
    ): void => {
      interceptor = registered;
    }) as typeof registry.registerCreateInterceptor;

    const enqueued: string[] = [];
    const shell = harness.getMockShell();
    const jobQueue = shell.getJobQueueService();
    jobQueue.enqueue = (async (request: { type: string }) => {
      enqueued.push(request.type);
      return "job-1";
    }) as typeof jobQueue.enqueue;
    shell.getJobQueueService = (): typeof jobQueue => jobQueue;

    await harness.installPlugin(entityPlugin);
    if (!interceptor) throw new Error("Create interceptor was not registered");

    const handled = await interceptor(
      { entityType: "link", prompt: "save https://example.com" },
      {},
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
    let interceptor:
      | ((input: unknown, executionContext: unknown) => Promise<unknown>)
      | undefined;
    const registry = harness.getEntityRegistry();
    registry.registerCreateInterceptor = ((
      _entityType: string,
      registered: typeof interceptor,
    ): void => {
      interceptor = registered;
    }) as typeof registry.registerCreateInterceptor;

    await harness.installPlugin(entityPlugin);
    if (!interceptor) throw new Error("Create interceptor was not registered");

    expect(
      await interceptor({ entityType: "link", from: "upload-1" }, {}),
    ).toMatchObject({ kind: "handled", result: { success: false } });

    harness.reset();
  });
});

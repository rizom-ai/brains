import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { createSilentLogger, createTestEntity } from "@brains/test-utils";
import {
  createPluginHarness,
  expectTemplateDataSourcesResolve,
} from "@brains/plugins/test";
import type { PluginCapabilities } from "@brains/plugins/test";
import type {
  BaseEntity,
  EntityAdapter,
  JobEntityAccess,
  Plugin,
} from "@brains/plugins";
import portfolioPackage from "../src";
import { projectGeneration } from "../src/handlers/generation-handler";
import { projectEntityPlugin, PACKAGE_METADATA } from "./helpers/install";

describe("portfolio package", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let plugin: Plugin;
  let capabilities: PluginCapabilities;

  beforeEach(async () => {
    harness = createPluginHarness({ dataDir: "/tmp/test-datadir" });
    plugin = projectEntityPlugin();
    capabilities = await harness.installPlugin(plugin);
  });

  afterEach(() => {
    harness.reset();
  });

  it("declares one entity and no projections", () => {
    expect(portfolioPackage.entities.map(({ type }) => type)).toEqual([
      "project",
    ]);
    expect(portfolioPackage.projections).toEqual([]);
  });

  it("produces an entity plugin scoped to the package", () => {
    expect(plugin.id).toBe(`${PACKAGE_METADATA.name}:project`);
    expect(plugin.type).toBe("entity");
    expect(plugin.version).toBe(PACKAGE_METADATA.version);
  });

  it("provides no tools — projects are created through system_create", () => {
    expect(capabilities.tools).toHaveLength(0);
    expect(capabilities.resources).toEqual([]);
  });

  it("registers projects as secondary topic sources", () => {
    expect(
      harness.getEntityRegistry().getEntityTypeConfig("project"),
    ).toMatchObject({ projectionSourceRole: "secondary" });
  });

  it("routes a described project to the generation job", async () => {
    const localHarness = createPluginHarness({
      dataDir: "/tmp/test-datadir-portfolio-enqueue",
      logContext: "portfolio-plugin-test",
    });
    try {
      const mockShell = localHarness.getMockShell();
      const origJobQueue = mockShell.getJobQueueService();
      const enqueued: Array<{ type: string; data: unknown }> = [];
      mockShell.getJobQueueService = (): ReturnType<
        typeof mockShell.getJobQueueService
      > => ({
        ...origJobQueue,
        enqueue: async ({ type, data }): Promise<string> => {
          enqueued.push({ type, data });
          return "job-123";
        },
      });

      await localHarness.installPlugin(projectEntityPlugin());

      const interceptor = localHarness
        .getEntityRegistry()
        .getCreateInterceptor("project");
      if (!interceptor) throw new Error("Expected project create interceptor");

      const result = await interceptor(
        {
          entityType: "project",
          prompt:
            "Create a portfolio case study for my API Gateway project from 2024",
          title: "API Gateway",
        },
        {
          interfaceType: "test",
          actor: { kind: "user", userId: "test-user" },
        },
      );

      expect(result).toMatchObject({
        kind: "handled",
        result: { success: true, data: { status: "generating" } },
      });

      // The runtime hands the create request through as-is; the job reads
      // the year out of it rather than the route parsing it first.
      expect(enqueued).toHaveLength(1);
      expect(enqueued[0]?.type).toBe("project:generation");
      expect(enqueued[0]?.data).toMatchObject({
        prompt:
          "Create a portfolio case study for my API Gateway project from 2024",
        title: "API Gateway",
      });
    } finally {
      localHarness.reset();
    }
  });

  // A project needs a year — it is required metadata — so a request without
  // one is refused with a message rather than creating an entity that
  // cannot validate.
  it("refuses generation when no year can be found", async () => {
    const entityService = harness.getEntityService();
    const entities: JobEntityAccess = {
      listEntities: (request) => entityService.listEntities(request),
      getEntity: (request) => entityService.getEntity(request),
      getEntityTypes: () => entityService.getEntityTypes(),
      search: (request) => entityService.search(request),
      get: async () => null,
      create: (entity) => entityService.createEntity({ entity }),
      update: (entity) => entityService.updateEntity({ entity }),
      createPending: async () => ({ entityId: "x", created: true }),
      saveProcessed: async () => ({
        entityId: "x",
        jobId: "j",
        skipped: false,
      }),
    };

    const result = await projectGeneration.generate({
      input: { prompt: "Create a case study for my API Gateway project" },
      entityId: undefined,
      ai: harness.getEntityContext("test").ai,
      logger: harness.getMockShell().getLogger(),
      entities,
      conversations: { get: async () => null },
      identity: harness.getEntityContext("test").identity,
      messaging: { publish: async (): Promise<void> => {} },
      progress: { report: async (): Promise<void> => {} },
      signal: new AbortController().signal,
    });

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining("year"),
    });
  });

  // A template carries its data source id as a string and the registry looks
  // it up by exact match, so a stale id type-checks and fails only when
  // something renders.
  it("registers templates that point at data sources it declares", async () => {
    const harness = createPluginHarness({
      logger: createSilentLogger("portfolio-datasource-test"),
    });
    await harness.installPlugin(projectEntityPlugin());

    expectTemplateDataSourcesResolve(harness);

    harness.reset();
  });

  // These round-trips used to be asserted against ProjectAdapter's own
  // toMarkdown/fromMarkdown. The declarative entity builds its adapter from
  // the `markdown` codec on `project`, so the class's copies stopped
  // running when the package converted.
  describe("the project markdown codec", () => {
    function adapterFor(
      installed: ReturnType<typeof createPluginHarness>,
    ): EntityAdapter<BaseEntity> {
      return installed.getEntityRegistry().getAdapter<BaseEntity>("project");
    }

    it("indexes the queryable fields and derives a slug", () => {
      const parsed = adapterFor(harness).fromMarkdown(
        [
          "---",
          "title: Roundtrip Project",
          "status: draft",
          "description: A description",
          "year: 2024",
          "---",
          "",
          "## Context",
          "",
          "Context content.",
        ].join("\n"),
      );

      expect(parsed.metadata).toMatchObject({
        title: "Roundtrip Project",
        slug: "roundtrip-project",
        status: "draft",
        year: 2024,
      });
    });

    it("keeps a slug the frontmatter already carries", () => {
      const parsed = adapterFor(harness).fromMarkdown(
        [
          "---",
          "title: Roundtrip Project",
          "slug: custom-slug",
          "status: draft",
          "description: A description",
          "year: 2024",
          "---",
          "",
          "Body",
        ].join("\n"),
      );

      expect(parsed.metadata?.["slug"]).toBe("custom-slug");
    });

    it("writes the frontmatter back out", () => {
      const adapter = adapterFor(harness);
      const original = [
        "---",
        "title: Roundtrip Project",
        "status: draft",
        "description: A description",
        "year: 2024",
        "---",
        "",
        "## Context",
        "",
        "Context content.",
      ].join("\n");
      const parsed = adapter.fromMarkdown(original);
      if (!parsed.metadata) throw new Error("The codec returned no metadata");

      const written = adapter.toMarkdown(
        createTestEntity<BaseEntity>("project", {
          id: "roundtrip-project",
          content: original,
          metadata: parsed.metadata,
        }),
      );

      expect(written).toContain("title: Roundtrip Project");
      expect(written).toContain("slug: roundtrip-project");
      expect(written).toContain("## Context");
    });
  });
});

import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createPluginHarness } from "../../src/test/harness";
import { createSilentLogger } from "@brains/test-utils";
import { EntityPlugin } from "../../src/entity/entity-plugin";
import type { EntityPluginContext } from "../../src/entity/context";
import type { DerivedEntityProjection } from "../../src/entity/derived-entity-projection";
import { z } from "@brains/utils";
import type { CreateInterceptionResult } from "@brains/entity-service";
import { baseEntitySchema, BaseEntityAdapter } from "@brains/entity-service";

// Test schema
const testFrontmatterSchema = z.object({
  title: z.string(),
  slug: z.string(),
});

const testSchema = baseEntitySchema.extend({
  metadata: testFrontmatterSchema,
});

type TestEntity = z.infer<typeof testSchema>;

const testPkg = {
  name: "@test/entity",
  version: "1.0.0",
  description: "Test entity plugin",
};

class TestAdapter extends BaseEntityAdapter<TestEntity> {
  constructor() {
    super({
      entityType: "test-item",
      schema: testSchema,
      frontmatterSchema: testFrontmatterSchema,
    });
  }
  override toMarkdown(entity: TestEntity): string {
    return entity.content;
  }
  fromMarkdown(content: string): Partial<TestEntity> {
    return { content };
  }
}

// Minimal EntityPlugin subclass (no derive)
class TestEntityPlugin extends EntityPlugin<TestEntity> {
  readonly entityType = "test-item";
  readonly schema = testSchema;
  readonly adapter = new TestAdapter();

  constructor() {
    super("test-item", testPkg);
  }
}

class InterceptingEntityPlugin extends EntityPlugin<TestEntity> {
  readonly entityType = "intercepting-item";
  readonly schema = testSchema;
  readonly adapter = new TestAdapter();

  constructor() {
    super("intercepting-item", testPkg);
  }

  protected override async interceptCreate(input: {
    entityType: string;
    title?: string;
  }): Promise<CreateInterceptionResult> {
    return {
      kind: "continue" as const,
      input: {
        ...input,
        title: "rewritten-title",
      },
    };
  }
}

class ProjectionEntityPlugin extends EntityPlugin<TestEntity> {
  readonly entityType = "projection-item";
  readonly schema = testSchema;
  readonly adapter = new TestAdapter();

  constructor() {
    super("projection-item", testPkg);
  }

  protected override getDerivedEntityProjections(
    _context: EntityPluginContext,
  ): DerivedEntityProjection[] {
    return [
      {
        id: "projection-item-sync",
        targetType: "projection-item",
        job: {
          type: "project",
          handler: {
            process: async () => ({ success: true }),
            validateAndParse: (data) => data as { reason: string },
          },
        },
        initialSync: {
          jobData: { reason: "initial-sync" },
        },
      },
    ];
  }
}

describe("EntityPlugin", () => {
  let harness: ReturnType<typeof createPluginHarness>;

  beforeEach(() => {
    harness = createPluginHarness({
      logger: createSilentLogger("entity-plugin-test"),
    });
  });

  describe("registration", () => {
    it("should register with correct type", async () => {
      const plugin = new TestEntityPlugin();
      await harness.installPlugin(plugin);

      expect(plugin.type).toBe("entity");
    });

    it("should return zero tools", async () => {
      const plugin = new TestEntityPlugin();
      const capabilities = await harness.installPlugin(plugin);

      expect(capabilities.tools).toHaveLength(0);
    });

    it("should return zero resources", async () => {
      const plugin = new TestEntityPlugin();
      const capabilities = await harness.installPlugin(plugin);

      expect(capabilities.resources).toHaveLength(0);
    });

    it("should register entity type with entity service", async () => {
      const plugin = new TestEntityPlugin();
      await harness.installPlugin(plugin);

      const entityService = harness.getEntityService();
      expect(entityService.getEntityTypes()).toContain("test-item");
    });

    it("should have correct id from entityType", async () => {
      const plugin = new TestEntityPlugin();
      await harness.installPlugin(plugin);

      expect(plugin.id).toBe("test-item");
    });

    it("should auto-register create interceptor when interceptCreate() is overridden", async () => {
      const plugin = new InterceptingEntityPlugin();
      await harness.installPlugin(plugin);

      const interceptor = harness
        .getEntityRegistry()
        .getCreateInterceptor("intercepting-item");
      expect(interceptor).toBeDefined();

      const result = await interceptor?.(
        { entityType: "intercepting-item", title: "original-title" },
        { interfaceType: "test", userId: "test-user" },
      );
      expect(result).toEqual({
        kind: "continue",
        input: {
          entityType: "intercepting-item",
          title: "rewritten-title",
        },
      });
    });

    it("should auto-register declared derived entity projections", async () => {
      const registerHandler = mock(() => {});
      const enqueue = mock(async () => "job-1");
      harness.getMockShell().getJobQueueService = (): never =>
        ({
          enqueue,
          registerHandler,
          getActiveJobs: async () => [],
          getActiveBatches: async () => [],
          getBatchStatus: async () => null,
          getStatus: async () => null,
        }) as never;

      const plugin = new ProjectionEntityPlugin();
      await harness.installPlugin(plugin);

      expect(registerHandler).toHaveBeenCalledWith(
        "projection-item:project",
        expect.any(Object),
        "projection-item",
      );

      await harness.sendMessage(
        "sync:initial:completed",
        { success: true },
        "directory-sync",
      );

      expect(enqueue).toHaveBeenCalledWith({
        type: "projection-item:project",
        data: { reason: "initial-sync" },
        options: expect.objectContaining({ source: "projection-item" }),
      });
    });
  });

  describe("prompts namespace", () => {
    it("should have context.prompts.resolve available", async () => {
      const plugin = new TestEntityPlugin();
      await harness.installPlugin(plugin);

      const context = harness.getEntityContext(plugin.id);
      expect(context.prompts).toBeDefined();
      expect(typeof context.prompts.resolve).toBe("function");
    });

    it("should return fallback when no prompt entity exists", async () => {
      const plugin = new TestEntityPlugin();
      await harness.installPlugin(plugin);

      const context = harness.getEntityContext(plugin.id);
      const result = await context.prompts.resolve(
        "test:generation",
        "My default prompt",
      );

      expect(result).toBe("My default prompt");
    });
  });

  describe("projection-only extraction", () => {
    it("should not auto-register legacy extract handlers", async () => {
      const registeredHandlers: string[] = [];
      const mockShell = harness.getMockShell();
      const origJobQueue = mockShell.getJobQueueService();
      const trackingJobQueue = {
        ...origJobQueue,
        registerHandler: (type: string): void => {
          registeredHandlers.push(type);
        },
      };
      mockShell.getJobQueueService = (): ReturnType<
        typeof mockShell.getJobQueueService
      > => trackingJobQueue as ReturnType<typeof mockShell.getJobQueueService>;

      const plugin = new TestEntityPlugin();
      await plugin.register(mockShell);

      expect(registeredHandlers).not.toContain("test-item:extract");
    });
  });
});

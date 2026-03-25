import { describe, it, expect, beforeEach } from "bun:test";
import { createPluginHarness } from "../../src/test/harness";
import { createSilentLogger } from "@brains/test-utils";
import { EntityPlugin, type DeriveEvent } from "../../src/entity/entity-plugin";
import type { EntityPluginContext } from "../../src/entity/context";
import { z } from "@brains/utils";
import type { BaseEntity } from "@brains/entity-service";
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
  toMarkdown(entity: TestEntity): string {
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

// EntityPlugin subclass with derive() implementation
class DerivedEntityPlugin extends EntityPlugin<TestEntity> {
  readonly entityType = "derived-item";
  readonly schema = testSchema;
  readonly adapter = new TestAdapter();
  public deriveCalls: Array<{
    source: BaseEntity;
    event: DeriveEvent;
  }> = [];

  constructor() {
    super("derived-item", testPkg);
  }

  public deriveAllCalled = false;

  public override async derive(
    source: BaseEntity,
    event: DeriveEvent,
    _context: EntityPluginContext,
  ): Promise<void> {
    this.deriveCalls.push({ source, event });
  }

  public override async deriveAll(
    _context: EntityPluginContext,
  ): Promise<void> {
    this.deriveAllCalled = true;
  }
}

function createTestSourceEntity(): BaseEntity {
  return {
    id: "source-1",
    entityType: "post",
    content: "# Hello World\n\nSome content here.",
    contentHash: "abc123",
    metadata: { title: "Hello World" },
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };
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
  });

  describe("derive()", () => {
    it("should be optional — plugins without derive() work normally", async () => {
      const plugin = new TestEntityPlugin();
      await harness.installPlugin(plugin);

      expect(plugin.hasDeriveHandler()).toBe(false);
    });

    it("should report hasDeriveHandler() = true when derive() is overridden", async () => {
      const plugin = new DerivedEntityPlugin();
      await harness.installPlugin(plugin);

      expect(plugin.hasDeriveHandler()).toBe(true);
    });

    it("should call derive() with source entity and event", async () => {
      const plugin = new DerivedEntityPlugin();
      await harness.installPlugin(plugin);

      const source = createTestSourceEntity();
      const context = harness.getEntityContext(plugin.id);
      await plugin.derive(source, "created", context);

      expect(plugin.deriveCalls).toHaveLength(1);
      expect(plugin.deriveCalls[0]?.source.id).toBe("source-1");
      expect(plugin.deriveCalls[0]?.event).toBe("created");
    });

    it("should support multiple derive() calls", async () => {
      const plugin = new DerivedEntityPlugin();
      await harness.installPlugin(plugin);

      const source1 = createTestSourceEntity();
      const source2 = { ...createTestSourceEntity(), id: "source-2" };
      const context = harness.getEntityContext(plugin.id);

      await plugin.derive(source1, "created", context);
      await plugin.derive(source2, "updated", context);

      expect(plugin.deriveCalls).toHaveLength(2);
      expect(plugin.deriveCalls[1]?.event).toBe("updated");
    });

    it("should call deriveAll() directly", async () => {
      const plugin = new DerivedEntityPlugin();
      await harness.installPlugin(plugin);

      const context = harness.getEntityContext(plugin.id);
      await plugin.deriveAll(context);

      expect(plugin.deriveAllCalled).toBe(true);
    });

    it("should default deriveAll() to no-op for plugins without it", async () => {
      const plugin = new TestEntityPlugin();
      await harness.installPlugin(plugin);

      const context = harness.getEntityContext(plugin.id);
      // Should not throw
      await plugin.deriveAll(context);
    });
  });

  describe("extract handler auto-registration", () => {
    it("should not register extract handler for plugins without derive()", async () => {
      const registeredHandlers: string[] = [];
      const mockShell = harness.getMockShell();
      const origJobQueue = mockShell.getJobQueueService();
      const trackingJobQueue = {
        ...origJobQueue,
        registerHandler: (type: string) => {
          registeredHandlers.push(type);
        },
      };
      mockShell.getJobQueueService = () =>
        trackingJobQueue as ReturnType<typeof mockShell.getJobQueueService>;

      const plugin = new TestEntityPlugin();
      await plugin.register(mockShell);

      expect(registeredHandlers).not.toContain("test-item:extract");
    });

    it("should auto-register extract handler for plugins with derive()", async () => {
      const registeredHandlers: string[] = [];
      const mockShell = harness.getMockShell();
      const origJobQueue = mockShell.getJobQueueService();
      const trackingJobQueue = {
        ...origJobQueue,
        registerHandler: (type: string) => {
          registeredHandlers.push(type);
        },
      };
      mockShell.getJobQueueService = () =>
        trackingJobQueue as ReturnType<typeof mockShell.getJobQueueService>;

      const plugin = new DerivedEntityPlugin();
      await plugin.register(mockShell);

      expect(registeredHandlers).toContain("derived-item:extract");
    });
  });
});

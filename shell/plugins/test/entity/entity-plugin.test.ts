import { describe, it, expect, beforeEach } from "bun:test";
import { createPluginHarness } from "../../src/test/harness";
import { createSilentLogger } from "@brains/test-utils";
import { EntityPlugin } from "../../src/entity/entity-plugin";
import { z } from "@brains/utils";
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

// Minimal EntityPlugin subclass
class TestEntityPlugin extends EntityPlugin<TestEntity> {
  readonly entityType = "test-item";
  readonly schema = testSchema;
  readonly adapter = new TestAdapter();

  constructor() {
    super("test-item", testPkg);
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
  });
});

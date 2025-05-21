import { describe, expect, test, beforeEach } from "bun:test";
import { z } from "zod";
import { EntityRegistry, EntityAdapter } from "../../src/entity/entityRegistry";
import { Logger } from "../../src/utils/logger";
import { BaseEntity, IContentModel, baseEntitySchema } from "../../src/types";

// Define a test entity type
const testEntitySchema = baseEntitySchema.extend({
  entityType: z.literal("test"),
  title: z.string(),
  content: z.string()
});

type TestEntity = z.infer<typeof testEntitySchema> & IContentModel;

// Create a test adapter
class TestEntityAdapter implements EntityAdapter<TestEntity> {
  fromMarkdown(markdown: string, metadata?: Record<string, any>): TestEntity {
    // Simple implementation that assumes frontmatter is already parsed
    const frontMatter = metadata || {};
    const contentStart = markdown.indexOf('---\n\n') + 5;
    const content = markdown.substring(contentStart).trim();
    
    return {
      id: frontMatter.id || "test-id",
      entityType: "test",
      created: frontMatter.created || new Date().toISOString(),
      updated: frontMatter.updated || new Date().toISOString(),
      tags: frontMatter.tags || [],
      title: frontMatter.title || "Test Title",
      content: content,
      toMarkdown: () => content
    };
  }
  
  extractMetadata(entity: TestEntity): Record<string, any> {
    return {
      title: entity.title,
      tags: entity.tags
    };
  }
  
  parseFrontMatter(markdown: string): Record<string, any> {
    // Simple implementation that just looks for basic frontmatter format
    if (!markdown.startsWith('---\n')) {
      return {};
    }
    
    const endIndex = markdown.indexOf('---\n', 4);
    if (endIndex === -1) {
      return {};
    }
    
    const frontMatterRaw = markdown.substring(4, endIndex);
    // Parse a very simple frontmatter format (key: value)
    const result: Record<string, any> = {};
    frontMatterRaw.split('\n').forEach(line => {
      const [key, value] = line.split(': ');
      if (key && value) {
        if (key === 'tags') {
          result[key] = value.split(',').map(tag => tag.trim());
        } else {
          result[key] = value.trim();
        }
      }
    });
    
    return result;
  }
  
  generateFrontMatter(entity: TestEntity): string {
    // Create simple frontmatter
    const lines = [
      '---',
      `id: ${entity.id}`,
      `entityType: ${entity.entityType}`,
      `title: ${entity.title}`,
      `created: ${entity.created}`,
      `updated: ${entity.updated}`,
      `tags: ${entity.tags.join(', ')}`,
      '---'
    ];
    
    return lines.join('\n');
  }
}

describe("EntityRegistry", () => {
  let registry: EntityRegistry;
  let logger: Logger;
  let adapter: TestEntityAdapter;
  
  beforeEach(() => {
    // Reset singletons
    EntityRegistry.resetInstance();
    Logger.resetInstance();
    
    // Create fresh instances
    logger = Logger.createFresh({ level: 5 }); // Silent for tests
    registry = EntityRegistry.createFresh(logger);
    adapter = new TestEntityAdapter();
    
    // Register test entity type
    registry.registerEntityType("test", testEntitySchema, adapter);
  });
  
  test("registers and retrieves entity types", () => {
    expect(registry.hasEntityType("test")).toBe(true);
    expect(registry.hasEntityType("nonexistent")).toBe(false);
    
    expect(registry.getAllEntityTypes()).toEqual(["test"]);
    
    const schema = registry.getSchema("test");
    expect(schema).toBeDefined();
    
    const retrievedAdapter = registry.getAdapter("test");
    expect(retrievedAdapter).toBeDefined();
  });
  
  test("validates entity against schema", () => {
    const validEntity: TestEntity = {
      id: "test-1",
      entityType: "test",
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      tags: ["tag1", "tag2"],
      title: "Test Entity",
      content: "This is a test entity",
      toMarkdown: () => "This is a test entity"
    };
    
    const validated = registry.validateEntity("test", validEntity);
    expect(validated).toEqual(validEntity);
    
    // Test invalid entity
    const invalidEntity = { ...validEntity, entityType: "invalid" };
    expect(() => registry.validateEntity("test", invalidEntity)).toThrow();
  });
  
  test("converts entity to markdown and back", () => {
    const entity: TestEntity = {
      id: "test-1",
      entityType: "test",
      created: "2023-01-01T00:00:00Z",
      updated: "2023-01-01T01:00:00Z",
      tags: ["tag1", "tag2"],
      title: "Test Entity",
      content: "This is a test entity",
      toMarkdown: () => "This is a test entity"
    };
    
    const markdown = registry.entityToMarkdown(entity);
    expect(markdown).toContain("id: test-1");
    expect(markdown).toContain("entityType: test");
    expect(markdown).toContain("This is a test entity");
    
    // Simple test for roundtrip - this depends on our test adapter implementation
    const roundtripEntity = registry.markdownToEntity<TestEntity>("test", markdown);
    expect(roundtripEntity.id).toEqual(entity.id);
    expect(roundtripEntity.entityType).toEqual(entity.entityType);
    expect(roundtripEntity.title).toEqual(entity.title);
  });
});
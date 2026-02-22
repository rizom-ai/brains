import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { DirectorySyncPlugin } from "../src/plugin";
import { createPluginHarness } from "@brains/plugins/test";
import type { BaseEntity, EntityAdapter } from "@brains/plugins/test";
import { baseEntitySchema } from "@brains/plugins/test";
import type { z } from "@brains/utils";
import { createTestEntity } from "@brains/test-utils";
import { join } from "path";
import { tmpdir } from "os";
import { existsSync, rmSync, readFileSync, mkdirSync } from "fs";

// Series adapter that preserves coverImageId in frontmatter
class SeriesTestAdapter implements EntityAdapter<BaseEntity> {
  public readonly entityType = "series";
  public readonly schema = baseEntitySchema;
  public readonly supportsCoverImage = true;

  fromMarkdown(markdown: string): Partial<BaseEntity> {
    // Store full markdown including frontmatter
    return {
      content: markdown,
      entityType: "series",
      metadata: this.extractMetadataFromMarkdown(markdown),
    };
  }

  toMarkdown(entity: BaseEntity): string {
    // Parse existing frontmatter to preserve coverImageId
    const frontmatterMatch = entity.content.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      // Content already has frontmatter, return as-is
      return entity.content;
    }
    // No frontmatter, just return content
    return entity.content;
  }

  extractMetadata(_entity: BaseEntity): Record<string, unknown> {
    return {};
  }

  private extractMetadataFromMarkdown(
    markdown: string,
  ): Record<string, unknown> {
    const frontmatterMatch = markdown.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch?.[1]) return {};

    const metadata: Record<string, unknown> = {};
    const lines = frontmatterMatch[1].split("\n");
    for (const line of lines) {
      const [key, ...valueParts] = line.split(":");
      if (key && valueParts.length > 0) {
        metadata[key.trim()] = valueParts.join(":").trim();
      }
    }
    return metadata;
  }

  parseFrontMatter<TFrontmatter>(
    _markdown: string,
    schema: z.ZodSchema<TFrontmatter>,
  ): TFrontmatter {
    return schema.parse({});
  }

  generateFrontMatter(_entity: BaseEntity): string {
    return "";
  }
}

describe("entity:updated subscriber", () => {
  let harness: ReturnType<typeof createPluginHarness<DirectorySyncPlugin>>;
  let plugin: DirectorySyncPlugin;
  let syncPath: string;

  beforeEach(async () => {
    syncPath = join(tmpdir(), `test-entity-subscriber-${Date.now()}`);

    harness = createPluginHarness<DirectorySyncPlugin>({
      dataDir: syncPath,
    });

    const shell = harness.getShell();
    const entityRegistry = shell.getEntityRegistry();
    entityRegistry.registerEntityType(
      "series",
      baseEntitySchema,
      new SeriesTestAdapter(),
    );

    plugin = new DirectorySyncPlugin({
      syncPath,
      autoSync: true, // Enable auto-sync to register entity:updated subscriber
      initialSync: false,
    });

    await harness.installPlugin(plugin);
  });

  afterEach(() => {
    harness.reset();
    if (existsSync(syncPath)) {
      rmSync(syncPath, { recursive: true, force: true });
    }
  });

  describe("coverImageId preservation (regression)", () => {
    it("should preserve coverImageId when entity:updated is emitted", async () => {
      // This is a regression test for the bug where coverImageId was stripped
      // during the sync process.

      const contentWithCover = `---
coverImageId: series-test-cover
name: Test Series
slug: test-series
---
# Test Series`;

      const entity: BaseEntity = createTestEntity("series", {
        id: "series-test-series",
        content: contentWithCover,
        metadata: { name: "Test Series", slug: "test-series" },
      });

      // Save entity to DB first (subscriber fetches from DB)
      const entityService = harness.getShell().getEntityService();
      await entityService.upsertEntity(entity);

      // Create series directory
      const seriesDir = join(syncPath, "series");
      if (!existsSync(seriesDir)) {
        mkdirSync(seriesDir, { recursive: true });
      }

      // Simulate entity:updated event (what happens after import job completes)
      await harness.sendMessage("entity:updated", {
        entity,
        entityType: "series",
        entityId: entity.id,
      });

      // Give subscriber time to process
      await new Promise((resolve) => setTimeout(resolve, 100));

      const filePath = join(seriesDir, `${entity.id}.md`);
      expect(existsSync(filePath)).toBe(true);

      const fileContent = readFileSync(filePath, "utf-8");
      expect(fileContent).toContain("coverImageId: series-test-cover");
      expect(fileContent).toContain("name: Test Series");
    });

    it("should write correct content when entity has coverImageId in frontmatter", async () => {
      const contentWithCover = `---
coverImageId: series-ecosystem-cover
name: Ecosystem Architecture
slug: ecosystem-architecture
---
# Ecosystem Architecture

Some content here.`;

      const entity: BaseEntity = createTestEntity("series", {
        id: "series-ecosystem-architecture",
        content: contentWithCover,
        metadata: {
          name: "Ecosystem Architecture",
          slug: "ecosystem-architecture",
        },
      });

      // Save entity to DB first (subscriber fetches from DB)
      const entityService = harness.getShell().getEntityService();
      await entityService.upsertEntity(entity);

      // Create series directory
      const seriesDir = join(syncPath, "series");
      mkdirSync(seriesDir, { recursive: true });

      // Publish entity:updated
      await harness.sendMessage("entity:updated", {
        entity,
        entityType: "series",
        entityId: entity.id,
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      const filePath = join(seriesDir, `${entity.id}.md`);
      expect(existsSync(filePath)).toBe(true);

      const fileContent = readFileSync(filePath, "utf-8");
      expect(fileContent).toContain("coverImageId: series-ecosystem-cover");
      expect(fileContent).toContain("name: Ecosystem Architecture");
      expect(fileContent).toContain("slug: ecosystem-architecture");
      expect(fileContent).toContain("# Ecosystem Architecture");
      expect(fileContent).toContain("Some content here.");
    });
  });

  describe("stale event payload (regression)", () => {
    it("should fetch current entity from DB instead of using stale event payload", async () => {
      // This tests the bug where old embedding jobs emit entity:updated with stale data.
      // The subscriber should fetch current entity from DB, not trust the payload.

      const staleContent = `---
name: Test Series
slug: test-series
---
# Test Series`;

      const currentContent = `---
coverImageId: series-test-cover
name: Test Series
slug: test-series
---
# Test Series`;

      // First, save the CURRENT entity to the database (with coverImageId)
      const currentEntity: BaseEntity = createTestEntity("series", {
        id: "series-stale-test",
        content: currentContent,
        metadata: {
          name: "Test Series",
          slug: "test-series",
          coverImageId: "series-test-cover",
        },
      });

      const entityService = harness.getShell().getEntityService();
      await entityService.upsertEntity(currentEntity);

      // Create series directory
      const seriesDir = join(syncPath, "series");
      mkdirSync(seriesDir, { recursive: true });

      // Simulate a STALE entity:updated event (from old job with outdated data)
      const staleEntity: BaseEntity = createTestEntity("series", {
        id: "series-stale-test",
        content: staleContent, // Missing coverImageId!
        metadata: { name: "Test Series", slug: "test-series" },
      });

      await harness.sendMessage("entity:updated", {
        entity: staleEntity, // Stale payload
        entityType: "series",
        entityId: staleEntity.id,
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check that file was written with CURRENT content (from DB), not stale payload
      const filePath = join(seriesDir, "series-stale-test.md");

      expect(existsSync(filePath)).toBe(true);
      const fileContent = readFileSync(filePath, "utf-8");

      // Should have coverImageId from current DB entity, not stale payload
      expect(fileContent).toContain("coverImageId: series-test-cover");
    });
  });
});

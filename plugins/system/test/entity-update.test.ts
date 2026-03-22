import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { SystemPlugin } from "../src/plugin";
import {
  createPluginHarness,
  expectSuccess,
  expectError,
  expectConfirmation,
} from "@brains/plugins/test";
import { createTestEntity } from "@brains/test-utils";
import type { BaseEntity } from "@brains/plugins";
import { z } from "@brains/utils";

const postMetadataSchema = z.object({
  title: z.string(),
  status: z.string(),
  slug: z.string(),
});

describe("entity_update tool", () => {
  let harness: ReturnType<typeof createPluginHarness>;

  beforeEach(async () => {
    harness = createPluginHarness({ dataDir: "/tmp/test-datadir" });
    await harness.installPlugin(new SystemPlugin());
  });

  afterEach(() => {
    harness.reset();
  });

  describe("partial field updates", () => {
    it("should return confirmation with diff when updating fields", async () => {
      const entity = createTestEntity<BaseEntity>("post", {
        id: "my-post",
        content:
          "---\ntitle: Old Title\nstatus: draft\nslug: my-post\n---\nBody text.",
        metadata: { title: "Old Title", status: "draft", slug: "my-post" },
      });
      await harness.getEntityService().upsertEntity(entity);

      const result = await harness.executeTool("system_update", {
        entityType: "post",
        id: "my-post",
        fields: { title: "New Title" },
      });

      expectConfirmation(result);
      expect(result.toolName).toBe("system_update");
      expect(result.description).toContain("Old Title");
      expect(result.description).toContain("New Title");
    });

    it("should apply field updates after confirmation", async () => {
      const entity = createTestEntity<BaseEntity>("post", {
        id: "my-post",
        content:
          "---\ntitle: Old Title\nstatus: draft\nslug: my-post\n---\nBody text.",
        metadata: { title: "Old Title", status: "draft", slug: "my-post" },
      });
      await harness.getEntityService().upsertEntity(entity);

      const result = await harness.executeTool("system_update", {
        entityType: "post",
        id: "my-post",
        fields: { title: "New Title" },
        confirmed: true,
      });

      expectSuccess(result);

      const updated = await harness
        .getEntityService()
        .getEntity("post", "my-post");
      expect(updated).not.toBeNull();
      expect(updated).not.toBeNull();
      const updatedMeta = postMetadataSchema.parse(updated?.metadata);
      expect(updatedMeta.title).toBe("New Title");
    });

    it("should not modify entity on first call (confirmation only)", async () => {
      const entity = createTestEntity<BaseEntity>("post", {
        id: "my-post",
        content:
          "---\ntitle: Original\nstatus: draft\nslug: my-post\n---\nBody.",
        metadata: { title: "Original", status: "draft", slug: "my-post" },
      });
      await harness.getEntityService().upsertEntity(entity);

      await harness.executeTool("system_update", {
        entityType: "post",
        id: "my-post",
        fields: { title: "Changed" },
      });

      const fetched = await harness
        .getEntityService()
        .getEntity("post", "my-post");
      expect(fetched).not.toBeNull();
      const fetchedMeta = postMetadataSchema.parse(fetched?.metadata);
      expect(fetchedMeta.title).toBe("Original");
    });
  });

  describe("full content replacement", () => {
    it("should return confirmation with diff for content replacement", async () => {
      const entity = createTestEntity<BaseEntity>("post", {
        id: "my-post",
        content:
          "---\ntitle: My Post\nstatus: draft\nslug: my-post\n---\nOld body.",
        metadata: { title: "My Post", status: "draft", slug: "my-post" },
      });
      await harness.getEntityService().upsertEntity(entity);

      const result = await harness.executeTool("system_update", {
        entityType: "post",
        id: "my-post",
        content:
          "---\ntitle: My Post\nstatus: draft\nslug: my-post\n---\nNew body.",
      });

      expectConfirmation(result);
      expect(result.description).toContain("Old body");
      expect(result.description).toContain("New body");
    });

    it("should apply content replacement after confirmation", async () => {
      const entity = createTestEntity<BaseEntity>("post", {
        id: "my-post",
        content:
          "---\ntitle: My Post\nstatus: draft\nslug: my-post\n---\nOld body.",
        metadata: { title: "My Post", status: "draft", slug: "my-post" },
      });
      await harness.getEntityService().upsertEntity(entity);

      const result = await harness.executeTool("system_update", {
        entityType: "post",
        id: "my-post",
        content:
          "---\ntitle: My Post\nstatus: draft\nslug: my-post\n---\nNew body.",
        confirmed: true,
      });

      expectSuccess(result);

      const updated = await harness
        .getEntityService()
        .getEntity("post", "my-post");
      expect(updated).not.toBeNull();
      expect(updated?.content).toContain("New body");
    });
  });

  describe("validation", () => {
    it("should return error for nonexistent entity", async () => {
      const result = await harness.executeTool("system_update", {
        entityType: "post",
        id: "no-such-post",
        fields: { title: "New" },
      });

      expectError(result);
      expect(result.error).toContain("not found");
    });

    it("should update published entity after confirmation", async () => {
      const entity = createTestEntity<BaseEntity>("post", {
        id: "pub-post",
        content:
          "---\ntitle: Published\nstatus: published\nslug: pub-post\n---\nContent.",
        metadata: {
          title: "Published",
          status: "published",
          slug: "pub-post",
        },
      });
      await harness.getEntityService().upsertEntity(entity);

      const result = await harness.executeTool("system_update", {
        entityType: "post",
        id: "pub-post",
        fields: { title: "Updated Published" },
        confirmed: true,
      });

      expectSuccess(result);
      const updated = await harness
        .getEntityService()
        .getEntity("post", "pub-post");
      expect(updated).not.toBeNull();
      const pubMeta = postMetadataSchema.parse(updated?.metadata);
      expect(pubMeta.title).toBe("Updated Published");
    });
  });
});

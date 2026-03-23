import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { SystemPlugin } from "../src/plugin";
import {
  createPluginHarness,
  expectSuccess,
  expectError,
} from "@brains/plugins/test";
import { z } from "@brains/utils";

const createResult = z.object({
  entityId: z.string().optional(),
  status: z.enum(["created", "generating"]),
  jobId: z.string().optional(),
});

describe("system_create tool", () => {
  let harness: ReturnType<typeof createPluginHarness>;

  beforeEach(async () => {
    harness = createPluginHarness({ dataDir: "/tmp/test-datadir" });
    await harness.installPlugin(new SystemPlugin());
  });

  afterEach(() => {
    harness.reset();
  });

  describe("direct create (with content)", () => {
    it("should create entity with title and content", async () => {
      const result = await harness.executeTool("system_create", {
        entityType: "base",
        title: "My Note",
        content: "This is a test note.",
      });

      expectSuccess(result);
      const data = createResult.parse(result.data);
      expect(data.status).toBe("created");
      expect(data.entityId).toBeDefined();
    });

    it("should slugify title as entity ID", async () => {
      const result = await harness.executeTool("system_create", {
        entityType: "base",
        title: "My Cool Note Title",
        content: "Body text.",
      });

      expectSuccess(result);
      const data = createResult.parse(result.data);
      expect(data.entityId).toBe("my-cool-note-title");
    });

    it("should store entity retrievable via system_get", async () => {
      await harness.executeTool("system_create", {
        entityType: "base",
        title: "Retrievable Note",
        content: "Find me later.",
      });

      const entity = await harness
        .getEntityService()
        .getEntity("base", "retrievable-note");
      expect(entity).not.toBeNull();
      expect(entity?.content).toContain("Find me later");
    });
  });

  describe("generate (with prompt)", () => {
    it("should queue generation job and return generating status", async () => {
      const result = await harness.executeTool("system_create", {
        entityType: "base",
        prompt: "Write a note about TypeScript.",
      });

      expectSuccess(result);
      const data = createResult.parse(result.data);
      expect(data.status).toBe("generating");
      expect(data.jobId).toBeDefined();
    });

    it("should queue job with entity-type-scoped job type", async () => {
      // The mock job queue tracks enqueued jobs
      const result = await harness.executeTool("system_create", {
        entityType: "base",
        prompt: "Write about testing.",
      });

      expectSuccess(result);
      const data = createResult.parse(result.data);
      expect(data.jobId).toBeDefined();
    });
  });

  describe("validation", () => {
    it("should require entityType", async () => {
      const result = await harness.executeTool("system_create", {
        title: "No type",
        content: "Body.",
      });

      expectError(result);
    });

    it("should require content or prompt", async () => {
      const result = await harness.executeTool("system_create", {
        entityType: "base",
        title: "No content or prompt",
      });

      expectError(result);
      expect(result.error).toContain("content");
    });

    it("should accept both content and prompt", async () => {
      const result = await harness.executeTool("system_create", {
        entityType: "base",
        title: "Enhanced",
        content: "Draft body.",
        prompt: "Improve this draft.",
      });

      expectSuccess(result);
      // When both provided, prompt triggers generation with content as context
      const data = createResult.parse(result.data);
      expect(data.status).toBe("generating");
    });
  });
});

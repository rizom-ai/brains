import { describe, it, expect } from "bun:test";
import { topicSourceSchema } from "../src/schemas/topic";
import { createTopicsTools } from "../src/tools";
import { createMockServicePluginContext } from "@brains/test-utils";

describe("TopicSource schema", () => {
  it("should require entityId field", () => {
    const sourceWithoutEntityId = {
      slug: "test-post",
      title: "Test Post",
      type: "post",
      contentHash: "abc123",
    };

    const result = topicSourceSchema.safeParse(sourceWithoutEntityId);
    expect(result.success).toBe(false);
  });

  it("should require contentHash field", () => {
    const sourceWithoutHash = {
      slug: "test-post",
      title: "Test Post",
      type: "post",
      entityId: "post-123",
    };

    const result = topicSourceSchema.safeParse(sourceWithoutHash);
    expect(result.success).toBe(false);
  });

  it("should validate complete source with all fields", () => {
    const completeSource = {
      slug: "test-post",
      title: "Test Post",
      type: "post",
      entityId: "post-123",
      contentHash: "abc123def456",
    };

    const result = topicSourceSchema.safeParse(completeSource);
    expect(result.success).toBe(true);
  });
});

describe("batch-extract tool", () => {
  it("should exist and be exported from topics plugin tools", () => {
    const context = createMockServicePluginContext();
    const tools = createTopicsTools(context);
    const batchExtractTool = tools.find((t) => t.name === "batch-extract");

    expect(batchExtractTool).toBeDefined();
    if (batchExtractTool) {
      expect(batchExtractTool.name).toBe("batch-extract");
    }
  });

  it("should have correct input schema", () => {
    const context = createMockServicePluginContext();
    const tools = createTopicsTools(context);
    const batchExtractTool = tools.find((t) => t.name === "batch-extract");

    expect(batchExtractTool).toBeDefined();

    if (batchExtractTool) {
      // The inputSchema is a ZodRawShape, not a full schema
      // We can check it has the expected keys
      const schemaShape = batchExtractTool.inputSchema;
      expect(schemaShape).toHaveProperty("entityTypes");
      expect(schemaShape).toHaveProperty("limit");
      expect(schemaShape).toHaveProperty("dryRun");
    }
  });
});

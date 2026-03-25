import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { SystemPlugin } from "../src/plugin";
import {
  createPluginHarness,
  expectSuccess,
  expectError,
} from "@brains/plugins/test";

describe("system_extract tool", () => {
  let harness: ReturnType<typeof createPluginHarness>;

  beforeEach(async () => {
    harness = createPluginHarness({ dataDir: "/tmp/test-datadir" });
    await harness.installPlugin(new SystemPlugin());
  });

  afterEach(() => {
    harness.reset();
  });

  it("should exist as a registered tool", () => {
    const capabilities = harness.getCapabilities();
    const toolNames = capabilities.tools.map((t) => t.name);
    expect(toolNames).toContain("system_extract");
  });

  it("should require entityType parameter", async () => {
    const result = await harness.executeTool("system_extract", {});

    expectError(result);
  });

  it("should return error for unknown entity type", async () => {
    const result = await harness.executeTool("system_extract", {
      entityType: "nonexistent",
    });

    expectError(result);
    expect(result.error).toContain("nonexistent");
  });

  it("should enqueue extract job for entity type with source", async () => {
    // Add entities — addEntities auto-registers the entity types
    harness.addEntities([
      {
        id: "post-1",
        entityType: "post",
        content: "# Test Post\n\nSome content.",
        metadata: { title: "Test Post" },
      },
      {
        id: "topic-1",
        entityType: "topic",
        content: "# Topic",
        metadata: { title: "Topic" },
      },
    ]);

    const result = await harness.executeTool("system_extract", {
      entityType: "topic",
      source: "post-1",
    });

    expectSuccess(result);
    expect(result.data).toHaveProperty("status", "extracting");
    expect(result.data).toHaveProperty("entityType", "topic");
    expect(result.data).toHaveProperty("source", "post-1");
  });

  it("should enqueue extract job without source for batch extraction", async () => {
    // Register the entity type
    harness.addEntities([
      {
        id: "topic-1",
        entityType: "topic",
        content: "# Topic",
        metadata: { title: "Topic" },
      },
    ]);

    const result = await harness.executeTool("system_extract", {
      entityType: "topic",
    });

    expectSuccess(result);
    expect(result.data).toHaveProperty("status", "extracting");
    expect(result.data).toHaveProperty("jobId");
  });
});

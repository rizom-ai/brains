import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { PluginTestHarness } from "../src/harness";
import { TestDataGenerator } from "../src/test-data";
import type { Plugin, PluginCapabilities } from "@brains/types";

describe("PluginTestHarness", () => {
  let harness: PluginTestHarness;

  beforeEach(async () => {
    harness = new PluginTestHarness();
    await harness.setup();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it("should initialize with mock services", async () => {
    const entityService = harness.getEntityService();
    expect(entityService).toBeDefined();
    expect(entityService.createEntity).toBeDefined();
    expect(entityService.getEntity).toBeDefined();
    expect(entityService.listEntities).toBeDefined();
  });

  it("should create test entities", async () => {
    const noteData = TestDataGenerator.note();
    const note = await harness.createTestEntity("base", noteData);

    expect(note.id).toBeDefined();
    expect(note.title).toBe(noteData.title ?? "Test Note");
    expect(note.content).toBe(noteData.content ?? "This is test content");
    expect(note.entityType).toBe("base");
  });

  it("should retrieve created entities", async () => {
    const note = await harness.createTestEntity(
      "base",
      TestDataGenerator.note(),
    );

    const retrieved = await harness.getEntity("base", note.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe(note.id);
  });

  it("should list entities", async () => {
    const count = 3;
    for (const data of TestDataGenerator.notes(count)) {
      await harness.createTestEntity("base", data);
    }

    const entities = await harness.listEntities("base");
    expect(entities).toHaveLength(count);
  });

  it("should execute queries", async () => {
    await harness.createTestEntity(
      "base",
      TestDataGenerator.note({
        title: "Test Query Note",
        content: "Content for query testing",
      }),
    );

    const result = await harness.query("Test Query Note");
    expect(result).toBeDefined();
  });

  it("should install plugins", async () => {
    const testPlugin: Plugin = {
      id: "test-plugin",
      name: "Test Plugin",
      version: "1.0.0",
      register: async () => {
        const capabilities: PluginCapabilities = {
          tools: [
            {
              name: "test_tool",
              description: "Test tool",
              inputSchema: {},
              handler: async () => ({ success: true }),
            },
          ],
          resources: [],
        };
        return capabilities;
      },
    };

    await harness.installPlugin(testPlugin);

    const installedPlugins = harness.getInstalledPlugins();
    expect(installedPlugins).toContain(testPlugin);
  });

  it("should create temp directories", () => {
    const tempDir = harness.getTempDir();
    expect(tempDir).toBeDefined();

    const subdir = harness.createTempSubdir("test-subdir");
    expect(subdir).toContain("test-subdir");
  });

  it("should provide plugin context", () => {
    const context = harness.getPluginContext();
    expect(context.registry).toBeDefined();
    expect(context.logger).toBeDefined();
  });
});

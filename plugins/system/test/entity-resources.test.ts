import { describe, expect, it, beforeEach } from "bun:test";
import { SystemPlugin } from "../src/plugin";
import { createPluginHarness } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import type { BaseEntity, PluginResourceTemplate } from "@brains/plugins";

describe("System Plugin Entity Resource Templates", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  const registeredTemplates: PluginResourceTemplate[] = [];

  beforeEach(async () => {
    registeredTemplates.length = 0;

    harness = createPluginHarness({
      logger: createSilentLogger("system-entity-resources-test"),
    });

    // Intercept resource template registration
    const shell = harness.getMockShell();
    shell.registerPluginResourceTemplate = (
      _pluginId: string,
      template: PluginResourceTemplate,
    ): void => {
      registeredTemplates.push(template);
    };

    const plugin = new SystemPlugin();
    await harness.installPlugin(plugin);
  });

  it("should register entity://{type} template", () => {
    const template = registeredTemplates.find(
      (t) => t.uriTemplate === "entity://{type}",
    );
    expect(template).toBeDefined();
    expect(template?.name).toBe("entity-list");
    expect(template?.mimeType).toBe("application/json");
  });

  it("should register entity://{type}/{id} template", () => {
    const template = registeredTemplates.find(
      (t) => t.uriTemplate === "entity://{type}/{id}",
    );
    expect(template).toBeDefined();
    expect(template?.name).toBe("entity-detail");
    expect(template?.mimeType).toBe("text/markdown");
  });

  describe("entity-list handler", () => {
    it("should return entities as JSON array", async () => {
      const entity: BaseEntity = {
        id: "test-post",
        entityType: "post",
        content: "---\ntitle: Test Post\nslug: test-post\n---\nHello",
        contentHash: "abc",
        metadata: { title: "Test Post", slug: "test-post" },
        created: "2024-01-01",
        updated: "2024-01-01",
      };
      harness.getMockShell().addEntities([entity]);

      const template = registeredTemplates.find(
        (t) => t.uriTemplate === "entity://{type}",
      );
      if (!template) throw new Error("entity-list template not found");

      const result = await template.handler({ type: "post" });
      const content = result.contents[0];
      if (!content) throw new Error("No content returned");

      expect(content.uri).toBe("entity://post");
      expect(content.mimeType).toBe("application/json");

      const items = JSON.parse(content.text);
      expect(Array.isArray(items)).toBe(true);
      expect(items).toHaveLength(1);
      expect(items[0].id).toBe("test-post");
    });

    it("should throw for unknown entity type", async () => {
      const template = registeredTemplates.find(
        (t) => t.uriTemplate === "entity://{type}",
      );
      if (!template) throw new Error("entity-list template not found");

      expect(template.handler({ type: "nonexistent" })).rejects.toThrow(
        "Unknown entity type: nonexistent",
      );
    });
  });

  describe("entity-detail handler", () => {
    it("should return entity content as markdown", async () => {
      const entity: BaseEntity = {
        id: "my-post",
        entityType: "post",
        content: "---\ntitle: My Post\nslug: my-post\n---\n# Hello World",
        contentHash: "abc",
        metadata: { title: "My Post", slug: "my-post" },
        created: "2024-01-01",
        updated: "2024-01-01",
      };
      harness.getMockShell().addEntities([entity]);

      const template = registeredTemplates.find(
        (t) => t.uriTemplate === "entity://{type}/{id}",
      );
      if (!template) throw new Error("entity-detail template not found");

      const result = await template.handler({ type: "post", id: "my-post" });
      const content = result.contents[0];
      if (!content) throw new Error("No content returned");

      expect(content.uri).toBe("entity://post/my-post");
      expect(content.mimeType).toBe("text/markdown");
      expect(content.text).toContain("Hello World");
    });

    it("should throw when entity not found", async () => {
      const template = registeredTemplates.find(
        (t) => t.uriTemplate === "entity://{type}/{id}",
      );
      if (!template) throw new Error("entity-detail template not found");

      expect(
        template.handler({ type: "post", id: "nonexistent" }),
      ).rejects.toThrow();
    });
  });
});

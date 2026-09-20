import { describe, expect, test } from "bun:test";
import { parseAskContent } from "@brains/contracts";
import { generateMarkdownWithFrontmatter } from "@brains/sdk/entities";
import { instantiatePluginPackageDefinition } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { createTestEntity } from "@brains/entity-service/test";
import askContentPackage, { askContent } from "../src";

describe("Ask content entity", () => {
  test("registers as an independent singleton with a fixed identity", async () => {
    const harness = createPluginHarness();
    try {
      await harness.installPlugins(
        instantiatePluginPackageDefinition(
          askContentPackage,
          {},
          { name: "@brains/ask-content", version: "0.0.0" },
        ),
      );
      const adapter = harness
        .getMockShell()
        .getEntityRegistry()
        .getAdapter("ask-content");
      expect(adapter.entityType).toBe("ask-content");
      expect(adapter.isSingleton).toBe(true);
      expect(
        adapter.frontmatterSchema?.parse({
          title: "Ask",
          topics: ["Welcome"],
        }),
      ).toEqual({ title: "Ask", topics: ["Welcome"] });
      expect(
        adapter.frontmatterSchema?.safeParse({ topics: ["x".repeat(501)] })
          .success,
      ).toBe(false);
      expect(
        harness.getEntityService().getEntityTypeConfig("ask-content")
          .embeddable,
      ).toBe(false);
      const entity = createTestEntity("ask-content", {
        id: "ask-content",
        metadata: {},
      });
      expect(adapter.schema.safeParse(entity).success).toBe(true);
      expect(
        adapter.schema.safeParse({ ...entity, id: "another" }).success,
      ).toBe(false);
      expect(askContent.singleton).toBe(true);
    } finally {
      await harness.reset();
    }
  });
  test("round trips authored copy through markdown and preserves empty metadata", async () => {
    const harness = createPluginHarness();
    try {
      await harness.installPlugins(
        instantiatePluginPackageDefinition(
          askContentPackage,
          {},
          { name: "@brains/ask-content", version: "0.0.0" },
        ),
      );
      const markdown = generateMarkdownWithFrontmatter("Welcome copy.", {
        title: "Ask",
        topics: ["Topic"],
      });
      await harness.getEntityService().createEntity({
        entity: {
          id: "ask-content",
          entityType: "ask-content",
          content: markdown,
          metadata: {},
        },
      });
      const entity = await harness
        .getEntityService()
        .getEntity({ entityType: "ask-content", id: "ask-content" });
      expect(entity?.entityType).toBe("ask-content");
      expect(entity?.metadata).toEqual({});
      expect(parseAskContent(entity?.content ?? "")).toEqual({
        title: "Ask",
        topics: ["Topic"],
        introduction: "Welcome copy.",
      });
    } finally {
      await harness.reset();
    }
  });
  test("does not manufacture a welcome", () => {
    const encoded = askContent.markdown?.encode({ content: "", metadata: {} });
    if (!encoded) throw new Error("Missing codec");
    expect(
      parseAskContent(
        generateMarkdownWithFrontmatter(encoded.content, encoded.frontmatter),
      ),
    ).toEqual({});
  });
});

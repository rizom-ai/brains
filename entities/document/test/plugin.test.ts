import { describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { DocumentPlugin, documentPlugin } from "../src";

describe("DocumentPlugin", () => {
  it("registers the document entity type", () => {
    const plugin = new DocumentPlugin();

    expect(plugin.entityType).toBe("document");
    expect(plugin.adapter.entityType).toBe("document");
  });

  it("factory returns a plugin", () => {
    expect(documentPlugin().id).toBe("document");
  });

  it("registers the manual document_generate tool", async () => {
    const harness = createPluginHarness<DocumentPlugin>();
    const capabilities = await harness.installPlugin(new DocumentPlugin());

    expect(capabilities.tools.map((tool) => tool.name)).toEqual([
      "document_generate",
    ]);
  });
});

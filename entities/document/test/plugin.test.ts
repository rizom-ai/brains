import { describe, expect, it } from "bun:test";
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
});

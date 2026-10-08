import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  createPluginHarness,
  expectTemplateDataSourcesResolve,
} from "@brains/plugins/test";
import { instantiatePluginPackageDefinition } from "@brains/plugins";
import bookPackage from "../src";

describe("book declarations", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  beforeEach(async () => {
    harness = createPluginHarness();
    await harness.installPlugins(
      instantiatePluginPackageDefinition(
        bookPackage,
        {},
        { name: "@brains/book", version: "0.0.0-test" },
      ),
    );
  });
  afterEach(async () => {
    await harness.reset();
  });
  it("registers book and resolves every declared template datasource", () => {
    expect(harness.getEntityService().getEntityTypes()).toContain("book");
    expectTemplateDataSourcesResolve(harness);
    expect([...harness.getDataSources().keys()].sort()).toEqual([
      "@brains/book:ask",
      "@brains/book:entities",
      "@brains/book:theme",
    ]);
  });
  it("keeps books read-only, in reading order, as canonical topic sources", () => {
    expect(
      harness.getEntityRegistry().getEntityTypeConfig("book"),
    ).toMatchObject({
      classification: "content",
      includeInBroadSearch: true,
      projectionSourceRole: "canonical",
      defaultSort: [{ field: "id", direction: "asc" }],
      actionPolicy: {
        create: "never",
        update: "never",
        delete: "never",
        extract: "never",
        publish: "never",
      },
    });
  });
  it("lets topic extraction read books", () => {
    expect(
      harness.getEntityRegistry().getEntityTypeConfig("book").projectionSource,
    ).not.toBe(false);
  });
});

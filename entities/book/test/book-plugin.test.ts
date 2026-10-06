import { beforeEach, describe, expect, it } from "bun:test";
import {
  createPluginHarness,
  type PluginTestHarness,
} from "@brains/plugins/test";
import { BookPlugin } from "../src";

describe("BookPlugin", () => {
  let harness: PluginTestHarness<BookPlugin>;

  beforeEach(() => {
    harness = createPluginHarness<BookPlugin>({
      dataDir: "/tmp/test-datadir",
    });
  });

  it("registers the book entity type", async () => {
    await harness.installPlugin(new BookPlugin());

    expect(harness.getEntityService().getEntityTypes()).toContain("book");
  });

  it("keeps books read-only, in reading order, as canonical topic sources", async () => {
    await harness.installPlugin(new BookPlugin());

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

  it("lets topic extraction read books", async () => {
    await harness.installPlugin(new BookPlugin());

    expect(
      harness.getEntityRegistry().getEntityTypeConfig("book").projectionSource,
    ).not.toBe(false);
  });
});

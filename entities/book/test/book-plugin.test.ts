import { beforeEach, describe, expect, it } from "bun:test";
import {
  createPluginHarness,
  type PluginTestHarness,
} from "@brains/plugins/test";
import { BookPlugin } from "../src";

const readOnly = {
  create: "never",
  update: "never",
  delete: "never",
  extract: "never",
  publish: "never",
};

describe("BookPlugin", () => {
  let harness: PluginTestHarness<BookPlugin>;

  beforeEach(async () => {
    harness = createPluginHarness<BookPlugin>({
      dataDir: "/tmp/test-datadir",
    });
    await harness.installPlugin(new BookPlugin());
  });

  it("registers books and their sections as two types", () => {
    expect(harness.getEntityService().getEntityTypes()).toEqual(
      expect.arrayContaining(["book", "book-section"]),
    );
  });

  it("keeps sections read-only, in reading order, as canonical topic sources", () => {
    expect(
      harness.getEntityRegistry().getEntityTypeConfig("book-section"),
    ).toMatchObject({
      classification: "content",
      includeInBroadSearch: true,
      projectionSourceRole: "canonical",
      defaultSort: [{ field: "id", direction: "asc" }],
      actionPolicy: readOnly,
      // A section lives in its book: stored, shown and deleted with it.
      containedIn: "book",
    });
    expect(
      harness.getEntityRegistry().getEntityTypeConfig("book-section")
        .projectionSource,
    ).not.toBe(false);
  });

  it("keeps books read-only and out of topic extraction: a contents list is no text", () => {
    expect(
      harness.getEntityRegistry().getEntityTypeConfig("book"),
    ).toMatchObject({
      classification: "content",
      includeInBroadSearch: true,
      projectionSource: false,
      projectionSourceRole: "excluded",
      actionPolicy: readOnly,
    });
  });
});

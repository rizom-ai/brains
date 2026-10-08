import { describe, expect, it } from "bun:test";
import { entityDisplaySchema } from "../src";

describe("entityDisplaySchema", () => {
  it("lets a site name the template for an entity type's pages", () => {
    expect(
      entityDisplaySchema.parse({
        label: "Theme",
        detailTemplate: "book:theme",
      }),
    ).toEqual({ label: "Theme", detailTemplate: "book:theme" });
  });

  it("still rejects fields it does not know", () => {
    expect(() =>
      entityDisplaySchema.parse({ label: "Theme", template: "book:theme" }),
    ).toThrow();
  });
});

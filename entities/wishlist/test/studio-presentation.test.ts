import { describe, expect, it } from "bun:test";
import { wishFrontmatterSchema, wishMetadataSchema } from "../src";

function widget(field: { meta(): unknown }): unknown {
  const meta = field.meta();
  return typeof meta === "object" && meta !== null
    ? Reflect.get(meta, "studioWidget")
    : undefined;
}

describe("a wish in Studio", () => {
  it("edits the metadata it registers, with the derived slug hidden", () => {
    expect(
      Object.fromEntries(
        Object.entries(wishMetadataSchema.shape)
          .map(([name, field]) => [name, widget(field)])
          .filter(([, value]) => value !== undefined),
      ),
    ).toEqual({ requested: "provenance", slug: "hidden" });
  });

  it("shows where it came from as facts and hides its bookkeeping", () => {
    const shape = wishFrontmatterSchema.shape;
    expect(
      Object.fromEntries(
        Object.entries(shape)
          .map(([name, field]) => [name, widget(field)])
          .filter(([, value]) => value !== undefined),
      ),
    ).toEqual({
      requested: "provenance",
    });
  });
});

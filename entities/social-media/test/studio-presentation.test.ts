import { describe, expect, it } from "bun:test";
import { socialPostFrontmatterSchema } from "../src/schemas/social-post";

function widget(field: { meta(): unknown }): unknown {
  const meta = field.meta();
  return typeof meta === "object" && meta !== null
    ? Reflect.get(meta, "studioWidget")
    : undefined;
}

describe("a social post in Studio", () => {
  it("shows where it came from as facts and hides its bookkeeping", () => {
    const shape = socialPostFrontmatterSchema.shape;
    expect(
      Object.fromEntries(
        Object.entries(shape)
          .map(([name, field]) => [name, widget(field)])
          .filter(([, value]) => value !== undefined),
      ),
    ).toEqual({
      publishedAt: "provenance",
      platformPostId: "provenance",
      sourceEntityId: "provenance",
      sourceEntityType: "provenance",
    });
  });
});

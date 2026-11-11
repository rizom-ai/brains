import { describe, expect, it } from "bun:test";
import {
  socialPostFrontmatterSchema,
  socialPostMetadataSchema,
} from "../src/schemas/social-post";

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

  it("leaves out the record's own slug, error and the slug a file states", () => {
    const shape = socialPostMetadataSchema.shape;
    expect(
      Object.entries(shape)
        .filter(([, field]) => widget(field) === "hidden")
        .map(([name]) => name),
    ).toEqual(["slug", "error", "statedSlug"]);
  });

  it("gives the vault no platform or status a file does not state, as the frontmatter schema did", () => {
    const { platform, status } = socialPostMetadataSchema.shape;
    expect(platform.safeParse(undefined).success).toBe(false);
    expect(status.safeParse(undefined).success).toBe(false);
  });
});

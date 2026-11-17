import { describe, expect, it } from "bun:test";
import {
  slugStatingFrontmatter,
  slugStatingMetadata,
} from "../../src/entity/slug-stating";

describe("metadata read from frontmatter that may state a slug", () => {
  it("keeps a stated slug and marks it authored", () => {
    expect(
      slugStatingMetadata({ title: "On Ships", slug: "ships" }, {}),
    ).toEqual({ title: "On Ships", slug: "ships", authoredSlug: true });
  });

  it("resolves the slug from the title when the file states none", () => {
    expect(slugStatingMetadata({ title: "On Ships" }, {})).toEqual({
      title: "On Ships",
      slug: "on-ships",
    });
  });

  it("carries the error a failed generation recorded, and nothing that is not text", () => {
    expect(
      slugStatingMetadata({ title: "T" }, { error: "Model unavailable" }),
    ).toEqual({ title: "T", slug: "t", error: "Model unavailable" });
    expect(slugStatingMetadata({ title: "T" }, { error: 3 })).toEqual({
      title: "T",
      slug: "t",
    });
  });
});

describe("frontmatter written for a type that may state a slug", () => {
  const fields = { status: "draft", excerpt: undefined };

  it("writes an authored slug under the title, where the file stated it", () => {
    expect(
      Object.entries(
        slugStatingFrontmatter(
          { title: "T", slug: "stated", authoredSlug: true },
          fields,
        ),
      ),
    ).toEqual([
      ["title", "T"],
      ["slug", "stated"],
      ["status", "draft"],
    ]);
  });

  it("writes a resolved slug after the fields, then a recorded error", () => {
    expect(
      Object.entries(
        slugStatingFrontmatter(
          { title: "T", slug: "t", error: "Failed" },
          fields,
        ),
      ),
    ).toEqual([
      ["title", "T"],
      ["status", "draft"],
      ["slug", "t"],
      ["error", "Failed"],
    ]);
  });
});

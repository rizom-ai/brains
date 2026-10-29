import { describe, expect, it } from "bun:test";
import { guideFrontmatterSchema } from "../src";

const frontmatter = {
  title: "Moving in as a writer",
  slug: "writer",
  order: 10,
  persona: "The writer",
  for: "You have years of essays and a folder of drafts.",
  recipe: "professional" as const,
  material: [
    {
      from: "Drafts and fragments",
      where: "Google Docs, Word, a notes app",
      becomes: "note",
      how: "Download as Markdown, bring the files in",
    },
  ],
};

describe("guideFrontmatterSchema", () => {
  it("accepts a guide for a kind of user", () => {
    expect(guideFrontmatterSchema.parse(frontmatter)).toEqual(frontmatter);
  });

  it("accepts a guide that names no recipe, as the self-hosting guide does", () => {
    const { recipe: _recipe, ...withoutRecipe } = frontmatter;

    const parsed = guideFrontmatterSchema.parse(withoutRecipe);

    expect(parsed.recipe).toBeNull();
  });

  it.each(["personal", "professional", "team"])(
    "accepts the %s recipe to start from",
    (recipe) => {
      expect(
        guideFrontmatterSchema.safeParse({ ...frontmatter, recipe }).success,
      ).toBe(true);
    },
  );

  it("rejects a recipe a guide cannot start from", () => {
    expect(
      guideFrontmatterSchema.safeParse({ ...frontmatter, recipe: "headless" })
        .success,
    ).toBe(false);
  });

  it("rejects a guide without the sentence describing its reader", () => {
    const { for: _for, ...withoutFor } = frontmatter;

    expect(guideFrontmatterSchema.safeParse(withoutFor).success).toBe(false);
  });

  it("rejects a guide without a slug", () => {
    const { slug: _slug, ...withoutSlug } = frontmatter;

    expect(guideFrontmatterSchema.safeParse(withoutSlug).success).toBe(false);
  });

  it("rejects a fractional order", () => {
    expect(
      guideFrontmatterSchema.safeParse({ ...frontmatter, order: 2.5 }).success,
    ).toBe(false);
  });

  it("rejects material that does not say how it moves in", () => {
    const material = [
      { from: "Drafts", where: "Google Docs", becomes: "note" },
    ];

    expect(
      guideFrontmatterSchema.safeParse({ ...frontmatter, material }).success,
    ).toBe(false);
  });
});

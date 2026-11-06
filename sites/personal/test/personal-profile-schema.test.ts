import { describe, expect, it } from "bun:test";
import { personalProfileSchema } from "../src/schemas";

describe("personal profile schema", () => {
  it("keeps every public profile field it renders", () => {
    const parsed = personalProfileSchema.parse({
      name: "Ada Morgan",
      organization: "Morgan Lab",
      description: "Writes about resilient systems",
      avatar: "/images/ada.png",
      website: "https://ada.test",
      email: "ada@ada.test",
      socialLinks: [
        { platform: "github", url: "https://github.com/ada", label: "GitHub" },
        { platform: "email", url: "mailto:ada@ada.test" },
      ],
      tagline: "Building *resilient* things",
      intro: "I write and teach.",
      story: "A longer story.",
      audience: "climate-tech founders",
    });

    expect(parsed).toStrictEqual({
      name: "Ada Morgan",
      organization: "Morgan Lab",
      description: "Writes about resilient systems",
      avatar: "/images/ada.png",
      website: "https://ada.test",
      email: "ada@ada.test",
      socialLinks: [
        { platform: "github", url: "https://github.com/ada", label: "GitHub" },
        { platform: "email", url: "mailto:ada@ada.test", label: null },
      ],
      tagline: "Building *resilient* things",
      intro: "I write and teach.",
      story: "A longer story.",
      audience: "climate-tech founders",
    });
  });

  it("drops professional and unknown fields the site does not render", () => {
    const parsed = personalProfileSchema.parse({
      name: "Ada Morgan",
      role: "advisor",
      expertise: ["resilient software systems"],
      artistMediums: ["installation"],
    });

    expect(parsed).not.toHaveProperty("role");
    expect(parsed).not.toHaveProperty("expertise");
    expect(parsed).not.toHaveProperty("artistMediums");
  });

  it("defaults every unset optional field to null", () => {
    expect(personalProfileSchema.parse({ name: "Ada Morgan" })).toStrictEqual({
      name: "Ada Morgan",
      organization: null,
      description: null,
      avatar: null,
      website: null,
      email: null,
      socialLinks: null,
      tagline: null,
      intro: null,
      story: null,
      audience: null,
    });
  });

  it("rejects a social link on an unknown platform", () => {
    expect(() =>
      personalProfileSchema.parse({
        name: "Ada Morgan",
        socialLinks: [{ platform: "myspace", url: "https://myspace.test" }],
      }),
    ).toThrow();
  });
});

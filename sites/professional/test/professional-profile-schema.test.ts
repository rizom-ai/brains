import { describe, expect, it } from "bun:test";
import {
  professionalProfileExtension,
  professionalProfileSchema,
} from "../src/schemas";

describe("professional profile schema", () => {
  it("defines professional profile fields in one shared extension", () => {
    expect(professionalProfileExtension.shape).toHaveProperty("role");
    expect(professionalProfileExtension.shape).toHaveProperty("audience");
    expect(professionalProfileExtension.shape).toHaveProperty("expertise");
    expect(professionalProfileExtension.shape).toHaveProperty("availability");
  });

  it("validates Rover onboarding profile content shape", () => {
    const parsed = professionalProfileSchema.parse({
      name: "Ada Morgan",
      role: "advisor",
      audience: "climate-tech founders",
      expertise: ["resilient software systems"],
      availability: "Open to advisory work",
    });

    expect(parsed.expertise).toEqual(["resilient software systems"]);
    expect(parsed.availability).toBe("Open to advisory work");
  });

  it("drops posture fields the site does not render", () => {
    const parsed = professionalProfileSchema.parse({
      name: "Ada Morgan",
      artistMediums: ["installation"],
    });

    expect(parsed).not.toHaveProperty("artistMediums");
  });

  it("defaults every unset optional field to null", () => {
    const parsed = professionalProfileSchema.parse({ name: "Ada Morgan" });

    expect(parsed).toStrictEqual({
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
      role: null,
      expertise: null,
      currentFocus: null,
      availability: null,
    });
  });

  it("keeps every profile field it renders", () => {
    const parsed = professionalProfileSchema.parse({
      name: "Ada Morgan",
      organization: "Morgan Lab",
      description: "Advises on resilient systems",
      avatar: "/images/ada.png",
      website: "https://ada.test",
      email: "ada@ada.test",
      socialLinks: [
        {
          platform: "linkedin",
          url: "https://linkedin.com/in/ada",
          label: "LinkedIn",
        },
        { platform: "website", url: "https://ada.test" },
      ],
      tagline: "Building *resilient* things",
      intro: "I advise and teach.",
      story: "A longer story.",
      audience: "climate-tech founders",
      role: "advisor",
      expertise: ["resilient software systems", "climate tech"],
      currentFocus: "Grid software",
      availability: "Open to advisory work",
    });

    expect(parsed).toStrictEqual({
      name: "Ada Morgan",
      organization: "Morgan Lab",
      description: "Advises on resilient systems",
      avatar: "/images/ada.png",
      website: "https://ada.test",
      email: "ada@ada.test",
      socialLinks: [
        {
          platform: "linkedin",
          url: "https://linkedin.com/in/ada",
          label: "LinkedIn",
        },
        { platform: "website", url: "https://ada.test", label: null },
      ],
      tagline: "Building *resilient* things",
      intro: "I advise and teach.",
      story: "A longer story.",
      audience: "climate-tech founders",
      role: "advisor",
      expertise: ["resilient software systems", "climate tech"],
      currentFocus: "Grid software",
      availability: "Open to advisory work",
    });
  });

  it("rejects a social link on an unknown platform", () => {
    expect(() =>
      professionalProfileSchema.parse({
        name: "Ada Morgan",
        socialLinks: [{ platform: "myspace", url: "https://myspace.test" }],
      }),
    ).toThrow();
  });
});

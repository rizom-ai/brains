import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { professionalProfileSchema } from "../src/schemas";
import { AboutPageLayout } from "../src/templates/about";

/** Pins the professional about page, so moving its layout into the shared kit cannot change it. */
describe("professional about page pin", () => {
  it("renders the full profile", () => {
    const profile = professionalProfileSchema.parse({
      name: "Jan Hein Hoogstad",
      description: "Building something inhabitable.",
      story: "I work on how *institutions* hold what they know.",
      expertise: ["Knowledge systems", "Institutional design"],
      currentFocus: "Rizom",
      availability: "Open to new work",
      email: "owner@example.com",
      website: "https://yeehaa.test",
      socialLinks: [
        {
          platform: "github",
          url: "https://github.com/yeehaa123",
          label: "GitHub",
        },
        {
          platform: "linkedin",
          url: "https://linkedin.com/in/yeehaa",
          label: "",
        },
      ],
    });
    expect(
      renderToStaticMarkup(<AboutPageLayout profile={profile} />),
    ).toMatchSnapshot();
  });

  it("renders a bare profile", () => {
    const profile = professionalProfileSchema.parse({ name: "" });
    expect(
      renderToStaticMarkup(<AboutPageLayout profile={profile} />),
    ).toMatchSnapshot();
  });
});

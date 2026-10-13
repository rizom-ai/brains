import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { organizationProfileSchema } from "../src/schemas/organization-profile";
import { OrganizationAbout } from "../src/templates/about";

const render = (fields: Record<string, unknown>): string =>
  renderToStaticMarkup(
    <OrganizationAbout
      profile={organizationProfileSchema.parse({
        name: "Team Brain POC Team",
        description: "A small team validating shared knowledge capture.",
        ...fields,
      })}
    />,
  );

describe("organization about page", () => {
  it("presents a team by its purpose, focus, capabilities and principles", () => {
    const html = render({
      purpose: "Keep what the team learns alive.",
      focusAreas: ["Research", "Operations"],
      capabilities: ["Synthesis", "Peer coordination"],
      workingPrinciples: ["Write it down", "Cite the source"],
    });
    expect(html).toContain(">About Team Brain POC Team</h1>");
    for (const heading of [
      "Purpose",
      "Focus areas",
      "Capabilities",
      "Working principles",
    ]) {
      expect(html).toContain(`>${heading}</h2>`);
    }
    expect(html).toContain("Keep what the team learns alive.");
    expect(html).toContain("<li>Cite the source</li>");
  });

  it("presents an organization by its mission, focus, offerings and values", () => {
    const html = render({
      mission: "Make institutions remember.",
      focusAreas: ["Knowledge commons"],
      offerings: ["Audits", "Brains"],
      values: ["Openness"],
    });
    for (const heading of ["Mission", "Focus areas", "Offerings", "Values"]) {
      expect(html).toContain(`>${heading}</h2>`);
    }
    expect(html).toContain("Make institutions remember.");
  });

  it("tells the profile's story and offers the ways to reach the team", () => {
    const html = render({
      story: "We started as *three* people and a shared notebook.",
      email: "team@example.com",
      website: "https://team.example.com",
    });
    expect(html).toContain("<em>three</em>");
    expect(html).toContain('href="mailto:team@example.com"');
  });

  it("leaves no heading standing empty", () => {
    const html = render({});
    expect(html).not.toContain("<h2");
    expect(html).toContain("A small team validating shared knowledge capture.");
  });
});

import { createTestEntity } from "@brains/entity-service/test";
import { createMockShell } from "@brains/plugins/test";
import { describe, expect, test } from "bun:test";
import {
  fetchAnchorProfileData,
  organizationProfileFields,
  organizationProfileSchema,
  professionalProfileFields,
  professionalProfileSchema,
  profileFrontmatterExtension,
  teamProfileFields,
  teamProfileSchema,
  validateProfileContent,
} from "../src";

describe("profile variants", () => {
  test("parses professional profiles without persisted classification", () => {
    expect(
      professionalProfileSchema.parse({
        name: "Ada",
        role: "Advisor",
        expertise: ["Resilient systems"],
      }),
    ).toMatchObject({ role: "Advisor" });
  });

  test("parses team profiles without persisted classification", () => {
    expect(
      teamProfileSchema.parse({
        name: "Relay Team",
        purpose: "Preserve shared context",
        capabilities: ["Synthesis"],
      }),
    ).toMatchObject({ purpose: "Preserve shared context" });
  });

  test("parses organization profiles without persisted classification", () => {
    expect(
      organizationProfileSchema.parse({
        name: "Rizom",
        mission: "Grow living expertise",
        offerings: ["Brains"],
      }),
    ).toMatchObject({ mission: "Grow living expertise" });
  });

  test("uses only base fields when no kind is selected", () => {
    expect(() =>
      validateProfileContent(
        `---\nname: Minimal\ntagline: Base profile\n---\n`,
      ),
    ).not.toThrow();
    expect(() =>
      validateProfileContent(`---\nname: Minimal\nrole: Advisor\n---\n`),
    ).toThrow();
  });

  test("validates selected kind fields from composition", () => {
    expect(() =>
      validateProfileContent(`---\nname: Ada\nrole: Advisor\n---\n`, {
        category: "person",
        fields: professionalProfileFields,
      }),
    ).not.toThrow();
    expect(() =>
      validateProfileContent(`---\nname: Team\nrole: Advisor\n---\n`, {
        category: "team",
        fields: teamProfileFields,
      }),
    ).toThrow();
  });

  test("fails clearly rather than pruning fields outside the selected schema", () => {
    expect(() =>
      validateProfileContent(`---\nname: Ada\nmediums:\n  - sculpture\n---\n`, {
        category: "person",
        fields: professionalProfileFields,
      }),
    ).toThrow();
  });

  test("rejects content-owned profile kinds after the fleet cutover", () => {
    for (const kind of ["collective", "organization"]) {
      expect(() =>
        validateProfileContent(
          `---\nname: Rizom\nkind: ${kind}\nmission: Grow living expertise\n---\n`,
          { category: "organization", fields: organizationProfileFields },
        ),
      ).toThrow();
    }
  });

  test("exposes base profile fields without a Studio kind dropdown", () => {
    expect(profileFrontmatterExtension.shape).toHaveProperty("tagline");
    expect(profileFrontmatterExtension.shape).toHaveProperty("intro");
    expect(profileFrontmatterExtension.shape).not.toHaveProperty("kind");
  });

  test("rejects story stored in frontmatter instead of the markdown body", () => {
    expect(() =>
      validateProfileContent(`---\nname: Ada\nstory: Wrong location\n---\n`),
    ).toThrow("markdown body");
  });

  test("fetches structured profile data and maps the markdown body to story", async () => {
    const shell = createMockShell();
    shell.addEntities([
      createTestEntity("anchor-profile", {
        id: "anchor-profile",
        content: "---\nname: Ada\nrole: Advisor\n---\nLong biography",
      }),
    ]);

    const profile = await fetchAnchorProfileData(
      shell.getEntityService(),
      professionalProfileSchema,
    );

    expect(profile.story).toBe("Long biography");
  });
});

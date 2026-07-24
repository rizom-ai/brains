import { describe, expect, mock, test } from "bun:test";
import {
  fetchAnchorProfileData,
  organizationProfileSchema,
  professionalProfileSchema,
  profileFrontmatterExtension,
  teamProfileSchema,
  validateProfileContent,
} from "../src";

describe("profile variants", () => {
  test("parses professional person profiles", () => {
    expect(
      professionalProfileSchema.parse({
        name: "Ada",
        kind: "person",
        role: "Advisor",
        expertise: ["Resilient systems"],
      }),
    ).toMatchObject({ kind: "person", role: "Advisor" });
  });

  test("parses team profiles", () => {
    expect(
      teamProfileSchema.parse({
        name: "Relay Team",
        kind: "team",
        purpose: "Preserve shared context",
        capabilities: ["Synthesis"],
      }),
    ).toMatchObject({ kind: "team", purpose: "Preserve shared context" });
  });

  test("parses organization profiles", () => {
    expect(
      organizationProfileSchema.parse({
        name: "Rizom",
        kind: "organization",
        mission: "Grow living expertise",
        offerings: ["Brains"],
      }),
    ).toMatchObject({ kind: "organization", mission: "Grow living expertise" });
  });

  test("accepts a legacy 'collective' kind and validates it as an organization", () => {
    expect(() =>
      validateProfileContent(
        `---\nname: Rizom\nkind: collective\nmission: Grow living expertise\n---\n`,
      ),
    ).not.toThrow();
  });

  test("accepts a legacy 'professional' kind and validates it as a person", () => {
    expect(() =>
      validateProfileContent(
        `---\nname: Ada\nkind: professional\nrole: Advisor\n---\n`,
      ),
    ).not.toThrow();
  });

  test("still enforces per-kind fields after a legacy kind is transitioned", () => {
    // collective -> organization, so a person-only field must still be rejected
    expect(() =>
      validateProfileContent(
        `---\nname: Rizom\nkind: collective\nrole: Advisor\n---\n`,
      ),
    ).toThrow();
  });

  test("rejects fields owned by another profile kind", () => {
    expect(() =>
      validateProfileContent(
        `---\nname: Team\nkind: team\nrole: Advisor\n---\n`,
      ),
    ).toThrow();
  });

  test("exposes a kind-aware frontmatter extension to editors", () => {
    expect(profileFrontmatterExtension.shape).toHaveProperty("name");
    expect(profileFrontmatterExtension.shape).toHaveProperty("kind");
    expect(
      profileFrontmatterExtension.safeParse({
        name: "Ada",
        kind: "person",
        role: "Advisor",
      }).success,
    ).toBe(true);
    expect(
      profileFrontmatterExtension.safeParse({
        name: "Ada",
        kind: "person",
        mission: "Mismatch",
      }).success,
    ).toBe(false);
  });

  test("rejects story stored in frontmatter instead of the markdown body", () => {
    expect(() =>
      validateProfileContent(
        `---\nname: Ada\nkind: person\nstory: Wrong location\n---\n`,
      ),
    ).toThrow("markdown body");
  });

  test("fetches structured profile data and maps the markdown body to story", async () => {
    const entityService = {
      listEntities: mock(() =>
        Promise.resolve([
          {
            content:
              "---\nname: Ada\nkind: person\nrole: Advisor\n---\nLong biography",
          },
        ]),
      ),
    };

    const profile = await fetchAnchorProfileData(
      entityService as never,
      professionalProfileSchema,
    );

    expect(profile.story).toBe("Long biography");
  });
});

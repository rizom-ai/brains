import { describe, it, expect, mock } from "bun:test";
import {
  baseProfileExtension,
  professionalProfileExtension,
  fetchAnchorProfile,
  fetchAnchorProfileData,
} from "../src/profile-helpers";

// ---- baseProfileExtension ----

describe("baseProfileExtension", () => {
  it("should parse all optional fields", () => {
    const result = baseProfileExtension.parse({
      tagline: "Sweet thoughts",
      intro: "A curious unicorn",
      story: "Once upon a time...",
    });
    expect(result.tagline).toBe("Sweet thoughts");
    expect(result.intro).toBe("A curious unicorn");
    expect(result.story).toBe("Once upon a time...");
  });

  it("should accept empty object (all fields optional)", () => {
    const result = baseProfileExtension.parse({});
    expect(result.tagline).toBeUndefined();
    expect(result.intro).toBeUndefined();
    expect(result.story).toBeUndefined();
  });

  it("should be extendable with additional fields", () => {
    const extended = baseProfileExtension.extend({
      skills: professionalProfileExtension.shape.skills,
    });
    const result = extended.parse({
      tagline: "hello",
      skills: ["TypeScript", "Rust"],
    });
    expect(result.tagline).toBe("hello");
    expect(result.skills).toEqual(["TypeScript", "Rust"]);
  });
});

describe("professionalProfileExtension", () => {
  it("should parse canonical professional profile fields", () => {
    const result = professionalProfileExtension.parse({
      role: "Advisor",
      headline: "Advisor for resilient systems",
      industry: "Climate technology",
      location: "Rotterdam, Netherlands",
      skills: ["TypeScript", "Systems architecture"],
      expertise: ["resilient software systems"],
      currentFocus: "Low-carbon infrastructure",
      availability: "Available for advisory work",
      positions: [
        {
          companyName: "Rizom",
          title: "Advisor",
          employmentType: "Self-employed",
          startedOn: "2024-01",
        },
      ],
      education: [
        {
          schoolName: "TU Delft",
          degreeName: "MSc",
          fieldOfStudy: "Computer Science",
        },
      ],
      certifications: [
        {
          name: "Cloud Architect",
          issuingOrganization: "Example Institute",
          issuedOn: "2025",
          credentialId: "credential-1",
        },
      ],
    });

    expect(result.role).toBe("Advisor");
    expect(result.headline).toBe("Advisor for resilient systems");
    expect(result.skills).toEqual(["TypeScript", "Systems architecture"]);
    expect(result.expertise).toEqual(["resilient software systems"]);
    expect(result.positions?.[0]?.title).toBe("Advisor");
    expect(result.education?.[0]?.schoolName).toBe("TU Delft");
    expect(result.certifications?.[0]?.credentialId).toBe("credential-1");
  });

  it("should preserve legacy communication fields during migration", () => {
    const result = professionalProfileExtension.parse({
      audience: "climate-tech founders",
      desiredTone: "clear, practical, quietly confident",
    });

    expect(result.audience).toBe("climate-tech founders");
    expect(result.desiredTone).toBe("clear, practical, quietly confident");
  });
});

// ---- fetchAnchorProfile ----

describe("fetchAnchorProfile", () => {
  it("should fetch entity and return raw content", async () => {
    const entityService = {
      listEntities: mock(() =>
        Promise.resolve([
          { id: "anchor-profile", content: "---\nname: Test\n---\nBody here" },
        ]),
      ),
    };

    const content = await fetchAnchorProfile(entityService as never);
    expect(content).toBe("---\nname: Test\n---\nBody here");
    expect(entityService.listEntities).toHaveBeenCalledWith({
      entityType: "anchor-profile",
      options: { limit: 1 },
    });
  });

  it("should throw when no profile entity exists", async () => {
    const entityService = {
      listEntities: mock(() => Promise.resolve([])),
    };

    expect(fetchAnchorProfile(entityService as never)).rejects.toThrow(
      "Profile not found",
    );
  });
});

// ---- fetchAnchorProfileData ----

describe("fetchAnchorProfileData", () => {
  it("fetches the profile entity and parses its body with the schema", async () => {
    const entityService = {
      listEntities: mock(() =>
        Promise.resolve([
          {
            id: "anchor-profile",
            content: "---\ntagline: Hello\n---\nBody",
          },
        ]),
      ),
    };

    const profile = await fetchAnchorProfileData(
      entityService as never,
      baseProfileExtension,
    );

    expect(profile.tagline).toBe("Hello");
  });
});

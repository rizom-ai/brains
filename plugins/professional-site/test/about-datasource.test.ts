import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import { AboutDataSource } from "../src/datasources/about-datasource";
import { createMockEntityService } from "@brains/test-utils";
import type { IEntityService } from "@brains/plugins";
import { z, computeContentHash } from "@brains/utils";
import { professionalProfileSchema } from "../src/schemas";

describe("AboutDataSource", () => {
  let datasource: AboutDataSource;
  let mockEntityService: IEntityService;

  const profileContent = `# Profile

## Name
Yeehaa

## Description
Professional developer and educator

## Intro
Essays and presentations on technology

## Story
This is my story.

I've been building software for many years.

## Expertise
- TypeScript
- Distributed Systems
- Education

## Current Focus
Building tools for thought

## Availability
Open for consulting`;

  const mockProfile = {
    id: "profile-1",
    entityType: "profile" as const,
    content: profileContent,
    contentHash: computeContentHash(profileContent),
    created: "2025-01-01T10:00:00.000Z",
    updated: "2025-01-01T10:00:00.000Z",
    metadata: {},
  };

  beforeEach(() => {
    mockEntityService = createMockEntityService();
    spyOn(mockEntityService, "listEntities").mockImplementation(
      (entityType: string) => {
        if (entityType === "profile") return Promise.resolve([mockProfile]);
        return Promise.resolve([]);
      },
    );

    datasource = new AboutDataSource(mockEntityService);
  });

  it("should have correct metadata", () => {
    expect(datasource.id).toBe("professional:about");
    expect(datasource.name).toBe("About Page DataSource");
    expect(datasource.description).toContain("about");
  });

  it("should fetch profile data", async () => {
    const schema = z.object({
      profile: professionalProfileSchema,
    });

    const result = await datasource.fetch({}, schema);

    expect(result.profile.name).toBe("Yeehaa");
    expect(result.profile.description).toBe(
      "Professional developer and educator",
    );
    expect(result.profile.story).toContain("This is my story");
    expect(result.profile.expertise).toEqual([
      "TypeScript",
      "Distributed Systems",
      "Education",
    ]);
    expect(result.profile.currentFocus).toBe("Building tools for thought");
    expect(result.profile.availability).toBe("Open for consulting");
  });

  it("should throw error if profile not found", async () => {
    spyOn(mockEntityService, "listEntities").mockImplementation(() =>
      Promise.resolve([]),
    );

    datasource = new AboutDataSource(mockEntityService);

    const schema = z.object({
      profile: professionalProfileSchema,
    });

    expect(datasource.fetch({}, schema)).rejects.toThrow("Profile not found");
  });

  it("should handle profile with minimal fields", async () => {
    const minimalContent = `# Profile

## Name
Test User`;

    const minimalProfile = {
      id: "profile-2",
      entityType: "profile" as const,
      content: minimalContent,
      contentHash: computeContentHash(minimalContent),
      created: "2025-01-01T10:00:00.000Z",
      updated: "2025-01-01T10:00:00.000Z",
      metadata: {},
    };

    spyOn(mockEntityService, "listEntities").mockImplementation(
      (entityType: string) => {
        if (entityType === "profile") return Promise.resolve([minimalProfile]);
        return Promise.resolve([]);
      },
    );

    datasource = new AboutDataSource(mockEntityService);

    const schema = z.object({
      profile: professionalProfileSchema,
    });

    const result = await datasource.fetch({}, schema);

    expect(result.profile.name).toBe("Test User");
    expect(result.profile.description).toBeUndefined();
    expect(result.profile.story).toBeUndefined();
    expect(result.profile.expertise).toBeUndefined();
  });
});

import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import { HomepageListDataSource } from "../src/datasources/homepage-datasource";
import { createMockEntityService } from "@brains/test-utils";
import type { IEntityService, ListOptions } from "@brains/plugins";
import type { BlogPost } from "@brains/blog";
import type { DeckEntity } from "@brains/decks";
import { z, computeContentHash } from "@brains/utils";
import { blogPostWithDataSchema } from "@brains/blog";
import { deckSchema } from "@brains/decks";
import { professionalProfileSchema } from "../src/schemas";
import { siteInfoCTASchema } from "@brains/site-builder-plugin";

describe("HomepageListDataSource", () => {
  let datasource: HomepageListDataSource;
  let mockEntityService: IEntityService;

  const profileContent = `# Profile

## Name
Yeehaa

## Description
Professional developer

## Tagline
Building tools for thought

## Intro
Essays and presentations on technology`;

  const mockProfile = {
    id: "profile-1",
    entityType: "profile" as const,
    content: profileContent,
    contentHash: computeContentHash(profileContent),
    created: "2025-01-01T10:00:00.000Z",
    updated: "2025-01-01T10:00:00.000Z",
    metadata: {},
  };

  const postContent = `---
title: Test Essay
slug: test-essay
status: published
publishedAt: 2025-01-15T10:00:00.000Z
excerpt: This is a test excerpt
author: Test Author
---
# Test Post

Content here`;

  const mockPost: BlogPost = {
    id: "post-1",
    entityType: "post" as const,
    content: postContent,
    contentHash: computeContentHash(postContent),
    created: "2025-01-15T10:00:00.000Z",
    updated: "2025-01-15T10:00:00.000Z",
    metadata: {
      title: "Test Essay",
      slug: "test-essay",
      status: "published",
      publishedAt: "2025-01-15T10:00:00.000Z",
    },
  };

  const deckContent = "# Test Deck\n\n---\n\nSlide content";

  const mockDeck: DeckEntity = {
    id: "deck-1",
    entityType: "deck" as const,
    title: "Test Deck",
    description: "A test presentation",
    status: "published",
    publishedAt: "2025-01-10T10:00:00.000Z",
    content: deckContent,
    contentHash: computeContentHash(deckContent),
    created: "2025-01-10T10:00:00.000Z",
    updated: "2025-01-10T10:00:00.000Z",
    metadata: {
      slug: "test-deck",
      title: "Test Deck",
      status: "published",
      publishedAt: "2025-01-10T10:00:00.000Z",
    },
  };

  const siteInfoContent = `# Site Information

## Title
Test Site

## Description
A test professional site

## CTA

### Heading
Let's work together

### Button Text
Get in Touch

### Button Link
mailto:test@example.com`;

  const mockSiteInfo = {
    id: "site-info",
    entityType: "site-info" as const,
    content: siteInfoContent,
    contentHash: computeContentHash(siteInfoContent),
    created: "2025-01-01T10:00:00.000Z",
    updated: "2025-01-01T10:00:00.000Z",
    metadata: {},
  };

  beforeEach(() => {
    mockEntityService = createMockEntityService();
    spyOn(mockEntityService, "listEntities").mockImplementation(
      (entityType: string) => {
        if (entityType === "profile") return Promise.resolve([mockProfile]);
        if (entityType === "post") return Promise.resolve([mockPost]);
        if (entityType === "deck") return Promise.resolve([mockDeck]);
        if (entityType === "site-info") return Promise.resolve([mockSiteInfo]);
        return Promise.resolve([]);
      },
    );

    datasource = new HomepageListDataSource(mockEntityService);
  });

  it("should have correct metadata", () => {
    expect(datasource.id).toBe("professional:homepage-list");
    expect(datasource.name).toBe("Homepage List DataSource");
    expect(datasource.description).toContain("homepage");
  });

  it("should fetch profile, posts, decks, and CTA", async () => {
    const schema = z.object({
      profile: professionalProfileSchema,
      posts: z.array(blogPostWithDataSchema),
      decks: z.array(deckSchema),
      cta: siteInfoCTASchema,
    });

    const result = await datasource.fetch({}, schema);

    expect(result.profile.name).toBe("Yeehaa");
    expect(result.profile.tagline).toBe("Building tools for thought");
    expect(result.posts).toHaveLength(1);
    expect(result.posts[0].frontmatter.excerpt).toBe("This is a test excerpt");
    expect(result.decks).toHaveLength(1);
    expect(result.cta.heading).toBe("Let's work together");
    expect(result.cta.buttonText).toBe("Get in Touch");
  });

  it("should filter published posts only", async () => {
    const draftPost: BlogPost = {
      ...mockPost,
      id: "post-2",
      metadata: {
        ...mockPost.metadata,
        status: "draft",
      },
    };

    spyOn(mockEntityService, "listEntities").mockImplementation(
      (entityType: string, options?: ListOptions) => {
        if (entityType === "profile") return Promise.resolve([mockProfile]);
        if (entityType === "post") {
          // Respect filter parameter - only return published posts if filter requests them
          const allPosts = [mockPost, draftPost];
          if (options?.filter?.metadata?.status === "published") {
            return Promise.resolve(
              allPosts.filter((p) => p.metadata.status === "published"),
            );
          }
          return Promise.resolve(allPosts);
        }
        if (entityType === "deck") return Promise.resolve([mockDeck]);
        if (entityType === "site-info") return Promise.resolve([mockSiteInfo]);
        return Promise.resolve([]);
      },
    );

    datasource = new HomepageListDataSource(mockEntityService);

    const schema = z.object({
      profile: professionalProfileSchema,
      posts: z.array(blogPostWithDataSchema),
      decks: z.array(deckSchema),
    });

    const result = await datasource.fetch({}, schema);

    // Should only include published post
    expect(result.posts).toHaveLength(1);
    expect(result.posts[0].metadata.status).toBe("published");
  });

  it("should throw error if profile not found", async () => {
    spyOn(mockEntityService, "listEntities").mockImplementation(
      (entityType: string) => {
        if (entityType === "profile") return Promise.resolve([]); // No profile
        if (entityType === "post") return Promise.resolve([mockPost]);
        if (entityType === "deck") return Promise.resolve([mockDeck]);
        if (entityType === "site-info") return Promise.resolve([mockSiteInfo]);
        return Promise.resolve([]);
      },
    );

    datasource = new HomepageListDataSource(mockEntityService);

    const schema = z.object({
      profile: professionalProfileSchema,
      posts: z.array(blogPostWithDataSchema),
      decks: z.array(deckSchema),
    });

    expect(datasource.fetch({}, schema)).rejects.toThrow("Profile not found");
  });
});

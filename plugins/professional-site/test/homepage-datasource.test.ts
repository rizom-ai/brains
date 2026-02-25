import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import { HomepageListDataSource } from "../src/datasources/homepage-datasource";
import { createMockEntityService, createTestEntity } from "@brains/test-utils";
import type {
  IEntityService,
  BaseDataSourceContext,
  BaseEntity,
} from "@brains/plugins";
import type { BlogPost } from "@brains/blog";
import type { DeckEntity } from "@brains/decks";
import { z } from "@brains/utils";
import { blogPostWithDataSchema } from "@brains/blog";
import { deckSchema } from "@brains/decks";
import { professionalProfileSchema } from "../src/schemas";
import { siteInfoCTASchema } from "@brains/site-builder-plugin";

describe("HomepageListDataSource", () => {
  let datasource: HomepageListDataSource;
  let mockEntityService: IEntityService;
  let mockContext: BaseDataSourceContext;

  const profileContent = `# Profile

## Name
Yeehaa

## Description
Professional developer

## Tagline
Building tools for thought

## Intro
Essays and presentations on technology`;

  const mockProfile = createTestEntity("anchor-profile", {
    id: "anchor-profile",
    content: profileContent,
    metadata: {},
  });

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

  const mockPost: BlogPost = createTestEntity<BlogPost>("post", {
    id: "post-1",
    content: postContent,
    metadata: {
      title: "Test Essay",
      slug: "test-essay",
      status: "published",
      publishedAt: "2025-01-15T10:00:00.000Z",
    },
  });

  const deckContent = "# Test Deck\n\n---\n\nSlide content";

  const mockDeck: DeckEntity = createTestEntity<DeckEntity>("deck", {
    id: "deck-1",
    title: "Test Deck",
    description: "A test presentation",
    status: "published",
    publishedAt: "2025-01-10T10:00:00.000Z",
    content: deckContent,
    metadata: {
      slug: "test-deck",
      title: "Test Deck",
      status: "published",
      publishedAt: "2025-01-10T10:00:00.000Z",
    },
  });

  const siteInfoContent = `---
title: Test Site
description: A test professional site
cta:
  heading: Let's work together
  buttonText: Get in Touch
  buttonLink: mailto:test@example.com
---
`;

  const mockSiteInfo = createTestEntity("site-info", {
    id: "site-info",
    content: siteInfoContent,
    metadata: {},
  });

  const entityStore: Record<string, BaseEntity[]> = {
    "anchor-profile": [mockProfile],
    post: [mockPost],
    deck: [mockDeck],
    "site-info": [mockSiteInfo],
  };

  function mockListEntities<T extends BaseEntity>(
    entityType: string,
  ): Promise<T[]> {
    return Promise.resolve((entityStore[entityType] ?? []) as T[]);
  }

  beforeEach(() => {
    mockEntityService = createMockEntityService();
    spyOn(mockEntityService, "listEntities").mockImplementation(
      mockListEntities,
    );

    // Only provide entityService via context - not constructor
    mockContext = { entityService: mockEntityService };

    // Only pass URL config to constructor (no entityService)
    datasource = new HomepageListDataSource("/essays", "/presentations");
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

    const result = await datasource.fetch({}, schema, mockContext);

    expect(result.profile.name).toBe("Yeehaa");
    expect(result.profile.tagline).toBe("Building tools for thought");
    expect(result.posts).toHaveLength(1);
    expect(result.posts[0]?.frontmatter.excerpt).toBe("This is a test excerpt");
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

    const store: Record<string, BaseEntity[]> = {
      "anchor-profile": [mockProfile],
      post: [mockPost, draftPost],
      deck: [mockDeck],
      "site-info": [mockSiteInfo],
    };

    spyOn(mockEntityService, "listEntities").mockImplementation(
      function mockList<T extends BaseEntity>(
        entityType: string,
        options?: { filter?: { metadata?: Record<string, unknown> } },
      ): Promise<T[]> {
        const entities = store[entityType] ?? [];
        if (
          entityType === "post" &&
          options?.filter?.metadata?.["status"] === "published"
        ) {
          return Promise.resolve(
            entities.filter(
              (e) =>
                (e.metadata as Record<string, unknown>)["status"] ===
                "published",
            ),
          ) as Promise<T[]>;
        }
        return Promise.resolve(entities) as Promise<T[]>;
      },
    );

    // Recreate context with new mock
    mockContext = { entityService: mockEntityService };
    datasource = new HomepageListDataSource("/essays", "/presentations");

    const schema = z.object({
      profile: professionalProfileSchema,
      posts: z.array(blogPostWithDataSchema),
      decks: z.array(deckSchema),
    });

    const result = await datasource.fetch({}, schema, mockContext);

    // Should only include published post
    expect(result.posts).toHaveLength(1);
    expect(result.posts[0]?.metadata.status).toBe("published");
  });

  it("should throw error if profile not found", async () => {
    const noProfileStore: Record<string, BaseEntity[]> = {
      post: [mockPost],
      deck: [mockDeck],
      "site-info": [mockSiteInfo],
    };

    spyOn(mockEntityService, "listEntities").mockImplementation(
      function mockList<T extends BaseEntity>(
        entityType: string,
      ): Promise<T[]> {
        return Promise.resolve((noProfileStore[entityType] ?? []) as T[]);
      },
    );

    // Recreate context with new mock
    mockContext = { entityService: mockEntityService };
    datasource = new HomepageListDataSource("/essays", "/presentations");

    const schema = z.object({
      profile: professionalProfileSchema,
      posts: z.array(blogPostWithDataSchema),
      decks: z.array(deckSchema),
    });

    expect(datasource.fetch({}, schema, mockContext)).rejects.toThrow(
      "Profile not found",
    );
  });
});

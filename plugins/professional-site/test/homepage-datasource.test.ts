import { describe, it, expect, beforeEach, mock } from "bun:test";
import { HomepageListDataSource } from "../src/datasources/homepage-datasource";
import type { IEntityService } from "@brains/plugins";
import type { BlogPost } from "@brains/blog";
import type { DeckEntity } from "@brains/decks";
import { z } from "@brains/utils";
import { blogPostWithDataSchema } from "@brains/blog";
import { deckSchema } from "@brains/decks";
import { profileBodySchema } from "@brains/profile-service";

describe("HomepageListDataSource", () => {
  let datasource: HomepageListDataSource;
  let mockEntityService: IEntityService;

  const mockProfile = {
    id: "profile-1",
    entityType: "profile" as const,
    content: `# Profile

## Name
Yeehaa

## Description
Professional developer

## Tagline
Building tools for thought

## Intro
Essays and presentations on technology`,
    created: "2025-01-01T10:00:00.000Z",
    updated: "2025-01-01T10:00:00.000Z",
    metadata: {},
  };

  const mockPost: BlogPost = {
    id: "post-1",
    entityType: "post" as const,
    content: `---
title: Test Essay
slug: test-essay
status: published
publishedAt: 2025-01-15T10:00:00.000Z
excerpt: This is a test excerpt
author: Test Author
---
# Test Post

Content here`,
    created: "2025-01-15T10:00:00.000Z",
    updated: "2025-01-15T10:00:00.000Z",
    metadata: {
      title: "Test Essay",
      slug: "test-essay",
      status: "published",
      publishedAt: "2025-01-15T10:00:00.000Z",
    },
  };

  const mockDeck: DeckEntity = {
    id: "deck-1",
    entityType: "deck" as const,
    title: "Test Deck",
    description: "A test presentation",
    content: "# Test Deck\n\nSlide content",
    created: "2025-01-10T10:00:00.000Z",
    updated: "2025-01-10T10:00:00.000Z",
    metadata: { slug: "test-deck", title: "Test Deck" },
  };

  beforeEach(() => {
    mockEntityService = {
      getEntity: mock(() => null),
      listEntities: mock((entityType: string) => {
        if (entityType === "profile") return [mockProfile];
        if (entityType === "post") return [mockPost];
        if (entityType === "deck") return [mockDeck];
        return [];
      }),
      createEntity: mock(() => ({})),
      updateEntity: mock(() => ({})),
      deleteEntity: mock(() => ({})),
    } as unknown as IEntityService;

    datasource = new HomepageListDataSource(mockEntityService);
  });

  it("should have correct metadata", () => {
    expect(datasource.id).toBe("professional:homepage-list");
    expect(datasource.name).toBe("Homepage List DataSource");
    expect(datasource.description).toContain("homepage");
  });

  it("should fetch profile, posts, and decks", async () => {
    const schema = z.object({
      profile: profileBodySchema,
      posts: z.array(blogPostWithDataSchema),
      decks: z.array(deckSchema),
    });

    const result = await datasource.fetch({}, schema);

    expect(result.profile.name).toBe("Yeehaa");
    expect(result.profile.tagline).toBe("Building tools for thought");
    expect(result.posts).toHaveLength(1);
    expect(result.posts[0].frontmatter.excerpt).toBe("This is a test excerpt");
    expect(result.decks).toHaveLength(1);
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

    mockEntityService.listEntities = mock((entityType: string) => {
      if (entityType === "profile") return [mockProfile];
      if (entityType === "post") return [mockPost, draftPost];
      if (entityType === "deck") return [mockDeck];
      return [];
    }) as unknown as IEntityService["listEntities"];

    datasource = new HomepageListDataSource(mockEntityService);

    const schema = z.object({
      profile: profileBodySchema,
      posts: z.array(blogPostWithDataSchema),
      decks: z.array(deckSchema),
    });

    const result = await datasource.fetch({}, schema);

    // Should only include published post
    expect(result.posts).toHaveLength(1);
    expect(result.posts[0].metadata.status).toBe("published");
  });

  it("should throw error if profile not found", async () => {
    mockEntityService.listEntities = mock((entityType: string) => {
      if (entityType === "profile") return []; // No profile
      if (entityType === "post") return [mockPost];
      if (entityType === "deck") return [mockDeck];
      return [];
    }) as unknown as IEntityService["listEntities"];

    datasource = new HomepageListDataSource(mockEntityService);

    const schema = z.object({
      profile: profileBodySchema,
      posts: z.array(blogPostWithDataSchema),
      decks: z.array(deckSchema),
    });

    expect(datasource.fetch({}, schema)).rejects.toThrow("Profile not found");
  });
});

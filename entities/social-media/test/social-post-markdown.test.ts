import { describe, expect, it } from "bun:test";
import {
  socialPostMarkdown,
  socialPostStub,
  socialPostWithData,
} from "../src/lib/social-post-markdown";
import type { SocialPost } from "../src/schemas/social-post";

describe("a social post's markdown", () => {
  it("reads a file with a title alone as a LinkedIn draft, its slug from both", () => {
    expect(
      socialPostMarkdown.decode({
        content: "Just text\n",
        frontmatter: { title: "Minimal Post" },
      }),
    ).toEqual({
      content: "Just text\n",
      metadata: {
        title: "Minimal Post",
        platform: "linkedin",
        status: "draft",
        slug: "linkedin-minimal-post",
      },
    });
  });

  it("keeps a slug the file states without reading it", () => {
    expect(
      socialPostMarkdown.decode({
        content: "",
        frontmatter: { title: "Dated", slug: "custom-slug" },
      }).metadata,
    ).toMatchObject({ slug: "linkedin-dated", statedSlug: "custom-slug" });
  });

  it("writes the fields in the adapter's order, never the slug or error", () => {
    expect(
      socialPostMarkdown.encode?.({
        content: "Body\n",
        metadata: {
          sourceEntityType: "post",
          sourceEntityId: "my-post",
          error: "boom",
          slug: "linkedin-launch-day",
          platformPostId: "urn:1",
          publishedAt: "2025-03-01T10:00:00.000Z",
          documents: [{ id: "doc-1" }],
          coverImageId: "img-1",
          status: "published",
          platform: "linkedin",
          title: "Launch Day",
          statedSlug: "custom",
        },
      }),
    ).toEqual({
      content: "Body",
      frontmatter: {
        title: "Launch Day",
        platform: "linkedin",
        status: "published",
        coverImageId: "img-1",
        documents: [{ id: "doc-1" }],
        publishedAt: "2025-03-01T10:00:00.000Z",
        platformPostId: "urn:1",
        sourceEntityId: "my-post",
        sourceEntityType: "post",
        slug: "custom",
      },
    });
  });

  it("starts a generated post as a LinkedIn post being generated", () => {
    expect(socialPostStub({ id: "x", title: "Stub Title" })).toEqual({
      content: "",
      metadata: {
        title: "Stub Title",
        platform: "linkedin",
        status: "generating",
        slug: "linkedin-stub-title",
      },
    });
  });

  it("gives the site the post as its document, frontmatter and text", () => {
    const post: SocialPost = {
      id: "linkedin-launch-day",
      entityType: "social-post",
      content: "Body text",
      created: "2025-01-01T00:00:00.000Z",
      updated: "2025-01-01T00:00:00.000Z",
      visibility: "public",
      contentHash: "hash",
      metadata: {
        title: "Launch Day",
        platform: "linkedin",
        status: "draft",
        slug: "linkedin-launch-day",
      },
    };
    expect(socialPostWithData(post)).toMatchObject({
      content:
        "---\ntitle: Launch Day\nplatform: linkedin\nstatus: draft\n---\nBody text\n",
      frontmatter: {
        title: "Launch Day",
        platform: "linkedin",
        status: "draft",
      },
      body: "Body text",
    });
  });
});

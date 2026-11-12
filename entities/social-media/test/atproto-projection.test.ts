import { describe, expect, it } from "bun:test";
import type { AtprotoProjection } from "@brains/atproto-contracts";
import { createPluginHarness } from "@brains/plugins/test";
import type { SocialPost } from "../src/schemas/social-post";
import { socialMediaPlugin } from "./social-media-plugin";

// A social post as a declared type reads it: its metadata and its text.
const socialPost: SocialPost = {
  id: "social-post-1",
  entityType: "social-post",
  content: "Sharing our launch note with the network.",
  created: "2026-05-28T09:00:00.000Z",
  updated: "2026-05-28T11:00:00.000Z",
  visibility: "public",
  contentHash: "hash",
  metadata: {
    title: "Launch Note",
    slug: "linkedin-launch-note",
    platform: "linkedin",
    status: "published",
    publishedAt: "2026-05-28T10:00:00.000Z",
    platformPostId: "urn:li:share:123",
    sourceEntityId: "post-1",
    sourceEntityType: "post",
  },
};

async function projection(): Promise<AtprotoProjection> {
  const harness = createPluginHarness({
    dataDir: "/tmp/test-social-post-atproto",
  });
  await harness.installPlugin(socialMediaPlugin());
  const found = harness
    .getMockShell()
    .getAtprotoProjectionRegistry()
    .get("social-post");
  if (!found) throw new Error("No social post projection");
  return found;
}

describe("social-post ATProto projection", () => {
  it("maps social posts to ai.rizom.brain.socialPost records", async () => {
    const record = await (
      await projection()
    ).buildRecord({
      entity: socialPost,
      context: createPluginHarness().getServiceContext("social-media"),
      config: {
        brainDid: "did:web:brain.example.com",
      },
    });

    expect(record).toEqual({
      $type: "ai.rizom.brain.socialPost",
      title: "Launch Note",
      platform: "linkedin",
      body: "Sharing our launch note with the network.",
      format: "text/markdown",
      status: "published",
      publishedAt: "2026-05-28T10:00:00.000Z",
      platformPostId: "urn:li:share:123",
      sourceLocalEntityType: "post",
      sourceLocalEntityId: "post-1",
      brainDid: "did:web:brain.example.com",
      sourceEntityType: "social-post",
      sourceEntityId: "social-post-1",
      createdAt: "2026-05-28T09:00:00.000Z",
      updatedAt: "2026-05-28T11:00:00.000Z",
    });
  });

  it("names its page when the site gives the social post one, and nothing otherwise", async () => {
    const found = await projection();
    const context = createPluginHarness().getServiceContext("social-media");
    const placed = await found.buildRecord({
      entity: socialPost,
      context,
      config: {},
      pageUrl: "https://brain.example.com/social-posts/socialPost-1",
    });
    expect(placed["canonicalUrl"]).toBe(
      "https://brain.example.com/social-posts/socialPost-1",
    );
    const unplaced = await found.buildRecord({
      entity: socialPost,
      context,
      config: {},
    });
    expect(unplaced["canonicalUrl"]).toBeUndefined();
  });
});

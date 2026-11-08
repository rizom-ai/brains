import { afterEach, describe, expect, it } from "bun:test";
import {
  VALID_PNG_BASE64,
  VALID_PNG_DATA_URL,
  imageJobs,
  seedPost,
  type ImageJobs,
} from "../image-job-harness";

/**
 * `image:image-render-source`, as content-pipeline queues it by contract:
 * the job renders an image from a source attachment and points the
 * target's OG image at it.
 */

const TINY_PNG = Buffer.from(VALID_PNG_BASE64, "base64");

let opened: ImageJobs | undefined;
afterEach(async () => {
  await opened?.close();
  opened = undefined;
});

const render = {
  sourceEntityType: "post",
  sourceEntityId: "post-1",
  attachmentType: "og-image",
  imageId: "og-post-post-1",
  targetEntityType: "post",
  targetEntityId: "post-1",
  targetImageField: "ogImageId",
} as const;

describe("SourceImageRenderJobHandler", () => {
  it("creates an image entity from a source attachment and sets ogImageId", async () => {
    const jobs = await imageJobs({
      attachment: {
        type: "image",
        data: TINY_PNG,
        mimeType: "image/png",
        filename: "post-og.png",
      },
    });
    opened = jobs;
    await seedPost(jobs.service, {
      id: "post-1",
      title: "Post",
      slug: "post-1",
      body: "Body",
    });

    const result = await jobs.run("image:image-render-source", render);

    expect(result).toEqual({
      success: true,
      imageId: "og-post-post-1",
      reused: false,
    });
    expect(await jobs.stored("image", "og-post-post-1")).toMatchObject({
      id: "og-post-post-1",
      entityType: "image",
      content: expect.stringContaining("data:image/png;base64,"),
      metadata: expect.objectContaining({
        attachmentType: "og-image",
        sourceEntityType: "post",
        sourceEntityId: "post-1",
      }),
    });
    expect(await jobs.stored("post", "post-1")).toMatchObject({
      id: "post-1",
      content: expect.stringContaining("ogImageId: og-post-post-1"),
    });
  });

  it("writes the target's stored body back, never one with resolved image references", async () => {
    const jobs = await imageJobs({
      attachment: {
        type: "image",
        data: TINY_PNG,
        mimeType: "image/png",
        filename: "post-og.png",
      },
    });
    opened = jobs;
    // A resolving read inlines the body image; only the stored read is safe
    // to write back.
    await jobs.service.createEntity({
      entity: {
        id: "figure",
        entityType: "image",
        content: VALID_PNG_DATA_URL,
        metadata: { title: "Figure", format: "png", width: 1, height: 1 },
      },
    });
    await seedPost(jobs.service, {
      id: "post-1",
      title: "Post",
      slug: "post-1",
      body: "Body ![Figure](entity://image/figure)",
    });

    await jobs.run("image:image-render-source", render);

    expect(await jobs.stored("post", "post-1")).toMatchObject({
      content: expect.stringContaining("![Figure](entity://image/figure)"),
    });
  });
});

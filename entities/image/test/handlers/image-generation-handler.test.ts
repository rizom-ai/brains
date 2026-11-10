import { afterEach, describe, it, expect } from "bun:test";
import type { ImageGenerateJobInput } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import {
  VALID_PNG_BASE64,
  VALID_PNG_DATA_URL,
  imageJobs,
  seedPost,
  type ImageJobs,
} from "../image-job-harness";

/**
 * `image:image-generate`, as other packages queue it by contract: the job
 * generates an image, saves it over its pending placeholder or as a new
 * image, and points a target's cover at it.
 */

const resultSchema = z.object({
  success: z.boolean(),
  imageId: z.string().optional(),
  error: z.string().optional(),
});

let opened: ImageJobs | undefined;
afterEach(async () => {
  await opened?.close();
  opened = undefined;
});

async function open(
  options: Parameters<typeof imageJobs>[0] = {},
): Promise<ImageJobs> {
  opened = await imageJobs(options);
  return opened;
}

async function generate(
  jobs: ImageJobs,
  data: ImageGenerateJobInput,
): Promise<z.output<typeof resultSchema>> {
  return resultSchema.parse(await jobs.run("image:image-generate", data));
}

describe("ImageGenerationJobHandler", () => {
  describe("validateAndParse", () => {
    it("should validate correct job data", async () => {
      const jobs = await open();
      const validData = {
        prompt: "A beautiful sunset over mountains",
        title: "Sunset Image",
      };

      const result = z
        .object({ prompt: z.string(), title: z.string() })
        .parse(
          jobs.handler("image:image-generate").validateAndParse(validData),
        );

      expect(result.prompt).toBe("A beautiful sunset over mountains");
      expect(result.title).toBe("Sunset Image");
    });

    it("should validate job data with optional aspectRatio", async () => {
      const jobs = await open();
      const validData = {
        prompt: "A beautiful sunset",
        title: "Sunset",
        aspectRatio: "1:1",
      };

      const result = z
        .object({ aspectRatio: z.string() })
        .parse(
          jobs.handler("image:image-generate").validateAndParse(validData),
        );

      expect(result.aspectRatio).toBe("1:1");
    });

    it("should validate job data with target entity info", async () => {
      const jobs = await open();
      const validData = {
        prompt: "Cover image for blog post",
        title: "Blog Post Cover",
        targetEntityType: "post",
        targetEntityId: "my-blog-post",
      };

      const result = z
        .object({ targetEntityType: z.string(), targetEntityId: z.string() })
        .parse(
          jobs.handler("image:image-generate").validateAndParse(validData),
        );

      expect(result.targetEntityType).toBe("post");
      expect(result.targetEntityId).toBe("my-blog-post");
    });

    it("should reject missing prompt", async () => {
      const jobs = await open();
      const invalidData = {
        title: "Sunset Image",
      };

      const result = jobs
        .handler("image:image-generate")
        .validateAndParse(invalidData);

      expect(result).toBeNull();
    });

    it("should generate image with derived title when title is omitted", async () => {
      const jobs = await open();

      const result = await generate(jobs, {
        prompt: "A beautiful sunset over mountains",
      });

      expect(result.success).toBe(true);
      expect(result.imageId).toBeDefined();
      const stored = await jobs.stored("image", result.imageId ?? "");
      expect(stored?.entityType).toBe("image");
      expect(stored?.metadata["title"]).toEqual(expect.any(String));
    });

    it("should reject invalid aspectRatio", async () => {
      const jobs = await open();
      const invalidData = {
        prompt: "A beautiful sunset",
        title: "Sunset",
        aspectRatio: "invalid-ratio",
      };

      const result = jobs
        .handler("image:image-generate")
        .validateAndParse(invalidData);

      expect(result).toBeNull();
    });
  });

  describe("process", () => {
    const createValidJobData = (
      overrides: Partial<ImageGenerateJobInput> = {},
    ): ImageGenerateJobInput => ({
      prompt: "A beautiful sunset over mountains",
      title: "Sunset Image",
      ...overrides,
    });

    it("should generate image and create entity", async () => {
      const jobs = await open();
      const result = await generate(jobs, createValidJobData());

      expect(result.success).toBe(true);
      expect(result.imageId).toBe("sunset-image");

      // Verify entity was created
      const stored = await jobs.stored("image", "sunset-image");
      expect(stored).toMatchObject({
        id: "sunset-image",
        entityType: "image",
        content: VALID_PNG_DATA_URL,
        metadata: expect.objectContaining({
          title: "Sunset Image",
        }),
      });
    });

    it("should update an existing pending image when generation completes", async () => {
      const jobs = await open();
      await jobs.service.createEntity({
        entity: {
          id: "sunset-image",
          entityType: "image",
          content: VALID_PNG_DATA_URL,
          visibility: "public",
          metadata: {
            title: "Sunset Image",
            alt: "Sunset Image",
            format: "png",
            width: 1,
            height: 1,
            status: "pending",
          },
        },
      });

      const result = await generate(jobs, createValidJobData());

      expect(result.success).toBe(true);
      const stored = await jobs.stored("image", "sunset-image");
      expect(stored).toMatchObject({
        id: "sunset-image",
        content: VALID_PNG_DATA_URL,
        metadata: expect.objectContaining({
          title: "Sunset Image",
          status: "draft",
        }),
      });
      // Updated in place: one image, not a second beside it.
      expect(
        (
          await jobs.service.listEntities({
            entityType: "image",
            options: { filter: { visibilityScope: "restricted" } },
          })
        ).map(({ id }) => id),
      ).toEqual(["sunset-image"]);
    });

    it("should update existing image in place when regenerating", async () => {
      const jobs = await open();
      // Setup: existing image with same ID
      const OLD_DATA_URL = `data:image/png;base64,${VALID_PNG_BASE64.replace("A", "B")}`;
      await jobs.service.createEntity({
        entity: {
          id: "sunset-image",
          entityType: "image",
          content: OLD_DATA_URL,
          visibility: "public",
          metadata: { title: "Old Image", format: "png", width: 1, height: 1 },
        },
      });
      const created = (await jobs.stored("image", "sunset-image"))?.created;

      const result = await generate(jobs, createValidJobData());

      expect(result.success).toBe(true);
      const stored = await jobs.stored("image", "sunset-image");
      expect(stored).toMatchObject({
        id: "sunset-image",
        content: VALID_PNG_DATA_URL,
        metadata: expect.objectContaining({ status: "draft" }),
      });
      // Neither deleted nor created anew: the same record, updated.
      expect(stored?.created).toBe(created);
    });

    it("should pass aspectRatio option to AI service", async () => {
      const jobs = await open();

      await generate(jobs, createValidJobData({ aspectRatio: "1:1" }));

      expect(jobs.generateImage).toHaveBeenCalledWith(
        expect.stringContaining("A beautiful sunset over mountains"),
        { aspectRatio: "1:1" },
      );
    });

    it("should fail when image generation not available", async () => {
      const jobs = await open({ canGenerateImages: false });

      const result = await generate(jobs, createValidJobData());

      expect(result.success).toBe(false);
      expect(result.error).toContain("not available");
    });

    it("should handle AI generation failure gracefully", async () => {
      const jobs = await open({
        generateImage: async () => {
          throw new Error("API rate limit exceeded");
        },
      });

      const result = await generate(jobs, createValidJobData());

      expect(result.success).toBe(false);
      expect(result.error).toContain("API rate limit exceeded");
    });

    it("should report progress during generation", async () => {
      const jobs = await open();

      await generate(jobs, createValidJobData());

      expect(jobs.progress.length).toBeGreaterThan(0);
      // Should have progress at start, during generation, and completion
      expect(jobs.progress.some((p) => p.progress === 100)).toBe(true);
    });

    it("should update target entity coverImageId when specified", async () => {
      const jobs = await open();
      await seedPost(jobs.service, {
        id: "my-post",
        title: "My Post",
        slug: "my-post",
      });

      const result = await generate(
        jobs,
        createValidJobData({
          targetEntityType: "post",
          targetEntityId: "my-post",
        }),
      );

      expect(result.success).toBe(true);

      // Verify entity was updated with coverImageId
      expect((await jobs.stored("post", "my-post"))?.metadata).toMatchObject({
        coverImageId: "sunset-image",
      });
    });

    it("should resolve target entities by title before updating coverImageId", async () => {
      const jobs = await open();
      await seedPost(jobs.service, {
        id: "resilience-in-distributed-systems",
        title: "Resilience Is Not Redundancy",
        slug: "resilience-in-distributed-systems",
      });

      const result = await generate(
        jobs,
        createValidJobData({
          targetEntityType: "post",
          targetEntityId: "Resilience Is Not Redundancy",
        }),
      );

      expect(result.success).toBe(true);
      expect(
        (await jobs.stored("post", "resilience-in-distributed-systems"))
          ?.metadata,
      ).toMatchObject({ coverImageId: "sunset-image" });
    });

    it("should fail when target entity not found", async () => {
      const jobs = await open();

      const result = await generate(
        jobs,
        createValidJobData({
          targetEntityType: "post",
          targetEntityId: "non-existent",
        }),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("should generate correct image ID from title", async () => {
      const jobs = await open();

      const result = await generate(
        jobs,
        createValidJobData({ title: "My Amazing Blog Post Cover" }),
      );

      expect(result.success).toBe(true);
      expect(result.imageId).toBe("my-amazing-blog-post-cover");
    });

    it("should call AI to distill prompt when entityContent is provided", async () => {
      const jobs = await open({
        distilled: "A glowing coral reef floating in amber light",
      });

      const result = await generate(
        jobs,
        createValidJobData({
          entityTitle: "The Future of Coral Reefs",
          entityContent:
            "Coral reefs are among the most biodiverse ecosystems...",
        }),
      );

      expect(result.success).toBe(true);
      // Should have called generateObject to distill the prompt
      expect(jobs.generateObject).toHaveBeenCalled();
      // The distilled prompt should be used for image generation, not the raw content
      expect(jobs.generateImage).toHaveBeenCalledWith(
        expect.stringContaining("A glowing coral reef floating in amber light"),
        expect.any(Object),
      );
    });

    it("should skip prompt distillation for image data URL entity content", async () => {
      const jobs = await open();

      const result = await generate(
        jobs,
        createValidJobData({
          prompt: "A pretty robot, elegant and friendly",
          entityTitle: "Pretty Robot",
          entityContent: VALID_PNG_DATA_URL,
        }),
      );

      expect(result.success).toBe(true);
      expect(jobs.generateObject).not.toHaveBeenCalled();
      expect(jobs.generateImage).toHaveBeenCalledWith(
        expect.stringContaining("A pretty robot, elegant and friendly"),
        expect.any(Object),
      );
    });

    it("uses a neutral subject prompt when the style guide is empty", async () => {
      const jobs = await open();

      await generate(jobs, createValidJobData());

      expect(jobs.generateImage).toHaveBeenCalledWith(
        "Subject: A beautiful sunset over mountains",
        expect.any(Object),
      );
    });

    it("should use prompt directly when entityContent is not provided", async () => {
      const jobs = await open();

      await generate(
        jobs,
        createValidJobData({ prompt: "A beautiful sunset over mountains" }),
      );

      // Should NOT call generateObject
      expect(jobs.generateObject).not.toHaveBeenCalled();
      // Should use the prompt with base style prepended
      expect(jobs.generateImage).toHaveBeenCalledWith(
        expect.stringContaining("A beautiful sunset over mountains"),
        expect.any(Object),
      );
    });
  });
});

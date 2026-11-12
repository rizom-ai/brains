import { beforeEach, describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import type { ContentGenerationConfig, JobHandler } from "@brains/plugins";
import { createMockProgressReporter } from "@brains/test-utils";
import { generationJobSchema } from "../src/entity/generation";
import { newsletterMetadataSchema } from "../src/entity/schemas/newsletter";
import { z } from "@brains/utils/zod";
import { createNewsletterEntityPlugin } from "./newsletter-plugins";

const generationResult = z.looseObject({
  success: z.boolean(),
  entityId: z.string().optional(),
  error: z.string().optional(),
});

/** A job the newsletter queued for itself, as the runtime queues it. */
function asPackage(input: unknown): unknown {
  return {
    authority: {
      actor: { kind: "service", serviceId: "newsletter" },
      permissionCeiling: "public",
    },
    input,
    byPackage: true,
  };
}

const firstPost = {
  id: "post-1",
  entityType: "post",
  content: "Content here.",
  metadata: {
    title: "First Post",
    slug: "post-1",
    status: "published",
    excerpt: "Introduction to the topic",
  },
};

describe("the newsletter generation", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let handler: JobHandler;
  let configs: ContentGenerationConfig[];

  beforeEach(async () => {
    harness = createPluginHarness();
    await harness.installPlugin(createNewsletterEntityPlugin());
    configs = [];
    harness.getMockShell().generateContent = async (
      config: ContentGenerationConfig,
    ): Promise<unknown> => {
      configs.push(config);
      return { subject: "Weekly Digest", content: "Here are the posts..." };
    };
    const registered = harness
      .getMockShell()
      .getJobQueueService()
      .getHandler("newsletter:generation");
    if (!registered) throw new Error("No newsletter generation");
    handler = registered;
  });

  async function run(
    input: unknown,
  ): Promise<z.output<typeof generationResult>> {
    const result = await handler.process(
      handler.validateAndParse(asPackage(input)),
      "job-123",
      createMockProgressReporter(),
      new AbortController().signal,
    );
    return generationResult.parse(result);
  }

  async function stored(
    id: string,
  ): Promise<ReturnType<typeof newsletterMetadataSchema.parse> | undefined> {
    const entity = await harness.getEntityService().getEntity({
      entityType: "newsletter",
      id,
      visibilityScope: "restricted",
    });
    return entity ? newsletterMetadataSchema.parse(entity.metadata) : undefined;
  }

  describe("generationJobSchema", () => {
    it("accepts a prompt, direct content, and source posts", () => {
      for (const data of [
        { prompt: "Create a newsletter about AI" },
        { subject: "Weekly Update", content: "Hello subscribers!" },
        { sourceEntityIds: ["post-1", "post-2"], sourceEntityType: "post" },
      ]) {
        expect(generationJobSchema.safeParse(data).success).toBe(true);
      }
    });

    it("leaves addToQueue unset when the input does", () => {
      expect(generationJobSchema.parse({ prompt: "Test" }).addToQueue).toBe(
        undefined,
      );
    });

    it("refuses a source type it does not write from", () => {
      expect(
        generationJobSchema.safeParse({
          sourceEntityIds: ["post-1"],
          sourceEntityType: "invalid",
        }).success,
      ).toBe(false);
    });
  });

  describe("process", () => {
    it("asks for an anchor-authored issue against the generation template", async () => {
      await run({ prompt: "Write a systems update" });

      expect(configs).toEqual([
        expect.objectContaining({
          prompt: "Write a systems update",
          templateName: "newsletter:generation",
          representedIdentity: "anchor",
        }),
      ]);
    });

    it("fails when no content source is provided", async () => {
      const result = await run({ addToQueue: true });

      expect(result.success).toBe(false);
      expect(result.error).toContain("No content source");
    });

    it("creates an issue from direct content with its subject, as a draft", async () => {
      const result = await run({
        subject: "Weekly Update",
        content: "Hello subscribers! Here are this week's highlights...",
      });

      expect(result).toMatchObject({
        success: true,
        entityId: "weekly-update",
      });
      expect((await stored("weekly-update"))?.status).toBe("draft");
      expect(configs).toEqual([]);
    });

    it("queues the issue when asked to", async () => {
      await run({
        subject: "Queued Update",
        content: "Content",
        addToQueue: true,
      });

      expect((await stored("queued-update"))?.status).toBe("queued");
    });

    it("fails when content is given without a subject", async () => {
      const result = await run({ content: "Hello subscribers!" });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Subject is required");
    });

    it("fails when none of the source posts exist", async () => {
      const result = await run({
        sourceEntityIds: ["non-existent-post"],
        sourceEntityType: "post",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("No source entities found");
    });

    it("records the posts it presents, and asks for them without voice rules of its own", async () => {
      harness.getMockShell().addEntities([
        {
          ...firstPost,
          contentHash: "post-1",
          visibility: "public",
          created: new Date(0).toISOString(),
          updated: new Date(0).toISOString(),
        },
      ]);

      const result = await run({
        sourceEntityIds: ["post-1"],
        sourceEntityType: "post",
      });

      expect(result.success).toBe(true);
      expect(await stored("weekly-digest")).toMatchObject({
        subject: "Weekly Digest",
        status: "draft",
        entityIds: ["post-1"],
        sourceEntityType: "post",
      });
      const prompt = configs[0]?.prompt ?? "";
      expect(prompt).toContain("First Post");
      expect(prompt).toContain("Introduction to the topic");
      for (const voiceRule of ["engaging", "compelling", "friendly sign-off"]) {
        expect(prompt).not.toContain(voiceRule);
      }
    });
  });
});

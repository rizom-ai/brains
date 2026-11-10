import { createTestEntity } from "@brains/entity-service/test";
import { createPluginHarness } from "@brains/plugins/test";
import { beforeEach, describe, expect, it } from "bun:test";
import type { ContentGenerationConfig, JobHandler } from "@brains/plugins";
import type { StyleGuideEntity } from "@brains/style-guide";
import { createMockProgressReporter } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import {
  buildProjectGenerationPrompt,
  projectGenerationJobSchema,
} from "../src/handlers/generation-handler";
import { portfolioPlugin } from "./portfolio-plugin";

/** A job the portfolio queued for itself, as the runtime queues it. */
function asPackage(input: unknown): unknown {
  return {
    authority: {
      actor: { kind: "service", serviceId: "portfolio" },
      permissionCeiling: "public",
    },
    input,
    byPackage: true,
  };
}

const generated = {
  title: "AI Project Title",
  description: "AI generated description",
  context: "AI generated context",
  problem: "AI generated problem",
  solution: "AI generated solution",
  outcome: "AI generated outcome",
};

describe("the project generation", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let handler: JobHandler;
  let configs: ContentGenerationConfig[];
  let failGeneration: boolean;

  beforeEach(async () => {
    harness = createPluginHarness();
    await harness.installPlugin(portfolioPlugin());
    configs = [];
    failGeneration = false;
    harness.getMockShell().generateContent = async (
      config: ContentGenerationConfig,
    ): Promise<unknown> => {
      configs.push(config);
      if (failGeneration) throw new Error("AI unavailable");
      return generated;
    };
    const registered = harness
      .getMockShell()
      .getJobQueueService()
      .getHandler("project:generation");
    if (!registered) throw new Error("No project generation");
    handler = registered;
    // As the declared style guide reads: the guidance is its metadata.
    harness.getMockShell().addEntities([
      createTestEntity<StyleGuideEntity>("style-guide", {
        id: "style-guide",
        content: "",
        metadata: {
          name: "Project voice",
          voice: { summary: "Plain and concrete" },
        },
      }),
    ]);
  });

  async function run(
    input: unknown,
    progress = createMockProgressReporter(),
  ): Promise<unknown> {
    return handler.process(
      handler.validateAndParse(asPackage(input)),
      "job-123",
      progress,
      new AbortController().signal,
    );
  }

  describe("validateAndParse", () => {
    it("takes a prompt and a year, and a title", () => {
      const data = { prompt: "Build an API", year: 2024, title: "My API" };
      expect(handler.validateAndParse(asPackage(data))).toMatchObject({
        input: data,
      });
      // As the portfolio plugin class queued it, before the type was declared.
      expect(handler.validateAndParse(data)).not.toBeNull();
    });

    it("refuses a request without its year or its prompt", () => {
      expect(
        handler.validateAndParse(asPackage({ prompt: "Build an API" })),
      ).toBeNull();
      expect(handler.validateAndParse(asPackage({ year: 2024 }))).toBeNull();
    });
  });

  describe("process", () => {
    it("writes the case study as the anchor, in the brain's voice", async () => {
      const data = { prompt: "Build something cool", year: 2023 };
      await run(data);

      expect(configs).toEqual([
        expect.objectContaining({
          prompt: buildProjectGenerationPrompt(data),
          templateName: "portfolio:generation",
          representedIdentity: "anchor",
          styleGuide: {
            voice: expect.stringContaining("Plain and concrete"),
          },
        }),
      ]);
    });

    it("saves a draft under its title's slug and answers with the title", async () => {
      const result = await run({ prompt: "Build an API gateway", year: 2024 });

      expect(result).toMatchObject({
        success: true,
        entityId: "ai-project-title",
        title: "AI Project Title",
      });
      const project = await harness
        .getEntityService()
        .getEntity({ entityType: "project", id: "ai-project-title" });
      expect(project?.content).toContain("## Context");
      expect(project?.content).toContain("## Outcome");
      expect(project?.metadata).toMatchObject({
        title: "AI Project Title",
        slug: "ai-project-title",
        status: "draft",
        description: "AI generated description",
        year: 2024,
      });
    });

    it("keeps the title the request states", async () => {
      const result = await run({
        prompt: "Build an API gateway",
        year: 2024,
        title: "Custom Title",
      });
      expect(result).toMatchObject({
        success: true,
        entityId: "custom-title",
        title: "Custom Title",
      });
    });

    it("reports progress as it goes", async () => {
      const reported: number[] = [];
      const progress = createMockProgressReporter();
      progress.report = async (notification): Promise<void> => {
        reported.push(
          z.looseObject({ progress: z.number() }).parse(notification).progress,
        );
      };
      await run({ prompt: "Build an API", year: 2024 }, progress);

      expect(reported.length).toBeGreaterThanOrEqual(2);
      expect(reported).toEqual([...reported].sort((a, b) => a - b));
    });

    it("answers with the error when the generation fails", async () => {
      failGeneration = true;
      expect(await run({ prompt: "Build an API", year: 2024 })).toEqual({
        success: false,
        error: "AI unavailable",
      });
    });
  });
});

describe("projectGenerationJobSchema", () => {
  it("should validate prompt and year", () => {
    expect(
      projectGenerationJobSchema.safeParse({ prompt: "Test", year: 2024 })
        .success,
    ).toBe(true);
  });

  it("should require prompt", () => {
    expect(projectGenerationJobSchema.safeParse({ year: 2024 }).success).toBe(
      false,
    );
  });

  it("should require year", () => {
    expect(
      projectGenerationJobSchema.safeParse({ prompt: "Test" }).success,
    ).toBe(false);
  });

  it("should accept optional title", () => {
    const result = projectGenerationJobSchema.safeParse({
      prompt: "Test",
      year: 2024,
      title: "My Title",
    });
    expect(result.data?.title).toBe("My Title");
  });
});

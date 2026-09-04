import { describe, it, expect, beforeEach } from "bun:test";
import type { EntityGenerationResult, JobEntityAccess } from "@brains/plugins";
import {
  createMockEntityPluginContext,
  createSilentLogger,
  createTestEntityAccess,
  createTestJobContext,
  type MockEntityPluginContext,
} from "@brains/test-utils";
import type { z } from "@brains/utils/zod";
import {
  buildProjectGenerationPrompt,
  projectGeneration,
} from "../src/handlers/generation-handler";

/**
 * These behaviours used to be asserted against ProjectGenerationJobHandler,
 * which nothing in production constructed once the package became
 * declarative. They belong to `projectGeneration`, which is what runs.
 */
describe("projectGeneration", () => {
  let context: MockEntityPluginContext;
  let writes: number;

  /**
   * A generation returns content and the runtime persists it, so writing its
   * own entity is a defect this catches rather than a case it supports.
   */
  function entityAccess(): JobEntityAccess {
    return createTestEntityAccess({
      entityService: context.entityService,
      refuseWrites: "projectGeneration must not write the entity itself",
      onWrite: () => {
        writes += 1;
      },
    });
  }

  async function generate(
    input: z.output<typeof projectGeneration.input>,
  ): Promise<EntityGenerationResult> {
    const jobContext = createTestJobContext<typeof input>({
      input,
      ai: context.ai,
      logger: createSilentLogger("portfolio-generation-test"),
      entities: entityAccess(),
      conversations: context.conversations,
      identity: context.identity,
      template: (localName: string) => `@brains/portfolio:project:${localName}`,
    });
    return projectGeneration.generate({ ...jobContext, entityId: undefined });
  }

  function succeeded(
    result: EntityGenerationResult,
  ): Extract<EntityGenerationResult, { success: true }> {
    if (!result.success) throw new Error(`Generation failed: ${result.error}`);
    return result;
  }

  beforeEach(() => {
    writes = 0;
    context = createMockEntityPluginContext({
      returns: {
        ai: {
          generate: {
            title: "AI Project Title",
            description: "AI generated description",
            context: "AI generated context",
            problem: "AI generated problem",
            solution: "AI generated solution",
            outcome: "AI generated outcome",
          },
        },
        entityService: { getEntity: null, listEntities: [] },
      },
    });
  });

  it("writes a case study from what the AI returned", async () => {
    const result = succeeded(
      await generate({ prompt: "Build an API gateway", year: 2024 }),
    );

    expect(result.metadata["title"]).toBe("AI Project Title");
    expect(result.metadata["status"]).toBe("draft");
    expect(result.metadata["year"]).toBe(2024);
    for (const section of ["Context", "Problem", "Solution", "Outcome"]) {
      expect(result.content).toContain(`## ${section}`);
    }
  });

  it("keeps a supplied title over the one the AI proposed", async () => {
    const result = succeeded(
      await generate({
        prompt: "Build an API gateway",
        year: 2024,
        title: "Custom Title",
      }),
    );

    expect(result.metadata["title"]).toBe("Custom Title");
    expect(result.resultExtras?.["title"]).toBe("Custom Title");
  });

  it("asks the AI through the portfolio template", async () => {
    const input = { prompt: "Build something cool", year: 2023 };
    await generate(input);

    expect(context.ai.generate).toHaveBeenCalledWith(
      {
        prompt: buildProjectGenerationPrompt(input),
        templateName: "@brains/portfolio:project:generation",
        representedIdentity: "anchor",
      },
      expect.anything(),
    );
  });

  // A project needs a year — it is required metadata — so a request without
  // one is refused rather than producing an entity that cannot validate.
  it("refuses a request with no year it can find", async () => {
    const result = await generate({
      prompt: "Create a case study for my API Gateway project",
    });

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining("year"),
    });
  });

  it("reads a year out of the prompt when none is given", async () => {
    const result = succeeded(
      await generate({ prompt: "a 2019 project about caching" }),
    );

    expect(result.metadata["year"]).toBe(2019);
  });

  it("never writes the entity itself — the runtime does", async () => {
    await generate({ prompt: "Build an API", year: 2024 });

    expect(writes).toBe(0);
  });
});

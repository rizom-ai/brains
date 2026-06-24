import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import type { EntityPluginContext } from "@brains/plugins";
import type { ProgressReporter } from "@brains/utils";
import {
  createMockEntityPluginContext,
  createMockProgressReporter,
  createSilentLogger,
} from "@brains/test-utils";
import { WhitepaperGenerationJobHandler } from "../src/handlers/whitepaperGenerationJobHandler";

describe("WhitepaperGenerationJobHandler", () => {
  let handler: WhitepaperGenerationJobHandler;
  let mockContext: EntityPluginContext;
  let mockProgressReporter: ProgressReporter;

  beforeEach(() => {
    mockProgressReporter = createMockProgressReporter();
    mockContext = createMockEntityPluginContext({
      returns: {
        ai: {
          generate: {
            title: "Regenerative Coordination Infrastructure",
            subtitle: "A civic technology outline",
            thesis:
              "Institutions need coordination infrastructure that preserves sovereignty and accountability.",
            abstract:
              "This white paper outlines a civic infrastructure approach to distributed coordination.",
            keywords: ["coordination", "institutions"],
            body: "## Executive Summary\n\n- Core argument\n\n## Roadmap\n\n- First phase",
          },
        },
        entityService: {
          createEntity: { entityId: "regenerative-coordination" },
        },
      },
    });
    handler = new WhitepaperGenerationJobHandler(
      createSilentLogger("whitepaper-generation-test"),
      mockContext,
    );
  });

  it("validates prompt-based job data", () => {
    const result = handler.validateAndParse({
      prompt: "Create a white paper outline about civic infrastructure",
      title: "Civic Infrastructure",
    });

    expect(result).not.toBeNull();
    expect(result?.prompt).toContain("white paper");
    expect(result?.title).toBe("Civic Infrastructure");
  });

  it("generates an outline whitepaper", async () => {
    const result = await handler.process(
      { prompt: "Create a white paper outline about civic infrastructure" },
      "job-123",
      mockProgressReporter,
    );

    expect(result.success).toBe(true);
    expect(result.title).toBe("Regenerative Coordination Infrastructure");
    expect(result.slug).toBe("regenerative-coordination-infrastructure");
    expect(mockContext.ai.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "Create a white paper outline about civic infrastructure",
        templateName: "whitepaper:generation",
      }),
    );
    expect(mockContext.entityService.createEntity).toHaveBeenCalledWith({
      entity: expect.objectContaining({
        entityType: "whitepaper",
        metadata: expect.objectContaining({
          status: "outline",
          slug: "regenerative-coordination-infrastructure",
        }),
        content: expect.stringContaining("status: outline"),
      }),
      options: undefined,
    });
  });

  it("includes provided source content in the AI prompt", async () => {
    const generate = spyOn(mockContext.ai, "generate");

    await handler.process(
      {
        prompt: "Create an outline",
        content: "Source note about institutional memory",
      },
      "job-123",
      mockProgressReporter,
    );

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining(
          "Source note about institutional memory",
        ),
      }),
    );
  });
});

import { createTestEntity } from "@brains/entity-service/test";
import { createPluginHarness } from "@brains/plugins/test";
import { beforeEach, describe, expect, it } from "bun:test";
import type { ContentGenerationConfig, JobHandler } from "@brains/plugins";
import type { StyleGuideEntity } from "@brains/style-guide";
import { createMockProgressReporter } from "@brains/test-utils";
import { decksPlugin } from "./decks-plugin";

/** A job the decks queued for themselves, as the runtime queues it. */
function asPackage(input: unknown): unknown {
  return {
    authority: {
      actor: { kind: "service", serviceId: "decks" },
      permissionCeiling: "public",
    },
    input,
    byPackage: true,
  };
}

describe("the deck generation", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let handler: JobHandler;
  let configs: ContentGenerationConfig[];

  beforeEach(async () => {
    harness = createPluginHarness();
    await harness.installPlugin(decksPlugin());
    configs = [];
    harness.getMockShell().generateContent = async (
      config: ContentGenerationConfig,
    ): Promise<unknown> => {
      configs.push(config);
      return config.templateName === "decks:description"
        ? { description: "Generated description" }
        : {
            title: "Generated Deck",
            content: "# Opening\n\n---\n\n# Close",
            description: "Generated description",
          };
    };
    const registered = harness
      .getMockShell()
      .getJobQueueService()
      .getHandler("deck:generation");
    if (!registered) throw new Error("No deck generation");
    handler = registered;
    // As the declared style guide reads: the guidance is its metadata.
    harness.getMockShell().addEntities([
      createTestEntity<StyleGuideEntity>("style-guide", {
        id: "style-guide",
        content: "",
        metadata: {
          name: "Deck voice",
          voice: { summary: "Decisive and evidence-led" },
        },
      }),
    ]);
  });

  async function run(input: unknown): Promise<unknown> {
    return handler.process(
      handler.validateAndParse(asPackage(input)),
      "job-123",
      createMockProgressReporter(),
      new AbortController().signal,
    );
  }

  describe("generation context", () => {
    it("passes anchor voice style guidance into deck generation", async () => {
      await run({ prompt: "Create a deck about resilient systems" });

      expect(configs).toContainEqual(
        expect.objectContaining({
          templateName: "decks:generation",
          representedIdentity: "anchor",
          styleGuide: {
            voice: expect.stringContaining("Decisive and evidence-led"),
          },
        }),
      );
    });

    it("passes voice guidance to descriptions without injecting identity", async () => {
      await run({
        title: "Existing Deck",
        content: "# Opinionated opening\n\n---\n\n# Conclusion",
      });

      expect(configs).toEqual([
        expect.objectContaining({
          templateName: "decks:description",
          representedIdentity: "none",
          styleGuide: {
            voice: expect.stringContaining("Decisive and evidence-led"),
          },
        }),
      ]);
    });
  });

  describe("validateAndParse", () => {
    it("should validate correct job data", () => {
      const data = { prompt: "Create a presentation", title: "My Deck" };
      const result = handler.validateAndParse(asPackage(data));

      expect(result).toMatchObject({ input: data });
    });

    it("should accept empty object (all fields optional)", () => {
      expect(handler.validateAndParse(asPackage({}))).not.toBeNull();
      // As the deck plugin class queued it, before the type was declared.
      expect(handler.validateAndParse({})).not.toBeNull();
    });

    it("should return null for invalid data", () => {
      expect(
        handler.validateAndParse(asPackage({ skipAi: "not-a-boolean" })),
      ).toBeNull();
      expect(handler.validateAndParse({ skipAi: "not-a-boolean" })).toBeNull();
    });
  });
});

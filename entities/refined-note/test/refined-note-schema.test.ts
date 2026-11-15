import { beforeAll, describe, expect, it } from "bun:test";
import type { BaseEntity, EntityAdapter } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import { refinedNoteMetadataSchema } from "../src/schemas/refined-note";
import { refinedNotePlugin } from "./refined-note-plugin";

describe("a refined note's required structure", () => {
  it("takes a title and a one-sentence summary", () => {
    expect(
      refinedNoteMetadataSchema.parse({
        title: "Push beats pull",
        summary: "People use what comes to them.",
      }),
    ).toEqual({
      title: "Push beats pull",
      summary: "People use what comes to them.",
    });
  });

  it.each([
    ["no title", { summary: "A summary." }],
    ["a blank title", { title: "  ", summary: "A summary." }],
    ["no summary", { title: "A title" }],
    ["a blank summary", { title: "A title", summary: "  " }],
  ])("refuses %s", (_case, metadata) => {
    expect(refinedNoteMetadataSchema.safeParse(metadata).success).toBe(false);
  });

  // The placeholder a queued generation starts from has nothing to sum up
  // yet, and one whose generation failed never will.
  it.each(["generating", "failed"])(
    "lets a %s placeholder go without a summary",
    (status) => {
      expect(
        refinedNoteMetadataSchema.safeParse({
          title: "A title",
          summary: "",
          status,
        }).success,
      ).toBe(true);
    },
  );
});

describe("the refined note's registered surface", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let adapter: EntityAdapter<BaseEntity>;
  const evals: string[] = [];

  beforeAll(async () => {
    harness = createPluginHarness({
      logger: createSilentLogger("refined-note-registration"),
    });
    harness.getMockShell().registerEvalHandler = (pluginId, id): void => {
      evals.push(`${pluginId}:${id}`);
    };
    await harness.installPlugin(refinedNotePlugin());
    adapter = harness.getEntityRegistry().getAdapter("refined-note");
  });

  it("registers a content type that uses up the notes it is written from", () => {
    expect(harness.getPlugin().id).toBe("refined-note");
    expect(
      harness.getEntityRegistry().getEntityTypeConfig("refined-note"),
    ).toMatchObject({
      classification: "content",
      consumesSources: ["note"],
      requiresGroupingMembership: true,
      projectionSourceRole: "primary",
    });
  });

  it("registers its template, its generation and its eval", () => {
    expect(evals).toEqual(["refined-note:refineNotes"]);
    expect(
      [...harness.getTemplates()]
        .filter(([name]) => name.startsWith("refined-note:"))
        .map(([name]) => name),
    ).toEqual(["refined-note:refinement"]);
    expect(
      harness.getMockShell().getJobQueueService().getRegisteredTypes(),
    ).toEqual(["refined-note:generation"]);
  });

  it("starts a queued generation from a placeholder with no summary", () => {
    expect(adapter.buildStub?.({ id: "a-title", title: "A title" })).toEqual({
      content: "",
      metadata: { title: "A title", summary: "", status: "generating" },
    });
  });

  it("stores its title and summary as frontmatter above the body", () => {
    const markdown = [
      "---",
      "title: Push beats pull",
      "summary: People use what comes to them.",
      "---",
      "",
      "The body, worked out.",
    ].join("\n");

    const read = adapter.fromMarkdown(markdown);

    expect(read.metadata).toEqual({
      title: "Push beats pull",
      summary: "People use what comes to them.",
    });
    expect(read.content?.trim()).toBe("The body, worked out.");
  });

  it("refuses a stored file that states no summary", () => {
    expect(() =>
      adapter.fromMarkdown("---\ntitle: Push beats pull\n---\n\nThe body."),
    ).toThrow();
  });
});

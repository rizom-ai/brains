import { describe, expect, it } from "bun:test";
import type { EntityPluginContext } from "@brains/plugins";
import {
  createMockEntityPluginContext,
  createSilentLogger,
  createTestEntity,
} from "@brains/test-utils";
import { SeriesGenerationHandler } from "../src/handlers/seriesGenerationHandler";
import type { Series } from "../src/schemas/series";

describe("SeriesGenerationHandler", () => {
  it("classifies source-derived descriptions as neutral", async () => {
    const series = createTestEntity<Series>("series", {
      id: "systems-series",
      content: `---
title: Systems Series
slug: systems-series
---
`,
      metadata: { title: "Systems Series", slug: "systems-series" },
    });
    const context: EntityPluginContext = createMockEntityPluginContext({
      entityTypes: ["series", "post"],
      returns: {
        ai: { generate: { description: "A connected set of systems notes." } },
        entityService: { getEntity: series },
      },
      listEntitiesImpl: async ({ entityType }) =>
        entityType === "post"
          ? [
              createTestEntity("post", {
                id: "systems-note",
                metadata: {
                  title: "Systems Note",
                  excerpt: "How the pieces connect",
                  seriesName: "Systems Series",
                },
              }),
            ]
          : [],
    });
    const handler = new SeriesGenerationHandler(
      createSilentLogger("test"),
      context,
    );

    await handler.process({ seriesId: "systems-series" });

    expect(context.ai.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        templateName: "series:description",
        representedIdentity: "none",
        style: "none",
      }),
    );
  });
});

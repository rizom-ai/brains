import { describe, expect, it } from "bun:test";

import {
  createMockEntityPluginContext,
  createSilentLogger,
  createTestEntity,
  createTestEntityAccess,
  createTestJobContext,
} from "@brains/test-utils";
import { seriesDescriptionJob } from "../src/handlers/seriesGenerationHandler";
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
      metadata: {
        title: "Systems Series",
        slug: "systems-series",
        coverImageId: null,
      },
    });
    const context = createMockEntityPluginContext({
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
    await seriesDescriptionJob.handle(
      createTestJobContext({
        input: { seriesId: "systems-series" },
        ai: context.ai,
        logger: createSilentLogger("test"),
        entities: createTestEntityAccess({
          entityService: context.entityService,
        }),
        conversations: context.conversations,
        identity: context.identity,
        template: (localName: string) => `@brains/series:series:${localName}`,
      }),
    );

    expect(context.ai.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        templateName: "@brains/series:series:description",
        representedIdentity: "none",
      }),
    );
  });
});

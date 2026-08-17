import { describe, expect, it } from "bun:test";

import {
  createMockEntityPluginContext,
  createSilentLogger,
  createTestEntity,
} from "@brains/test-utils";
import { seriesGeneration } from "../src/handlers/seriesGenerationHandler";
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
    await seriesGeneration.handle({
      input: { seriesId: "systems-series" },
      ai: context.ai,
      logger: createSilentLogger("test"),
      entities: {
        ...context.entityService,
        get: async () => null,
        create: async () => ({ entityId: "x", jobId: "j", skipped: false }),
        update: async () => ({ entityId: "x", jobId: "j", skipped: false }),
      },
      conversations: context.conversations,
      progress: { report: async (): Promise<void> => {} },
      signal: new AbortController().signal,
      messaging: { publish: async (): Promise<void> => {} },
    });

    expect(context.ai.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        templateName: "series:description",
        representedIdentity: "none",
      }),
    );
  });
});

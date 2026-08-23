import {
  defineEntity,
  defineEntityDashboardWidget,
  type EntityDefinition,
} from "@brains/sdk/entities";
import { swotFrontmatterSchema, swotMetadataSchema } from "./schemas/swot";
import { swotAdapter } from "./adapters/swot-adapter";
import { swotEvals } from "./lib/swot-evals";
import { swotWidget } from "./widgets/swot";

/**
 * A SWOT analysis of the brain's own capabilities.
 *
 * Derived from agents and skills by a projection rule, and excluded from
 * projection sourcing itself: a SWOT is a reading of the corpus, not part
 * of it.
 */
export const swot: EntityDefinition<"swot", typeof swotMetadataSchema> =
  defineEntity({
    type: "swot",
    purpose:
      "A SWOT analysis of strengths, weaknesses, opportunities, and threats.",
    metadata: swotMetadataSchema,
    config: { projectionSource: false, projectionSourceRole: "excluded" },
    markdown: {
      // The analysis lives entirely in frontmatter; only derivedAt is
      // indexed, so the rest is carried forward on write.
      decode: ({ content, frontmatter }) => ({
        content,
        metadata: {
          derivedAt: swotFrontmatterSchema.parse(frontmatter).derivedAt,
        },
      }),
      encode: ({ content, metadata }) => ({
        content,
        frontmatter: { derivedAt: metadata.derivedAt },
      }),
    },
    evals: swotEvals,
    dashboardWidgets: [
      defineEntityDashboardWidget(swotWidget, async ({ entities, signal }) => {
        signal.throwIfAborted();
        const entity = await entities.getEntity({
          entityType: "swot",
          id: "swot",
        });
        signal.throwIfAborted();
        if (!entity) return { status: "generating" as const };
        const { frontmatter } = swotAdapter.parseSwotContent(entity.content);
        return { status: "ready" as const, ...frontmatter };
      }),
    ],
  });

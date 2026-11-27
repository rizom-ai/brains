import {
  defineEntity,
  type EntityDefinition,
  type EntityOf,
} from "@brains/sdk/entities";
import { storedFormCodec } from "@brains/sdk/internal/entity-runtime";
import type { z } from "@brains/utils/zod";
import { seriesAtproto } from "./atproto-projection";
import { getTemplates } from "./lib/register-templates";
import { createSeriesProjectionRule } from "./lib/series-projection";
import {
  createSeriesBodyFormatter,
  parseSeriesBody,
  seriesFrontmatterSchema,
  seriesMetadataSchema,
} from "./schemas/series";
import { seriesDescriptionTemplate } from "./templates/description-template";

// Legacy: also reads the sectioned body layout written before 0.2.0-alpha.760; removed with stored-form-sectioned-body-layout (docs/legacy-code-inventory.json).

/** A series' stored document, its body in the compact layout. */
function seriesDocument(
  content: string,
  metadata: z.output<typeof seriesMetadataSchema>,
): { content: string; frontmatter: Record<string, unknown> } {
  return {
    content: createSeriesBodyFormatter(metadata.title, "compact").format(
      parseSeriesBody(metadata.title, content),
    ),
    frontmatter: {
      title: metadata.title,
      slug: metadata.slug,
      ...(metadata.coverImageId !== null && {
        coverImageId: metadata.coverImageId,
      }),
    },
  };
}

/**
 * A series: a named sequence its member entities join through their
 * `series` group, one series each, in the order they were published. It is
 * derived rather than authored: the series projection
 * builds one from the members of every other type and describes it. Its
 * frontmatter is its metadata; its body is the description, written in the
 * series body's form under the series' title, as the series adapter wrote it.
 */
export const series: EntityDefinition<"series", typeof seriesMetadataSchema> =
  defineEntity({
    type: "series",
    purpose: "A series grouping related posts or content under one theme.",
    coverImage: true,
    metadata: seriesMetadataSchema,
    markdown: storedFormCodec<typeof seriesMetadataSchema>({
      decode: ({ content, frontmatter }) => {
        const parsed = seriesFrontmatterSchema.parse(frontmatter);
        return {
          content,
          metadata: {
            title: parsed.title,
            slug: parsed.slug,
            coverImageId: parsed.coverImageId,
          },
        };
      },
      // A body in the sectioned layout reads; the compact one is written.
      encode: ({ content, metadata }) => seriesDocument(content, metadata),
    }),
    // Supporting weight: a series is an index over other content, so it
    // should not outrank the content it points at.
    config: {
      weight: 0.5,
      projectionSourceRole: "supporting",
      // Members join a series as people choose, through a built-in group.
      memberGroup: { label: "Series", multiple: false },
    },
    templates: { ...getTemplates(), description: seriesDescriptionTemplate },
    projectionRules: ({ template }) => [
      createSeriesProjectionRule(template("description")),
    ],
    atproto: seriesAtproto,
  });

export type Series = EntityOf<typeof series>;

import {
  defineEntity,
  type EntityDefinition,
  type EntityOf,
} from "@brains/sdk/entities";
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

/**
 * A series: a named sequence its member entities opt into with their
 * `seriesName`. It is derived rather than authored: the series projection
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
    markdown: {
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
      encode: ({ content, metadata }) => ({
        content: createSeriesBodyFormatter(metadata.title).format(
          parseSeriesBody(metadata.title, content),
        ),
        frontmatter: {
          title: metadata.title,
          slug: metadata.slug,
          ...(metadata.coverImageId !== null && {
            coverImageId: metadata.coverImageId,
          }),
        },
      }),
    },
    // Supporting weight: a series is an index over other content, so it
    // should not outrank the content it points at.
    config: { weight: 0.5, projectionSourceRole: "supporting" },
    templates: { ...getTemplates(), description: seriesDescriptionTemplate },
    projectionRules: ({ template }) => [
      createSeriesProjectionRule(template("description")),
    ],
    atproto: seriesAtproto,
  });

export type Series = EntityOf<typeof series>;

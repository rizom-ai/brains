/**
 * Series entity package.
 *
 * A series is derived rather than authored: any entity carrying a
 * `seriesName` in its metadata joins one, and the projection rule builds
 * the series entity from every other type. That is why it declares a
 * projection rule rather than a `defineProjection` — the latter pairs one
 * named source with one target.
 *
 * Authored against the public declarative surface (`@brains/sdk/entities`).
 */

import {
  defineEntity,
  defineEntityPackage,
  type EntityDefinition,
  type EntityOf,
  type EntityPackageDefinition,
} from "@brains/sdk/entities";
import {
  seriesFrontmatterSchema,
  seriesMetadataSchema,
} from "./schemas/series";
import { seriesDataSource } from "./datasources/series-datasource";
import { seriesGeneration } from "./handlers/seriesGenerationHandler";
import { getTemplates } from "./lib/register-templates";
import { createSeriesProjectionRule } from "./lib/series-projection";
import { seriesDescriptionTemplate } from "./templates/description-template";
import { createSeriesAtprotoProjection } from "./atproto-projection";

export const series: EntityDefinition<"series", typeof seriesMetadataSchema> =
  defineEntity({
    type: "series",
    purpose: "A named sequence its member entities opt into.",
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
        content,
        frontmatter: {
          title: metadata.title,
          slug: metadata.slug,
          coverImageId: metadata.coverImageId,
        },
      }),
    },
    // Supporting weight: a series is an index over other content, so it
    // should not outrank the content it points at.
    config: { weight: 0.5, projectionSourceRole: "supporting" },
    templates: { ...getTemplates(), description: seriesDescriptionTemplate },
    dataSources: [seriesDataSource],
    generation: seriesGeneration,
    projectionRules: [createSeriesProjectionRule()],
    atproto: createSeriesAtprotoProjection(),
  });

export type Series = EntityOf<typeof series>;

const seriesPackage: EntityPackageDefinition<
  readonly [typeof series],
  readonly []
> = defineEntityPackage({
  id: "series",
  entities: [series],
});

export default seriesPackage;

export {
  buildSeriesAtprotoRecord,
  createSeriesAtprotoProjection,
} from "./atproto-projection";
export {
  seriesSchema,
  seriesFrontmatterSchema,
  seriesMetadataSchema,
  seriesWithDataSchema,
  seriesListItemSchema,
  seriesBodySchema,
  type SeriesFrontmatter,
  type SeriesMetadata,
  type SeriesWithData,
  type SeriesListItem,
  type SeriesBody,
} from "./schemas/series";
export { seriesDataSource } from "./datasources/series-datasource";

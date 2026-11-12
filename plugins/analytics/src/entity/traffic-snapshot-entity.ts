import { defineEntity, type EntityDefinition } from "@brains/sdk/entities";
import {
  storedDocumentCodec,
  writesInDocumentOrder,
  withFrontmatterSchema,
} from "@brains/sdk/internal/entity-runtime";
import { trafficSnapshotAdapter } from "./adapter";
import {
  trafficSnapshotFrontmatterSchema,
  trafficSnapshotMetadataSchema,
} from "./schema";

/**
 * A week of site traffic the daily check captured from Cloudflare Web
 * Analytics: the operator's restricted numbers, written only by the
 * capture, never by hand, and kept out of search, embeddings and
 * projections.
 *
 * An exception to the declared-type pattern, made deliberately, as the
 * traffic-snapshot entity class kept it: the file's header holds each
 * day's pageviews, visits, paths, referrers and countries, but metadata
 * indexes only the week's title and totals, derived from them; the
 * per-day data never enters metadata. A read hands back the whole
 * document, as the class's adapter read it, and the reports parse it; a
 * write keeps the header once, in the document's order
 * (storedDocumentCodec with writesInDocumentOrder).
 */
export const trafficSnapshotEntity: EntityDefinition<
  "traffic-snapshot",
  typeof trafficSnapshotMetadataSchema
> = withFrontmatterSchema(
  writesInDocumentOrder(
    defineEntity({
      type: "traffic-snapshot",
      purpose:
        "A week of site traffic captured from Cloudflare Web Analytics: per day pageviews, visits, top paths, referrers and countries. Restricted operational data for the owner.",
      classification: "system",
      metadata: trafficSnapshotMetadataSchema,
      markdown: storedDocumentCodec({
        header: trafficSnapshotFrontmatterSchema,
        deriveMetadata: (header) => trafficSnapshotAdapter.metadataFor(header),
      }),
      config: {
        // The capture's record of what Cloudflare counted: written only by
        // the daily check, never by hand.
        actionPolicy: {
          create: "never",
          update: "never",
          delete: "never",
          extract: "never",
          publish: "never",
        },
        embeddable: false,
        // The days fix the week; these stored copies are no longer written.
        retiredFields: ["week", "start", "end"],
        fullTextSearchable: false,
        projectionSource: false,
        projectionSourceRole: "excluded",
      },
      validatePersist: ({ content, visibility }) => {
        if (visibility !== "restricted") {
          throw new Error("Traffic snapshots must have restricted visibility");
        }
        trafficSnapshotAdapter.parseContent(content);
      },
    }),
  ),
  trafficSnapshotFrontmatterSchema,
);

import {
  defineEntity,
  frontmatterInContent,
  type EntityDefinition,
} from "@brains/sdk/entities";
import { linkFrontmatterSchema, linkMetadataSchema } from "./schemas/link";
import { linkExtractionTemplate } from "./templates/extraction-template";
import { linkListTemplate } from "./templates/link-list";
import { linkDetailTemplate } from "./templates/link-detail";
import { linksDataSource } from "./datasources/links-datasource";
import { createLinkAtprotoProjection } from "./atproto-projection";
import { LINK_CAPTURE_JOB } from "./job-names";

/**
 * A saved external URL.
 *
 * Everything a link needs to be stored and rendered lives here. The work of
 * actually fetching a URL needs an API key, so it belongs to the service
 * package that declares this entity — see `./index.ts`.
 */
export const link: EntityDefinition<"link", typeof linkMetadataSchema> =
  defineEntity({
    type: "link",
    purpose:
      "A saved external URL or web resource captured for later reference.",
    metadata: linkMetadataSchema,
    config: { projectionSourceRole: "supporting" },
    // Metadata indexes three of the seven frontmatter fields — `capturedAt`
    // among them, because the data source sorts on it at the database rather
    // than over a fetched page. The rest — url, domain, source, description —
    // live in the file and are carried forward on write. Spelled out by hand
    // this dropped them: decode returned the body without its frontmatter and
    // encode re-emitted only the indexed fields, so a saved link lost its URL.
    markdown: frontmatterInContent((frontmatter) => {
      const parsed = linkFrontmatterSchema.parse(frontmatter);
      return {
        title: parsed.title,
        status: parsed.status,
        capturedAt: parsed.capturedAt,
      };
    }),
    templates: {
      extraction: linkExtractionTemplate,
      "link-list": linkListTemplate,
      "link-detail": linkDetailTemplate,
    },
    dataSources: [linksDataSource],
    atproto: createLinkAtprotoProjection(),
    // Anything that arrives as a URL — typed, pasted, or spoken — is a
    // capture. The runtime enqueues the job and reports the outcome, so the
    // package cannot claim a link it did not save.
    create: {
      fromPrompt: { delegate: LINK_CAPTURE_JOB },
      fromContent: { delegate: LINK_CAPTURE_JOB },
      fromUpload: {
        reject:
          "Links are captured from a URL, not from an uploaded file. Provide the URL instead.",
      },
    },
  });

import { defineEntity, type EntityDefinition } from "@brains/plugins";
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
    markdown: {
      // Metadata indexes two of the seven frontmatter fields. The rest —
      // url, domain, capturedAt, source, description — stay in the content's
      // frontmatter and are carried forward on write, so the codec only has
      // to state what it indexes.
      decode: ({ content, frontmatter }) => {
        const parsed = linkFrontmatterSchema.parse(frontmatter);
        return {
          content,
          metadata: { title: parsed.title, status: parsed.status },
        };
      },
      encode: ({ content, metadata }) => ({
        content,
        frontmatter: { title: metadata.title, status: metadata.status },
      }),
    },
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

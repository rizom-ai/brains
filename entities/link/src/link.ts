import { defineEntity, type EntityDefinition } from "@brains/sdk/entities";
import {
  withUrlRoute,
  writesInDocumentOrder,
} from "@brains/sdk/internal/entity-runtime";
import { linkAtproto } from "./atproto-projection";
import {
  linkFromContent,
  linkFromPrompt,
  linkFromUrl,
} from "./lib/create-from-url";
import { linkMarkdown } from "./lib/link-markdown";
import { linkMetadataSchema } from "./schemas/link";
import { linkExtractionTemplate } from "./templates/extraction-template";
import { linkDetailTemplate } from "./templates/link-detail";
import { linkListTemplate } from "./templates/link-list";

/**
 * A saved link: its summary in the body, its frontmatter its metadata. It
 * is captured from the URL a request names, by fetching and summarizing
 * the page, rendered on the site and published as an ai.rizom.brain.link
 * record. People write link files by hand, so a write keeps the file's own
 * frontmatter order. The capture jobs read the package's config, so the
 * package binds them (configure).
 */
export const link: EntityDefinition<"link", typeof linkMetadataSchema> =
  withUrlRoute(
    writesInDocumentOrder(
      defineEntity({
        type: "link",
        purpose:
          "A saved external URL or web resource captured for later reference.",
        metadata: linkMetadataSchema,
        markdown: linkMarkdown,
        // domain is the URL's hostname; readers take it from url.
        config: {
          projectionSourceRole: "supporting",
          retiredFields: ["domain"],
        },
        templates: {
          extraction: linkExtractionTemplate,
          "link-list": linkListTemplate,
          "link-detail": linkDetailTemplate,
        },
        create: {
          fromContent: linkFromContent(() => link),
          fromPrompt: linkFromPrompt,
        },
        atproto: linkAtproto,
      }),
    ),
    linkFromUrl,
  );

import {
  defineEntity,
  frontmatterInContent,
  generateMarkdownWithFrontmatter,
  type EntityDefinition,
} from "@brains/sdk/entities";
import { newsletterDataSource } from "./datasources/newsletter-datasource";
import { newsletterGeneration } from "./handlers/generation";
import { newsletterEvals } from "./lib/eval-handlers";
import {
  newsletterMetadataSchema,
  type NewsletterMetadata,
} from "./schemas/newsletter";
import { generationTemplate } from "./templates/generation-template";
import { newsletterDetailTemplate } from "./templates/newsletter-detail";
import { newsletterListTemplate } from "./templates/newsletter-list";

/**
 * An email newsletter issue.
 *
 * Secondary as a projection source: an issue restates what the brain has
 * already published rather than adding knowledge of its own. Sending is the
 * service half of this package; the entity only says what an issue is.
 */
export const newsletterEntity: EntityDefinition<
  "newsletter",
  typeof newsletterMetadataSchema
> = defineEntity({
  type: "newsletter",
  purpose: "An email newsletter issue composed for subscribers.",
  metadata: newsletterMetadataSchema,
  config: {
    projectionSourceRole: "secondary",
    publish: { publishStatuses: ["queued", "published", "failed"] },
  },
  // The issue's frontmatter stays in the file, so a synced copy reads as the
  // document a person would edit; metadata indexes the same fields.
  markdown: frontmatterInContent((frontmatter): NewsletterMetadata =>
    newsletterMetadataSchema.parse(frontmatter),
  ),
  // What system_generate persists before the writing starts.
  stub: ({ title }) => ({
    content: generateMarkdownWithFrontmatter("", {
      subject: title,
      status: "generating",
    }),
    metadata: { subject: title, status: "generating" },
  }),
  templates: {
    generation: generationTemplate,
    "newsletter-list": newsletterListTemplate,
    "newsletter-detail": newsletterDetailTemplate,
  },
  dataSources: [newsletterDataSource],
  generation: newsletterGeneration,
  // A scheduled issue digests what was published since: the runtime gathers
  // the recent published posts and hands them to generation in one batch.
  scheduledGeneration: {
    from: { entityType: "post", status: "published", limit: 10 },
    mode: "batch",
  },
  evals: newsletterEvals,
});

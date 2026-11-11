import { withFrontmatterSchema } from "@brains/sdk/internal/entity-runtime";
import { defineEntity, z, type EntityDefinition } from "@brains/sdk/entities";
import { generateMarkdownWithFrontmatter } from "@brains/plugins";
import { newsletterGeneration, generatedNewsletterSchema } from "./generation";
import {
  newsletterFrontmatterSchema,
  newsletterMetadataSchema,
} from "./schemas/newsletter";
import { generationTemplate } from "./templates/generation-template";
import { newsletterDetailTemplate } from "./templates/newsletter-detail";
import { newsletterListTemplate } from "./templates/newsletter-list";

const generationEvalInputSchema = z.object({
  prompt: z.string().optional(),
  content: z.string().optional(),
});

/**
 * An email newsletter issue: its body the issue, its frontmatter its
 * subject, status and the posts it presents. Secondary as a projection
 * source, since an issue restates what the brain already published. It is
 * written from a prompt, from given content, or from the recent published
 * posts when the content pipeline schedules one, and sent by the delivery
 * provider the package's services register. An issue's body sits trimmed
 * under its frontmatter, in the metadata schema's order, as the class's
 * adapter wrote it; the provider ids it once recorded after sending are
 * retired.
 */
export const newsletterEntity: EntityDefinition<
  "newsletter",
  typeof newsletterMetadataSchema
> = withFrontmatterSchema(
  defineEntity({
    type: "newsletter",
    purpose: "An email newsletter issue composed for subscribers.",
    metadata: newsletterMetadataSchema,
    markdown: {
      decode: ({ content, frontmatter }) => ({
        content,
        metadata: newsletterMetadataSchema.parse(frontmatter),
      }),
      encode: ({ content, metadata }) => ({
        content: content.trim(),
        frontmatter: metadata,
      }),
    },
    config: {
      projectionSourceRole: "secondary",
      publish: { publishStatuses: ["queued", "published", "failed"] },
      // Provider delivery ids were written after sending and never read.
      retiredFields: ["buttondownId", "resendBroadcastId"],
    },
    // What a create persists before the writing starts, as the class's
    // adapter built it.
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
    generation: newsletterGeneration,
    // A scheduled issue presents the recent published posts, all in one, as
    // the class's generate:execute answer gathered the ten most recent.
    scheduledGeneration: {
      from: { entityType: "post", status: "published", limit: 10 },
      mode: "batch",
    },
    evals: {
      // The issue's text from a prompt or a post, against the template the
      // generation uses, as the anchor in the brain's voice.
      generation: async (input, { ai }) => {
        const parsed = generationEvalInputSchema.parse(input);
        return ai.generate(
          {
            template: "generation",
            prompt: parsed.content
              ? `Write a newsletter based on this content:\n\n${parsed.content}`
              : (parsed.prompt ?? "Write a newsletter"),
            representedIdentity: "anchor",
            voice: true,
          },
          generatedNewsletterSchema,
        );
      },
    },
  }),
  newsletterFrontmatterSchema,
);

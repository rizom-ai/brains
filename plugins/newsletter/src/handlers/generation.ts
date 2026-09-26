import {
  baseEntityParserSchema,
  ensureUniqueTitle,
  fetchVoiceGuidance,
  generateMarkdownWithFrontmatter,
  z,
  type EntityGenerationDeclaration,
  type EntityGenerationResult,
} from "@brains/sdk/entities";
import { slugify } from "@brains/utils/string-utils";
import type { NewsletterMetadata } from "../schemas/newsletter";

/** The fields of a post that an issue is written from. */
const sourceEntitySchema = baseEntityParserSchema.extend({
  metadata: z.looseObject({
    title: z.string(),
    slug: z.string(),
    status: z.string(),
    excerpt: z.string().optional(),
  }),
});
type SourceEntity = z.output<typeof sourceEntitySchema>;

/** Shape the newsletter generation template returns. */
export const generatedNewsletterSchema: z.ZodObject<{
  subject: z.ZodString;
  content: z.ZodString;
}> = z.object({ subject: z.string(), content: z.string() });

export const generationJobSchema: z.ZodObject<{
  prompt: z.ZodOptional<z.ZodString>;
  sourceEntityIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
  sourceEntityType: z.ZodOptional<z.ZodEnum<{ post: "post" }>>;
  content: z.ZodOptional<z.ZodString>;
  subject: z.ZodOptional<z.ZodString>;
  addToQueue: z.ZodOptional<z.ZodBoolean>;
}> = z.object({
  prompt: z.string().optional().describe("AI generation prompt"),
  sourceEntityIds: z
    .array(z.string())
    .optional()
    .describe("Entity IDs to include in newsletter (e.g., blog posts)"),
  sourceEntityType: z
    .enum(["post"])
    .optional()
    .describe("Type of source entities"),
  content: z.string().optional().describe("Direct content (skip AI)"),
  subject: z
    .string()
    .optional()
    .describe("Newsletter subject (AI-generated if not provided)"),
  addToQueue: z
    .boolean()
    .optional()
    .describe("Create as queued (true) or draft (false)"),
});

export type GenerationJobData = z.output<typeof generationJobSchema>;

const failed = (error: string): EntityGenerationResult => ({
  success: false,
  error,
});

/**
 * Newsletter generation, declared.
 *
 * Three ways in: content with a subject needs no AI, a set of source posts
 * is digested, and a bare prompt is written from scratch. The result is
 * content for the runtime to persist; nothing here writes the issue.
 */
export const newsletterGeneration: EntityGenerationDeclaration<
  typeof generationJobSchema
> = {
  input: generationJobSchema,
  generate: async ({ input, ai, logger, entities, progress, template }) => {
    const addToQueue = input.addToQueue ?? false;
    const { prompt, sourceEntityIds, sourceEntityType } = input;
    let { content, subject } = input;

    const generateWith = async (finalPrompt: string): Promise<void> => {
      const voiceGuidance = await fetchVoiceGuidance(entities);
      const generated = await ai.generate(
        {
          prompt: finalPrompt,
          templateName: template("generation"),
          representedIdentity: "anchor",
          ...(voiceGuidance && { styleGuide: { voice: voiceGuidance } }),
        },
        generatedNewsletterSchema,
      );
      subject = subject ?? generated.subject;
      content = generated.content;
    };

    if (content) {
      if (!subject) {
        return failed("Subject is required when providing content directly");
      }
      await progress.report({
        progress: 50,
        total: 100,
        message: "Using provided content",
      });
    } else if (sourceEntityIds && sourceEntityIds.length > 0) {
      const entityType = sourceEntityType ?? "post";
      await progress.report({
        progress: 10,
        total: 100,
        message: `Fetching ${sourceEntityIds.length} source entities`,
      });

      const found = await Promise.all(
        sourceEntityIds.map((id) =>
          entities.getEntity({ entityType, id }, sourceEntitySchema),
        ),
      );
      const posts = found.filter((post): post is SourceEntity => post !== null);
      if (posts.length === 0) {
        return failed(
          `No source entities found for IDs: ${sourceEntityIds.join(", ")}`,
        );
      }

      await progress.report({
        progress: 30,
        total: 100,
        message: `Generating newsletter from ${posts.length} posts`,
      });

      const postSummaries = posts
        .map(
          (post) =>
            `## ${post.metadata.title}\n\n${post.metadata.excerpt ?? post.content.slice(0, 500)}`,
        )
        .join("\n\n---\n\n");
      const baseInstructions = `Create an engaging newsletter that highlights these blog posts:

${postSummaries}

The newsletter should:
- Have a compelling subject line
- Include a brief intro welcoming readers
- Summarize each post with a call-to-action to read more
- Have a friendly sign-off`;

      await generateWith(
        prompt
          ? `${baseInstructions}\n\nAdditional instructions: ${prompt}`
          : baseInstructions,
      );
      await progress.report({
        progress: 50,
        total: 100,
        message: "Newsletter generated from posts",
      });
    } else if (prompt) {
      await progress.report({
        progress: 10,
        total: 100,
        message: "Generating newsletter with AI",
      });
      await generateWith(prompt);
      await progress.report({
        progress: 50,
        total: 100,
        message: "Newsletter generated",
      });
    } else {
      return failed(
        "No content source provided (prompt, sourceEntityIds, or content)",
      );
    }

    if (!content || !subject) {
      return failed("Content or subject was not generated");
    }

    // An issue is stored under its slugified subject, so a colliding subject
    // would collide as an id too.
    const finalSubject = await ensureUniqueTitle({
      entityType: "newsletter",
      title: subject,
      deriveId: slugify,
      regeneratePrompt:
        "Generate a different newsletter subject line on the same topic.",
      context: { entityService: entities, ai, logger },
    });

    const metadata: NewsletterMetadata = {
      subject: finalSubject,
      status: addToQueue ? "queued" : "draft",
      ...(sourceEntityIds && { entityIds: sourceEntityIds }),
      ...(sourceEntityType && { sourceEntityType }),
    };

    return {
      success: true,
      id: slugify(finalSubject),
      content: generateMarkdownWithFrontmatter(content, metadata),
      metadata,
    };
  },
};

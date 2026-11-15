import type {
  EntityGenerationContext,
  EntityGenerationDeclaration,
  EntityGenerationResult,
} from "@brains/sdk/entities";
import {
  ensureUniqueTitle,
  entityRuntime,
  uniqueTitleContext,
  type EntityRuntime,
} from "@brains/sdk/internal/entity-runtime";
import { slugify } from "@brains/utils/string-utils";
import { z } from "@brains/utils/zod";
import type {
  NewsletterMetadata,
  newsletterMetadataSchema,
} from "./schemas/newsletter";

/** Source entity shape consumed by newsletter generation */
const sourceEntitySchema = z.looseObject({
  id: z.string(),
  content: z.string(),
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

/** A failure the generation answers with, as the class handler failed early. */
class GenerationRefused extends Error {}

interface Written {
  readonly subject: string | undefined;
  readonly content: string;
}

/** The issue written by the AI from a prompt, as the anchor in the brain's voice. */
async function writeWithAI(
  context: EntityGenerationContext<GenerationJobData>,
  prompt: string,
): Promise<{ subject: string; content: string }> {
  return context.ai.generate(
    {
      template: "generation",
      prompt,
      representedIdentity: "anchor",
      voice: true,
    },
    generatedNewsletterSchema,
  );
}

/** The posts an issue is written from, those that exist, parsed as the class read them. */
async function sourcePosts(
  runtime: EntityRuntime,
  entityType: string,
  ids: readonly string[],
): Promise<SourceEntity[]> {
  const found = await Promise.all(
    ids.map(async (id) => {
      const entity = await runtime.anyEntities.getEntity({ entityType, id });
      return entity ? sourceEntitySchema.parse(entity) : null;
    }),
  );
  return found.filter((entity): entity is SourceEntity => entity !== null);
}

/** The subject and body: given, written from posts, or written from a prompt. */
async function writeIssue(
  context: EntityGenerationContext<GenerationJobData>,
  runtime: EntityRuntime,
): Promise<Written> {
  const { input, progress } = context;
  const { prompt, sourceEntityIds, sourceEntityType, content, subject } = input;
  // Case 1: Direct content provided
  if (content) {
    if (!subject) {
      throw new GenerationRefused(
        "Subject is required when providing content directly",
      );
    }
    await progress.report({ progress: 50, message: "Using provided content" });
    return { subject, content };
  }
  // Case 2: Generate from source entities (blog posts)
  if (sourceEntityIds && sourceEntityIds.length > 0) {
    await progress.report({
      progress: 10,
      message: `Fetching ${sourceEntityIds.length} source entities`,
    });
    const posts = await sourcePosts(
      runtime,
      sourceEntityType ?? "post",
      sourceEntityIds,
    );
    if (posts.length === 0) {
      throw new GenerationRefused(
        `No source entities found for IDs: ${sourceEntityIds.join(", ")}`,
      );
    }
    await progress.report({
      progress: 30,
      message: `Generating newsletter from ${posts.length} posts`,
    });
    const postSummaries = posts
      .map(
        (p) =>
          `## ${p.metadata.title}\n\n${p.metadata.excerpt ?? p.content.slice(0, 500)}`,
      )
      .join("\n\n---\n\n");
    const baseInstructions = `Write a newsletter that presents these blog posts:

${postSummaries}

Summarize each post and link to it.`;
    const generated = await writeWithAI(
      context,
      prompt
        ? `${baseInstructions}\n\nAdditional instructions: ${prompt}`
        : baseInstructions,
    );
    await progress.report({
      progress: 50,
      message: "Newsletter generated from posts",
    });
    return {
      subject: subject ?? generated.subject,
      content: generated.content,
    };
  }
  // Case 3: Generate from prompt
  if (prompt) {
    await progress.report({
      progress: 10,
      message: "Generating newsletter with AI",
    });
    const generated = await writeWithAI(context, prompt);
    await progress.report({ progress: 50, message: "Newsletter generated" });
    return {
      subject: subject ?? generated.subject,
      content: generated.content,
    };
  }
  throw new GenerationRefused(
    "No content source provided (prompt, sourceEntityIds, or content)",
  );
}

/**
 * The newsletter's `newsletter:generation`: an issue from content given
 * with its subject, from the posts it presents, or from a prompt, written
 * as the anchor in the brain's voice; a subject that is taken asked for
 * again, and the issue saved beside any that already has its id.
 */
export const newsletterGeneration: EntityGenerationDeclaration<
  typeof generationJobSchema,
  typeof newsletterMetadataSchema
> = {
  input: generationJobSchema,
  generate: async (
    context,
  ): Promise<EntityGenerationResult<typeof newsletterMetadataSchema>> => {
    const { input } = context;
    const runtime = entityRuntime(context);
    let written: Written;
    try {
      written = await writeIssue(context, runtime);
    } catch (error) {
      if (error instanceof GenerationRefused) {
        return { success: false, error: error.message };
      }
      throw error;
    }
    const { subject, content } = written;
    if (!content || !subject) {
      return { success: false, error: "Content or subject was not generated" };
    }
    const { sourceEntityIds, sourceEntityType } = input;
    const finalSubject = await ensureUniqueTitle({
      entityType: "newsletter",
      title: subject,
      deriveId: slugify,
      regeneratePrompt:
        "Generate a different newsletter subject line on the same topic.",
      context: uniqueTitleContext(runtime),
    });
    const metadata: NewsletterMetadata = {
      subject: finalSubject,
      status: input.addToQueue ? "queued" : "draft",
      ...(sourceEntityIds && { entityIds: sourceEntityIds }),
      ...(sourceEntityType && { sourceEntityType }),
    };
    return runtime.deduplicated({
      success: true,
      id: slugify(finalSubject),
      content,
      metadata,
    });
  },
};

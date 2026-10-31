import type {
  CreateExecutionContext,
  CreateInput,
  CreateInterceptionResult,
  EntityPluginContext,
} from "@brains/plugins";
import {
  entityTextError,
  readEntityText,
  statedDateSchema,
} from "@brains/plugins";
import { getErrorMessage } from "@brains/utils/error";
import { slugify } from "@brains/utils/string-utils";
import { z } from "@brains/utils/zod";
import { blogPostAdapter } from "../adapters/blog-post-adapter";
import { blogPostFrontmatterSchema } from "../schemas/blog-post";

/**
 * Post fields a writer can state for their own text: in its frontmatter, or
 * as system_create `fields` (when and where an essay was first published).
 * Everything else a post needs is filled in by the generation job.
 */
const postTextFieldsSchema = z.object({
  status: z.enum(["draft", "queued", "published"]).optional(),
  publishedAt: statedDateSchema.optional(),
  canonicalUrl: z.string().url().optional(),
  excerpt: z.string().trim().min(1).optional(),
  author: z.string().trim().min(1).optional(),
  coverImageId: z.string().min(1).optional(),
  seriesName: z.string().min(1).optional(),
  seriesIndex: z.number().optional(),
});

/**
 * system_create for a post from the writer's own text: the text stays as
 * written, and the generation job adds what a post needs around it (an
 * excerpt, the author, a status). A complete post document is left to the
 * direct create, which stores it as given.
 */
export async function createPostFromText(
  input: CreateInput,
  executionContext: CreateExecutionContext,
  context: EntityPluginContext,
  pluginId: string,
): Promise<CreateInterceptionResult> {
  const read = readEntityText(input, {
    noun: "post",
    fieldsSchema: postTextFieldsSchema,
    isComplete: (frontmatter) =>
      blogPostFrontmatterSchema.safeParse(frontmatter).success,
  });
  if (read.kind === "not-text") return { kind: "continue", input };
  if (read.kind === "error") return entityTextError(read.error);
  const { title, body, fields } = read.text;

  let entityId: string;
  try {
    const id = slugify(title);
    const stub = blogPostAdapter.buildStub({ id, title });
    const now = new Date().toISOString();
    const created = await context.entityService.createEntity({
      entity: {
        id,
        entityType: "post",
        content: stub.content,
        metadata: stub.metadata,
        ...(input.visibility !== undefined && {
          visibility: input.visibility,
        }),
        created: now,
        updated: now,
      },
      options: { deduplicateId: true },
    });
    entityId = created.entityId;
  } catch (error) {
    return entityTextError(getErrorMessage(error, "Failed to create the post"));
  }

  try {
    const jobId = await context.jobs.enqueue({
      type: "post:generation",
      data: { entityId, title, content: body, ...fields },
      toolContext: executionContext,
      options: {
        source: pluginId,
        metadata: { operationType: "content_operations" },
      },
    });
    return {
      kind: "handled",
      result: {
        success: true,
        data: { entityId, status: "generating", jobId },
      },
    };
  } catch (error) {
    // No job will fill the stub; left behind it would stay "generating".
    await context.entityService
      .deleteEntity({ entityType: "post", id: entityId })
      .catch(() => undefined);
    return entityTextError(
      getErrorMessage(error, "Failed to queue the post's completion"),
    );
  }
}

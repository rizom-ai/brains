import type {
  CreateExecutionContext,
  CreateInput,
  CreateInterceptionResult,
  EntityPluginContext,
} from "@brains/plugins";
import { getErrorMessage } from "@brains/utils/error";
import { parseMarkdown } from "@brains/utils/markdown";
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
  publishedAt: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), {
      message: "Expected a date such as 2025-03-12",
    })
    .transform((value) => new Date(value).toISOString())
    .optional(),
  canonicalUrl: z.string().url().optional(),
  excerpt: z.string().trim().min(1).optional(),
  author: z.string().trim().min(1).optional(),
  coverImageId: z.string().min(1).optional(),
  seriesName: z.string().min(1).optional(),
  seriesIndex: z.number().optional(),
});

type PostTextFields = z.output<typeof postTextFieldsSchema>;

const LEADING_H1 = /^#[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*(?:\r?\n|$)/;

function sameTitle(a: string, b: string): boolean {
  const normalize = (value: string): string =>
    value.trim().replace(/\s+/g, " ").toLowerCase();
  return normalize(a) === normalize(b);
}

/**
 * Title the post, dropping a leading H1 that is (or repeats) the title so the
 * page does not show it twice. Any other text is kept exactly as written.
 */
function titleAndBody(
  stated: string | undefined,
  text: string,
): { title: string | undefined; body: string } {
  const heading = LEADING_H1.exec(text);
  const headingText = heading?.[1]?.trim();
  if (!heading || !headingText) return { title: stated, body: text };
  if (stated && !sameTitle(stated, headingText)) {
    return { title: stated, body: text };
  }
  return {
    title: stated ?? headingText,
    body: text.slice(heading[0].length).replace(/^(?:[ \t]*\r?\n)+/, ""),
  };
}

function handledError(error: string): CreateInterceptionResult {
  return { kind: "handled", result: { success: false, error } };
}

function describeIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) =>
      issue.code === "unrecognized_keys"
        ? `not post fields: ${issue.keys.join(", ")}`
        : `${issue.path.join(".")}: ${issue.message}`,
    )
    .join("; ");
}

function isCompletePostDocument(frontmatter: Record<string, unknown>): boolean {
  return blogPostFrontmatterSchema.safeParse(frontmatter).success;
}

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
  if (input.prompt || input.from || !input.content) {
    return { kind: "continue", input };
  }

  let parsed: { frontmatter: Record<string, unknown>; content: string };
  try {
    parsed = parseMarkdown(input.content);
  } catch (error) {
    return handledError(getErrorMessage(error, "Unreadable post frontmatter"));
  }
  if (isCompletePostDocument(parsed.frontmatter)) {
    return { kind: "continue", input };
  }

  const fromText = postTextFieldsSchema.safeParse(parsed.frontmatter);
  if (!fromText.success) {
    return handledError(
      `Invalid post frontmatter (${describeIssues(fromText.error)}).`,
    );
  }
  const stated = postTextFieldsSchema.strict().safeParse(input.fields ?? {});
  if (!stated.success) {
    return handledError(
      `Invalid post fields (${describeIssues(stated.error)}).`,
    );
  }
  const fields: PostTextFields = { ...fromText.data, ...stated.data };

  const frontmatterTitle = parsed.frontmatter["title"];
  const { title, body } = titleAndBody(
    input.title ??
      (typeof frontmatterTitle === "string" && frontmatterTitle.trim()
        ? frontmatterTitle.trim()
        : undefined),
    parsed.content,
  );
  if (!title) {
    return handledError(
      'A post needs a title: pass `title`, or start the text with a "# Title" heading.',
    );
  }
  if (!body.trim()) {
    return handledError("The post has no text besides its title.");
  }

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
    return handledError(getErrorMessage(error, "Failed to create the post"));
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
    return handledError(
      getErrorMessage(error, "Failed to queue the post's completion"),
    );
  }
}

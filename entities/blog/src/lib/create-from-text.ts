import type {
  EntityCreateContext,
  EntityCreateRoute,
} from "@brains/sdk/entities";
import {
  checkEntityText,
  entityRuntime,
  entityTextError,
  readEntityText,
  statedDateSchema,
} from "@brains/sdk/internal/entity-runtime";
import { slugify } from "@brains/utils/string-utils";
import { z } from "@brains/utils/zod";
import {
  blogPostFrontmatterSchema,
  type blogPostMetadataSchema,
} from "../schemas/blog-post";
import { postStub } from "./post-markdown";

/**
 * Post fields a writer can state for their own text: in its frontmatter, or
 * as system_create `fields` (when and where an essay was first published).
 * Everything else a post needs is filled in by the generation.
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

function readPostText(
  context: EntityCreateContext,
): ReturnType<typeof readEntityText<typeof postTextFieldsSchema>> {
  return readEntityText(context.input, {
    noun: "post",
    fieldsSchema: postTextFieldsSchema,
    isComplete: (frontmatter) =>
      blogPostFrontmatterSchema.safeParse(frontmatter).success,
  });
}

/**
 * system_create for a post from the writer's own text: the text stays as
 * written, and the post's own generation adds what a post needs around it
 * (an excerpt, the author, a status), filling the placeholder it was
 * queued for, for the caller who asked. Before the save is confirmed it
 * asks for a title the text does not give, and fills in the one it does. A
 * complete post document, or anything that is not the writer's text, goes
 * on to the ordinary create, which stores it as given.
 */
export const postFromText: EntityCreateRoute<typeof blogPostMetadataSchema> = {
  check: async (context) =>
    checkEntityText(readPostText(context), ({ title }) => ({ title })),
  resolve: async (context) => {
    const read = readPostText(context);
    if (read.kind === "not-text")
      return entityRuntime(context).ordinaryCreate();
    if (read.kind !== "text") {
      const refused = entityTextError(read);
      return {
        refuse:
          refused.kind === "handled" && !refused.result.success
            ? refused.result.error
            : "This text cannot be saved as a post",
      };
    }
    const { title, body, fields } = read.text;
    const id = slugify(title);
    return {
      create: { id, ...postStub({ id, title }) },
      delegate: {
        job: "generation",
        input: { title, content: body, ...fields },
      },
    };
  },
};

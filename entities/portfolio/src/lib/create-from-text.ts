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
  type EntityTextResult,
} from "@brains/sdk/internal/entity-runtime";
import { generateMarkdown } from "@brains/utils/markdown-frontmatter";
import { getErrorMessage } from "@brains/utils/error";
import { z } from "@brains/utils/zod";
import {
  projectFrontmatterSchema,
  type projectMetadataSchema,
} from "../schemas/project";
import {
  projectFromTextSchema,
  type ProjectFromText,
} from "../templates/from-text-template";

/** Project fields a writer can state for their own text, in frontmatter or as `fields`. */
const projectTextFieldsSchema = z.object({
  status: z.enum(["draft", "published"]).optional(),
  publishedAt: statedDateSchema.optional(),
  description: z.string().trim().min(1).optional(),
  year: z.coerce.number().int().min(1000).max(9999).optional(),
  url: z.string().url().optional(),
  coverImageId: z.string().min(1).optional(),
});

async function deriveFromText(
  context: EntityCreateContext,
  project: { title: string; body: string },
): Promise<ProjectFromText> {
  return entityRuntime(context).generate(
    {
      template: "from-text",
      prompt: `Title: ${project.title}\n\nText:\n${project.body}`,
      representedIdentity: "none",
      voice: true,
    },
    projectFromTextSchema,
  );
}

/** A derived year counts only when the text itself names it. */
function statedInText(
  year: number | null,
  project: { title: string; body: string },
): number | undefined {
  if (year === null) return undefined;
  const pattern = new RegExp(`\\b${year}\\b`);
  return pattern.test(project.title) || pattern.test(project.body)
    ? year
    : undefined;
}

type ProjectTextFields = z.output<typeof projectTextFieldsSchema>;

/**
 * The writer's project text with its card description and year: the ones
 * they state, else written from the text and the year it names. A year or
 * description that cannot be found is asked for.
 */
async function readProjectText(
  context: EntityCreateContext,
): Promise<
  EntityTextResult<ProjectTextFields & { year: number; description: string }>
> {
  const read = readEntityText(context.input, {
    noun: "project",
    fieldsSchema: projectTextFieldsSchema,
    isComplete: (frontmatter) =>
      projectFrontmatterSchema.safeParse(frontmatter).success,
  });
  if (read.kind !== "text") return read;
  const { title, body, fields } = read.text;

  let description = fields.description;
  let year = fields.year;
  if (description === undefined || year === undefined) {
    try {
      const derived = await deriveFromText(context, { title, body });
      description ??= derived.description.trim() || undefined;
      year ??= statedInText(derived.year, { title, body });
    } catch (error) {
      return {
        kind: "error",
        error: getErrorMessage(error, "Could not describe the project"),
      };
    }
  }
  if (year === undefined) {
    return {
      kind: "question",
      asks: "fields",
      question: "Which year did this project begin?",
      answerWith: "Pass the answer as fields { year }.",
    };
  }
  if (description === undefined) {
    return {
      kind: "question",
      asks: "fields",
      question: "How would you sum up this project in a sentence?",
      answerWith: "Pass the answer as fields { description }.",
    };
  }
  return {
    kind: "text",
    text: { title, body, fields: { ...fields, year, description } },
  };
}

/**
 * system_create for a portfolio project from the writer's own text: the text
 * stays as written, titled from its first heading, saved as a draft with a
 * card description written from it and the year it names. Before the save
 * is confirmed it asks for the year the text does not name, and fills in
 * the title, year and card description the confirmation shows. Anything
 * that is not the writer's text goes on to the ordinary create.
 */
export const projectFromText: EntityCreateRoute<typeof projectMetadataSchema> =
  {
    check: async (context) =>
      checkEntityText(await readProjectText(context), ({ title, fields }) => ({
        title,
        fields: { year: fields.year, description: fields.description },
      })),
    resolve: async (context) => {
      const read = await readProjectText(context);
      const runtime = entityRuntime(context);
      if (read.kind === "not-text") return runtime.ordinaryCreate();
      if (read.kind !== "text") {
        const refused = entityTextError(read);
        return {
          refuse:
            refused.kind === "handled" && !refused.result.success
              ? refused.result.error
              : "This text cannot be saved as a project",
        };
      }
      const { title, body, fields } = read.text;
      const { year, description } = fields;
      const status = fields.status ?? "draft";
      const frontmatter = Object.fromEntries(
        Object.entries({
          title,
          status,
          description,
          year,
          url: fields.url,
          publishedAt:
            fields.publishedAt ??
            (status === "published" ? new Date().toISOString() : undefined),
          coverImageId: fields.coverImageId,
        }).filter(([, value]) => value !== undefined),
      );
      return runtime.ordinaryCreate({
        title,
        content: generateMarkdown(frontmatter, body),
      });
    },
  };

/** The year a request names, in its title or its prompt. */
function extractProjectYear(
  title: string | undefined,
  prompt: string | undefined,
): number | null {
  for (const value of [title, prompt]) {
    const match = value?.match(/\b(19\d{2}|20\d{2})\b/);
    if (match?.[1]) return Number(match[1]);
  }
  return null;
}

/**
 * system_create for a project from a prompt that names the year it began:
 * the type's own generation writes it, for the caller who asked. A prompt
 * that names no year goes on to the ordinary create.
 */
export const projectFromPrompt: EntityCreateRoute<
  typeof projectMetadataSchema
> = {
  resolve: async (context) => {
    const { input } = context;
    const year = extractProjectYear(input.title, input.prompt);
    if (!input.prompt || year === null) {
      return entityRuntime(context).ordinaryCreate();
    }
    return {
      delegate: {
        job: "generation",
        input: {
          prompt: input.prompt,
          ...(input.title ? { title: input.title } : {}),
          year,
        },
      },
    };
  },
};

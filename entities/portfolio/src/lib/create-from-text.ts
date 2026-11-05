import type {
  CreateCheckResult,
  CreateInput,
  CreateInterceptionResult,
  EntityPluginContext,
  EntityTextResult,
} from "@brains/plugins";
import {
  checkEntityText,
  continueWithEntityText,
  entityTextError,
  readEntityText,
  statedDateSchema,
} from "@brains/plugins";
import { fetchStyleGuide, formatVoiceGuidance } from "@brains/contracts";
import { getErrorMessage } from "@brains/utils/error";
import { z } from "@brains/utils/zod";
import { projectFrontmatterSchema } from "../schemas/project";
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
  context: Pick<EntityPluginContext, "ai" | "entityService">,
  project: { title: string; body: string },
): Promise<ProjectFromText> {
  const voiceGuidance = formatVoiceGuidance(
    await fetchStyleGuide(context.entityService),
  );
  return context.ai.generate(
    {
      prompt: `Title: ${project.title}\n\nText:\n${project.body}`,
      templateName: "portfolio:from-text",
      representedIdentity: "none",
      ...(voiceGuidance && { styleGuide: { voice: voiceGuidance } }),
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
  input: CreateInput,
  context: Pick<EntityPluginContext, "ai" | "entityService">,
): Promise<
  EntityTextResult<ProjectTextFields & { year: number; description: string }>
> {
  const read = readEntityText(input, {
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
 * Before a project from the writer's text is confirmed: ask for the year
 * the text does not name, and fill in the title, year and card description
 * the confirmation shows and the confirmed save receives.
 */
export async function checkProjectText(
  input: CreateInput,
  context: Pick<EntityPluginContext, "ai" | "entityService">,
): Promise<CreateCheckResult> {
  return checkEntityText(
    await readProjectText(input, context),
    ({ title, fields }) => ({
      title,
      fields: { year: fields.year, description: fields.description },
    }),
  );
}

/**
 * system_create for a portfolio project from the writer's own text: the text
 * stays as written, titled from its first heading, saved as a draft with a
 * card description written from it and the year it names.
 */
export async function createProjectFromText(
  input: CreateInput,
  context: Pick<EntityPluginContext, "ai" | "entityService">,
): Promise<CreateInterceptionResult> {
  const read = await readProjectText(input, context);
  if (read.kind === "not-text") return { kind: "continue", input };
  if (read.kind !== "text") return entityTextError(read);
  const { title, body, fields } = read.text;
  const { year, description } = fields;

  const status = fields.status ?? "draft";
  return continueWithEntityText(input, {
    title,
    body,
    frontmatter: {
      title,
      status,
      description,
      year,
      url: fields.url,
      publishedAt:
        fields.publishedAt ??
        (status === "published" ? new Date().toISOString() : undefined),
      coverImageId: fields.coverImageId,
    },
  });
}

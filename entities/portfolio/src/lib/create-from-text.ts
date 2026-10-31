import type {
  CreateInput,
  CreateInterceptionResult,
  EntityPluginContext,
} from "@brains/plugins";
import {
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

/**
 * system_create for a portfolio project from the writer's own text: the text
 * stays as written, titled from its first heading, saved as a draft with a
 * card description written from it and the year it names. When the text does
 * not say when the project began, the user is asked once.
 */
export async function createProjectFromText(
  input: CreateInput,
  context: Pick<EntityPluginContext, "ai" | "entityService">,
): Promise<CreateInterceptionResult> {
  const read = readEntityText(input, {
    noun: "project",
    fieldsSchema: projectTextFieldsSchema,
    isComplete: (frontmatter) =>
      projectFrontmatterSchema.safeParse(frontmatter).success,
  });
  if (read.kind === "not-text") return { kind: "continue", input };
  if (read.kind === "error") return entityTextError(read.error);
  const { title, body, fields } = read.text;

  let description = fields.description;
  let year = fields.year;
  if (description === undefined || year === undefined) {
    try {
      const derived = await deriveFromText(context, { title, body });
      description ??= derived.description.trim() || undefined;
      year ??= statedInText(derived.year, { title, body });
    } catch (error) {
      return entityTextError(
        getErrorMessage(error, "Could not describe the project"),
      );
    }
  }
  if (year === undefined) {
    return entityTextError(
      "Which year did this project begin? The text does not say. (Save it again from the same user message, with fields { year }.)",
    );
  }
  if (description === undefined) {
    return entityTextError(
      "How would you sum up this project in a sentence? A description could not be written from the text. (Save it again from the same user message, with fields { description }.)",
    );
  }

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

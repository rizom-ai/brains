import { isEntityValidationError } from "@brains/sdk/internal/entity-runtime";
import { isRecord } from "@brains/utils/is-record";
import { z } from "@brains/utils/zod";
import { jsonResponse } from "./editor-response";

const validationSchema = z.object({
  issues: z.array(
    z.object({
      path: z.array(z.union([z.string(), z.number()])).default([]),
      message: z.string(),
    }),
  ),
});

/** Schema failures and cross-entity persist failures share the field-error UI. */
export function editorValidationResponse(error: unknown): Response | undefined {
  if (!isEntityValidationError(error)) return undefined;
  const parsed = validationSchema.safeParse(
    isRecord(error) && Object.hasOwn(error, "originalError")
      ? error["originalError"]
      : error,
  );
  return jsonResponse(
    {
      error: "Invalid entity data",
      issues: parsed.success ? parsed.data.issues : [],
    },
    400,
  );
}

/** Whether a field holds nothing an author entered. */
function isEmptyValue(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "") ||
    (Array.isArray(value) && value.length === 0)
  );
}

/**
 * A frontmatter schema's refusal, for the form. A field left empty is named
 * as required instead of with the validator's type message, which describes
 * the schema rather than what the author has to do.
 */
export function frontmatterIssueResponse(
  error: z.ZodError,
  values: Record<string, unknown>,
): Response {
  return jsonResponse(
    {
      error: "Invalid frontmatter",
      issues: error.issues.map((issue) => {
        const field = issue.path[0];
        return issue.path.length === 1 &&
          typeof field === "string" &&
          isEmptyValue(values[field])
          ? { ...issue, message: "Required." }
          : issue;
      }),
    },
    400,
  );
}

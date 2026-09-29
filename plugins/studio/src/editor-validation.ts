import { isEntityValidationError } from "@brains/plugins";
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

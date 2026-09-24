import { z } from "@brains/utils/zod";
import { jsonResponse } from "./editor-response";

const validationSchema = z.object({
  kind: z.literal("invalid"),
  issues: z.array(
    z.object({
      path: z.array(z.union([z.string(), z.number()])).default([]),
      message: z.string(),
    }),
  ),
});

/** Schema failures and cross-entity persist failures share the field-error UI. */
export function editorValidationResponse(error: unknown): Response | undefined {
  const parsed = validationSchema.safeParse(error);
  if (!parsed.success) return undefined;
  return jsonResponse(
    {
      error: "Invalid entity data",
      issues: parsed.data.issues,
    },
    400,
  );
}

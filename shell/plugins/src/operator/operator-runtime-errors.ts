import type { z } from "@brains/utils/zod";
import type { RuntimeOperatorValidationIssue } from "./operator-view-runtime";

/** The declared operator surface a runtime error is attributed to. */
export interface OperatorRuntimeIdentity {
  readonly publicServiceId: string;
  readonly packageName: string;
  readonly surface: "dashboard widget" | "Studio workspace";
  readonly id: string;
}

export function runtimeError(
  identity: OperatorRuntimeIdentity,
  stage: string,
  detail?: string,
): Error {
  return new Error(
    `Service "${identity.publicServiceId}" package "${identity.packageName}" ${identity.surface} "${identity.id}" ${stage}${detail ? `: ${detail}` : ""}`,
  );
}

export function validationDetail(
  issues: readonly RuntimeOperatorValidationIssue[],
): string {
  return issues
    .slice(0, 5)
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "value";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

export function parseOperatorData<TSchema extends z.ZodType<unknown, unknown>>(
  schema: TSchema,
  input: unknown,
  identity: OperatorRuntimeIdentity,
): z.output<TSchema> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw runtimeError(
      identity,
      "returned invalid data; return a value matching its data schema",
      validationDetail(parsed.error.issues),
    );
  }
  return parsed.data;
}

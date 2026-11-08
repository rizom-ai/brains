import {
  SDK_ERROR_MESSAGE_MAX_LENGTH,
  SdkError,
  toSdkError,
  type SdkErrorCode,
} from "@brains/contracts";
import { getErrorMessage } from "@brains/utils/error";
import type { Logger } from "@brains/utils/logger";
import type { z } from "@brains/utils/zod";
import { formatZodIssues } from "@brains/utils/zod-issues";
import type { RuntimeOperatorValidationIssue } from "./operator-view-runtime";

/** The declared operator surface a runtime error is attributed to. */
export interface OperatorRuntimeIdentity {
  readonly publicServiceId: string;
  readonly packageName: string;
  readonly surface: "dashboard widget" | "Studio workspace";
  readonly id: string;
}

/** How a failure is published: its code and, when it has one, its message. */
export interface OperatorFailure {
  /** Defaults to a failed handler. */
  readonly code?: SdkErrorCode | undefined;
  /** Safe to publish; without one, the code's standard message stands in. */
  readonly publicMessage?: string | undefined;
  readonly cause?: unknown;
}

/**
 * A coded failure of a declared operator surface. Its message is the
 * diagnostic, naming the service, package and surface, and stays in the
 * declaring package's log; only its code and public message are published.
 */
export function runtimeError(
  identity: OperatorRuntimeIdentity,
  stage: string,
  detail?: string,
  failure: OperatorFailure = {},
): SdkError {
  return new SdkError(failure.code ?? "handler_failed", {
    message: `Service "${identity.publicServiceId}" package "${identity.packageName}" ${identity.surface} "${identity.id}" ${stage}${detail ? `: ${detail}` : ""}`,
    ...(failure.publicMessage !== undefined && {
      publicMessage: failure.publicMessage,
    }),
    ...(failure.cause !== undefined && { cause: failure.cause }),
  });
}

/**
 * A callback's own failure: an SdkError keeps its code and public message,
 * and anything else is a failed handler whose message is not published.
 */
export function callbackFailure(
  identity: OperatorRuntimeIdentity,
  stage: string,
  error: unknown,
): SdkError {
  const { code, message } = toSdkError(error).toJSON();
  return runtimeError(identity, stage, undefined, {
    code,
    publicMessage: message,
    cause: error,
  });
}

/**
 * Input the caller sent that its schema refuses: the offending paths are the
 * caller's own, so they are published, within the public message bound.
 */
export function refusedInput(
  identity: OperatorRuntimeIdentity,
  stage: string,
  error: z.ZodError,
): SdkError {
  return runtimeError(identity, stage, validationDetail(error.issues), {
    code: "invalid_input",
    publicMessage: formatZodIssues(error, {
      maxLength: SDK_ERROR_MESSAGE_MAX_LENGTH,
    }),
    cause: error,
  });
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

/** A callback's answer outside its declared schema is an invalid response. */
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
      { code: "invalid_response", cause: parsed.error },
    );
  }
  return parsed.data;
}

/**
 * Runs an operator request so a failure leaves in its public form while its
 * diagnostic, and what caused it, stay in the declaring package's log. A
 * request that went, or a runtime shutting down, is not logged.
 */
export async function reportedFailure<T>(
  logger: Logger,
  signals: readonly (AbortSignal | undefined)[],
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!signals.some((signal) => signal?.aborted)) {
      const { code } = toSdkError(error);
      const fault = code === "handler_failed" || code === "invalid_response";
      const cause = error instanceof Error ? error.cause : undefined;
      logger[fault ? "error" : "warn"](getErrorMessage(error), {
        code,
        ...(cause !== undefined && { cause: getErrorMessage(cause) }),
      });
    }
    throw error;
  }
}

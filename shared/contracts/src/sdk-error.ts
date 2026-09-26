import { z } from "@brains/utils/zod";

/** Codes survive supported boundaries; human-readable messages are not stable. */
export const sdkErrorCodeSchema: z.ZodEnum<{
  no_handler: "no_handler";
  handler_failed: "handler_failed";
  invalid_input: "invalid_input";
  invalid_response: "invalid_response";
  unauthenticated: "unauthenticated";
  permission_denied: "permission_denied";
  not_found: "not_found";
  conflict: "conflict";
  cancelled: "cancelled";
  deadline_exceeded: "deadline_exceeded";
}> = z.enum([
  "no_handler",
  "handler_failed",
  "invalid_input",
  "invalid_response",
  "unauthenticated",
  "permission_denied",
  "not_found",
  "conflict",
  "cancelled",
  "deadline_exceeded",
]);

export type SdkErrorCode = z.output<typeof sdkErrorCodeSchema>;

export const sdkErrorSchema: z.ZodObject<{
  code: typeof sdkErrorCodeSchema;
  message: z.ZodString;
}> = z.object({ code: sdkErrorCodeSchema, message: z.string().max(1024) });
export type SdkErrorData = z.output<typeof sdkErrorSchema>;

const messages: Record<SdkErrorCode, string> = {
  no_handler: "No handler is available for this capability",
  handler_failed: "The operation failed",
  invalid_input: "Invalid input",
  invalid_response: "Invalid response",
  unauthenticated: "Authentication required",
  permission_denied: "Permission denied",
  not_found: "Not found",
  conflict: "The operation conflicts with the current state",
  cancelled: "The operation was cancelled",
  deadline_exceeded: "The execution deadline was exceeded",
};

/**
 * A local coded failure. Diagnostic message/cause stay local; toJSON emits only
 * safe public data. Check code, not instanceof, across package/process boundaries.
 */
export class SdkError extends Error {
  readonly code: SdkErrorCode;
  /** Explicitly safe to publish; never populated from diagnostic Error.message. */
  readonly publicMessage: string;

  constructor(
    code: SdkErrorCode,
    options: { message?: string; publicMessage?: string; cause?: unknown } = {},
  ) {
    const checkedCode = sdkErrorCodeSchema.parse(code);
    const publicMessage = sdkErrorSchema.shape.message.parse(
      options.publicMessage ?? messages[checkedCode],
    );
    super(options.message ?? publicMessage, { cause: options.cause });
    this.name = "SdkError";
    this.code = checkedCode;
    this.publicMessage = publicMessage;
  }

  toJSON(): SdkErrorData {
    const parsed = sdkErrorCodeSchema.safeParse(this.code);
    const code = parsed.data ?? "handler_failed";
    const message = parsed.success
      ? sdkErrorSchema.shape.message.safeParse(this.publicMessage).data
      : undefined;
    return { code, message: message ?? messages[code] };
  }
}

/** Runtime-owned mapping: never forward arbitrary exception messages or causes. */
export function toSdkError(
  error: unknown,
  fallback: SdkErrorCode = "handler_failed",
): SdkError {
  let code = fallback;
  let publicMessage: string | undefined;
  try {
    if (error !== null && typeof error === "object") {
      const parsed = sdkErrorCodeSchema.safeParse(Reflect.get(error, "code"));
      if (parsed.success) {
        code = parsed.data;
        publicMessage = sdkErrorSchema.shape.message.safeParse(
          Reflect.get(error, "publicMessage"),
        ).data;
      } else {
        const name: unknown = Reflect.get(error, "name");
        if (name === "AbortError") code = "cancelled";
        if (name === "TimeoutError") code = "deadline_exceeded";
      }
    }
  } catch {
    // An exception can itself be an unreadable proxy/getter. Keep the fallback
    // rather than replacing the original failure or exposing its private text.
  }
  return new SdkError(code, {
    cause: error,
    ...(publicMessage !== undefined ? { publicMessage } : {}),
  });
}

/** Explicit mapping for runtime-generated HTTP errors, not protocol envelopes. */
export function sdkErrorHttpStatus(code: SdkErrorCode): number {
  switch (code) {
    case "invalid_input":
      return 400;
    case "unauthenticated":
      return 401;
    case "permission_denied":
      return 403;
    case "not_found":
      return 404;
    case "cancelled":
      return 408;
    case "conflict":
      return 409;
    case "no_handler":
      return 503;
    case "deadline_exceeded":
      return 504;
    case "handler_failed":
    case "invalid_response":
      return 500;
  }
}

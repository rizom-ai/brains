import { types } from "node:util";
import { z } from "@brains/utils/zod";
import { EntityValidationError } from "./errors";

// Domain diagnostics only, below the existing 64 KiB metadata allowance.
export const ENTITY_VALIDATION_RPC_BYTES: number = 16 * 1024;
const MAX_ISSUES = 16;
const MAX_PATH = 8;
const MESSAGE_BYTES = 512;
const PATH_BYTES = 128;
const KIND = "entity-validation-failure";
const issueSchema = z.strictObject({
  path: z
    .array(
      z.union([
        z.string().max(PATH_BYTES),
        z.number().int().nonnegative().safe(),
      ]),
    )
    .max(MAX_PATH),
  message: z.string().max(MESSAGE_BYTES),
});
const failureSchema = z
  .strictObject({
    kind: z.literal(KIND),
    entityType: z.string().max(128),
    phase: z.enum(["schema", "persist"]),
    issues: z.array(issueSchema).max(MAX_ISSUES),
    diagnosticsTruncated: z.boolean(),
  })
  .refine(
    (value) =>
      Buffer.byteLength(JSON.stringify(value)) <= ENTITY_VALIDATION_RPC_BYTES,
    "Entity validation diagnostics exceed the wire budget",
  );
type Failure = z.output<typeof failureSchema>;
type Issue = z.output<typeof issueSchema>;

function own(value: unknown, key: string): unknown {
  if (value === null || typeof value !== "object" || types.isProxy(value))
    return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}
function clip(value: string, bytes: number): string {
  let result = "";
  let used = 0;
  for (const character of value.slice(0, bytes + 1)) {
    const size = Buffer.byteLength(character);
    if (used + size > bytes) break;
    result += character;
    used += size;
  }
  return result;
}
function encode(error: EntityValidationError): Failure {
  const originalType = own(error, "entityType");
  const phase = own(error, "phase");
  if (
    typeof originalType !== "string" ||
    (phase !== "schema" && phase !== "persist")
  )
    throw error;
  const entityType = clip(originalType, 128);
  const result: Failure = {
    kind: KIND,
    entityType,
    phase,
    issues: [],
    diagnosticsTruncated: entityType !== originalType,
  };
  const issues = own(own(error, "originalError"), "issues");
  if (!Array.isArray(issues) || types.isProxy(issues)) {
    result.diagnosticsTruncated = true;
    return failureSchema.parse(result);
  }
  if (issues.length > MAX_ISSUES) result.diagnosticsTruncated = true;
  for (let index = 0; index < Math.min(issues.length, MAX_ISSUES); index++) {
    const source = own(issues, String(index));
    const text = own(source, "message");
    if (typeof text !== "string") {
      result.diagnosticsTruncated = true;
      continue;
    }
    const message = text.slice(0, MESSAGE_BYTES + 1).includes("Failed query:")
      ? "Validation failed (SQL and parameters omitted)"
      : clip(text, MESSAGE_BYTES);
    if (message !== text) result.diagnosticsTruncated = true;
    const path = own(source, "path");
    const parts: Issue["path"] = [];
    let validPath =
      Array.isArray(path) && !types.isProxy(path) && path.length <= MAX_PATH;
    if (validPath && Array.isArray(path)) {
      for (let part = 0; part < path.length; part++) {
        const value = own(path, String(part));
        if (
          typeof value === "string" &&
          value.length <= PATH_BYTES &&
          Buffer.byteLength(value) <= PATH_BYTES
        )
          parts.push(value);
        else if (
          typeof value === "number" &&
          Number.isSafeInteger(value) &&
          value >= 0
        )
          parts.push(value);
        else {
          validPath = false;
          break;
        }
      }
    }
    // Never turn a truncated path into a different field: report at form level.
    if (!validPath) result.diagnosticsTruncated = true;
    result.issues.push({ path: validPath ? parts : [], message });
    if (
      Buffer.byteLength(JSON.stringify(result)) > ENTITY_VALIDATION_RPC_BYTES
    ) {
      result.issues.pop();
      result.diagnosticsTruncated = true;
      break;
    }
  }
  return failureSchema.parse(result);
}

/** Keep domain failures out of the generic database diagnostic graph. */
export async function withEntityRpcValidation(
  operation: () => Promise<unknown>,
): Promise<unknown> {
  try {
    return await operation();
  } catch (error) {
    // Aggregates and unknown outcomes must retain their original failure graph.
    if (types.isProxy(error) || !(error instanceof EntityValidationError))
      throw error;
    return encode(error);
  }
}

/** Validate the complete bounded envelope before reconstructing a domain error. */
export function throwEntityRpcValidationFailure(value: unknown): void {
  if (own(value, "kind") !== KIND) return;
  const failure = failureSchema.parse(value);
  const error = new EntityValidationError(
    failure.entityType,
    Object.assign(
      new Error(
        failure.issues.map((issue) => issue.message).join("; ") ||
          "Entity validation failed",
      ),
      { issues: failure.issues },
    ),
    failure.phase,
  );
  Object.defineProperty(error, "diagnosticsTruncated", {
    value: failure.diagnosticsTruncated,
  });
  throw error;
}

import { z } from "@brains/utils/zod";

// This slice uses bounded messages on the existing private worker port. It does
// not yet implement the proposed direct bulk data channel or runtime ingress.
export const STAGE_CHUNK_BYTES: number = 32 * 1024;
export const STAGE_BUDGET_BYTES: number = 100 * 1024 * 1024;
export const STAGE_SLOTS: number = 16;
export const capabilitySchema: z.ZodObject<{
  generation: z.ZodString;
  scope: z.ZodString;
  id: z.ZodNumber;
}> = z.strictObject({
  generation: z.string().uuid(),
  scope: z.string().uuid(),
  id: z.number().int().positive(),
});
export const claimSchema: z.ZodObject<
  typeof capabilitySchema.shape & { claimId: z.ZodString }
> = capabilitySchema.extend({ claimId: z.string().uuid() });
export const sealedSchema: z.ZodObject<{
  capability: typeof capabilitySchema;
  sizeBytes: z.ZodNumber;
  sha256: z.ZodString;
}> = z.strictObject({
  capability: capabilitySchema,
  sizeBytes: z.number().int().min(0).max(STAGE_BUDGET_BYTES),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
const scalarSchema: z.ZodUnion<
  [z.ZodNull, z.ZodString, z.ZodNumber, z.ZodBigInt, z.ZodBoolean, z.ZodDate]
> = z.union([
  z.null(),
  z.string().max(STAGE_CHUNK_BYTES),
  z.number(),
  z.bigint().min(-9223372036854775808n).max(9223372036854775807n),
  z.boolean(),
  z.date(),
]);
const bindingSchema: z.ZodDiscriminatedUnion<
  [
    z.ZodObject<{ kind: z.ZodLiteral<"scalar">; value: typeof scalarSchema }>,
    z.ZodObject<{ kind: z.ZodLiteral<"resident">; claim: typeof claimSchema }>,
  ],
  "kind"
> = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("scalar"), value: scalarSchema }),
  z.strictObject({ kind: z.literal("resident"), claim: claimSchema }),
]);
export const boundStatementSchema: z.ZodObject<{
  sql: z.ZodString;
  args: z.ZodArray<typeof bindingSchema>;
}> = z.strictObject({
  sql: z.string().min(1).max(STAGE_CHUNK_BYTES),
  args: z.array(bindingSchema).max(128),
});
export const stageStatsSchema: z.ZodObject<{
  reservedBytes: z.ZodNumber;
  stages: z.ZodNumber;
  scopes: z.ZodNumber;
  claims: z.ZodNumber;
  attached: z.ZodNumber;
}> = z.strictObject({
  reservedBytes: z.number().int().nonnegative(),
  stages: z.number().int().nonnegative(),
  scopes: z.number().int().nonnegative(),
  claims: z.number().int().nonnegative(),
  attached: z.number().int().nonnegative(),
});

type Command<
  Name extends string,
  Shape extends z.ZodRawShape = Record<never, never>,
> = z.ZodObject<{ action: z.ZodLiteral<Name> } & Shape>;
export const binaryCommandSchema: z.ZodDiscriminatedUnion<
  [
    Command<"openScope">,
    Command<"closeScope", { scope: z.ZodString }>,
    Command<
      "beginStage",
      {
        scope: z.ZodString;
        reservationBytes: z.ZodNumber;
        expectedSize: z.ZodOptional<z.ZodNumber>;
        expectedDigest: z.ZodOptional<z.ZodString>;
      }
    >,
    Command<
      "append",
      {
        scope: z.ZodString;
        capability: typeof capabilitySchema;
        offset: z.ZodNumber;
        bytes: z.ZodCustom<ArrayBuffer>;
      }
    >,
    Command<
      "seal",
      { scope: z.ZodString; capability: typeof capabilitySchema }
    >,
    Command<
      "reserve",
      { scope: z.ZodString; capability: typeof capabilitySchema }
    >,
    Command<
      "discard",
      { scope: z.ZodString; capability: typeof capabilitySchema }
    >,
    Command<"releaseClaim", { claim: typeof claimSchema }>,
    Command<"stats">,
  ],
  "action"
> = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("openScope") }),
  z.strictObject({ action: z.literal("closeScope"), scope: z.string().uuid() }),
  z.strictObject({
    action: z.literal("beginStage"),
    scope: z.string().uuid(),
    reservationBytes: z.number().int().min(0).max(STAGE_BUDGET_BYTES),
    expectedSize: z.number().int().min(0).max(STAGE_BUDGET_BYTES).optional(),
    expectedDigest: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  }),
  z.strictObject({
    action: z.literal("append"),
    scope: z.string().uuid(),
    capability: capabilitySchema,
    offset: z.number().int().nonnegative(),
    bytes: z
      .instanceof(ArrayBuffer)
      .refine(
        (bytes) =>
          bytes.byteLength > 0 && bytes.byteLength <= STAGE_CHUNK_BYTES,
      ),
  }),
  z.strictObject({
    action: z.literal("seal"),
    scope: z.string().uuid(),
    capability: capabilitySchema,
  }),
  z.strictObject({
    action: z.literal("reserve"),
    scope: z.string().uuid(),
    capability: capabilitySchema,
  }),
  z.strictObject({
    action: z.literal("discard"),
    scope: z.string().uuid(),
    capability: capabilitySchema,
  }),
  z.strictObject({ action: z.literal("releaseClaim"), claim: claimSchema }),
  z.strictObject({ action: z.literal("stats") }),
]);
export type StageCapability = z.output<typeof capabilitySchema>;
export type StageClaim = z.output<typeof claimSchema>;
export type SealedStage = z.output<typeof sealedSchema>;
export type StageStats = z.output<typeof stageStatsSchema>;
export type BinaryCommand = z.output<typeof binaryCommandSchema>;
export type BoundStatement = z.output<typeof boundStatementSchema>;

export function isBinaryCleanup(command: BinaryCommand): boolean {
  return (
    command.action === "closeScope" ||
    command.action === "discard" ||
    command.action === "releaseClaim"
  );
}
export function validateBinaryReply(
  command: BinaryCommand,
  value: unknown,
): unknown {
  switch (command.action) {
    case "openScope":
      return z.string().uuid().parse(value);
    case "beginStage":
      return capabilitySchema.parse(value);
    case "seal":
      return sealedSchema.parse(value);
    case "reserve":
      return claimSchema.parse(value);
    case "stats":
      return stageStatsSchema.parse(value);
    default:
      return z.undefined().parse(value);
  }
}
export function boundStatementBytes(statement: BoundStatement): number {
  return statement.args.reduce(
    (size, arg) =>
      size +
      (arg.kind === "resident"
        ? 256
        : typeof arg.value === "string"
          ? Buffer.byteLength(arg.value) + 32
          : 32),
    Buffer.byteLength(statement.sql) + 256,
  );
}

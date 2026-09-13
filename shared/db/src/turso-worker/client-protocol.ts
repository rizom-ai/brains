import { z } from "@brains/utils/zod";

// Existing admission limits, not a new runtime policy. Caller compatibility must
// be reviewed before activating this client through the runtime factory.
export const MAX_SQL_MESSAGE_BYTES: number = 64 * 1024;
export const MAX_SQL_BATCH_STATEMENTS: number = 16;
export const MAX_SQL_MIGRATION_STATEMENTS: number = 256;

export const argumentSchema: z.ZodUnion<
  [
    z.ZodNull,
    z.ZodString,
    z.ZodNumber,
    z.ZodBigInt,
    z.ZodBoolean,
    z.ZodDate,
    z.ZodCustom<ArrayBuffer>,
    z.ZodCustom<Uint8Array>,
  ]
> = z.union([
  z.null(),
  z.string().max(MAX_SQL_MESSAGE_BYTES),
  z.number(),
  z.bigint(),
  z.boolean(),
  z.date(),
  z
    .instanceof(ArrayBuffer)
    .refine((value) => value.byteLength <= MAX_SQL_MESSAGE_BYTES),
  z
    .instanceof(Uint8Array)
    .refine((value) => value.byteLength <= MAX_SQL_MESSAGE_BYTES),
]);
export const statementSchema: z.ZodObject<{
  sql: z.ZodString;
  args: z.ZodOptional<
    z.ZodUnion<
      readonly [
        z.ZodArray<typeof argumentSchema>,
        z.ZodRecord<z.ZodString, typeof argumentSchema>,
      ]
    >
  >;
}> = z.strictObject({
  sql: z.string().min(1).max(MAX_SQL_MESSAGE_BYTES),
  args: z
    .union([
      z.array(argumentSchema).max(256),
      z
        .record(z.string().max(128), argumentSchema)
        .refine((args) => Object.keys(args).length <= 256),
    ])
    .optional(),
});
export type SqlStatement = z.output<typeof statementSchema>;
export function parseStatement(input: unknown): SqlStatement {
  return statementSchema.parse(input);
}

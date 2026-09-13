import { z } from "@brains/utils/zod";

export const savepointTokenSchema: z.ZodObject<{
  generation: z.ZodString;
  lease: z.ZodString;
  id: z.ZodNumber;
}> = z.strictObject({
  generation: z.string().uuid(),
  lease: z.string().uuid(),
  id: z.number().int().positive(),
});
export const savepointCommandSchema: z.ZodDiscriminatedUnion<
  [
    z.ZodObject<{ action: z.ZodLiteral<"begin">; lease: z.ZodString }>,
    z.ZodObject<{
      action: z.ZodEnum<{ release: "release"; rollback: "rollback" }>;
      lease: z.ZodString;
      token: typeof savepointTokenSchema;
    }>,
  ],
  "action"
> = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("begin"), lease: z.string().uuid() }),
  z.strictObject({
    action: z.enum(["release", "rollback"]),
    lease: z.string().uuid(),
    token: savepointTokenSchema,
  }),
]);
export type SavepointToken = z.output<typeof savepointTokenSchema>;
export type SavepointCommand = z.output<typeof savepointCommandSchema>;

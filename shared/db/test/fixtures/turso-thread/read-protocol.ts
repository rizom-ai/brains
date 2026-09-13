import { z } from "@brains/utils/zod";
import { blobPlanSchema } from "../../../src/turso-worker/blob-protocol";
import {
  capabilitySchema,
  sealedSchema,
  STAGE_CHUNK_BYTES,
} from "./binary-protocol";
import { uploadGrantSchema, uploadResultSchema } from "./upload-protocol";

type Command<
  Name extends string,
  Shape extends z.ZodRawShape = Record<never, never>,
> = z.ZodObject<{ action: z.ZodLiteral<Name> } & Shape>;
export const readStatsSchema: z.ZodObject<{
  scopes: z.ZodNumber;
  reads: z.ZodNumber;
  reservedBytes: z.ZodNumber;
  preparing: z.ZodNumber;
  streaming: z.ZodNumber;
}> = z.strictObject({
  scopes: z.number().int().nonnegative(),
  reads: z.number().int().nonnegative(),
  reservedBytes: z.number().int().nonnegative(),
  preparing: z.number().int().nonnegative(),
  streaming: z.number().int().nonnegative(),
});
export const readCommandSchema: z.ZodDiscriminatedUnion<
  [
    Command<"openScope">,
    Command<"closeScope", { scope: z.ZodString }>,
    Command<"allocate", { scope: z.ZodString; plan: typeof blobPlanSchema }>,
    Command<"fill", { capability: typeof capabilitySchema }>,
    Command<"discard", { capability: typeof capabilitySchema }>,
    Command<"stats">,
  ],
  "action"
> = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("openScope") }),
  z.strictObject({ action: z.literal("closeScope"), scope: z.string().uuid() }),
  z.strictObject({
    action: z.literal("allocate"),
    scope: z.string().uuid(),
    plan: blobPlanSchema,
  }),
  z.strictObject({ action: z.literal("fill"), capability: capabilitySchema }),
  z.strictObject({
    action: z.literal("discard"),
    capability: capabilitySchema,
  }),
  z.strictObject({ action: z.literal("stats") }),
]);
export type ReadCommand = z.output<typeof readCommandSchema>;
export type ReadStats = z.output<typeof readStatsSchema>;
export function validateReadReply(
  command: ReadCommand,
  input: unknown,
  generation: string,
  id: number,
): void {
  switch (command.action) {
    case "openScope":
      z.string().uuid().parse(input);
      break;
    case "allocate":
    case "fill": {
      const capability =
        command.action === "allocate"
          ? capabilitySchema.parse(input)
          : sealedSchema.parse(input).capability;
      const expected =
        command.action === "allocate"
          ? { generation, scope: command.scope, id }
          : command.capability;
      if (
        capability.generation !== expected.generation ||
        capability.scope !== expected.scope ||
        capability.id !== expected.id
      )
        throw new Error("Invalid read snapshot acknowledgement");
      break;
    }
    case "stats":
      readStatsSchema.parse(input);
      break;
    default:
      z.undefined().parse(input);
  }
}
const bufferSchema: z.ZodCustom<ArrayBuffer> = z
  .instanceof(ArrayBuffer)
  .refine((bytes) => bytes.byteLength === STAGE_CHUNK_BYTES);
export const readInputSchema: z.ZodDiscriminatedUnion<
  [
    z.ZodObject<{
      kind: z.ZodLiteral<"hello">;
      grant: typeof uploadGrantSchema;
    }>,
    z.ZodObject<{
      kind: z.ZodLiteral<"pull">;
      sequence: z.ZodNumber;
      credit: z.ZodString;
      bytes: typeof bufferSchema;
    }>,
  ],
  "kind"
> = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("hello"), grant: uploadGrantSchema }),
  z.strictObject({
    kind: z.literal("pull"),
    sequence: z.number().int().nonnegative(),
    credit: z.string().uuid(),
    bytes: bufferSchema,
  }),
]);
export const readOutputSchema: z.ZodUnion<
  [
    z.ZodObject<{
      kind: z.ZodLiteral<"chunk">;
      sequence: z.ZodNumber;
      credit: z.ZodString;
      size: z.ZodNumber;
      bytes: typeof bufferSchema;
    }>,
    typeof uploadResultSchema,
  ]
> = z.union([
  z.strictObject({
    kind: z.literal("chunk"),
    sequence: z.number().int().nonnegative(),
    credit: z.string().uuid(),
    size: z.number().int().min(0).max(STAGE_CHUNK_BYTES),
    bytes: bufferSchema,
  }),
  uploadResultSchema,
]);

import { MessagePort } from "node:worker_threads";
import { z } from "@brains/utils/zod";
import {
  capabilitySchema,
  sealedSchema,
  STAGE_CHUNK_BYTES,
} from "./binary-protocol";
import { errorSchema } from "../../../src/turso-worker/error-protocol";

export const uploadGrantSchema: z.ZodObject<{
  id: z.ZodString;
  pool: z.ZodString;
  direction: z.ZodEnum<{ upload: "upload"; read: "read" }>;
  stage: typeof capabilitySchema;
}> = z.strictObject({
  id: z.string().uuid(),
  pool: z.string().uuid(),
  direction: z.enum(["upload", "read"]),
  stage: capabilitySchema,
});
export type UploadGrant = z.output<typeof uploadGrantSchema>;
const creditBufferSchema: z.ZodCustom<ArrayBuffer> = z
  .instanceof(ArrayBuffer)
  .refine((bytes) => bytes.byteLength === STAGE_CHUNK_BYTES);
export const uploadInputSchema: z.ZodDiscriminatedUnion<
  [
    z.ZodObject<{
      kind: z.ZodLiteral<"hello">;
      grant: typeof uploadGrantSchema;
    }>,
    z.ZodObject<{
      kind: z.ZodLiteral<"chunk">;
      sequence: z.ZodNumber;
      credit: z.ZodString;
      size: z.ZodNumber;
      bytes: typeof creditBufferSchema;
    }>,
    z.ZodObject<{
      kind: z.ZodLiteral<"finish">;
      sequence: z.ZodNumber;
      credit: z.ZodString;
      bytes: typeof creditBufferSchema;
    }>,
  ],
  "kind"
> = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("hello"), grant: uploadGrantSchema }),
  z.strictObject({
    kind: z.literal("chunk"),
    sequence: z.number().int().nonnegative(),
    credit: z.string().uuid(),
    size: z.number().int().min(1).max(STAGE_CHUNK_BYTES),
    bytes: creditBufferSchema,
  }),
  z.strictObject({
    kind: z.literal("finish"),
    sequence: z.number().int().nonnegative(),
    credit: z.string().uuid(),
    bytes: creditBufferSchema,
  }),
]);
export const uploadResultSchema: z.ZodDiscriminatedUnion<
  [
    z.ZodObject<{ kind: z.ZodLiteral<"sealed">; facts: typeof sealedSchema }>,
    z.ZodObject<{ kind: z.ZodLiteral<"error">; error: typeof errorSchema }>,
  ],
  "kind"
> = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("sealed"), facts: sealedSchema }),
  z.strictObject({ kind: z.literal("error"), error: errorSchema }),
]);
export type UploadResult = z.output<typeof uploadResultSchema>;
export const uploadOutputSchema: z.ZodUnion<
  [
    z.ZodObject<{
      kind: z.ZodLiteral<"credit">;
      sequence: z.ZodNumber;
      credit: z.ZodString;
      bytes: typeof creditBufferSchema;
    }>,
    typeof uploadResultSchema,
  ]
> = z.union([
  z.strictObject({
    kind: z.literal("credit"),
    sequence: z.number().int().nonnegative(),
    credit: z.string().uuid(),
    bytes: creditBufferSchema,
  }),
  uploadResultSchema,
]);
export const uploadBootstrapSchema: z.ZodObject<{
  port: z.ZodCustom<MessagePort>;
  grant: typeof uploadGrantSchema;
}> = z.strictObject({
  port: z.instanceof(MessagePort),
  grant: uploadGrantSchema,
});

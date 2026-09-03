import { z } from "@brains/utils/zod";

const safeText = (max: number): z.ZodString =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value));

const safeBody = (max: number): z.ZodString =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) =>
      Array.from(value).every(
        (character) =>
          character === "\n" ||
          character === "\t" ||
          !/[\p{Cc}\p{Cf}]/u.test(character),
      ),
    );

export const studioCreatePrefillSchema: z.ZodObject<
  {
    version: z.ZodLiteral<2>;
    entityType: z.ZodLiteral<"note">;
    title: z.ZodString;
    body: z.ZodOptional<z.ZodString>;
    backlink: z.ZodString;
  },
  z.core.$strict
> = z.strictObject({
  version: z.literal(2),
  entityType: z.literal("note"),
  title: safeText(160),
  body: safeBody(1_000).optional(),
  backlink: safeText(500).regex(/^entity:\/\/[^/]+\/.+$/),
});

export type StudioCreatePrefill = z.output<typeof studioCreatePrefillSchema>;

export const studioCreatePrefillStateSchema: z.ZodObject<
  { studioCreatePrefill: typeof studioCreatePrefillSchema },
  z.core.$loose
> = z.looseObject({ studioCreatePrefill: studioCreatePrefillSchema });

export type StudioCreatePrefillState = z.output<
  typeof studioCreatePrefillStateSchema
>;

export function createStudioCreatePrefillState(
  title: string,
  backlink: string,
  body?: string,
): StudioCreatePrefillState {
  return studioCreatePrefillStateSchema.parse({
    studioCreatePrefill: {
      version: 2,
      entityType: "note",
      title,
      ...(body ? { body } : {}),
      backlink,
    },
  });
}

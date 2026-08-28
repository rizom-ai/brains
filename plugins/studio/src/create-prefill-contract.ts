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

export interface StudioCreatePrefill {
  version: 2;
  entityType: "note";
  title: string;
  body?: string | undefined;
  backlink: string;
}

export interface StudioCreatePrefillState {
  studioCreatePrefill: StudioCreatePrefill;
}

export const studioCreatePrefillSchema: z.ZodType<
  StudioCreatePrefill,
  StudioCreatePrefill
> = z.strictObject({
  version: z.literal(2),
  entityType: z.literal("note"),
  title: safeText(160),
  body: safeBody(1_000).optional(),
  backlink: safeText(500).regex(/^entity:\/\/[^/]+\/.+$/),
});

export const studioCreatePrefillStateSchema: z.ZodType<
  StudioCreatePrefillState,
  unknown
> = z.object({ studioCreatePrefill: studioCreatePrefillSchema }).passthrough();

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

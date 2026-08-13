import { z } from "@brains/utils/zod";

const safeText = (max: number): z.ZodString =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value));

export interface CmsCreatePrefill {
  version: 1;
  entityType: "note";
  title: string;
  backlink: string;
}

export interface CmsCreatePrefillState {
  cmsCreatePrefill: CmsCreatePrefill;
}

export const cmsCreatePrefillSchema: z.ZodType<
  CmsCreatePrefill,
  CmsCreatePrefill
> = z.strictObject({
  version: z.literal(1),
  entityType: z.literal("note"),
  title: safeText(160),
  backlink: safeText(500).regex(/^entity:\/\/[^/]+\/.+$/),
});

export const cmsCreatePrefillStateSchema: z.ZodType<
  CmsCreatePrefillState,
  unknown
> = z.object({ cmsCreatePrefill: cmsCreatePrefillSchema }).passthrough();

export function createCmsCreatePrefillState(
  title: string,
  backlink: string,
): CmsCreatePrefillState {
  return cmsCreatePrefillStateSchema.parse({
    cmsCreatePrefill: {
      version: 1,
      entityType: "note",
      title,
      backlink,
    },
  });
}

import { z } from "@brains/utils/zod";

const describedSchema = z.object({
  alt: z.string().trim().min(1),
  altSource: z.enum(["generated", "owner"]),
});

/**
 * An image's alt text when it describes the image: written by the brain's
 * vision model or by the owner. A stand-in (a title, a prompt's start,
 * `cover-<post>`) says nothing about what the image shows, so it is none.
 */
export function describedImageAlt(metadata: unknown): string | undefined {
  const described = describedSchema.safeParse(metadata);
  return described.success ? described.data.alt : undefined;
}

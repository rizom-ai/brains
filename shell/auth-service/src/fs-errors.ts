import { z } from "@brains/utils/zod";

const fsErrorSchema = z.looseObject({
  code: z.string().optional(),
});

export function isFileNotFoundError(error: unknown): boolean {
  const parsed = fsErrorSchema.safeParse(error);
  return parsed.success && parsed.data.code === "ENOENT";
}

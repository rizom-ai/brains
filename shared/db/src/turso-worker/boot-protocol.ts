import { z } from "@brains/utils/zod";

export const bootSchema: z.ZodObject<{
  url: z.ZodString;
  generation: z.ZodString;
  budget: z.ZodString;
}> = z.strictObject({
  url: z.string().startsWith("file:"),
  generation: z.string().uuid(),
  budget: z.string().uuid(),
});
export type SqlWorkerBoot = z.output<typeof bootSchema>;
export interface SqlWorkerPlacement {
  generation: string;
  threadId: number;
  pid: number;
}
export function parseBoot(input: unknown): SqlWorkerBoot {
  return bootSchema.parse(input);
}

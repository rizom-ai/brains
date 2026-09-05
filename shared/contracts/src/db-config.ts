import { z } from "@brains/utils/zod";

type DbConfigSchema = z.ZodObject<
  {
    url: z.ZodString;
  },
  z.core.$strict
>;

/**
 * Local Turso database configuration shared by runtime services.
 */
export const dbConfigSchema: DbConfigSchema = z.strictObject({
  url: z.string().startsWith("file:"),
});

export type DbConfig = z.output<typeof dbConfigSchema>;

import { z } from "zod";

/**
 * Blog plugin configuration schema
 */
export const blogConfigSchema = z.object({
  defaultPrompt: z
    .string()
    .default("Write a blog post about my recent work and insights"),
});

/**
 * Blog plugin configuration type
 */
export type BlogConfig = z.infer<typeof blogConfigSchema>;

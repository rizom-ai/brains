import { z } from "zod";

/**
 * Blog plugin configuration schema
 */
export const blogConfigSchema = z.object({
  defaultPrompt: z
    .string()
    .default("Write a blog post about my recent work and insights"),
  /** Enable pagination for blog list pages (default: true) */
  paginate: z.boolean().default(true),
  /** Number of posts per page (default: 10) */
  pageSize: z.number().default(10),
});

/**
 * Blog plugin configuration type (output, with all defaults applied)
 */
export type BlogConfig = z.infer<typeof blogConfigSchema>;

/**
 * Blog plugin configuration input type (allows optional fields with defaults)
 */
export type BlogConfigInput = Partial<BlogConfig>;

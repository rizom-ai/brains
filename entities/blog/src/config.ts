import { z } from "@brains/utils/zod";

/**
 * Blog plugin configuration schema
 */
export interface BlogConfig {
  defaultPrompt: string;
  paginate: boolean;
  pageSize: number;
}

export interface BlogConfigInput {
  defaultPrompt?: string | undefined;
  paginate?: boolean | undefined;
  pageSize?: number | undefined;
}

export const blogConfigSchema: z.ZodType<BlogConfig, BlogConfigInput> =
  z.object({
    defaultPrompt: z
      .string()
      .default("Write a blog post about my recent work and insights"),
    /** Enable pagination for blog list pages (default: true) */
    paginate: z.boolean().default(true),
    /** Number of posts per page (default: 10) */
    pageSize: z.number().default(10),
  });

/**
 * Job-related types for the Brain system
 * These are base types that can be extended by specific implementations
 */

import { z } from "zod";

/**
 * Schema for job interface
 * This represents a job in the queue with all common fields
 */
export const jobSchema = z.object({
  id: z.string(),
  type: z.string(),
  status: z.string(),
  priority: z.number(),
  retryCount: z.number(),
  createdAt: z.number(),
  startedAt: z.number().nullable(),
  completedAt: z.number().nullable().optional(),
  lastError: z.string().nullable().optional(),
  data: z.unknown().optional(),
  result: z.unknown().optional(),
});

/**
 * Base job interface representing a job in the queue
 */
export type Job = z.infer<typeof jobSchema>;

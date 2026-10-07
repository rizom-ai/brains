import { z } from "@brains/utils/zod";

/** Actual mounted destination, not a guessed path. Named consumer: Contact readiness. */
export const inboxWorkspaceRequest: {
  readonly topic: string;
  readonly payload: z.ZodObject<Record<string, never>>;
  readonly response: z.ZodObject<{ href: z.ZodOptional<z.ZodString> }>;
} = {
  topic: "unified-inbox:workspace",
  payload: z.strictObject({}),
  response: z.strictObject({ href: z.string().optional() }),
};

import { z } from "zod";

export const PLAYBOOKS_REGISTER_LIFECYCLE_STARTER =
  "playbooks:register-lifecycle-starter";

export const lifecycleStarterRegistrationSchema = z
  .object({
    id: z.string().min(1),
    trigger: z.string().min(1),
    playbookId: z.string().min(1),
    once: z.boolean().default(true),
    starterText: z.string().min(1),
    description: z.string().min(1).optional(),
    starterPrompt: z.string().min(1),
  })
  .strict();

export type LifecycleStarterRegistration = z.infer<
  typeof lifecycleStarterRegistrationSchema
>;

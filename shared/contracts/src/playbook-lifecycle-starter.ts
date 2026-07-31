import { z } from "@brains/utils/zod";

export const PLAYBOOKS_REGISTER_LIFECYCLE_STARTER =
  "playbooks:register-lifecycle-starter";

export interface LifecycleStarterRegistration {
  id: string;
  trigger: string;
  playbookId: string;
  once: boolean;
  starterText: string;
  description?: string | undefined;
  starterPrompt: string;
}

export interface LifecycleStarterRegistrationInput {
  id: string;
  trigger: string;
  playbookId: string;
  once?: boolean | undefined;
  starterText: string;
  description?: string | undefined;
  starterPrompt: string;
}

export const lifecycleStarterRegistrationSchema: z.ZodType<
  LifecycleStarterRegistration,
  LifecycleStarterRegistrationInput
> = z
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

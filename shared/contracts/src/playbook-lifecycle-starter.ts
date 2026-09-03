import { z } from "@brains/utils/zod";

export const PLAYBOOKS_REGISTER_LIFECYCLE_STARTER =
  "playbooks:register-lifecycle-starter";

type LifecycleStarterRegistrationSchema = z.ZodObject<
  {
    id: z.ZodString;
    trigger: z.ZodString;
    playbookId: z.ZodString;
    once: z.ZodDefault<z.ZodBoolean>;
    starterText: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    starterPrompt: z.ZodString;
  },
  z.core.$strict
>;

export const lifecycleStarterRegistrationSchema: LifecycleStarterRegistrationSchema =
  z
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

export type LifecycleStarterRegistration = z.output<
  typeof lifecycleStarterRegistrationSchema
>;
export type LifecycleStarterRegistrationInput = z.input<
  typeof lifecycleStarterRegistrationSchema
>;

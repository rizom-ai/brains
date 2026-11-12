import { z } from "@brains/utils/zod";
import { defineBusContract, type BusContract } from "./bus-contract";

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

const lifecycleStarterRegistrationSchema: LifecycleStarterRegistrationSchema = z
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

type LifecycleStarterRegistrationResultSchema = z.ZodObject<{
  registered: z.ZodBoolean;
  id: z.ZodString;
  ignored: z.ZodOptional<z.ZodBoolean>;
  reason: z.ZodOptional<z.ZodString>;
}>;

const lifecycleStarterRegistrationResultSchema: LifecycleStarterRegistrationResultSchema =
  z.object({
    registered: z.boolean(),
    id: z.string(),
    ignored: z.boolean().optional(),
    reason: z.string().optional(),
  });

/**
 * A plugin registers a playbook starter for a lifecycle moment. Playbooks owns
 * it and answers whether the starter was registered or, conflicting with one
 * another plugin registered under the same id, ignored.
 */
export const lifecycleStarterRegistrationContract: BusContract<
  LifecycleStarterRegistrationSchema,
  LifecycleStarterRegistrationResultSchema,
  "request"
> = defineBusContract({
  channel: "playbooks:register-lifecycle-starter",
  request: lifecycleStarterRegistrationSchema,
  response: lifecycleStarterRegistrationResultSchema,
  delivery: "request",
});

export type LifecycleStarterRegistration = z.output<
  typeof lifecycleStarterRegistrationSchema
>;
export type LifecycleStarterRegistrationResult = z.output<
  typeof lifecycleStarterRegistrationResultSchema
>;

import { z } from "@brains/utils/zod";
import {
  FORM_POLICY_DEFAULTS,
  formPolicyOverridesSchema,
  resolveFormPolicy,
  type FormEnginePolicy,
  type FormPolicyOverrides,
} from "@brains/forms";

/** The intake's policy as it runs: the engine's defaults under the owner's
 * overrides, on the origin the brain serves. */
export type ContactIntakePolicy = FormEnginePolicy;
export type ContactIntakeOverrides = FormPolicyOverrides;
export const CONTACT_INTAKE_DEFAULTS: typeof FORM_POLICY_DEFAULTS =
  FORM_POLICY_DEFAULTS;

export interface ContactPluginConfig {
  intake?: ContactIntakeOverrides | undefined;
}
export const contactPluginConfigSchema: z.ZodType<ContactPluginConfig> =
  z.strictObject({ intake: formPolicyOverridesSchema.optional() });

/** The policy the intake runs on the given origin. */
export function resolveIntakePolicy(
  config: ContactPluginConfig,
  origin: string,
): ContactIntakePolicy {
  return resolveFormPolicy(config.intake ?? {}, origin);
}

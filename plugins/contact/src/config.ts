import { z } from "@brains/utils/zod";
import {
  contactAdmissionPolicySchema,
  type ContactAdmissionPolicy,
} from "./admission-state";
import { contactHttpPolicySchema, type ContactHttpPolicy } from "./http";
import {
  contactStoragePolicySchema,
  type ContactStoragePolicy,
} from "./storage-slots";
import {
  contactDeliveryPolicySchema,
  type ContactDeliveryPolicy,
} from "./delivery";

export interface ContactIntakeConfig {
  http: ContactHttpPolicy;
  admission: ContactAdmissionPolicy;
  storage: ContactStoragePolicy;
  delivery: ContactDeliveryPolicy;
  /** Exact same-origin Studio Inbox URL, verified against mounted routes at readiness. */
  inboxUrl: string;
  preview: boolean;
}
export interface ContactPluginConfig {
  intake?: ContactIntakeConfig | undefined;
}
const intakeSchema: z.ZodType<ContactIntakeConfig> = z
  .strictObject({
    http: contactHttpPolicySchema,
    admission: contactAdmissionPolicySchema,
    storage: contactStoragePolicySchema,
    delivery: contactDeliveryPolicySchema,
    inboxUrl: z.string().url(),
    preview: z.boolean(),
  })
  .refine((config) => {
    if (!URL.canParse(config.inboxUrl)) return false;
    const url = new URL(config.inboxUrl);
    return (
      url.origin === config.http.origin &&
      url.href === config.inboxUrl &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  }, "Contact Inbox must be a canonical same-origin URL");
export const contactPluginConfigSchema: z.ZodType<ContactPluginConfig> =
  z.strictObject({ intake: intakeSchema.optional() });

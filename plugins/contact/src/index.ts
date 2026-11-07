import { ContactPlugin } from "./plugin";
import { ContactRequestPlugin } from "./entity/plugin";
import type { ContactPluginConfig } from "./config";

export { ContactHttpHandlers, contactHttpPolicySchema } from "./http";
export { ContactDeliveryTarget } from "./delivery-target";
export { CONTACT_ADMISSION, CONTACT_SLOTS } from "./state";
export {
  CONTACT_INTAKE_DEFAULTS,
  contactPluginConfigSchema,
  resolveIntakePolicy,
} from "./config";
export type {
  ContactPluginConfig,
  ContactIntakeOverrides,
  ContactIntakePolicy,
} from "./config";
export type { ContactHttpOptions, ContactHttpPolicy } from "./http";
export { ContactIntake } from "./intake";
export type {
  ContactIntakeDependencies,
  ContactSaveResult,
  ContactMaintenanceReport,
} from "./intake";
export { ContactPlugin, ContactRequestPlugin };
export { ContactInboxSource } from "./inbox-source";
export { ContactRequestAdapter, contactRequestAdapter } from "./entity/adapter";
export {
  contactSubmissionSchema,
  contactFrontmatterSchema,
  contactMetadataSchema,
  contactRequestSchema,
} from "./entity/schema";
export type {
  ContactSubmission,
  ContactFrontmatter,
  ContactMetadata,
  ContactRequest,
} from "./entity/schema";

/** Explicit compound composition; no site or default bundle activates intake. */
export function contactPlugin(
  config: ContactPluginConfig = {},
): [ContactRequestPlugin, ContactPlugin] {
  return [new ContactRequestPlugin(), new ContactPlugin(config)];
}

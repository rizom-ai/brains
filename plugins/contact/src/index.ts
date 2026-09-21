import { ContactPlugin } from "./plugin";
import { ContactRequestPlugin } from "./entity/plugin";
import type { ContactPluginConfig } from "./config";

export { ContactHttpHandlers, contactHttpPolicySchema } from "./http";
export { ContactDelivery, contactDeliveryPolicySchema } from "./delivery";
export type {
  ContactDeliveryPolicy,
  ContactDeliveryDependencies,
} from "./delivery";
export { contactPluginConfigSchema } from "./config";
export type { ContactPluginConfig, ContactIntakeConfig } from "./config";
export type { ContactHttpPolicy } from "./http";
export { ContactIntake } from "./intake";
export type {
  ContactIntakeDependencies,
  ContactSaveResult,
  ContactMaintenanceReport,
} from "./intake";
export { contactStoragePolicySchema } from "./storage-slots";
export type { ContactStoragePolicy } from "./storage-slots";
export { ContactPlugin, ContactRequestPlugin };
export { ContactInboxSource } from "./inbox-source";
export { ContactAdmission } from "./admission";
export type {
  ContactDenialReason,
  ContactFormResult,
  ContactReservationResult,
} from "./admission";
export { contactAdmissionPolicySchema } from "./admission-state";
export type { ContactAdmissionPolicy } from "./admission-state";
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

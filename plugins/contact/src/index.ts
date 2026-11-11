import { ContactPlugin } from "./plugin";
import { ContactRequestPlugin } from "./entity/plugin";
import type { ContactPluginConfig } from "./config";

export { CONTACT_ADMISSION, CONTACT_SLOTS } from "./state";
export { CONTACT_COPY, CONTACT_FORM } from "./form";
export { contactRequestTarget } from "./target";
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
export { ContactPlugin, ContactRequestPlugin };
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

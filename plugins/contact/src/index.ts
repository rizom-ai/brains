import { formPackageDependencies } from "@brains/forms";
import { createContactPackage } from "./plugin";

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
export { createContactPackage } from "./plugin";
export { contactRequestEntity } from "./entity/contact-request-entity";
export { contactRequestAdapter } from "./entity/adapter";
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

/**
 * The contact form and its contact-request type, as a brain composes them:
 * explicitly, as no site or default bundle activates intake.
 */
const contactPackage: ReturnType<typeof createContactPackage> =
  createContactPackage();
export default contactPackage;

/** The plugins the contact service registers after, as its class declared. */
export const CONTACT_DEPENDENCIES: readonly string[] = Object.freeze(
  formPackageDependencies("contact-request"),
);

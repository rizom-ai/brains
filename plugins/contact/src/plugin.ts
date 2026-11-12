import { defineFormPackage } from "@brains/forms";
import type { ServicePackageDefinition } from "@brains/sdk/services";
import type { contactPluginConfigSchema } from "./config";
import { contactRequestEntity } from "./entity/contact-request-entity";
import type { ContactRequest } from "./entity/schema";
import { CONTACT_FORM } from "./form";
import { contactRequestTarget } from "./target";

/** The brain's contact form, on the forms engine; its requests are
 * `contact-request` records in the owner's Inbox. */
export function createContactPackage(): ServicePackageDefinition<
  typeof contactPluginConfigSchema
> {
  return defineFormPackage<ContactRequest>({
    id: "contact",
    label: "Contact",
    entity: contactRequestEntity,
    target: contactRequestTarget,
    forms: [CONTACT_FORM],
  });
}

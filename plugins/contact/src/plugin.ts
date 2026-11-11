import { FormPlugin } from "@brains/forms";
import packageJson from "../package.json";
import type { ContactPluginConfig } from "./config";
import type { ContactRequest } from "./entity/schema";
import { CONTACT_FORM } from "./form";
import { contactRequestTarget } from "./target";

/** The brain's contact form, on the forms engine; its requests are
 * `contact-request` records in the owner's Inbox. */
export class ContactPlugin extends FormPlugin<ContactRequest> {
  constructor(config: ContactPluginConfig = {}) {
    super(
      {
        id: "contact",
        packageJson,
        label: "Contact",
        target: contactRequestTarget,
        forms: [CONTACT_FORM],
      },
      config,
    );
  }
}

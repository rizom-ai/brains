import type { FormAdmissionOptions, FormStorageOptions } from "@brains/forms";

/** Where the contact form's admission ledger lives and how requests are named. */
export const CONTACT_ADMISSION: FormAdmissionOptions = {
  namespace: "contact.admission",
  idPrefix: "contact",
};
/** Where the contact form's in-flight ledger lives. */
export const CONTACT_SLOTS: FormStorageOptions = {
  namespace: "contact.storage",
  idPrefix: "contact",
};

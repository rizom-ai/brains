import type { FormAdmissionOptions, FormStorageOptions } from "@brains/forms";

/** Contact's ledgers keep the namespaces and record names they had before the
 * forms engine, so a deployment's live state carries over. */
export const CONTACT_ADMISSION: FormAdmissionOptions = {
  namespace: "contact.admission",
  idPrefix: "contact",
};
export const CONTACT_SLOTS: FormStorageOptions = {
  namespace: "contact.storage",
  idPrefix: "contact",
};

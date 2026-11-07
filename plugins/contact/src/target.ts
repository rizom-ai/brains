import {
  formFields,
  type FormDefinition,
  type FormField,
  type FormRecord,
  type FormSubmission,
  type FormTarget,
} from "@brains/forms";
import { contactRequestAdapter } from "./entity/adapter";
import {
  contactMetadataSchema,
  contactRequestSchema,
  type ContactRequest,
} from "./entity/schema";

type ContactField = "name" | "email" | "message";
/** The fields a contact request holds, each of the kind it is asked as, and
 * its label when a form names it otherwise. */
const CONTACT_FIELDS: ReadonlyMap<
  string,
  { kind: FormField["kind"]; required: boolean; label: string }
> = new Map([
  ["name", { kind: "text", required: true, label: "Name" }],
  ["email", { kind: "email", required: true, label: "Email" }],
  ["message", { kind: "longText", required: false, label: "Message" }],
]);

function record(
  frontmatter: Parameters<typeof contactRequestAdapter.createContent>[0],
  message: string,
): FormRecord {
  const content = contactRequestAdapter.createContent(frontmatter, message);
  return {
    content,
    metadata: contactMetadataSchema.parse(
      contactRequestAdapter.fromMarkdown(content).metadata,
    ),
  };
}

/** Contact requests as forms produce them: who wrote, how to answer, and the
 * message. */
export const contactRequestTarget: FormTarget<ContactRequest> = {
  entityType: "contact-request",
  schema: contactRequestSchema,

  refuse(form: FormDefinition): string | undefined {
    const fields = formFields(form);
    const refused = fields.find(
      (field) => CONTACT_FIELDS.get(field.id)?.kind !== field.kind,
    );
    if (refused)
      return `Form "${form.id}": a contact request holds no field "${refused.id}" of kind ${refused.kind}`;
    const missing = [...CONTACT_FIELDS].find(
      ([id, field]) =>
        field.required &&
        !fields.some((asked) => asked.id === id && asked.required),
    );
    return missing
      ? `Form "${form.id}": a contact request needs "${missing[0]}", required`
      : undefined;
  },

  record({ answers, receivedAt }: FormSubmission): FormRecord {
    return record(
      {
        name: answers["name"] ?? "",
        email: answers["email"] ?? "",
        receivedAt: new Date(receivedAt).toISOString(),
        status: "new",
        notification: "pending",
      },
      answers["message"] ?? "",
    );
  },

  matches(
    entity: ContactRequest,
    { answers, receivedAt }: FormSubmission,
  ): boolean {
    const { frontmatter, message } = contactRequestAdapter.parseContent(
      entity.content,
    );
    return (
      frontmatter.name === answers["name"] &&
      frontmatter.email === answers["email"] &&
      message === (answers["message"] ?? "") &&
      Date.parse(frontmatter.receivedAt) === receivedAt
    );
  },

  notification(entity: ContactRequest) {
    return contactRequestAdapter.parseContent(entity.content).frontmatter
      .notification;
  },

  withNotification(
    entity: ContactRequest,
    notification: "sent" | "failed",
  ): FormRecord {
    const { frontmatter, message } = contactRequestAdapter.parseContent(
      entity.content,
    );
    return record({ ...frontmatter, notification }, message);
  },

  handled(entity: ContactRequest): boolean {
    return (
      contactRequestAdapter.parseContent(entity.content).frontmatter.status ===
      "handled"
    );
  },

  alert(entity: ContactRequest, form: FormDefinition) {
    const { frontmatter, message } = contactRequestAdapter.parseContent(
      entity.content,
    );
    const labels = new Map(formFields(form).map((f) => [f.id, f.label]));
    const label = (id: ContactField): string =>
      labels.get(id) ?? CONTACT_FIELDS.get(id)?.label ?? id;
    return {
      answers: [
        { label: label("name"), value: frontmatter.name },
        { label: label("email"), value: frontmatter.email },
        { label: label("message"), value: message },
      ],
      replyTo: frontmatter.email,
    };
  },
};

import {
  FORM_COPY,
  type BuiltInForm,
  type FormCopy,
  type FormDraft,
} from "@brains/forms";
import { CONTACT_ADMISSION, CONTACT_SLOTS } from "./state";

/** Contact's own words for what the engine says around its form. */
export const CONTACT_COPY: FormCopy = {
  ...FORM_COPY,
  denials: {
    "invalid-network": "Notes can’t be sent from this connection.",
    "invalid-submission":
      "Check the name, email and message fields before retrying.",
    "invalid-token":
      "This form is unavailable or expired. Copy your message before opening a new form.",
    "submission-conflict":
      "This form already sent a different note. To send another, open a new form.",
    "rate-limited": "Too many requests. Please wait before retrying this form.",
    capacity:
      "There’s no room for new notes right now. Please try this same form again later.",
    unavailable:
      "Your note couldn’t be confirmed as saved. Send this same form again rather than opening a new one.",
  },
  denied: "Contact request denied.",
  paused: {
    title: "Notes are paused",
    body: "Notes can’t be received right now. Please try this same form again later.",
  },
  refusedTitle: "Contact unavailable",
};

/** A site links a topic to the form; it starts the visitor's message, who can change it. */
const TOPIC_MAX_LENGTH = 200;
function topicDraft(url: URL): FormDraft {
  const topic = url.searchParams
    .get("topic")
    ?.trim()
    .slice(0, TOPIC_MAX_LENGTH);
  return topic ? { message: `${topic}\n\n` } : {};
}

/** The brain's contact form at `/contact`. Its state keeps the names it had
 * before forms ran on the engine. */
export const CONTACT_FORM: BuiltInForm = {
  definition: {
    id: "contact",
    target: "contact-request",
    path: "/contact",
    title: "Write to {owner}",
    pageTitle: "Contact",
    intro:
      "Your note goes privately to {owner}, who can reply by email. It’s kept until {owner} has dealt with it, doesn’t start a chat, and never becomes part of what this site knows.",
    submitLabel: "Send note",
    thanks: {
      title: "Note saved",
      body: "Your note is saved for {owner}, who can reply by email.\n\nIt stays saved even if the alert to {owner} is delayed, so there’s no need to send it again.",
    },
    steps: [
      {
        fields: [
          {
            kind: "text",
            id: "name",
            label: "Name",
            required: true,
            maxLength: 120,
            autocomplete: "name",
          },
          {
            kind: "email",
            id: "email",
            label: "Email",
            required: true,
            autocomplete: "email",
          },
          {
            kind: "longText",
            id: "message",
            label: "Message",
            maxLength: 4000,
          },
        ],
      },
    ],
    notify: { title: "New contact request" },
  },
  copy: CONTACT_COPY,
  prefill: topicDraft,
  state: {
    admission: CONTACT_ADMISSION.namespace,
    storage: CONTACT_SLOTS.namespace,
  },
  endpoint: { label: "Contact", priority: 50 },
  role: "contact-form",
};

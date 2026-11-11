import { createEmailInterface } from "./email-interface";

export {
  inboundEmailSchema,
  type InboundEmail,
  type InboundEmailAddress,
  type InboundEmailSender,
} from "@brains/contracts";
export type {
  EmailImapConfig,
  EmailImapConfigInput,
  InboundEmailClient,
  InboundEmailClientFactory,
  InboundEmailCursor,
  InboundEmailSelection,
  InboundEmailSourceMessage,
} from "./inbound-email";
export { createInboundEmailSourceRef } from "./inbound-email";
export type { InboundEmailSleep } from "./inbound-supervisor";
export {
  createEmailInterface,
  emailConfigSchema,
  shouldRedactDelivery,
  type EmailConfig,
  type EmailConfigInput,
  type EmailInterfaceDefinition,
  type EmailInterfaceDependencies,
  type EmailSendResult,
} from "./email-interface";

/** The Email interface, with its real Resend and IMAP collaborators. */
const emailInterface: ReturnType<typeof createEmailInterface> =
  createEmailInterface();

export default emailInterface;

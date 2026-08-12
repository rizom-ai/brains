import {
  defineAccountSettings,
  defineDaemon,
  defineInterface,
  z,
} from "@rizom/brain/interfaces";
import { ImapFlow } from "imapflow";

const mailboxSettingsSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65_535).default(993),
  secure: z.boolean().default(true),
  user: z.string().min(1),
  password: z.string().min(1),
  mailbox: z.string().min(1).default("INBOX"),
});

const mailboxSettings = defineAccountSettings({
  title: "Inbound mailbox",
  description: "Connect a read-only mailbox for this Brain account.",
  schema: mailboxSettingsSchema,
  fields: {
    host: { label: "IMAP host" },
    port: { label: "Port", control: "number" },
    secure: { label: "Use TLS", control: "checkbox" },
    user: { label: "Username" },
    password: { label: "Password", secret: true },
    mailbox: { label: "Mailbox" },
  },
});

async function waitForAbort(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  await new Promise<void>((resolve) => {
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
}

const mailboxConnections = defineDaemon({
  id: "configured-mailboxes",
  required: false,
  forAccounts: mailboxSettings,
  async run({ account, health, signal }) {
    const client = new ImapFlow({
      host: account.settings.host,
      port: account.settings.port,
      secure: account.settings.secure,
      auth: {
        user: account.settings.user,
        pass: account.settings.password,
      },
      logger: false,
    });

    try {
      await client.connect();
      await client.mailboxOpen(account.settings.mailbox, { readOnly: true });
      health.ready();
      await waitForAbort(signal);
    } finally {
      await client.logout().catch(() => {});
    }
  },
});

export default defineInterface({
  id: "mailbox-connection",
  config: z.object({}),
  accountSettings: mailboxSettings,
  daemons: () => [mailboxConnections],
});

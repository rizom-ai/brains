# Unified inbox test app

This canonical posture exercises inbound email triage, shared Inbox surfaces, source-owned
actions, and the daily digest. Use a dedicated mailbox containing synthetic messages only.
Never point it at a personal or production mailbox.

## Setup

1. Copy the gitignored environment file and restrict its permissions:

   ```bash
   cd packages/brain-cli/test-apps/unified-inbox
   cp .env.example .env
   chmod 600 .env
   ```

2. Add a capped `AI_API_KEY`, `IMAP_USER`, and app-specific `IMAP_PASSWORD` to `.env`.
3. Replace the explicit `imap.test.invalid` host in `brain.yaml` with the test mailbox's
   IMAP host. Keep port, mailbox, poll mode, and interval explicit in YAML.
4. To exercise actual digest delivery, also configure the three `SETUP_EMAIL_*` values
   in `.env`. They provide the existing Resend transport and notification recipient.

## Run

From `packages/brain-cli`:

```bash
bun start:unified-inbox
```

Open <http://localhost:8080/>. If the test data directory has no Admin account yet, use
the one-time setup URL printed during boot.

Send synthetic messages that cover high-priority actionable mail, normal mail, reply
requests, and strong bulk/list signals. Verify that only restricted derived titles and
summaries appear, source-owned actions remove resolved items from the live projection,
and restarting does not create duplicates.

Do not commit `.env`, mailbox exports, message fixtures copied from a real mailbox, or
runtime databases.

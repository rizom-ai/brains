# Unified inbox test app

This canonical posture exercises inbound email workflows, private source reads, shared
Inbox surfaces, generated reply drafts, source-owned actions, and the daily digest. Use a
dedicated mailbox containing synthetic messages only.
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
requests, and strong bulk/list signals. Open
<http://localhost:8080/cms/workspaces/inbox> and verify server-side source/urgency
filters, list/detail navigation, transient original-message reads, confirmation, and
paging. For a synthetic item needing a reply, open **Draft reply**, generate and edit a
revision, then confirm only the authored reply text appears in the restricted draft entity;
the workspace offers no send action. Dashboard should expose only a five-entry read-only
summary whose **Open Inbox** link returns to that workspace;
`inbox_list` remains the chat read surface. If digest delivery is configured, verify its
link resolves to the same workspace. Only restricted derived titles and content-safe
summaries should appear, source-owned actions should remove resolved items from the live
projection, and restarting must not create duplicates.

Do not commit `.env`, mailbox exports, message fixtures copied from a real mailbox, or
runtime databases.

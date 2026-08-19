# Unified inbox test app

This canonical posture exercises inbound email workflows, private source reads,
source-backed Chat, content-safe note Capture, source-owned actions, and the daily digest.
Use a dedicated mailbox containing synthetic messages only.
Never point it at a personal or production mailbox.

## Setup

1. Copy the gitignored environment file and restrict its permissions:

   ```bash
   cd packages/brain-cli/test-apps/unified-inbox
   cp .env.example .env
   chmod 600 .env
   ```

2. Add a capped `AI_API_KEY` plus the dedicated synthetic Migadu mailbox's
   `IMAP_USER` and app-specific `IMAP_PASSWORD` to `.env`. The committed
   `imap.migadu.com` host, port, mailbox, poll mode, and interval remain explicit
   in `brain.yaml`.
3. To exercise actual digest delivery, also configure the three `SETUP_EMAIL_*` values
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
paging. Open **Discuss in chat** and verify the new conversation can answer a question
requiring the selected synthetic email body without placing that body in browser history
state. Open **Capture as note** and verify the unsaved note contains the safe summary and a
readable source link. Confirm that Inbox and CMS expose no reply-draft follow-up, workspace,
or entity collection. Dashboard should expose only a five-entry read-only summary whose **Open Inbox**
link returns to that workspace;
`inbox_list` remains the chat read surface. If digest delivery is configured, verify its
link resolves to the same workspace. Only restricted derived titles and content-safe
summaries should appear, source-owned actions should remove resolved items from the live
projection, and restarting must not create duplicates.

Do not commit `.env`, mailbox exports, message fixtures copied from a real mailbox, or
runtime databases.

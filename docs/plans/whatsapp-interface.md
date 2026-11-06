# Plan: WhatsApp Interface

## Status

Proposed. `@brains/chat` runs Discord and Slack on the Chat SDK (`chat` 4.41.1). WhatsApp is not wired.

- `@chat-adapter/whatsapp` 4.44.0 is the official Chat SDK adapter for the WhatsApp Business Cloud API. Its peer dependency pins `chat` at exactly 4.44.0.
- The adapter handles direct messages only: every thread is `whatsapp:{phoneNumberId}:{userWaId}`, `isDM()` always returns true, and every send sets `recipient_type: "individual"`. Upstream group support ([vercel/chat#271](https://github.com/vercel/chat/issues/271)) was closed as not planned.
- The adapter cannot edit or delete messages; both throw. Streaming is buffered into one message.
- Meta's Groups API requires an Official Business Account (OBA), caps a group at 8 participants including the business, and does not allow interactive messages in groups.

Two PRs: direct messages first, then groups once the business number holds OBA status.

## Goal

A brain answers WhatsApp direct messages through `@brains/chat` with the same turn routing, approvals, uploads and permissions as Discord and Slack. WhatsApp groups then work as channels.

## Decisions

- **One more platform in `@brains/chat`**, not a new interface package. `ChatPlatform` gains `whatsapp`; the config gains `adapters.whatsapp`.
- **The Chat SDK moves to 4.44.0 as a whole.** `chat` and every `@chat-adapter/*` dependency move in one step, because the WhatsApp adapter pins `chat` exactly. `interfaces/chat` is the only workspace that depends on them.
- **Webhook only.** Meta offers no socket or gateway mode. `GET` (the verification handshake) and `POST` (signed events) are served on `/api/webhooks/chat/whatsapp`, both public. There is no listener loop; the daemon is healthy while the Chat SDK app runs.
- **Credentials come from four env vars, all or none:** `WHATSAPP_ACCESS_TOKEN` (a permanent System User token), `WHATSAPP_APP_SECRET`, `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_VERIFY_TOKEN`. A partial set yields no adapter, the rule `chatConfigFromEnv` already applies to Discord.
- **Message editing is decided per channel.** The public `supportsMessageEditing` hook receives the target `channelId`, and `ChatInterface` answers false for WhatsApp channels. Where editing is off:
  - a job's completion posts a new message instead of editing the agent response that started it (today a failed edit drops the completion);
  - no tool-status cards are posted, and the reply carries the outcome;
  - a resolved approval posts its resolution as a new message.
- **Identity.** The subject is the adapter's canonical user ID: the phone number (country code, digits only) when Meta sends one, otherwise the business-scoped user ID (BSUID). Permission rules read `whatsapp:31612345678`. The channel descriptor's subject pattern accepts both forms.
- **Identity links persist.** The adapter links a user's phone number, BSUID and parent ID under `whatsapp:identity:*` Chat SDK state keys. The chat state adapter persists only thread subscriptions today; it also persists these keys in runtime state, so a restart keeps each user's identity and reply route.
- **Messages outside the 24-hour window are dropped.** Meta rejects a free-form message to a user who has not written in 24 hours (`WhatsAppApiError.errorCode` 131047). The interface logs a warning and drops the message. No template messages are sent.
- **Formatting.** WhatsApp posts go out as `{ markdown }`, which the adapter converts to WhatsApp's syntax. The per-message limit is 4096 characters.
- **Approvals use the existing card.** Confirm and Cancel become WhatsApp reply buttons (up to 3, titles up to 20 characters). Typed yes/no keeps working; the confirmation coordinator already limits resolution to the requester or an administrator.
- **Uploads follow Slack.** Inbound media is saved to a `whatsapp` upload store and served on `/api/webhooks/chat/whatsapp/uploads`; generated artifacts go out as native WhatsApp media.
- **Local testing** uses Meta's test number (up to 5 verified recipients) against the `whatsapp` test app behind a Cloudflare quick tunnel (`cloudflared tunnel --url http://localhost:<port>`). The tunnel URL is the webhook callback for that session.
- **Groups extend the adapter by subclass** in `@brains/chat` (`WhatsAppGroupAdapter`). The adapter keeps inbound handling, thread-ID encoding, `isDM()`, `channelIdFromThreadId()` and `recipient()` overridable, and its own type test guards that. Every send spreads `recipient()` after `recipient_type: "individual"`, so returning `{ recipient_type: "group", to: groupId }` turns all sends into group sends.
- **Groups require a mention by default.** Meta bills each delivered group message per member, and a brain answering every message in a group is noise.
- **Groups are created by the operator** through a script, not a brain tool: groups are few, the operator shares the invite link, and a group holds at most 8 people.

## Phase 1 — Direct messages

One PR. Each step is one commit, with its tests written first.

1. **Text in, text out.** The Chat SDK bump; `adapters.whatsapp` config, env vars and the regenerated canonical env schema; `whatsapp` in `CHAT_PLATFORMS`, the 4096 limit and `toPlatformText`; the webhook routes; the channel descriptor; the daemon and "at least one adapter" gates; the `whatsapp` test app in `packages/brain-cli/test-apps/` and the `AGENTS.md` test-app list.
   - Tests: a signed `POST` fixture routes a turn and the reply reaches the Graph API.
   - Tests: the `GET` handshake echoes the challenge for the right verify token and rejects a wrong one.
   - Tests: the Discord and Slack suites pass on 4.44.0.
2. **Post-only replies.** Per-channel `supportsMessageEditing`; completion posts a new message when the channel cannot edit; no tool-status cards on WhatsApp; approval resolution posts a new message.
   - Tests: a job completion in a WhatsApp DM posts once and never calls edit.
   - Tests: Slack still edits the agent response on completion.
3. **Identity and permissions.** `whatsapp:identity:*` keys persisted in runtime state; the descriptor's subject pattern.
   - Tests: a `whatsapp:<phone>` rule grants its level.
   - Tests: a BSUID-only message after a restart resolves to the same user.
4. **Approvals.** Confirm and Cancel as reply buttons.
   - Tests: a `button_reply` for Confirm resolves the pending confirmation, and a typed "yes" does too.
5. **Media.** The `whatsapp` upload store and uploads route; artifacts sent as media.
   - Tests: an inbound image is stored and its upload ref reaches the turn.
   - Tests: a generated artifact goes out as a media message.
6. **The 24-hour window.** Rejections with 131047 are logged and dropped.
   - Tests: a send rejected with 131047 logs a warning and does not throw.
7. **Docs and release.** A WhatsApp section in `docs/interface-setup.md`: the Meta app, the System User token, the webhook callback and verify token, env vars, the local tunnel and permission rules. A changeset for `@rizom/brain`.

Exit: a message from a verified phone to the test number gets an answer from the running test app, an approval completes with a button, and a job's completion arrives as its own message.

## Phase 2 — Groups

A second PR, started once the business number holds OBA status.

1. **Payload capture.** Create a test group through `POST /<phone-number-id>/groups` and record webhook payloads for a plain message, an @-mention, media, a join and a leave as fixtures. They settle what Meta's docs leave open: whether every group message is delivered and how a mention is marked.
2. **Group messages.** `WhatsAppGroupAdapter`: an inbound `group_id` maps to the thread `whatsapp:{phoneNumberId}:group:{groupId}` with its own channel ID, `isDM()` is false for it, the sender is identified by `from_user_id`, and sends use `recipient_type: "group"`.
   - Tests: a captured group message routes a turn in the group thread.
   - Tests: the reply body carries `recipient_type: "group"` and the group ID.
3. **Mention gating.** Mentions are detected from the captured mention data, falling back to the bot's name at the start of a message.
   - Tests: with `requireMention`, a mention routes and a plain message does not.
4. **Approvals in groups.** Interactive messages are not allowed in groups, so cards render as text with the existing yes/no instruction.
   - Tests: the prompt goes out as text, the requester's "yes" resolves it, and another member's "yes" does not.
5. **Group management.** `interfaces/chat/scripts/whatsapp-group.ts create|invite-link|list|delete`. The `group_lifecycle_update`, `group_participants_update` and `group_settings_update` webhooks keep channel names current. Groups are allowlisted through `allowedChannels`.
   - Tests: each script command against a fake Graph API.
   - Tests: a subject change renames the channel.
6. **Groups as spaces.** A group can be selected as a space for passive capture; an answered space notice posts its new content as a new message. The setup docs cover OBA, the 8-member cap and per-member billing.
   - Tests: a passive group message lands in the space conversation.
   - Tests: an answered notice posts once and never calls edit.

## Risks

- **OBA may not be granted.** Phase 2 waits on Meta; Phase 1 does not depend on it.
- **The authoring boundary re-apply** ([authoring-boundary-reapply.md](./authoring-boundary-reapply.md)) changes the public message-interface contract and converts `@brains/chat`. Whichever lands second re-reads the other, and the `supportsMessageEditing` change updates the public-authoring golden.
- **WhatsApp usernames.** A user who hides their number arrives with a BSUID only, and a phone-number rule does not match them until the operator adds a rule for the BSUID.
- **Tunnel URLs change per run**, so the Meta webhook callback is re-entered for each local session.

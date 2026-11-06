# Plan: WhatsApp Interface

## Status

Proposed. `@brains/chat` runs Discord and Slack on the Chat SDK. WhatsApp is not wired.

The brain reaches WhatsApp through Baileys 7 (`baileys` 7.0.0-rc14), which links the brain as a device of an ordinary WhatsApp account, the way WhatsApp Web does. This route is unofficial: WhatsApp's terms do not allow it, and a number using it can be banned. Meta's Cloud API is not used, because its groups need an Official Business Account, hold at most 8 members, can only be created by the business, and cannot carry buttons.

The community Chat SDK adapters do not fit:

- `chat-adapter-baileys` has no mention detection, no phone-number mapping for group senders, and renders cards as plain text.
- `chat-adapter-zaileys` covers those, but installs 282 MB, about 200 MB of it ffmpeg, ffprobe and audio and image decoders.

Baileys alone installs about 77 MB, including its required `sharp` peer (37 MB), which no workspace uses today.

## Goal

A brain answers WhatsApp direct messages and takes part in WhatsApp groups through `@brains/chat`, with the same turn routing, mention gating, approvals, uploads and permissions as Discord and Slack.

## Decisions

- **Our own adapter in `@brains/chat`.** `WhatsAppAdapter` implements the Chat SDK `Adapter` directly on Baileys. `ChatPlatform` gains `whatsapp`; the config gains `adapters.whatsapp`. Its button messages port the native-flow construction from zaileys (MIT), credited in the file.
- **Baileys loads only when configured.** It is imported dynamically when `adapters.whatsapp` is set, so other brains never load it.
- **A dedicated number.** The brain's WhatsApp account uses a number that serves nothing else. Operators keep their own numbers and reach the brain through permission rules.
- **Pairing-code login.** The config holds `phoneNumber` (country code, digits only), set from `WHATSAPP_PHONE_NUMBER`. While the session is unregistered, the adapter calls `requestPairingCode` and writes the code to the brain's log; the operator enters it under Linked devices → Link with phone number.
- **The session lives in runtime state.** Baileys' `AuthenticationState` (credentials and signal keys) is stored in the interface's runtime state, not on disk, so restarts and redeploys keep the link.
- **Connection.** A `WhatsAppConnectionLoop` on `RestartingListenerSupervisor`, like the Discord and Slack loops. A dropped connection reconnects. A logged-out close (`DisconnectReason.loggedOut`, 401) stops the loop and clears the session, and the daemon reports unhealthy until the number is paired again. There are no webhook routes.
- **Threads.** A thread ID is `whatsapp:<jid>` with the normalized JID: `<phone>@s.whatsapp.net` or `<lid>@lid` for a direct message, `<id>@g.us` for a group. WhatsApp has no threads inside a chat, so a chat's channel ID is its thread ID. `isDM()` is false for group JIDs.
- **Mentions.** A message mentions the brain when `contextInfo.mentionedJid` holds the account's phone JID or LID. Groups default to `requireMention: true`.
- **Who can add the brain to groups.** On connect, the adapter sets the account's group-add privacy to `contacts` (`updateGroupsAddPrivacy`), so only the account's contacts can add it to a group. `allowedChannels` takes group JIDs; empty allows every group, as it does for Slack channels.
- **Identity.** The sender resolves to a phone number: `participantAlt` or `remoteJidAlt` when present, otherwise Baileys' LID mapping (`getPNForLID`), otherwise the LID itself. The subject is the phone number in digits (`whatsapp:31612345678`), or the full LID (`whatsapp:123456789@lid`) when WhatsApp hides the number. The channel descriptor's subject pattern accepts both.
- **Formatting.** Posts go out as `{ markdown }` and are converted to WhatsApp's syntax (`*bold*`, `_italic_`, `~strike~`, monospace) by a converter on the Chat SDK's `BaseFormatConverter`.
- **Cards.**
  - A card with buttons is sent as an interactive native-flow message with `quick_reply` buttons, relayed with the `biz` node WhatsApp expects.
  - A tap arrives as `interactiveResponseMessage.nativeFlowResponseMessage` and goes to `processAction`.
  - A card without buttons is sent as its fallback text.
  - Typed yes/no keeps working; the confirmation coordinator already limits resolution to the requester or an administrator.
- **Editing.** Edits and deletes use Baileys' `edit` and `delete` message keys. WhatsApp accepts an edit for 15 minutes; after that the edit fails. A failed completion edit posts the completion as a new message. This is a shared fix in the progress coordinator, because today a failed edit drops the completion on every platform.
- **Media.** Inbound images, documents, audio and video are downloaded into a `whatsapp` upload store, as Slack's are. Generated artifacts go out as image or document messages.
- **Typing.** The adapter sends `composing` presence while a turn runs, when `showTypingIndicator` is on.
- **Tests drive a fake socket.** The adapter receives its Baileys socket factory as a dependency. Tests inject a fake that emits `messages.upsert` and `connection.update` events and records `sendMessage` and `relayMessage` calls.

## Steps

One PR. Each step is one commit, with its tests written first.

1. **Direct messages, text in and out.** `WhatsAppAdapter` with DM threads, text parsing and `{ markdown }` posts; `adapters.whatsapp` config, `WHATSAPP_PHONE_NUMBER` and the regenerated canonical env schema; the session store; pairing-code login; the connection loop and daemon health; the channel descriptor; the `baileys` and `sharp` dependencies; the `whatsapp` test app and the `AGENTS.md` test-app list.
   - Tests: an inbound DM routes a turn, and the reply is sent to the sender's JID as WhatsApp-formatted text.
   - Tests: an unregistered session requests a pairing code and logs it; saved credentials are read back after a restart.
   - Tests: a dropped connection reconnects; a logged-out close stops the loop and the daemon reports unhealthy.
   - Live: the test app pairs with the number and answers a DM under Bun.
2. **Groups.** Group threads, `allowedChannels`, mention detection, `requireMention` and the group-add privacy.
   - Tests: a mention in an allowed group routes a turn, a plain message does not, and a message in an unlisted group is ignored.
   - Tests: connecting sets group-add privacy to `contacts`.
3. **Identity.** Sender resolution and the subject pattern.
   - Tests: a group sender with only a LID resolves to the phone number through the LID mapping.
   - Tests: a `whatsapp:<phone>` rule grants its level; an unmapped LID stays its own subject.
4. **Completions after the edit window.** The shared fallback in the progress coordinator.
   - Tests: a completion whose edit fails posts once as a new message, on WhatsApp and on Slack.
5. **Buttons.** Native-flow cards and tap routing.
   - Tests: the approval card is relayed as an interactive message with Confirm and Cancel `quick_reply` buttons, and a native-flow tap resolves the confirmation.
   - Tests: a card without buttons goes out as text.
   - Live: the buttons render and work on iPhone, Android and WhatsApp desktop.
6. **Media.**
   - Tests: an inbound image is stored and its upload ref reaches the turn.
   - Tests: a generated artifact is sent as a document message.
7. **Docs and release.** A WhatsApp section in `docs/interface-setup.md`: the unofficial status and ban risk, the dedicated number, pairing, permission rules and groups. A changeset for `@rizom/brain`.

Exit: the test app, paired with a dedicated number, answers DMs and mentions in an allowed group, completes an approval with a button, and keeps its session across a restart.

## Risks

- **Bans.** WhatsApp can ban the number at any time. The number is dedicated, so a ban costs only the brain's WhatsApp access; the setup docs say so.
- **Protocol changes.** Baileys follows WhatsApp Web, so a WhatsApp change can break the connection or the buttons until Baileys catches up. Baileys 7 is still a release candidate.
- **Bun.** Baileys targets Node.js; step 1's live check is its first run under Bun.
- **Buttons from a linked device** depend on each WhatsApp client rendering them. Step 5's live check covers the three clients, and typed yes/no stays as the fallback.
- **The authoring boundary re-apply** ([authoring-boundary-reapply.md](./authoring-boundary-reapply.md)) converts `@brains/chat`. Whichever lands second re-reads the other.

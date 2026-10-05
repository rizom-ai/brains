# Onboarding emails and the AI tools page

## Status

Proposed. Copy and layout are drafted in [../onboarding-ai-tools-mockups.html](../onboarding-ai-tools-mockups.html).

## Current state

Brain alpha.485 sends one onboarding email per person, rendered by `renderOnboardingEmail` in `shell/auth-service/src/onboarding-emails.ts`: an anchor setup email and an invitation, each with its own opening and a shared body (first five minutes, Studio, MCP connection steps, footer).

- The MCP steps (address, Claude Code command, Claude Desktop connector) live only in the email. No page in the brain shows the MCP address or how to connect a client, and an email cannot be corrected after it is sent.
- The anchor email does not name the person. Neither email says what the brain is for.
- The chat and Studio links are hardcoded as `/chat` and `/studio`, whatever the brain actually serves.

## Decisions

### An AI tools tab in Account

The Studio Account workspace (`studio:account`, open to every signed-in user) gets a fifth tab, **AI tools**, next to Profile, Sign-in & sessions, Linked identities and Personal settings. Connecting a client is personal: the client acts as the signed-in user, with that user's access.

The tab shows the brain's MCP address with a copy button, what a connected tool can do (talk to the brain as the user does in chat, within the user's access), and one card per client:

| Client                   | Steps on the card                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude (desktop and web) | Settings → Connectors → Add custom connector; paste the address; sign in with the passkey.                                                                                                                                                                                                                                                                                                                                                            |
| Claude Code              | `claude mcp add --transport http brain <address>` with a copy button; then `/mcp` to sign in.                                                                                                                                                                                                                                                                                                                                                         |
| ChatGPT                  | Settings → Apps & Connectors → Advanced → Developer mode; Create; paste the address; choose OAuth; sign in.                                                                                                                                                                                                                                                                                                                                           |
| Cursor                   | `~/.cursor/mcp.json` entry `{"mcpServers": {"brain": {"url": "<address>"}}}` with a copy button; sign in when Cursor asks.                                                                                                                                                                                                                                                                                                                            |
| VS Code                  | `.vscode/mcp.json` entry `{"servers": {"brain": {"type": "http", "url": "<address>"}}}` with a copy button; sign in when VS Code asks.                                                                                                                                                                                                                                                                                                                |
| Any other MCP client     | The settings to enter: type remote Streamable HTTP (not stdio or SSE), the address as URL, OAuth with API key, token, client ID and secret left empty (the client registers itself). Then: the brain's "Authorize <client>?" page, approved with the passkey; the client gets the `chat` and `confirm` tools. For clients that only run local stdio servers or ask for an API key: an `npx -y mcp-remote <address>` bridge config with a copy button. |

The cards are one typed list in the Studio account UI; adding a client is one entry. Commands and config snippets are shown exactly as they are copied: JSON pretty-printed over several lines, never wrapped inside a token, scrolling horizontally when wider than the card. A client appears on the tab only after it has been connected to a deployed brain and completed the passkey sign-in. Client steps follow each vendor's current settings labels and are rechecked when a card is added or changed.

The address comes from the registered `mcp` interaction (`interfaces/mcp/src/mcp-interface.ts`), resolved against the issuer origin and passed to the Account bootstrap as `mcpUrl`. Without an HTTP MCP interaction the tab is not rendered.

The tab is deep-linkable: `?section=ai-tools` on the Account workspace URL opens it.

### Shorter, personal emails

- **Greeting.** When the auth anchor is a person and its profile name resolves, the anchor email says "Hi Becca, your brain is ready" (subject "Becca, your brain is ready"). Team and organization anchors, and unnamed ones, keep "Your brain is ready".
- **Purpose.** Both emails carry the brain character's purpose as "What it’s for: …" when it differs from the default character's purpose. A brain that has not been given a purpose says nothing rather than the generic default.
- **MCP section.** The connection steps leave the email. One paragraph remains: the AI tools you already use — Claude, ChatGPT, Cursor and others — can work with the brain directly; Account → AI tools has the address and the steps for each one. It links to the deep link above.
- **Links from the brain.** Chat, Studio and AI tools links are resolved at send time from the brain's registered interactions and endpoints. A link whose target is not registered is left out with its sentence.

`AuthInvitationService`'s `getBrainName` option becomes `getOnboardingContext`, returning the brain name, purpose and links, read at send time so resends and recovered deliveries carry them. The anchor setup email reads the same context in `AuthServicePlugin`.

## Phases

Each phase lands with its tests written first.

### Phase 1 — AI tools tab

1. Tests: Account bootstrap carries `mcpUrl` when an HTTP `mcp` interaction is registered and omits it otherwise; `account-view.test.tsx` renders the AI tools tab with the address and every client card's address-bearing snippet when `mcpUrl` is set, hides the tab without it, and opens it from `?section=ai-tools`.
2. Implement the bootstrap field, the client card list, the tab, copy buttons and the `section` query parameter.
3. Verify on `bun start:personal` in `packages/brain-cli`: sign in, open the deep link, and connect Claude Code, Cursor, VS Code and an `mcp-remote` bridge to the local brain.
4. Verify the cloud-hosted connectors against `smoke.rizom.ai` once it runs the release: Claude (desktop and web) and ChatGPT reach the brain from their vendors' servers, so they cannot use a local brain. A client whose sign-in fails is removed from the list before the phase ships.

### Phase 2 — Personal emails linking to AI tools

1. Tests: renderer cases for the named and unnamed greeting, the purpose line with a custom and a default purpose, the AI tools paragraph and link, and omitted links; `auth-invitation-service.test.ts` asserts that a resend carries the purpose and links.
2. Implement the onboarding context in `AuthRuntime` and `AuthServicePlugin`, the renderer inputs, and the shorter body.
3. Verify: render both emails for a person anchor with a purpose and an invitation to a team brain, check them at 900px and 375px, and send samples to the maintainer's inbox.

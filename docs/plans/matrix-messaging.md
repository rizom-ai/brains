# Plan: Matrix Messaging

## Status

In progress. The brain side is built:

- auth-service is an OpenID Connect provider with a fixed `preferred_username` per person (#1051). A provisioned OAuth client can declare the identity its sign-ins prove, which the brain then records as a verified claim.
- `@brains/chat` talks Matrix on `@beeper/chat-adapter-matrix` 0.2.0, held there by the lockfile and a version-keyed patch (`patches/README.md`). The patch adds `isDM`, records direct invites in `m.direct`, and adds an `inviteAutoJoin.accept` hook. The `matrix` channel delivers straight to the homeserver.
- The `matrix-server` plugin and the `matrix` bundle front a Tuwunel homeserver at the brain's domain, with forwarding, the well-known documents, the `@_brain` bot and the `matrix-homeserver` client. The plugin keeps a room for each trusted peer, opened and closed by `a2a:peer-trust-changed`.
- The `matrix` test app runs it all beside a local homeserver from `plugins/matrix-server/scripts/local-homeserver.ts`.

- The brain provisions its homeserver itself: it writes the homeserver's configuration and secrets into the directory they share, and the chat interface asks `matrix-server` for the bot's password over `matrix:bot-credentials`. The deploy runs Tuwunel as a Kamal accessory when brain.yaml's bundles include `matrix`, restarts it when the brain writes it a new configuration, and takes an online backup of it before each deploy.

All of this was verified against Tuwunel 2.0.0 locally, the first boot from an empty directory included. What remains is a default recipient chosen without configuration, and the checks a local machine cannot make.

## Remaining work

### A default recipient without configuration

Notifications accept a `matrix` recipient, and an operator can set `defaultRecipient` to their Matrix id. Defaulting to the Anchor's Matrix id without configuration would mean a plugin reading a person's identity claim or username from auth, which the identity rules keep private. It waits for that decision.

### Checks a local machine cannot make

- **The first real deploy.** The accessory, the shared directory, the reload step and the homeserver backup are tested against rendered templates and against Tuwunel in Docker, not on a server. The homeserver signs people in through `https://<domain>`, so it must reach the server's own public address from its container.
- **Federation between two brains.** The peer room's lifecycle is covered against a fake homeserver. Two deployed brains trusting each other and talking in the host's room is the live check, since federation needs real domains with valid certificates.
- **Sign-in with a passkey.** The homeserver's sign-in redirect reaches the brain's `/authorize`, which knows the client. Completing it needs a person's passkey in a browser.

## Risks

- **Federation is open by default.** Server ACLs restrict brain-created rooms only. Rooms that people create themselves federate with any server, as on any Matrix homeserver.
- **A young adapter.** 0.2.0 has a single maintainer organization, and the brain carries a patch for it. An upgrade must rebase or drop the patch and keep the direct-message tests and a live direct message passing.
- **The Chat SDK core is held at 4.41.1.** A root override keeps the Matrix adapter's looser range from lifting `chat` past the other adapters. Upgrading the Chat SDK means moving the override with them.
- **A lost configuration file orphans the bot.** The secrets live only in `tuwunel.toml`; if it is deleted while the database stays, the brain writes new secrets and the bot can no longer log in to its existing account. The predeploy backup and the homeserver's own backup keep them together.

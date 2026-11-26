# Plan: Matrix Messaging

## Status

Proposed. `@brains/chat` runs Discord and Slack on the Chat SDK, and no brain speaks Matrix.

What exists to build on:

- **An adapter.** Beeper publishes `@beeper/chat-adapter-matrix` (0.2.0, MIT, on `matrix-js-sdk` 41, `chat` ^4.17). It logs in as an ordinary Matrix user with an access token or a password, receives events over `/sync` rather than webhooks, maps a room to a channel and a threaded reply to a thread, and opens DMs with `openDM`. It has no cards, modals or native streaming, and it parses slash commands from plain text. It keeps its session and sync position in the Chat instance's state adapter through plain key-value calls, and takes a `createClient` hook that exposes the underlying `matrix-js-sdk` client. Its `inviteAutoJoin.inviterAllowlist` is an exact set of inviter user ids, fixed when the adapter is constructed.
- **A homeserver.** Tuwunel is a single-binary Rust homeserver on RocksDB, published as `ghcr.io/matrix-construct/tuwunel`. It delegates login to upstream OpenID Connect providers (`[[global.identity_provider]]`), derives the Matrix localpart from the claims named in `userid_claims`, takes configuration from a file and from `TUWUNEL_` environment variables, and makes online database backups (`[global.database.backup]`, `server backup-database`). It reads identity providers at startup, and a provider's `client_id` must never change.
- **A place to run it.** The Kamal template (`shared/deploy-support/src/kamal-deploy.yml`) already runs Ollama as an accessory beside the brain, reached at `http://__SERVICE_NAME__-models:11434`.
- **Prefix routes.** Plugins register `match: "prefix"` routes on the brain's webserver, as WebDAV does. The webserver's idle timeout is 255 seconds.
- **Channels and invitations.** The chat interface registers a channel descriptor per platform. Discord and Slack set `manualDelivery: true` and register no delivery provider. An invitation reaches a new person through the delivery provider of the recipient's channel type, and completing setup records `verified` evidence on that delivery claim (`targeted-setup-service.ts`). An Admin can attach a further claim to an existing person, recorded as verified by the Admin.
- **Identity claims.** `person_identity_claims` allows one active claim per identity key and any number of claims per person, of any registered channel type.

What was run, against Tuwunel 2.0.0 in Docker and Bun 1.4.0:

- **The adapter under Bun.** From source and bundled with `bun build`, the adapter logged in with a password, joined an invite, received a message and replied. Its state keys all begin with `matrix:` (`matrix:session:`, `matrix:device:`, `matrix:store:`).
- **Registration by token.** With `allow_registration = true` and a `registration_token`, a registration without the token or with a wrong one is refused, and one with the token creates the account. Sign-in through an identity provider creates accounts without the token.
- **A fixed Matrix id.** With `userid_claims = ["preferred_username"]`, the first sign-in created `@alice-one:localhost`. Two later sign-ins with the same subject and a changed `preferred_username` returned the same id and created no account.
- **Long-polling.** `/sync?timeout=30000` sends its response headers after 30.0 seconds. Kamal's proxy applies `response_timeout`, 30 seconds by default, to the wait for response headers (`ResponseHeaderTimeout` in kamal-proxy's `target.go`), so the default would cut it.

What is missing:

- **Durable adapter state.** `createChatSubscriptionStateAdapter` keeps only thread subscriptions in runtime state. Locks, cache, lists and queues stay in memory, so the Matrix adapter's session and sync position would be lost on restart.
- **OpenID Connect in auth-service.** The OAuth server issues access and refresh tokens only: no ID token, no `userinfo`, no `/.well-known/openid-configuration`. Its metadata still advertises the `openid` scope and `id_token_signing_alg_values_supported` (`shell/auth-service/src/auth-service.ts:404`), which promises clients an ID token the token endpoint never sends.
- **A trust-change message.** `agent_set_trust_level` in `entities/agent-discovery` is the only caller of auth-service's grant and revoke, and it emits nothing. auth-service has no message bus of its own.
- **A default recipient that a plugin can supply.** Notifications read a static `defaultRecipient` from configuration.
- **A homeserver in the backup.** The predeploy backup script copies fixed directories and understands SQLite only.

## Goal

A brain that installs the `matrix-server` plugin runs its own Matrix homeserver at its domain. Matrix becomes its default messaging platform. Its people sign in to that homeserver with their brain account. Every brain it trusts gets a dedicated room that the peer's brain joins over federation. A person who belongs to several brains keeps one Matrix identity, which each of those brains links as a claim.

## Decisions

- **Federation, one homeserver per brain.** A brain's Matrix server name is its domain, matching the identity rule that a brain's identity is its domain. Each brain authenticates only its own people. No brain creates or vouches for another brain's users, so decision 5 in [identity-and-trust.md](./identity-and-trust.md) holds unchanged.
- **Tuwunel as an accessory, not our own homeserver.** Federation, room state resolution, encryption key distribution, sync and media are a public attack surface that the integration does not need to own. The accessory runs a pinned image tag, mounts its database under `/opt/brain-matrix`, and is reached only from the brain container.
- **The homeserver's configuration is written at deploy time.** The deploy scaffold renders Tuwunel's configuration file: the server name, closed registration, and one identity provider pointing at the brain. Three secrets are generated once per brain and passed as Kamal secrets to both containers: the identity provider's client secret, a registration token, and the bot's password. The brain never writes homeserver configuration at runtime and never needs to restart the accessory.
- **The brain fronts all Matrix traffic.** `matrix-server` registers a public prefix route for `/_matrix` that forwards requests and streamed responses to the accessory, and serves `/.well-known/matrix/server` (`<domain>:443`) and `/.well-known/matrix/client` (`https://<domain>`). Kamal's proxy keeps serving only port 8080, with `response_timeout` raised to 120 seconds so a 30-second `/sync` is not cut.
- **The brain's bot is an ordinary account.** On first boot `matrix-server` registers `@brain:<domain>` with the registration token and the bot's password. There is no application service: creating rooms, inviting and setting server ACLs all work from an ordinary account.
- **Matrix in `@brains/chat` on Beeper's adapter.** `ChatPlatform` gains `matrix`, and the config gains `adapters.matrix` (`baseUrl`, `userId`, `password`), read through the chat env schema as `MATRIX_BASE_URL`, `MATRIX_USER_ID` and `MATRIX_PASSWORD`. The adapter logs in with the password and reuses its stored session afterward. The config check that requires Discord or Slack accepts Matrix as well. Without the plugin, an operator can point `adapters.matrix` at any homeserver.
- **Matrix adapter state is durable.** The chat state adapter keeps keys that begin with `matrix:` in a runtime-state namespace, so the session and sync position survive restarts. Other platforms' cache stays in memory.
- **Cards fall back to text on Matrix.** An approval card is posted as its fallback text, and typed yes/no resolves it. The confirmation coordinator already limits resolution to the requester or an administrator.
- **Matrix delivers on its own.** Unlike Discord and Slack, the `matrix` channel registers a delivery provider that opens a DM with `openDM` and posts the message. Invitations and notifications therefore reach a Matrix address without manual delivery. The descriptor's subject pattern is a full Matrix user id, `^@[a-z0-9._=/+-]+:[A-Za-z0-9.-]+(:[0-9]+)?$`.
- **Installing the plugin makes Matrix the default.** Notifications gain a default-recipient contract that a plugin can answer. `matrix-server` answers it with the Anchor's Matrix id. A `defaultRecipient` in configuration still wins. Discord and Slack stay available when configured.
- **People sign in with their brain account.** auth-service becomes an OpenID Connect provider: an ID token from the token endpoint when `openid` is in scope, a `userinfo` endpoint, and `/.well-known/openid-configuration`. `matrix-server` registers the homeserver with auth-service as a client with a fixed `client_id` and the deploy-time secret. The homeserver's only identity provider is the brain itself, and its people have no Matrix passwords.
- **The brain chooses the Matrix id.** auth-service reserves a unique `preferred_username` per person, set once and never changed, and the homeserver is configured with `userid_claims = ["preferred_username"]`. When the homeserver redeems a person's authorization code, the brain records `@<preferred_username>:<domain>` as a verified `matrix` claim on that person, with `provider` evidence.
- **One Matrix identity per person.** A brain adds someone who already has a Matrix id by inviting that address. The invitation arrives as a DM over federation, and completing setup records the `matrix` claim as verified. The brain never creates a second Matrix account for them. When a person already holds two Matrix ids, an Admin attaches the second to the same person. Brains deliver to the most recently verified one. Matrix cannot merge accounts or move history, so messages stay under the id that sent them.
- **A room per trusted peer.** `agent_set_trust_level` sends a peer-trust-changed message after a grant or a revoke. On a grant, `matrix-server` creates a room aliased by the peer's domain with dots as dashes (`#team-rizom-ai:<domain>`), sets its `m.room.server_acl` to allow only this server and the peer's, and invites `@brain:<peer domain>`. On a revoke, the plugin removes the peer's bot, drops the peer's server from the ACL, and keeps the room's history.
- **The interface decides which invites to accept.** The adapter's own auto-join stays off. Through the adapter's `createClient` hook, `@brains/chat` listens for invites on the underlying client and joins when the inviter is `@brain:<domain>` and auth-service holds `trusted` peer trust for that domain at that moment. A peer trusted after startup is honored without a restart.
- **The homeserver is in the predeploy backup.** Tuwunel's `database.backup.path` points inside `/opt/brain-matrix`. The predeploy backup script triggers `server backup-database`, waits for it, and copies that backup directory with the other roots.
- **Unencrypted rooms first.** Brain-created rooms and the bot's DMs start unencrypted. Encryption needs the adapter's crypto store to survive restarts. It is not used until that is shown.
- **The test app runs the homeserver in Docker.** A `matrix` test app's `.env` names the pinned Tuwunel image and the three secrets. When `matrix-server` is configured outside a Kamal deploy, the plugin starts and stops that container itself with the same rendered configuration. The canonical start script stays unchanged.

## Pull requests

Two PRs. Each step is one commit, with its tests written first. Each PR carries its own changeset for `@rizom/brain`.

### 1. OpenID Connect in auth-service

1. **ID token, `userinfo` and discovery.**
   - Tests: an authorization code with `openid` yields an ID token signed with the brain's ES256 key. `userinfo` returns the same subject, and the discovery document lists only what the server issues.
   - Tests: without `openid` in scope, no ID token is issued.
2. **A stable `preferred_username`.**
   - Tests: a person's `preferred_username` is unique, appears in the ID token and `userinfo`, and stays the same after a display-name change.

### 2. Matrix messaging

1. **Matrix in `@brains/chat`.** The `matrix` platform on `@beeper/chat-adapter-matrix`, `adapters.matrix` and its env schema, durable adapter state, the channel descriptor, the delivery provider, text fallback for cards, and the adapter on `RestartingListenerSupervisor`.
   - Tests: an inbound DM routes a turn, and the reply reaches the sender's room.
   - Tests: after a restart the adapter resumes from its stored session and sync position without logging in again.
   - Tests: an approval card is posted as text, and a typed "yes" from the requester resolves it.
   - Tests: an invitation to a `matrix:` recipient is sent as a DM. Completing setup records the claim as verified.
   - Live: the test app, pointed at a local Tuwunel with a hand-made bot account, answers a DM from Element.
2. **The `matrix-server` plugin.** The accessory, its rendered configuration and the three secrets in the deploy scaffold, the local container for test apps, the `/_matrix` forwarding route, the well-known documents, the bot's registration, and `response_timeout: 120` on the Kamal proxy.
   - Tests: `/_matrix/client/versions` reaches the homeserver through the brain, including a streamed `/sync`.
   - Tests: first boot registers the bot, and a second boot does not register again.
   - Live: a federation tester resolves a deployed brain's domain to its homeserver.
3. **Sign-in with the brain account.** The homeserver's client registration in auth-service and the claim recorded at code redemption.
   - Tests: the homeserver's code redemption records a verified `matrix` claim. A second sign-in records nothing new.
   - Live: a brain user signs in to Element with a passkey and lands as `@<preferred_username>:<domain>`.
4. **Matrix as the default.** The default-recipient contract in notifications, answered by `matrix-server`.
   - Tests: with the plugin installed and no `defaultRecipient` configured, a notification goes by DM to the Anchor's Matrix id. A configured `defaultRecipient` still wins.
5. **Rooms for trusted peers.** The peer-trust-changed message, the room lifecycle, and invite handling in the interface.
   - Tests: granting `trusted` creates the room with the server ACL and invites the peer's bot. Revoking removes the bot and narrows the ACL.
   - Tests: the interface joins an invite from the bot of a domain trusted at that moment, and ignores one from an untrusted domain or from a non-bot user of a trusted domain.
   - Live: two deployed brains trust each other and exchange messages in the host's room. Federation needs real domains with valid certificates, so this does not run between local test apps.
6. **Backup.** The online backup in the predeploy script.
   - Tests: the predeploy backup contains a homeserver backup newer than the script's start.
   - Live: a homeserver restored from a predeploy backup serves its rooms.
7. **Docs.** A Matrix section in `docs/interface-setup.md` covering the accessory, the domain and well-known setup, sign-in, inviting people by Matrix id, a second Matrix id, peer rooms and the unencrypted start.

Exit: two deployed brains each run `matrix-server`, their people sign in with passkeys, each brain invites the other's person by their existing Matrix id, the trusted peer's brain talks in its dedicated room, and a predeploy backup restores the homeserver.

## Risks

- **Federation is open by default.** Server ACLs restrict brain-created rooms only. Rooms that people create themselves federate with any server, as on any Matrix homeserver.
- **A young adapter.** 0.2.0 has a single maintainer organization. The dependency is pinned exactly, and the adapter stays behind `adapters.matrix`.

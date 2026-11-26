# Plan: Matrix Messaging

## Status

In progress. The brain side is built:

- auth-service is an OpenID Connect provider with a fixed `preferred_username` per person (#1051). A provisioned OAuth client can declare the identity its sign-ins prove, which the brain then records as a verified claim.
- `@brains/chat` talks Matrix on `@beeper/chat-adapter-matrix` 0.2.0, held there by the lockfile and a version-keyed patch (`patches/README.md`). The patch adds `isDM`, records direct invites in `m.direct`, and adds an `inviteAutoJoin.accept` hook. The `matrix` channel delivers straight to the homeserver.
- The `matrix-server` plugin and the `matrix` bundle front a Tuwunel homeserver at the brain's domain, with forwarding, the well-known documents, the `@_brain` bot and the `matrix-homeserver` client. The plugin keeps a room for each trusted peer, opened and closed by `a2a:peer-trust-changed`.
- The `matrix` test app runs it all beside a local homeserver from `plugins/matrix-server/scripts/local-homeserver.ts`.

All of this was verified against Tuwunel 2.0.0 locally. What remains is running the homeserver in a deploy, backing it up, a default recipient chosen without configuration, and the checks a local machine cannot make.

## Remaining work

### Deploying the homeserver

- **The accessory.** The Kamal template gains a Tuwunel accessory when brain.yaml's bundles include `matrix`. It runs a pinned image tag and mounts `/opt/brain-matrix` for its database and configuration. The brain reaches it at `http://__SERVICE_NAME__-matrix:8008`, and Kamal's proxy gets `response_timeout: 120`, because the default 30 seconds cuts a 30-second `/sync` before its headers.
- **The brain's environment.** The template sets `MATRIX_SERVER_NAME` and `MATRIX_USER_ID` (`@_brain:<domain>`) from the brain's domain. It points `MATRIX_HOMESERVER_URL` and `MATRIX_BASE_URL` at the accessory. `MATRIX_PASSWORD`, `MATRIX_REGISTRATION_TOKEN` and `MATRIX_OIDC_CLIENT_SECRET` are deploy secrets, generated once per brain.
- **The configuration on the server.** Tuwunel reads its identity provider at start, so `tuwunel.toml` has to be on the server before the accessory first boots. The pre-deploy hook renders it with `renderHomeserverConfig` from the secrets and copies it to `/opt/brain-matrix`, as it copies brain.yaml to `/opt/brain.yaml`. The stale-template check learns the new blocks, as it did the model runtime's.

### Backing it up

Tuwunel's online backup writes to `/opt/brain-matrix/backup` (`[global.database.backup]`, already in the rendered configuration). The predeploy backup script triggers `server backup-database`, waits for it, and copies that directory with the other roots. Tests: a predeploy backup holds a homeserver backup newer than the script's start. Live: a homeserver restored from it serves its rooms.

### A default recipient without configuration

Notifications accept a `matrix` recipient, and an operator can set `defaultRecipient` to their Matrix id. Defaulting to the Anchor's Matrix id without configuration would mean a plugin reading a person's identity claim or username from auth, which the identity rules keep private. It waits for that decision.

### Checks a local machine cannot make

- **Federation between two brains.** The peer room's lifecycle is covered against a fake homeserver. Two deployed brains trusting each other and talking in the host's room is the live check, since federation needs real domains with valid certificates.
- **Sign-in with a passkey.** The homeserver's sign-in redirect reaches the brain's `/authorize`, which knows the client. Completing it needs a person's passkey in a browser.

## Risks

- **Federation is open by default.** Server ACLs restrict brain-created rooms only. Rooms that people create themselves federate with any server, as on any Matrix homeserver.
- **A young adapter.** 0.2.0 has a single maintainer organization, and the brain carries a patch for it. An upgrade must rebase or drop the patch and keep the direct-message tests and a live direct message passing.
- **The Chat SDK core is held at 4.41.1.** A root override keeps the Matrix adapter's looser range from lifting `chat` past the other adapters. Upgrading the Chat SDK means moving the override with them.

---
"@brains/chat": patch
"@brains/matrix-server": patch
"@brains/notifications": patch
"@brains/contracts": patch
"@brains/auth-service": patch
"@brains/agent-discovery": patch
"@brains/sdk": patch
"@rizom/brain": patch
---

A brain can talk on Matrix. The chat interface gains a `matrix` platform on Beeper's Chat SDK adapter, configured by `MATRIX_BASE_URL`, `MATRIX_USER_ID` and `MATRIX_PASSWORD`; it answers direct messages, posts approvals as text, and delivers invitations and notifications to a Matrix user by DM. The new `matrix` bundle adds the `matrix-server` plugin, which fronts a Tuwunel homeserver at the brain's own domain: it forwards `/_matrix`, serves the Matrix well-known documents, registers the brain's bot, and lets people sign in to the homeserver with their brain account, which records their Matrix id as theirs. Each peer brain trusted at `trusted` gets a room open only to the two servers, and the bot joins a room only when a trusted peer's bot invites it. A provisioned OAuth client can declare the identity its sign-ins prove, a notification recipient can be a Matrix user, and `a2a:peer-trust-changed` is broadcast when a peer's trust changes.

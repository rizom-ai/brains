# @brains/matrix-server

## 0.2.0-alpha.776

### Patch Changes

- [#1053](https://github.com/rizom-ai/brains/pull/1053) [`fab1f73`](https://github.com/rizom-ai/brains/commit/fab1f73985b8fc7f63f332f252d233b20c5f4be5) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A brain can talk on Matrix. The chat interface gains a `matrix` platform on Beeper's Chat SDK adapter, configured by `MATRIX_BASE_URL`, `MATRIX_USER_ID` and `MATRIX_PASSWORD`; it answers direct messages, posts approvals as text, and delivers invitations and notifications to a Matrix user by DM. The new `matrix` bundle adds the `matrix-server` plugin, which fronts a Tuwunel homeserver at the brain's own domain: it forwards `/_matrix`, serves the Matrix well-known documents, registers the brain's bot, and lets people sign in to the homeserver with their brain account, which records their Matrix id as theirs. Each peer brain trusted at `trusted` gets a room open only to the two servers, and the bot joins a room only when a trusted peer's bot invites it. A provisioned OAuth client can declare the identity its sign-ins prove, a notification recipient can be a Matrix user, and `a2a:peer-trust-changed` is broadcast when a peer's trust changes.
- Updated dependencies [[`fab1f73`](https://github.com/rizom-ai/brains/commit/fab1f73985b8fc7f63f332f252d233b20c5f4be5)]:
  - @brains/contracts@0.2.0-alpha.776
  - @brains/sdk@0.2.0-alpha.776
  - @brains/utils@0.2.0-alpha.776

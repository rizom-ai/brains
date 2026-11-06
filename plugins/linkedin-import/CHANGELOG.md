# @brains/linkedin-import

## 0.2.0-alpha.633

### Patch Changes

- [#828](https://github.com/rizom-ai/brains/pull/828) [`a449334`](https://github.com/rizom-ai/brains/commit/a449334d9d2fd31f95a161444008e3ab5b959891) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A new opt-in `oauth-broker` plugin lets brains connect LinkedIn without their own LinkedIn app. One central brain holds the shared app and its single callback; each instance brain configures `plugins.linkedin-import.broker` (`url`, `instanceId`, `secret`, `returnUri` ending at `/linkedin/oauth/broker/return`) in place of `oauth`. Connecting starts at the broker, LinkedIn returns to the broker, and the broker sends the owner back with a two-minute, single-use grant that only that instance can redeem for the token. Each instance may start ten connections per ten minutes.
- Updated dependencies [[`a449334`](https://github.com/rizom-ai/brains/commit/a449334d9d2fd31f95a161444008e3ab5b959891)]:
  - @brains/contracts@0.2.0-alpha.633
  - @brains/utils@0.2.0-alpha.633
  - @brains/plugins@0.2.0-alpha.633

## 0.2.0-alpha.632

### Patch Changes

- [#827](https://github.com/rizom-ai/brains/pull/827) [`61b8521`](https://github.com/rizom-ai/brains/commit/61b85210dfa16fe0b0c5c59d3efcceeff0f00578) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A new opt-in `linkedin-import` plugin fills the owner's profile from LinkedIn. Add it with `add: [linkedin-import]` and the instance's LinkedIn app under `plugins.linkedin-import.oauth` (`clientId`, `clientSecret`, `redirectUri` ending at `/linkedin/oauth/callback`). The Anchor gets a LinkedIn workspace in Studio: Connect LinkedIn runs LinkedIn's consent flow and keeps the token in the Anchor's account settings, then the workspace shows each profile field next to LinkedIn's value. Empty fields and placeholders are filled, values the owner wrote are kept. Importing asks for confirmation and refuses when the profile changed since the preview. An Inspect LinkedIn data shapes action returns a redacted summary of the skills, positions, education and certifications domains, for writing their import fixtures.
- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.632
  - @brains/plugins@0.2.0-alpha.632

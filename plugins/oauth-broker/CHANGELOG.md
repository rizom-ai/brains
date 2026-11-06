# @brains/oauth-broker

## 0.2.0-alpha.634

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.634
  - @brains/utils@0.2.0-alpha.634
  - @brains/plugins@0.2.0-alpha.634

## 0.2.0-alpha.633

### Patch Changes

- [#828](https://github.com/rizom-ai/brains/pull/828) [`a449334`](https://github.com/rizom-ai/brains/commit/a449334d9d2fd31f95a161444008e3ab5b959891) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A new opt-in `oauth-broker` plugin lets brains connect LinkedIn without their own LinkedIn app. One central brain holds the shared app and its single callback; each instance brain configures `plugins.linkedin-import.broker` (`url`, `instanceId`, `secret`, `returnUri` ending at `/linkedin/oauth/broker/return`) in place of `oauth`. Connecting starts at the broker, LinkedIn returns to the broker, and the broker sends the owner back with a two-minute, single-use grant that only that instance can redeem for the token. Each instance may start ten connections per ten minutes.
- Updated dependencies [[`a449334`](https://github.com/rizom-ai/brains/commit/a449334d9d2fd31f95a161444008e3ab5b959891)]:
  - @brains/contracts@0.2.0-alpha.633
  - @brains/utils@0.2.0-alpha.633
  - @brains/plugins@0.2.0-alpha.633

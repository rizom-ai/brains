# @brains/email-triage

## 0.2.0-alpha.251

### Patch Changes

- Updated dependencies [[`ca41276`](https://github.com/rizom-ai/brains/commit/ca412762e73ca8391d8a77a6c08b20c63b30848e)]:
  - @brains/plugins@0.2.0-alpha.251
  - @brains/dashboard@0.2.0-alpha.251
  - @brains/contracts@0.2.0-alpha.251
  - @brains/utils@0.2.0-alpha.251

## 0.2.0-alpha.250

### Patch Changes

- [#79](https://github.com/rizom-ai/brains/pull/79) [`246dcb8`](https://github.com/rizom-ai/brains/commit/246dcb8fe1f8abede1acf7fd00e5c946f9d22e3c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Move editable email-classification guidance from plugin configuration to the standard `email-triage:classification` prompt entity while keeping privacy and schema invariants code-owned.

- Updated dependencies []:
  - @brains/dashboard@0.2.0-alpha.250
  - @brains/contracts@0.2.0-alpha.250
  - @brains/utils@0.2.0-alpha.250
  - @brains/plugins@0.2.0-alpha.250

## 0.2.0-alpha.249

### Minor Changes

- [#77](https://github.com/rizom-ai/brains/pull/77) [`84dca8c`](https://github.com/rizom-ai/brains/commit/84dca8c9ddf83fcf01784f54da479e2229eba09c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add the shared inbound-email source reference contract and the opt-in email-triage capability. Meaningful inbound mail is conservatively filtered, classified into a restricted derived mail item, persisted before acknowledgement, and retried with a safe unclassified fallback without copying mailbox content into Brain storage or logs. Admins can review the derived queue through a typed CMS workspace, a combined-filter tool, status actions, and a compact dashboard contribution.

### Patch Changes

- Updated dependencies [[`84dca8c`](https://github.com/rizom-ai/brains/commit/84dca8c9ddf83fcf01784f54da479e2229eba09c)]:
  - @brains/contracts@0.2.0-alpha.249
  - @brains/plugins@0.2.0-alpha.249
  - @brains/dashboard@0.2.0-alpha.249
  - @brains/utils@0.2.0-alpha.249

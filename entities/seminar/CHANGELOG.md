# @brains/seminar

## 0.2.0-alpha.781

### Patch Changes

- [#1060](https://github.com/rizom-ai/brains/pull/1060) [`b1b08de`](https://github.com/rizom-ai/brains/commit/b1b08de76f5779cbb32b6f0d0e5e5f20a798f7ab) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A brain can hold a seminar: with the `seminar` capability added, the owner's `seminar_hold` tool puts one question to every approved peer at once, the chair (the brain itself) reads their openings and decides whose stands, the others are asked to answer him from a work of their own, he answers them, and the chair closes with where they meet. Every peer's turn is kept verbatim, with the sources it returned, and every follow-up as the chair wrote it, as a draft `seminar`. Nobody edits a seminar: the owner reads it, redoes a draft from the chair's turn or from the closing (`seminar_hold` with `seminar` and `from`), and publishes it. A peer that does not answer is recorded with the reason. `plugins.seminar.guidance` tells the chair what it should know of its peers, such as the works a peer's brain does not hold. A site reads seminars through the `seminar:entities` data source. Turns reach peers through a new A2A turn contract, which sends the message as written, carries up to 32,000 characters and has its own budget, `turnTimeoutMs` (90 seconds by default).
- Updated dependencies [[`b1b08de`](https://github.com/rizom-ai/brains/commit/b1b08de76f5779cbb32b6f0d0e5e5f20a798f7ab)]:
  - @brains/contracts@0.2.0-alpha.781
  - @brains/content-formatters@0.2.0-alpha.781
  - @brains/sdk@0.2.0-alpha.781
  - @brains/utils@0.2.0-alpha.781

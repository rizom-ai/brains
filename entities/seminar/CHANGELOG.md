# @brains/seminar

## 0.2.0-alpha.790

### Patch Changes

- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.790
  - @rizom/brain-ui@0.2.0-alpha.790
  - @brains/content-formatters@0.2.0-alpha.790
  - @brains/contracts@0.2.0-alpha.790
  - @brains/site-atlas@0.2.0-alpha.790
  - @brains/utils@0.2.0-alpha.790

## 0.2.0-alpha.789

### Patch Changes

- Updated dependencies [[`a5be1aa`](https://github.com/rizom-ai/brains/commit/a5be1aa11f9f800c98551ee091ac3ef6fb397158)]:
  - @brains/contracts@0.2.0-alpha.789
  - @brains/sdk@0.2.0-alpha.789
  - @brains/site-atlas@0.2.0-alpha.789
  - @rizom/brain-ui@0.2.0-alpha.789
  - @brains/content-formatters@0.2.0-alpha.789
  - @brains/utils@0.2.0-alpha.789

## 0.2.0-alpha.788

### Patch Changes

- [#1068](https://github.com/rizom-ai/brains/pull/1068) [`18e53a6`](https://github.com/rizom-ai/brains/commit/18e53a639047a5ebdbabdc9874c79e9743ba3ff3) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A seminar has its pages. `seminar:seminar-list` lists the seminars a brain has held, newest first, each with its question, the day, who stood and who answered him, and the first sentence of where they meet. `seminar:seminar-detail` sets one seminar to be read top to bottom: the openings side by side, the chair's turn, the challenges, the rejoinder and the closing, with every source a turn returned linked where its text names it. `plugins.seminar.peers` names the brain's peers and orders them, as its pages show them and as the chair writes of them. `seminar:ask` is the Ask page of such a brain: the guest box while asking is open, and whom a question reaches.
- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.788
  - @rizom/brain-ui@0.2.0-alpha.788
  - @brains/content-formatters@0.2.0-alpha.788
  - @brains/contracts@0.2.0-alpha.788
  - @brains/site-atlas@0.2.0-alpha.788
  - @brains/utils@0.2.0-alpha.788

## 0.2.0-alpha.787

### Patch Changes

- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.787
  - @brains/content-formatters@0.2.0-alpha.787
  - @brains/contracts@0.2.0-alpha.787
  - @brains/utils@0.2.0-alpha.787

## 0.2.0-alpha.786

### Patch Changes

- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.786
  - @brains/content-formatters@0.2.0-alpha.786
  - @brains/contracts@0.2.0-alpha.786
  - @brains/utils@0.2.0-alpha.786

## 0.2.0-alpha.785

### Patch Changes

- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.785
  - @brains/content-formatters@0.2.0-alpha.785
  - @brains/contracts@0.2.0-alpha.785
  - @brains/utils@0.2.0-alpha.785

## 0.2.0-alpha.784

### Patch Changes

- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.784
  - @brains/content-formatters@0.2.0-alpha.784
  - @brains/contracts@0.2.0-alpha.784
  - @brains/utils@0.2.0-alpha.784

## 0.2.0-alpha.783

### Patch Changes

- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.783
  - @brains/content-formatters@0.2.0-alpha.783
  - @brains/contracts@0.2.0-alpha.783
  - @brains/utils@0.2.0-alpha.783

## 0.2.0-alpha.782

### Patch Changes

- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.782
  - @brains/content-formatters@0.2.0-alpha.782
  - @brains/contracts@0.2.0-alpha.782
  - @brains/utils@0.2.0-alpha.782

## 0.2.0-alpha.781

### Patch Changes

- [#1060](https://github.com/rizom-ai/brains/pull/1060) [`b1b08de`](https://github.com/rizom-ai/brains/commit/b1b08de76f5779cbb32b6f0d0e5e5f20a798f7ab) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A brain can hold a seminar: with the `seminar` capability added, the owner's `seminar_hold` tool puts one question to every approved peer at once, the chair (the brain itself) reads their openings and decides whose stands, the others are asked to answer him from a work of their own, he answers them, and the chair closes with where they meet. Every peer's turn is kept verbatim, with the sources it returned, and every follow-up as the chair wrote it, as a draft `seminar`. Nobody edits a seminar: the owner reads it, redoes a draft from the chair's turn or from the closing (`seminar_hold` with `seminar` and `from`), and publishes it. A peer that does not answer is recorded with the reason. `plugins.seminar.guidance` tells the chair what it should know of its peers, such as the works a peer's brain does not hold. A site reads seminars through the `seminar:entities` data source. Turns reach peers through a new A2A turn contract, which sends the message as written, carries up to 32,000 characters and has its own budget, `turnTimeoutMs` (90 seconds by default).
- Updated dependencies [[`b1b08de`](https://github.com/rizom-ai/brains/commit/b1b08de76f5779cbb32b6f0d0e5e5f20a798f7ab)]:
  - @brains/contracts@0.2.0-alpha.781
  - @brains/content-formatters@0.2.0-alpha.781
  - @brains/sdk@0.2.0-alpha.781
  - @brains/utils@0.2.0-alpha.781

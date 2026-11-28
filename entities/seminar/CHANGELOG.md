# @brains/seminar

## 0.2.0-alpha.807

### Patch Changes

- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.807
  - @rizom/brain-ui@0.2.0-alpha.807
  - @brains/content-formatters@0.2.0-alpha.807
  - @brains/contracts@0.2.0-alpha.807
  - @brains/site-atlas@0.2.0-alpha.807
  - @brains/utils@0.2.0-alpha.807

## 0.2.0-alpha.806

### Patch Changes

- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.806
  - @brains/site-atlas@0.2.0-alpha.806
  - @rizom/brain-ui@0.2.0-alpha.806
  - @brains/content-formatters@0.2.0-alpha.806
  - @brains/contracts@0.2.0-alpha.806
  - @brains/utils@0.2.0-alpha.806

## 0.2.0-alpha.805

### Patch Changes

- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.805
  - @rizom/brain-ui@0.2.0-alpha.805
  - @brains/content-formatters@0.2.0-alpha.805
  - @brains/contracts@0.2.0-alpha.805
  - @brains/site-atlas@0.2.0-alpha.805
  - @brains/utils@0.2.0-alpha.805

## 0.2.0-alpha.804

### Patch Changes

- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.804
  - @rizom/brain-ui@0.2.0-alpha.804
  - @brains/content-formatters@0.2.0-alpha.804
  - @brains/contracts@0.2.0-alpha.804
  - @brains/site-atlas@0.2.0-alpha.804
  - @brains/utils@0.2.0-alpha.804

## 0.2.0-alpha.803

### Patch Changes

- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.803
  - @rizom/brain-ui@0.2.0-alpha.803
  - @brains/content-formatters@0.2.0-alpha.803
  - @brains/contracts@0.2.0-alpha.803
  - @brains/site-atlas@0.2.0-alpha.803
  - @brains/utils@0.2.0-alpha.803

## 0.2.0-alpha.802

### Patch Changes

- [#1088](https://github.com/rizom-ai/brains/pull/1088) [`49c9689`](https://github.com/rizom-ai/brains/commit/49c9689db3ade60a14c1a37e17a6ef2ce23768ec) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A brain that holds seminars shows its notes on its site. The note type has no pages of its own, so the seminar capability brings them: `/notes` lists every public note by title under its opening sentence, and `/notes/<id>` shows a note as written, its quotes and links kept. Brains without the seminar capability are unchanged.
- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.802
  - @rizom/brain-ui@0.2.0-alpha.802
  - @brains/content-formatters@0.2.0-alpha.802
  - @brains/contracts@0.2.0-alpha.802
  - @brains/site-atlas@0.2.0-alpha.802
  - @brains/utils@0.2.0-alpha.802

## 0.2.0-alpha.801

### Patch Changes

- Updated dependencies [[`5e2c373`](https://github.com/rizom-ai/brains/commit/5e2c3736ff82b900ecfb6f689fe067b94cb4766c)]:
  - @brains/contracts@0.2.0-alpha.801
  - @brains/sdk@0.2.0-alpha.801
  - @rizom/brain-ui@0.2.0-alpha.801
  - @brains/content-formatters@0.2.0-alpha.801
  - @brains/site-atlas@0.2.0-alpha.801
  - @brains/utils@0.2.0-alpha.801

## 0.2.0-alpha.800

### Patch Changes

- [#1081](https://github.com/rizom-ai/brains/pull/1081) [`4d0bbff`](https://github.com/rizom-ai/brains/commit/4d0bbffe63ac05f5dcc25d2b9fbb5c0c59e9e2bb) Thanks [@yeehaa123](https://github.com/yeehaa123)! - An owner can show a peer under a name of their own. An agent in the directory takes an optional `shownAs`; where it is set, `network_ask` attributes the peer's answer and sources to that name, and a seminar is held and stored under it, so a brain that reads with Karl's brain can call him Marx in chat, in its seminars and on its pages alike. A card refresh and a reconnect keep the name, and a reconnect now keeps the owner's notes too. `plugins.seminar.peers` no longer carries names: it is the list of agent ids that orders the peers on the brain's pages.
- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.800
  - @rizom/brain-ui@0.2.0-alpha.800
  - @brains/content-formatters@0.2.0-alpha.800
  - @brains/contracts@0.2.0-alpha.800
  - @brains/site-atlas@0.2.0-alpha.800
  - @brains/utils@0.2.0-alpha.800

## 0.2.0-alpha.799

### Patch Changes

- [#1080](https://github.com/rizom-ai/brains/pull/1080) [`9eefbe6`](https://github.com/rizom-ai/brains/commit/9eefbe6f5cda5493d8eb00f8967630b6ff6554a7) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A brain that holds seminars answers a live question as a seminar would. Its instructions tell it to put a question about its peers' ideas or texts to them, to give each peer's answer under his name without merging them into one voice, to add no quotation or citation a peer did not give, to say so when a peer had nothing, and to close with where they meet and where they part. The rules come with the seminar capability, so no brain has to carry them in its character.
- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.799
  - @rizom/brain-ui@0.2.0-alpha.799
  - @brains/content-formatters@0.2.0-alpha.799
  - @brains/contracts@0.2.0-alpha.799
  - @brains/site-atlas@0.2.0-alpha.799
  - @brains/utils@0.2.0-alpha.799

## 0.2.0-alpha.798

### Patch Changes

- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.798
  - @rizom/brain-ui@0.2.0-alpha.798
  - @brains/content-formatters@0.2.0-alpha.798
  - @brains/contracts@0.2.0-alpha.798
  - @brains/site-atlas@0.2.0-alpha.798
  - @brains/utils@0.2.0-alpha.798

## 0.2.0-alpha.797

### Patch Changes

- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.797
  - @rizom/brain-ui@0.2.0-alpha.797
  - @brains/content-formatters@0.2.0-alpha.797
  - @brains/contracts@0.2.0-alpha.797
  - @brains/site-atlas@0.2.0-alpha.797
  - @brains/utils@0.2.0-alpha.797

## 0.2.0-alpha.796

### Patch Changes

- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.796
  - @brains/site-atlas@0.2.0-alpha.796
  - @rizom/brain-ui@0.2.0-alpha.796
  - @brains/content-formatters@0.2.0-alpha.796
  - @brains/contracts@0.2.0-alpha.796
  - @brains/utils@0.2.0-alpha.796

## 0.2.0-alpha.795

### Patch Changes

- Updated dependencies [[`fd4b85e`](https://github.com/rizom-ai/brains/commit/fd4b85e54f30fdfdfb84a8485d23c0d95dc480c9)]:
  - @brains/sdk@0.2.0-alpha.795
  - @brains/site-atlas@0.2.0-alpha.795
  - @rizom/brain-ui@0.2.0-alpha.795
  - @brains/content-formatters@0.2.0-alpha.795
  - @brains/contracts@0.2.0-alpha.795
  - @brains/utils@0.2.0-alpha.795

## 0.2.0-alpha.794

### Patch Changes

- Updated dependencies [[`6cf28c6`](https://github.com/rizom-ai/brains/commit/6cf28c6fe5e38b4569b4ff0dc9b328cff20c0205)]:
  - @brains/contracts@0.2.0-alpha.794
  - @brains/sdk@0.2.0-alpha.794
  - @rizom/brain-ui@0.2.0-alpha.794
  - @brains/content-formatters@0.2.0-alpha.794
  - @brains/site-atlas@0.2.0-alpha.794
  - @brains/utils@0.2.0-alpha.794

## 0.2.0-alpha.793

### Patch Changes

- [#1074](https://github.com/rizom-ai/brains/pull/1074) [`5d5e590`](https://github.com/rizom-ai/brains/commit/5d5e5900e3b912b63fa3419c9da25b1d86529cff) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The chair of a seminar reads the brain's own notes on the question before it decides who stands. It is given the public notes nearest the question, at most three, as its own background: it judges the openings and writes its follow-ups with them, and puts none of their passages to a participant as his. A seminar is held without them when the notes cannot be read.
- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.793
  - @rizom/brain-ui@0.2.0-alpha.793
  - @brains/content-formatters@0.2.0-alpha.793
  - @brains/contracts@0.2.0-alpha.793
  - @brains/site-atlas@0.2.0-alpha.793
  - @brains/utils@0.2.0-alpha.793

## 0.2.0-alpha.792

### Patch Changes

- Updated dependencies [[`a52afd8`](https://github.com/rizom-ai/brains/commit/a52afd851a87a7333c51dfec485d59136dbf418e)]:
  - @brains/contracts@0.2.0-alpha.792
  - @brains/sdk@0.2.0-alpha.792
  - @rizom/brain-ui@0.2.0-alpha.792
  - @brains/content-formatters@0.2.0-alpha.792
  - @brains/site-atlas@0.2.0-alpha.792
  - @brains/utils@0.2.0-alpha.792

## 0.2.0-alpha.791

### Patch Changes

- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.791
  - @rizom/brain-ui@0.2.0-alpha.791
  - @brains/content-formatters@0.2.0-alpha.791
  - @brains/contracts@0.2.0-alpha.791
  - @brains/site-atlas@0.2.0-alpha.791
  - @brains/utils@0.2.0-alpha.791

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

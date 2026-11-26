# @brains/reference

## 0.2.0-alpha.773

### Patch Changes

- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.773
  - @rizom/brain-ui@0.2.0-alpha.773
  - @brains/atproto-client@0.2.0-alpha.773
  - @brains/contracts@0.2.0-alpha.773
  - @brains/utils@0.2.0-alpha.773

## 0.2.0-alpha.772

### Patch Changes

- Updated dependencies [[`08e8ee5`](https://github.com/rizom-ai/brains/commit/08e8ee536d674ee23a1abb5fd0d0a8205a12a3d4), [`74901a1`](https://github.com/rizom-ai/brains/commit/74901a1e43935e5e64ecaab090c0824689bf0631)]:
  - @brains/contracts@0.2.0-alpha.772
  - @brains/sdk@0.2.0-alpha.772
  - @rizom/brain-ui@0.2.0-alpha.772
  - @brains/atproto-client@0.2.0-alpha.772
  - @brains/utils@0.2.0-alpha.772

## 0.2.0-alpha.771

### Patch Changes

- [#1046](https://github.com/rizom-ai/brains/pull/1046) [`467ecd3`](https://github.com/rizom-ai/brains/commit/467ecd37abf6121b3ef0f2b2095426f9158c2ed7) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Docs, guides, newsletter issues and books publish AT Protocol records, each under its own lexicon: `ai.rizom.brain.doc`, `ai.rizom.brain.guide`, `ai.rizom.brain.newsletter` and `ai.rizom.brain.book`. Docs, guides and sent newsletter issues carry their text; a book's record says what the book is and carries none of its text. The four lexicons enter the registry as drafts. A reference can point to any of the four.
- Updated dependencies []:
  - @brains/atproto-client@0.2.0-alpha.771
  - @brains/sdk@0.2.0-alpha.771
  - @rizom/brain-ui@0.2.0-alpha.771
  - @brains/contracts@0.2.0-alpha.771
  - @brains/utils@0.2.0-alpha.771

## 0.2.0-alpha.770

### Patch Changes

- [#1044](https://github.com/rizom-ai/brains/pull/1044) [`d0330b2`](https://github.com/rizom-ai/brains/commit/d0330b229ba3f9ca20c81a538d67d0e05550d741) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A brain can point to what another brain publishes. A `reference` is created from the address of an entity on its author's brain: the capture finds the author's AT Protocol repo, reads the record for that address, takes the byline from the author's brain card, and writes a draft holding the display fields and where the entity lives. The record's body is never stored. Publishing the draft is the choice to feature it.

  Every day each reference is checked against its record. A changed record updates the entry's fields and byline in place; a record that is gone marks the entry withdrawn and asks for one site rebuild; a record that returns makes it active again. A failure to reach the author changes nothing. A request a PDS refuses now fails with its status and error code (`AtprotoRequestError`).

  A site shows the selection with the `references:list` section on the `references:entities` data source: each entry's series, author and date, its title and the author's own summary, linking to the entity on its author's site, newest first. A production build shows only published entries whose source is active; a preview also shows drafts; a withdrawn entry appears in neither.

  A reference can point to a post, a deck, a project or a series. A post shows its series as its kicker; the others show what they are.

  References are part of the `federation` bundle, which now covers both directions: a brain publishes itself and points to what other brains publish. The lexicon registry (`atproto-registry`) leaves the bundle; the brain that is the lexicon authority adds it with `add: [atproto-registry]`.

  A reference is stored as a YAML file. An author's entries are also withdrawn when their PDS or the PLC directory reports the account itself deleted, deactivated, taken down or suspended; a timeout or a server error still changes nothing.

  A reference links to the piece on its author's own brain, wherever it first appeared. A post record now carries `pageUrl`, its page on the author's brain, beside `canonicalUrl`; a curator can give either address.

  Links, notes, topics and social posts that have a page on their author's site can be referenced too.

- Updated dependencies [[`2c7ccfd`](https://github.com/rizom-ai/brains/commit/2c7ccfddef74cab5c2b9ab408c336ea5688f1e7e), [`d0330b2`](https://github.com/rizom-ai/brains/commit/d0330b229ba3f9ca20c81a538d67d0e05550d741)]:
  - @brains/atproto-client@0.2.0-alpha.770
  - @brains/sdk@0.2.0-alpha.770
  - @rizom/brain-ui@0.2.0-alpha.770
  - @brains/contracts@0.2.0-alpha.770
  - @brains/utils@0.2.0-alpha.770

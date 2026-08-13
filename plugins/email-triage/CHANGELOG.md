# @brains/email-triage

## 0.2.0-alpha.286

### Patch Changes

- Updated dependencies [[`b7cda6c`](https://github.com/rizom-ai/brains/commit/b7cda6cd64c1a7400b16bf4faacb36d0244c58f9)]:
  - @brains/plugins@0.2.0-alpha.286
  - @brains/contracts@0.2.0-alpha.286
  - @brains/ui-library@0.2.0-alpha.286
  - @brains/utils@0.2.0-alpha.286

## 0.2.0-alpha.285

### Patch Changes

- Updated dependencies [[`c41168e`](https://github.com/rizom-ai/brains/commit/c41168ea6058686541e3bd3abde1699d86687eb0)]:
  - @brains/plugins@0.2.0-alpha.285
  - @brains/contracts@0.2.0-alpha.285
  - @brains/ui-library@0.2.0-alpha.285
  - @brains/utils@0.2.0-alpha.285

## 0.2.0-alpha.284

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.284
  - @brains/ui-library@0.2.0-alpha.284
  - @brains/utils@0.2.0-alpha.284
  - @brains/plugins@0.2.0-alpha.284

## 0.2.0-alpha.283

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.283
  - @brains/ui-library@0.2.0-alpha.283
  - @brains/utils@0.2.0-alpha.283
  - @brains/plugins@0.2.0-alpha.283

## 0.2.0-alpha.282

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.282
  - @brains/ui-library@0.2.0-alpha.282
  - @brains/utils@0.2.0-alpha.282
  - @brains/plugins@0.2.0-alpha.282

## 0.2.0-alpha.281

### Patch Changes

- [#114](https://github.com/rizom-ai/brains/pull/114) [`c6b44ae`](https://github.com/rizom-ai/brains/commit/c6b44ae420bc0c4c92c2081bfbc320c00987db79) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add migration-gated email thread ordinals with deterministic indexed ordering, concurrency-safe ingress assignment, directory round-trip preservation, and Inbox-only “message N in thread” rendering.

- Updated dependencies [[`c6b44ae`](https://github.com/rizom-ai/brains/commit/c6b44ae420bc0c4c92c2081bfbc320c00987db79)]:
  - @brains/plugins@0.2.0-alpha.281
  - @brains/contracts@0.2.0-alpha.281
  - @brains/ui-library@0.2.0-alpha.281
  - @brains/utils@0.2.0-alpha.281

## 0.2.0-alpha.280

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.280
  - @brains/contracts@0.2.0-alpha.280
  - @brains/ui-library@0.2.0-alpha.280
  - @brains/utils@0.2.0-alpha.280

## 0.2.0-alpha.279

### Minor Changes

- [#111](https://github.com/rizom-ai/brains/pull/111) [`bd1eb47`](https://github.com/rizom-ai/brains/commit/bd1eb4768ee154570f5ba144f59a145c7f00aa51) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Connect recognizable Inbox senders to verified People identities. Normalize privacy-safe inbound email identity resolution, derive bounded sender labels without retaining mailbox addresses, carry a structured optional contact through the Inbox contract, and link resolved contacts to the exact person through the registered Admin surface while keeping Dashboard and digest projections redacted. Consume shared Dashboard widget primitives from the UI library rather than importing across plugin boundaries.

- [#111](https://github.com/rizom-ai/brains/pull/111) [`bd1eb47`](https://github.com/rizom-ai/brains/commit/bd1eb4768ee154570f5ba144f59a145c7f00aa51) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Quality pass on the unified-inbox surfaces. Email triage serves its rail badge
  through the CMS `badgeProvider` and shares the admin list-tool envelope and
  workspace-admin guard from `@brains/plugins`. The dashboard package re-exports
  `formatDate` beside the other widget primitives. App resolution recognizes
  plugin configuration validation errors across separately bundled runtime
  entrypoints.

### Patch Changes

- [#111](https://github.com/rizom-ai/brains/pull/111) [`bd1eb47`](https://github.com/rizom-ai/brains/commit/bd1eb4768ee154570f5ba144f59a145c7f00aa51) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Harden provider boundaries and the entity round-trip against failures visible
  with live transports. Entity adapters strip the system-injected `visibility`
  frontmatter key before domain validation, so strict adapters accept their own
  exported files on re-import, and both directory-sync deletion paths treat a
  quarantined (`.invalid`) file as ours, not a user deletion — together these
  stop restricted entities from being quarantined and then destroyed moments
  after creation. Optional email transport settings and the notifications
  default recipient treat empty env interpolations as absent so inbound-only
  postures boot as documented. The email-triage classifier sends a flat wire
  schema (OpenAI strict structured outputs reject root-level unions) and maps it
  onto the unchanged domain decision union.
- Updated dependencies [[`bd1eb47`](https://github.com/rizom-ai/brains/commit/bd1eb4768ee154570f5ba144f59a145c7f00aa51), [`d0211d9`](https://github.com/rizom-ai/brains/commit/d0211d97253360ead7cfdeb957650e7ff8369afc)]:
  - @brains/contracts@0.2.0-alpha.279
  - @brains/plugins@0.2.0-alpha.279
  - @brains/ui-library@0.2.0-alpha.279
  - @brains/utils@0.2.0-alpha.279

## 0.2.0-alpha.278

### Patch Changes

- Updated dependencies [[`f2d2775`](https://github.com/rizom-ai/brains/commit/f2d2775d61177d5af16e3a839aed6d18de10a511)]:
  - @brains/plugins@0.2.0-alpha.278
  - @brains/contracts@0.2.0-alpha.278
  - @brains/ui-library@0.2.0-alpha.278
  - @brains/utils@0.2.0-alpha.278

## 0.2.0-alpha.277

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.277
  - @brains/ui-library@0.2.0-alpha.277
  - @brains/utils@0.2.0-alpha.277
  - @brains/plugins@0.2.0-alpha.277

## 0.2.0-alpha.276

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.276
  - @brains/ui-library@0.2.0-alpha.276
  - @brains/utils@0.2.0-alpha.276
  - @brains/plugins@0.2.0-alpha.276

## 0.2.0-alpha.275

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.275
  - @brains/ui-library@0.2.0-alpha.275
  - @brains/utils@0.2.0-alpha.275
  - @brains/plugins@0.2.0-alpha.275

## 0.2.0-alpha.274

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.274
  - @brains/ui-library@0.2.0-alpha.274
  - @brains/utils@0.2.0-alpha.274
  - @brains/plugins@0.2.0-alpha.274

## 0.2.0-alpha.273

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.273
  - @brains/ui-library@0.2.0-alpha.273
  - @brains/utils@0.2.0-alpha.273
  - @brains/plugins@0.2.0-alpha.273

## 0.2.0-alpha.272

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.272
  - @brains/ui-library@0.2.0-alpha.272
  - @brains/utils@0.2.0-alpha.272
  - @brains/plugins@0.2.0-alpha.272

## 0.2.0-alpha.271

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.271
  - @brains/ui-library@0.2.0-alpha.271
  - @brains/utils@0.2.0-alpha.271
  - @brains/plugins@0.2.0-alpha.271

## 0.2.0-alpha.270

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.270
  - @brains/ui-library@0.2.0-alpha.270
  - @brains/utils@0.2.0-alpha.270
  - @brains/plugins@0.2.0-alpha.270

## 0.2.0-alpha.269

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.269
  - @brains/ui-library@0.2.0-alpha.269
  - @brains/utils@0.2.0-alpha.269
  - @brains/plugins@0.2.0-alpha.269

## 0.2.0-alpha.268

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.268
  - @brains/ui-library@0.2.0-alpha.268
  - @brains/utils@0.2.0-alpha.268
  - @brains/plugins@0.2.0-alpha.268

## 0.2.0-alpha.267

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.267
  - @brains/contracts@0.2.0-alpha.267
  - @brains/ui-library@0.2.0-alpha.267
  - @brains/utils@0.2.0-alpha.267

## 0.2.0-alpha.266

### Patch Changes

- Updated dependencies [[`e70ab12`](https://github.com/rizom-ai/brains/commit/e70ab12745c6cf757f685389f4cd6de8991de95f)]:
  - @brains/utils@0.2.0-alpha.266
  - @brains/contracts@0.2.0-alpha.266
  - @brains/ui-library@0.2.0-alpha.266
  - @brains/plugins@0.2.0-alpha.266

## 0.2.0-alpha.265

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.265
  - @brains/ui-library@0.2.0-alpha.265
  - @brains/utils@0.2.0-alpha.265
  - @brains/plugins@0.2.0-alpha.265

## 0.2.0-alpha.264

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.264
  - @brains/contracts@0.2.0-alpha.264
  - @brains/ui-library@0.2.0-alpha.264
  - @brains/utils@0.2.0-alpha.264

## 0.2.0-alpha.263

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.263
  - @brains/contracts@0.2.0-alpha.263
  - @brains/ui-library@0.2.0-alpha.263
  - @brains/utils@0.2.0-alpha.263

## 0.2.0-alpha.262

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.262
  - @brains/dashboard@0.2.0-alpha.262
  - @brains/contracts@0.2.0-alpha.262
  - @brains/utils@0.2.0-alpha.262

## 0.2.0-alpha.261

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.261
  - @brains/dashboard@0.2.0-alpha.261
  - @brains/contracts@0.2.0-alpha.261
  - @brains/utils@0.2.0-alpha.261

## 0.2.0-alpha.260

### Patch Changes

- Updated dependencies []:
  - @brains/dashboard@0.2.0-alpha.260
  - @brains/contracts@0.2.0-alpha.260
  - @brains/utils@0.2.0-alpha.260
  - @brains/plugins@0.2.0-alpha.260

## 0.2.0-alpha.259

### Patch Changes

- Updated dependencies []:
  - @brains/dashboard@0.2.0-alpha.259
  - @brains/contracts@0.2.0-alpha.259
  - @brains/utils@0.2.0-alpha.259
  - @brains/plugins@0.2.0-alpha.259

## 0.2.0-alpha.258

### Patch Changes

- Updated dependencies []:
  - @brains/dashboard@0.2.0-alpha.258
  - @brains/contracts@0.2.0-alpha.258
  - @brains/utils@0.2.0-alpha.258
  - @brains/plugins@0.2.0-alpha.258

## 0.2.0-alpha.257

### Patch Changes

- Updated dependencies []:
  - @brains/dashboard@0.2.0-alpha.257
  - @brains/contracts@0.2.0-alpha.257
  - @brains/utils@0.2.0-alpha.257
  - @brains/plugins@0.2.0-alpha.257

## 0.2.0-alpha.256

### Patch Changes

- Updated dependencies [[`b155d93`](https://github.com/rizom-ai/brains/commit/b155d938c240bcc9500c2395f11763ab49a017c9), [`1e45eca`](https://github.com/rizom-ai/brains/commit/1e45ecaaed5351964cbf8a0754a301507b15c298), [`b155d93`](https://github.com/rizom-ai/brains/commit/b155d938c240bcc9500c2395f11763ab49a017c9), [`b155d93`](https://github.com/rizom-ai/brains/commit/b155d938c240bcc9500c2395f11763ab49a017c9)]:
  - @brains/plugins@0.2.0-alpha.256
  - @brains/utils@0.2.0-alpha.256
  - @brains/dashboard@0.2.0-alpha.256
  - @brains/contracts@0.2.0-alpha.256

## 0.2.0-alpha.255

### Patch Changes

- Updated dependencies []:
  - @brains/dashboard@0.2.0-alpha.255
  - @brains/contracts@0.2.0-alpha.255
  - @brains/utils@0.2.0-alpha.255
  - @brains/plugins@0.2.0-alpha.255

## 0.2.0-alpha.254

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.254
  - @brains/dashboard@0.2.0-alpha.254
  - @brains/contracts@0.2.0-alpha.254
  - @brains/utils@0.2.0-alpha.254

## 0.2.0-alpha.253

### Patch Changes

- Updated dependencies []:
  - @brains/dashboard@0.2.0-alpha.253
  - @brains/contracts@0.2.0-alpha.253
  - @brains/utils@0.2.0-alpha.253
  - @brains/plugins@0.2.0-alpha.253

## 0.2.0-alpha.252

### Minor Changes

- [#82](https://github.com/rizom-ai/brains/pull/82) [`2f8a48e`](https://github.com/rizom-ai/brains/commit/2f8a48eac1b316c44cd765ca35e9393ae856c78a) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Register restricted derived mail items as the first unified-inbox source. New items are projected live with high-priority urgency and Admin-enforced reviewed, handled, and archive actions that reuse email triage's typed status workflow without persisting raw mailbox content or duplicate inbox state.

### Patch Changes

- Updated dependencies []:
  - @brains/dashboard@0.2.0-alpha.252
  - @brains/contracts@0.2.0-alpha.252
  - @brains/utils@0.2.0-alpha.252
  - @brains/plugins@0.2.0-alpha.252

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

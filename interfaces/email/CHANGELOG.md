# @brains/email

## 0.2.0-alpha.307

### Patch Changes

- Updated dependencies [[`947bd44`](https://github.com/rizom-ai/brains/commit/947bd44edf379b9dfa70732dfd0b98c2655dae38)]:
  - @brains/plugins@0.2.0-alpha.307
  - @brains/contracts@0.2.0-alpha.307
  - @brains/utils@0.2.0-alpha.307

## 0.2.0-alpha.306

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.306
  - @brains/utils@0.2.0-alpha.306
  - @brains/plugins@0.2.0-alpha.306

## 0.2.0-alpha.305

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.305
  - @brains/contracts@0.2.0-alpha.305
  - @brains/utils@0.2.0-alpha.305

## 0.2.0-alpha.304

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.304
  - @brains/utils@0.2.0-alpha.304
  - @brains/plugins@0.2.0-alpha.304

## 0.2.0-alpha.303

### Patch Changes

- Updated dependencies [[`5ff2420`](https://github.com/rizom-ai/brains/commit/5ff2420e2173df8b9add5bfc05a91033ddd1d976)]:
  - @brains/plugins@0.2.0-alpha.303
  - @brains/contracts@0.2.0-alpha.303
  - @brains/utils@0.2.0-alpha.303

## 0.2.0-alpha.302

### Patch Changes

- [`fb765a1`](https://github.com/rizom-ai/brains/commit/fb765a19809c9a4125236d21ba3400e0e01386ab) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Keep a persistent IMAP error listener between interval polls so socket timeouts trigger the existing reconnect path instead of crashing the runtime.

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.302
  - @brains/utils@0.2.0-alpha.302
  - @brains/plugins@0.2.0-alpha.302

## 0.2.0-alpha.301

### Patch Changes

- Updated dependencies [[`b2fd00c`](https://github.com/rizom-ai/brains/commit/b2fd00c1550e0b9a386484e07a53546106f793ce)]:
  - @brains/plugins@0.2.0-alpha.301
  - @brains/contracts@0.2.0-alpha.301
  - @brains/utils@0.2.0-alpha.301

## 0.2.0-alpha.300

### Patch Changes

- [`f575fd1`](https://github.com/rizom-ai/brains/commit/f575fd154d1309e37831e33eb15c0eb87e3e6af6) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Retry IMAP TLS hostname connections over IPv4 when Bun cannot read certificate names from the IPv6 peer, preserving normal certificate validation and restoring source-backed Inbox reads.

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.300
  - @brains/utils@0.2.0-alpha.300
  - @brains/plugins@0.2.0-alpha.300

## 0.2.0-alpha.299

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.299
  - @brains/utils@0.2.0-alpha.299
  - @brains/plugins@0.2.0-alpha.299

## 0.2.0-alpha.298

### Minor Changes

- [#145](https://github.com/rizom-ai/brains/pull/145) [`9666d4a`](https://github.com/rizom-ai/brains/commit/9666d4af711d4a65ea2f071e757178f2639c6325) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add bounded email threading metadata and ship explicit confirmation-gated sending for saved reply-draft revisions. Recipients, subjects, and reply headers are resolved from fresh mailbox source reads; stable per-revision idempotency and persisted provider acceptance keep retries safe without storing original messages.

### Patch Changes

- Updated dependencies [[`9666d4a`](https://github.com/rizom-ai/brains/commit/9666d4af711d4a65ea2f071e757178f2639c6325)]:
  - @brains/plugins@0.2.0-alpha.298
  - @brains/contracts@0.2.0-alpha.298
  - @brains/utils@0.2.0-alpha.298

## 0.2.0-alpha.297

### Minor Changes

- [#144](https://github.com/rizom-ai/brains/pull/144) [`f6d93c7`](https://github.com/rizom-ai/brains/commit/f6d93c7aa49acccd691b049b090a7fdbbe7b6a1a) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Rename the email workflow package, add destination-resolved source-specific Inbox follow-ups, and ship private locator-backed IMAP detail reads plus an Admin-only reply drafting workspace. Original messages remain mailbox-owned and non-persistent; only operator-authored reply drafts are stored.

### Patch Changes

- Updated dependencies [[`f6d93c7`](https://github.com/rizom-ai/brains/commit/f6d93c7aa49acccd691b049b090a7fdbbe7b6a1a)]:
  - @brains/contracts@0.2.0-alpha.297
  - @brains/plugins@0.2.0-alpha.297
  - @brains/utils@0.2.0-alpha.297

## 0.2.0-alpha.296

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.296
  - @brains/utils@0.2.0-alpha.296
  - @brains/plugins@0.2.0-alpha.296

## 0.2.0-alpha.295

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.295
  - @brains/contracts@0.2.0-alpha.295
  - @brains/utils@0.2.0-alpha.295

## 0.2.0-alpha.294

### Patch Changes

- Updated dependencies [[`995d491`](https://github.com/rizom-ai/brains/commit/995d4910a2d6b10e3524664dd557ce2100d48173)]:
  - @brains/plugins@0.2.0-alpha.294
  - @brains/contracts@0.2.0-alpha.294
  - @brains/utils@0.2.0-alpha.294

## 0.2.0-alpha.293

### Patch Changes

- Updated dependencies [[`f25b201`](https://github.com/rizom-ai/brains/commit/f25b2017de7be3a7eb117166ca3458237055137b)]:
  - @brains/plugins@0.2.0-alpha.293
  - @brains/contracts@0.2.0-alpha.293
  - @brains/utils@0.2.0-alpha.293

## 0.2.0-alpha.292

### Patch Changes

- Updated dependencies [[`7fc21a2`](https://github.com/rizom-ai/brains/commit/7fc21a277c3e81779c65d9a95809c0d53682406f)]:
  - @brains/plugins@0.2.0-alpha.292
  - @brains/contracts@0.2.0-alpha.292
  - @brains/utils@0.2.0-alpha.292

## 0.2.0-alpha.291

### Patch Changes

- Updated dependencies [[`3ed9cfe`](https://github.com/rizom-ai/brains/commit/3ed9cfe0636ee55dac9bf74506d743a6a84eb6f8)]:
  - @brains/plugins@0.2.0-alpha.291
  - @brains/contracts@0.2.0-alpha.291
  - @brains/utils@0.2.0-alpha.291

## 0.2.0-alpha.290

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.290
  - @brains/contracts@0.2.0-alpha.290
  - @brains/utils@0.2.0-alpha.290

## 0.2.0-alpha.289

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.289
  - @brains/utils@0.2.0-alpha.289
  - @brains/plugins@0.2.0-alpha.289

## 0.2.0-alpha.288

### Patch Changes

- Updated dependencies [[`b06bc78`](https://github.com/rizom-ai/brains/commit/b06bc78514aa163b3a86c5c6d62d4500aa7c7e3b)]:
  - @brains/plugins@0.2.0-alpha.288
  - @brains/contracts@0.2.0-alpha.288
  - @brains/utils@0.2.0-alpha.288

## 0.2.0-alpha.287

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.287
  - @brains/utils@0.2.0-alpha.287
  - @brains/plugins@0.2.0-alpha.287

## 0.2.0-alpha.286

### Patch Changes

- Updated dependencies [[`b7cda6c`](https://github.com/rizom-ai/brains/commit/b7cda6cd64c1a7400b16bf4faacb36d0244c58f9)]:
  - @brains/plugins@0.2.0-alpha.286
  - @brains/contracts@0.2.0-alpha.286
  - @brains/utils@0.2.0-alpha.286

## 0.2.0-alpha.285

### Patch Changes

- Updated dependencies [[`c41168e`](https://github.com/rizom-ai/brains/commit/c41168ea6058686541e3bd3abde1699d86687eb0)]:
  - @brains/plugins@0.2.0-alpha.285
  - @brains/contracts@0.2.0-alpha.285
  - @brains/utils@0.2.0-alpha.285

## 0.2.0-alpha.284

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.284
  - @brains/utils@0.2.0-alpha.284
  - @brains/plugins@0.2.0-alpha.284

## 0.2.0-alpha.283

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.283
  - @brains/utils@0.2.0-alpha.283
  - @brains/plugins@0.2.0-alpha.283

## 0.2.0-alpha.282

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.282
  - @brains/utils@0.2.0-alpha.282
  - @brains/plugins@0.2.0-alpha.282

## 0.2.0-alpha.281

### Patch Changes

- Updated dependencies [[`c6b44ae`](https://github.com/rizom-ai/brains/commit/c6b44ae420bc0c4c92c2081bfbc320c00987db79)]:
  - @brains/plugins@0.2.0-alpha.281
  - @brains/contracts@0.2.0-alpha.281
  - @brains/utils@0.2.0-alpha.281

## 0.2.0-alpha.280

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.280
  - @brains/contracts@0.2.0-alpha.280
  - @brains/utils@0.2.0-alpha.280

## 0.2.0-alpha.279

### Minor Changes

- [#111](https://github.com/rizom-ai/brains/pull/111) [`bd1eb47`](https://github.com/rizom-ai/brains/commit/bd1eb4768ee154570f5ba144f59a145c7f00aa51) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Connect recognizable Inbox senders to verified People identities. Normalize privacy-safe inbound email identity resolution, derive bounded sender labels without retaining mailbox addresses, carry a structured optional contact through the Inbox contract, and link resolved contacts to the exact person through the registered Admin surface while keeping Dashboard and digest projections redacted. Consume shared Dashboard widget primitives from the UI library rather than importing across plugin boundaries.

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
  - @brains/utils@0.2.0-alpha.279

## 0.2.0-alpha.278

### Patch Changes

- Updated dependencies [[`f2d2775`](https://github.com/rizom-ai/brains/commit/f2d2775d61177d5af16e3a839aed6d18de10a511)]:
  - @brains/plugins@0.2.0-alpha.278
  - @brains/contracts@0.2.0-alpha.278
  - @brains/utils@0.2.0-alpha.278

## 0.2.0-alpha.277

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.277
  - @brains/utils@0.2.0-alpha.277
  - @brains/plugins@0.2.0-alpha.277

## 0.2.0-alpha.276

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.276
  - @brains/utils@0.2.0-alpha.276
  - @brains/plugins@0.2.0-alpha.276

## 0.2.0-alpha.275

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.275
  - @brains/utils@0.2.0-alpha.275
  - @brains/plugins@0.2.0-alpha.275

## 0.2.0-alpha.274

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.274
  - @brains/utils@0.2.0-alpha.274
  - @brains/plugins@0.2.0-alpha.274

## 0.2.0-alpha.273

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.273
  - @brains/utils@0.2.0-alpha.273
  - @brains/plugins@0.2.0-alpha.273

## 0.2.0-alpha.272

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.272
  - @brains/utils@0.2.0-alpha.272
  - @brains/plugins@0.2.0-alpha.272

## 0.2.0-alpha.271

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.271
  - @brains/utils@0.2.0-alpha.271
  - @brains/plugins@0.2.0-alpha.271

## 0.2.0-alpha.270

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.270
  - @brains/utils@0.2.0-alpha.270
  - @brains/plugins@0.2.0-alpha.270

## 0.2.0-alpha.269

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.269
  - @brains/utils@0.2.0-alpha.269
  - @brains/plugins@0.2.0-alpha.269

## 0.2.0-alpha.268

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.268
  - @brains/utils@0.2.0-alpha.268
  - @brains/plugins@0.2.0-alpha.268

## 0.2.0-alpha.267

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.267
  - @brains/contracts@0.2.0-alpha.267
  - @brains/utils@0.2.0-alpha.267

## 0.2.0-alpha.266

### Patch Changes

- Updated dependencies [[`e70ab12`](https://github.com/rizom-ai/brains/commit/e70ab12745c6cf757f685389f4cd6de8991de95f)]:
  - @brains/utils@0.2.0-alpha.266
  - @brains/contracts@0.2.0-alpha.266
  - @brains/plugins@0.2.0-alpha.266

## 0.2.0-alpha.265

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.265
  - @brains/utils@0.2.0-alpha.265
  - @brains/plugins@0.2.0-alpha.265

## 0.2.0-alpha.264

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.264
  - @brains/contracts@0.2.0-alpha.264
  - @brains/utils@0.2.0-alpha.264

## 0.2.0-alpha.263

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.263
  - @brains/contracts@0.2.0-alpha.263
  - @brains/utils@0.2.0-alpha.263

## 0.2.0-alpha.262

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.262
  - @brains/contracts@0.2.0-alpha.262
  - @brains/utils@0.2.0-alpha.262

## 0.2.0-alpha.261

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.261
  - @brains/contracts@0.2.0-alpha.261
  - @brains/utils@0.2.0-alpha.261

## 0.2.0-alpha.260

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.260
  - @brains/utils@0.2.0-alpha.260
  - @brains/plugins@0.2.0-alpha.260

## 0.2.0-alpha.259

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.259
  - @brains/utils@0.2.0-alpha.259
  - @brains/plugins@0.2.0-alpha.259

## 0.2.0-alpha.258

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.258
  - @brains/utils@0.2.0-alpha.258
  - @brains/plugins@0.2.0-alpha.258

## 0.2.0-alpha.257

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.257
  - @brains/utils@0.2.0-alpha.257
  - @brains/plugins@0.2.0-alpha.257

## 0.2.0-alpha.256

### Patch Changes

- Updated dependencies [[`b155d93`](https://github.com/rizom-ai/brains/commit/b155d938c240bcc9500c2395f11763ab49a017c9), [`1e45eca`](https://github.com/rizom-ai/brains/commit/1e45ecaaed5351964cbf8a0754a301507b15c298), [`b155d93`](https://github.com/rizom-ai/brains/commit/b155d938c240bcc9500c2395f11763ab49a017c9), [`b155d93`](https://github.com/rizom-ai/brains/commit/b155d938c240bcc9500c2395f11763ab49a017c9)]:
  - @brains/plugins@0.2.0-alpha.256
  - @brains/utils@0.2.0-alpha.256
  - @brains/contracts@0.2.0-alpha.256

## 0.2.0-alpha.255

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.255
  - @brains/utils@0.2.0-alpha.255
  - @brains/plugins@0.2.0-alpha.255

## 0.2.0-alpha.254

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.254
  - @brains/contracts@0.2.0-alpha.254
  - @brains/utils@0.2.0-alpha.254

## 0.2.0-alpha.253

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.253
  - @brains/utils@0.2.0-alpha.253
  - @brains/plugins@0.2.0-alpha.253

## 0.2.0-alpha.252

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.252
  - @brains/utils@0.2.0-alpha.252
  - @brains/plugins@0.2.0-alpha.252

## 0.2.0-alpha.251

### Patch Changes

- Updated dependencies [[`ca41276`](https://github.com/rizom-ai/brains/commit/ca412762e73ca8391d8a77a6c08b20c63b30848e)]:
  - @brains/plugins@0.2.0-alpha.251
  - @brains/contracts@0.2.0-alpha.251
  - @brains/utils@0.2.0-alpha.251

## 0.2.0-alpha.250

### Patch Changes

- Updated dependencies []:
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
  - @brains/utils@0.2.0-alpha.249

## 0.2.0-alpha.248

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.248
  - @brains/utils@0.2.0-alpha.248
  - @brains/plugins@0.2.0-alpha.248

## 0.2.0-alpha.247

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.247
  - @brains/utils@0.2.0-alpha.247
  - @brains/plugins@0.2.0-alpha.247

## 0.2.0-alpha.246

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.246
  - @brains/utils@0.2.0-alpha.246
  - @brains/plugins@0.2.0-alpha.246

## 0.2.0-alpha.245

### Minor Changes

- [#76](https://github.com/rizom-ai/brains/pull/76) [`e2fa886`](https://github.com/rizom-ai/brains/commit/e2fa886134594d834582c5b55704e893fcb0988a) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add optional IMAP intake to the Email interface. Configured interfaces now connect to a read-only mailbox, parse MIME messages, publish the exported `EMAIL_INBOUND` contract, and persist an acknowledgement-gated, UIDVALIDITY-scoped cursor for at-least-once delivery. Poison messages no longer block later mail. Intake stays live through per-connection IDLE fallback and capped reconnect backoff, including failed initial connections, and enriches known senders through the auth principal registry. Outbound-only setups remain unchanged, and mailbox content, addresses, and credentials stay out of logs.

### Patch Changes

- Updated dependencies [[`e2fa886`](https://github.com/rizom-ai/brains/commit/e2fa886134594d834582c5b55704e893fcb0988a)]:
  - @brains/contracts@0.2.0-alpha.245
  - @brains/plugins@0.2.0-alpha.245
  - @brains/utils@0.2.0-alpha.245

## 0.2.0-alpha.244

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.244
  - @brains/utils@0.2.0-alpha.244

## 0.2.0-alpha.243

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.243
  - @brains/plugins@0.2.0-alpha.243

## 0.2.0-alpha.242

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.242
  - @brains/plugins@0.2.0-alpha.242

## 0.2.0-alpha.241

### Patch Changes

- [`7f5c45f`](https://github.com/rizom-ai/brains/commit/7f5c45f4cac4556fdd2abcb939b48f1a76adbe62) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Route notifications through the channel delivery registry instead of a
  transport-specific `email:send` channel, and delete `@brains/email-contracts`.
  `ChannelDeliveryInput` gains optional `html` and `sensitivity`, so one
  mechanism now covers both invitation and notification delivery.
- Updated dependencies [[`7f5c45f`](https://github.com/rizom-ai/brains/commit/7f5c45f4cac4556fdd2abcb939b48f1a76adbe62), [`7f5c45f`](https://github.com/rizom-ai/brains/commit/7f5c45f4cac4556fdd2abcb939b48f1a76adbe62)]:
  - @brains/plugins@0.2.0-alpha.241
  - @brains/utils@0.2.0-alpha.241

## 0.2.0-alpha.240

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.240
  - @brains/utils@0.2.0-alpha.240
  - @brains/plugins@0.2.0-alpha.240

## 0.2.0-alpha.239

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.239
  - @brains/utils@0.2.0-alpha.239
  - @brains/plugins@0.2.0-alpha.239

## 0.2.0-alpha.238

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.238
  - @brains/utils@0.2.0-alpha.238
  - @brains/plugins@0.2.0-alpha.238

## 0.2.0-alpha.237

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.237
  - @brains/utils@0.2.0-alpha.237
  - @brains/plugins@0.2.0-alpha.237

## 0.2.0-alpha.236

### Minor Changes

- [`9655faf`](https://github.com/rizom-ai/brains/commit/9655faf210917e322ce2bdce0a95adaabd816a8d) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Replace the standalone Email Resend service with an outbound-first Email message interface. Email now owns its channel descriptor and configured Resend provider, Notifications remains channel-agnostic, channel registration is restricted to message-interface plugins, and brain configuration uses `plugins.email`; existing `plugins.email-resend` configuration must be renamed.

### Patch Changes

- [`a6ca836`](https://github.com/rizom-ai/brains/commit/a6ca836f4cd5abef038584de13944765d7b4843a) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add the app-scoped channel descriptor and delivery-provider registry, registry-driven auth identities and Admin channel presentation, supervised invitation recovery, and explicit audited manual invitation delivery.

- [`8bd7c18`](https://github.com/rizom-ai/brains/commit/8bd7c18678822bafdb796f20c44db3220a7c1d0f) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add durable idempotent invitation lifecycles, provider-backed email delivery, safe resend/cancellation/expiry handling, and Admin invitation status history.

- Updated dependencies [[`a6ca836`](https://github.com/rizom-ai/brains/commit/a6ca836f4cd5abef038584de13944765d7b4843a), [`8bd7c18`](https://github.com/rizom-ai/brains/commit/8bd7c18678822bafdb796f20c44db3220a7c1d0f), [`9655faf`](https://github.com/rizom-ai/brains/commit/9655faf210917e322ce2bdce0a95adaabd816a8d)]:
  - @brains/plugins@0.2.0-alpha.236
  - @brains/email-contracts@0.2.0-alpha.236
  - @brains/utils@0.2.0-alpha.236

History before the outbound-interface restructure was released as `@brains/email-resend`.

## 0.2.0-alpha.235

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.235
  - @brains/email-contracts@0.2.0-alpha.235
  - @brains/utils@0.2.0-alpha.235

## 0.2.0-alpha.234

### Patch Changes

- Updated dependencies [[`afa5cf4`](https://github.com/rizom-ai/brains/commit/afa5cf4cbdf75400b180d4bb89ed46dd4e6097cc)]:
  - @brains/plugins@0.2.0-alpha.234
  - @brains/email-contracts@0.2.0-alpha.234
  - @brains/utils@0.2.0-alpha.234

## 0.2.0-alpha.233

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.233
  - @brains/utils@0.2.0-alpha.233
  - @brains/plugins@0.2.0-alpha.233

## 0.2.0-alpha.232

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.232
  - @brains/utils@0.2.0-alpha.232
  - @brains/plugins@0.2.0-alpha.232

## 0.2.0-alpha.231

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.231
  - @brains/utils@0.2.0-alpha.231
  - @brains/plugins@0.2.0-alpha.231

## 0.2.0-alpha.230

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.230
  - @brains/utils@0.2.0-alpha.230
  - @brains/plugins@0.2.0-alpha.230

## 0.2.0-alpha.229

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.229
  - @brains/utils@0.2.0-alpha.229
  - @brains/plugins@0.2.0-alpha.229

## 0.2.0-alpha.228

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.228
  - @brains/utils@0.2.0-alpha.228
  - @brains/plugins@0.2.0-alpha.228

## 0.2.0-alpha.227

### Patch Changes

- Updated dependencies [[`500a6dc`](https://github.com/rizom-ai/brains/commit/500a6dc284a590e1e9bb6af9fa0995332eeb8c58), [`f7b3500`](https://github.com/rizom-ai/brains/commit/f7b350042c5bbcd6c5a43016d25e95e35ea3bfed), [`fa8e4eb`](https://github.com/rizom-ai/brains/commit/fa8e4eb3a237aaec54eeeb815f68e792d3a1715b), [`5c1bed1`](https://github.com/rizom-ai/brains/commit/5c1bed1134f92701f4ead9b25a6f432cd208ac29), [`20ac901`](https://github.com/rizom-ai/brains/commit/20ac901e319ef62b38bb291de8d026b9d8ae51d7)]:
  - @brains/plugins@0.2.0-alpha.227
  - @brains/utils@0.2.0-alpha.227
  - @brains/email-contracts@0.2.0-alpha.227

## 0.2.0-alpha.226

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.226
  - @brains/utils@0.2.0-alpha.226
  - @brains/plugins@0.2.0-alpha.226

## 0.2.0-alpha.225

### Patch Changes

- Updated dependencies [[`b0001fb`](https://github.com/rizom-ai/brains/commit/b0001fb102c030855586d92c4abef67004ae7987)]:
  - @brains/plugins@0.2.0-alpha.225
  - @brains/email-contracts@0.2.0-alpha.225
  - @brains/utils@0.2.0-alpha.225

## 0.2.0-alpha.224

### Patch Changes

- Updated dependencies [[`b7c5df6`](https://github.com/rizom-ai/brains/commit/b7c5df61ebe0aa44f6b786695f16daa7ee151e61)]:
  - @brains/utils@0.2.0-alpha.224
  - @brains/email-contracts@0.2.0-alpha.224
  - @brains/plugins@0.2.0-alpha.224

## 0.2.0-alpha.223

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.223
  - @brains/utils@0.2.0-alpha.223
  - @brains/plugins@0.2.0-alpha.223

## 0.2.0-alpha.222

### Patch Changes

- Updated dependencies [[`4943d79`](https://github.com/rizom-ai/brains/commit/4943d79ecf4abefd4cf79a38a526e203ea32064a)]:
  - @brains/plugins@0.2.0-alpha.222
  - @brains/email-contracts@0.2.0-alpha.222
  - @brains/utils@0.2.0-alpha.222

## 0.2.0-alpha.221

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.221
  - @brains/utils@0.2.0-alpha.221
  - @brains/plugins@0.2.0-alpha.221

## 0.2.0-alpha.220

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.220
  - @brains/utils@0.2.0-alpha.220
  - @brains/plugins@0.2.0-alpha.220

## 0.2.0-alpha.219

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.219
  - @brains/utils@0.2.0-alpha.219
  - @brains/plugins@0.2.0-alpha.219

## 0.2.0-alpha.218

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.218
  - @brains/utils@0.2.0-alpha.218
  - @brains/plugins@0.2.0-alpha.218

## 0.2.0-alpha.217

### Patch Changes

- Updated dependencies [[`b737ed9`](https://github.com/rizom-ai/brains/commit/b737ed9b37f0cd38b0e5387e2fb3795ca5eeec04)]:
  - @brains/plugins@0.2.0-alpha.217
  - @brains/email-contracts@0.2.0-alpha.217
  - @brains/utils@0.2.0-alpha.217

## 0.2.0-alpha.216

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.216
  - @brains/utils@0.2.0-alpha.216
  - @brains/plugins@0.2.0-alpha.216

## 0.2.0-alpha.215

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.215
  - @brains/utils@0.2.0-alpha.215
  - @brains/plugins@0.2.0-alpha.215

## 0.2.0-alpha.214

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.214
  - @brains/utils@0.2.0-alpha.214
  - @brains/plugins@0.2.0-alpha.214

## 0.2.0-alpha.213

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.213
  - @brains/utils@0.2.0-alpha.213
  - @brains/plugins@0.2.0-alpha.213

## 0.2.0-alpha.212

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.212
  - @brains/utils@0.2.0-alpha.212
  - @brains/plugins@0.2.0-alpha.212

## 0.2.0-alpha.211

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.211
  - @brains/utils@0.2.0-alpha.211
  - @brains/plugins@0.2.0-alpha.211

## 0.2.0-alpha.210

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.210
  - @brains/utils@0.2.0-alpha.210
  - @brains/plugins@0.2.0-alpha.210

## 0.2.0-alpha.209

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.209
  - @brains/utils@0.2.0-alpha.209
  - @brains/plugins@0.2.0-alpha.209

## 0.2.0-alpha.208

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.208
  - @brains/utils@0.2.0-alpha.208
  - @brains/plugins@0.2.0-alpha.208

## 0.2.0-alpha.207

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.207
  - @brains/utils@0.2.0-alpha.207
  - @brains/plugins@0.2.0-alpha.207

## 0.2.0-alpha.206

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.206
  - @brains/utils@0.2.0-alpha.206
  - @brains/plugins@0.2.0-alpha.206

## 0.2.0-alpha.205

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.205
  - @brains/utils@0.2.0-alpha.205
  - @brains/plugins@0.2.0-alpha.205

## 0.2.0-alpha.204

### Patch Changes

- Updated dependencies [[`998a786`](https://github.com/rizom-ai/brains/commit/998a78694a06c7796fefcca09e258cc90eb62ce9)]:
  - @brains/plugins@0.2.0-alpha.204
  - @brains/email-contracts@0.2.0-alpha.204
  - @brains/utils@0.2.0-alpha.204

## 0.2.0-alpha.203

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.203
  - @brains/email-contracts@0.2.0-alpha.203
  - @brains/utils@0.2.0-alpha.203

## 0.2.0-alpha.202

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.202
  - @brains/utils@0.2.0-alpha.202
  - @brains/plugins@0.2.0-alpha.202

## 0.2.0-alpha.201

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.201
  - @brains/utils@0.2.0-alpha.201
  - @brains/plugins@0.2.0-alpha.201

## 0.2.0-alpha.200

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.200
  - @brains/utils@0.2.0-alpha.200
  - @brains/plugins@0.2.0-alpha.200

## 0.2.0-alpha.199

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.199
  - @brains/utils@0.2.0-alpha.199
  - @brains/plugins@0.2.0-alpha.199

## 0.2.0-alpha.198

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.198
  - @brains/utils@0.2.0-alpha.198
  - @brains/plugins@0.2.0-alpha.198

## 0.2.0-alpha.197

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.197
  - @brains/utils@0.2.0-alpha.197
  - @brains/plugins@0.2.0-alpha.197

## 0.2.0-alpha.196

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.196
  - @brains/utils@0.2.0-alpha.196
  - @brains/plugins@0.2.0-alpha.196

## 0.2.0-alpha.195

### Patch Changes

- Updated dependencies [[`1ece871`](https://github.com/rizom-ai/brains/commit/1ece871c78c950ff91033cb62e34fe89987cfd2c)]:
  - @brains/plugins@0.2.0-alpha.195
  - @brains/email-contracts@0.2.0-alpha.195
  - @brains/utils@0.2.0-alpha.195

## 0.2.0-alpha.194

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.194
  - @brains/utils@0.2.0-alpha.194
  - @brains/plugins@0.2.0-alpha.194

## 0.2.0-alpha.193

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.193
  - @brains/utils@0.2.0-alpha.193
  - @brains/plugins@0.2.0-alpha.193

## 0.2.0-alpha.192

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.192
  - @brains/utils@0.2.0-alpha.192
  - @brains/plugins@0.2.0-alpha.192

## 0.2.0-alpha.191

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.191
  - @brains/utils@0.2.0-alpha.191
  - @brains/plugins@0.2.0-alpha.191

## 0.2.0-alpha.190

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.190
  - @brains/utils@0.2.0-alpha.190
  - @brains/plugins@0.2.0-alpha.190

## 0.2.0-alpha.189

### Patch Changes

- Updated dependencies [[`5294aec`](https://github.com/rizom-ai/brains/commit/5294aec7eab3b98ddfa68fc3aadc4b966355740e)]:
  - @brains/plugins@0.2.0-alpha.189
  - @brains/email-contracts@0.2.0-alpha.189
  - @brains/utils@0.2.0-alpha.189

## 0.2.0-alpha.188

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.188
  - @brains/utils@0.2.0-alpha.188
  - @brains/plugins@0.2.0-alpha.188

## 0.2.0-alpha.187

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.187
  - @brains/utils@0.2.0-alpha.187
  - @brains/plugins@0.2.0-alpha.187

## 0.2.0-alpha.186

### Patch Changes

- Updated dependencies [[`45c57a1`](https://github.com/rizom-ai/brains/commit/45c57a1330e11fb79ea376a82924c9f02e4a84d4), [`143788b`](https://github.com/rizom-ai/brains/commit/143788beb9544649f3d1bac16bcea605c36cd94a)]:
  - @brains/plugins@0.2.0-alpha.186
  - @brains/email-contracts@0.2.0-alpha.186
  - @brains/utils@0.2.0-alpha.186

## 0.2.0-alpha.185

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.185
  - @brains/utils@0.2.0-alpha.185
  - @brains/plugins@0.2.0-alpha.185

## 0.2.0-alpha.184

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.184
  - @brains/email-contracts@0.2.0-alpha.184
  - @brains/utils@0.2.0-alpha.184

## 0.2.0-alpha.183

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.183
  - @brains/email-contracts@0.2.0-alpha.183
  - @brains/utils@0.2.0-alpha.183

## 0.2.0-alpha.182

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.182
  - @brains/utils@0.2.0-alpha.182
  - @brains/plugins@0.2.0-alpha.182

## 0.2.0-alpha.181

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.181
  - @brains/utils@0.2.0-alpha.181
  - @brains/plugins@0.2.0-alpha.181

## 0.2.0-alpha.180

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.180
  - @brains/email-contracts@0.2.0-alpha.180
  - @brains/utils@0.2.0-alpha.180

## 0.2.0-alpha.179

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.179
  - @brains/email-contracts@0.2.0-alpha.179
  - @brains/utils@0.2.0-alpha.179

## 0.2.0-alpha.178

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.178
  - @brains/utils@0.2.0-alpha.178
  - @brains/plugins@0.2.0-alpha.178

## 0.2.0-alpha.177

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.177
  - @brains/utils@0.2.0-alpha.177
  - @brains/plugins@0.2.0-alpha.177

## 0.2.0-alpha.176

### Patch Changes

- Updated dependencies [[`de494c9`](https://github.com/rizom-ai/brains/commit/de494c964bef7a85e4f6c88f17577d56fc1bc6fb)]:
  - @brains/plugins@0.2.0-alpha.176
  - @brains/email-contracts@0.2.0-alpha.176
  - @brains/utils@0.2.0-alpha.176

## 0.2.0-alpha.175

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.175
  - @brains/email-contracts@0.2.0-alpha.175
  - @brains/utils@0.2.0-alpha.175

## 0.2.0-alpha.174

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.174
  - @brains/email-contracts@0.2.0-alpha.174
  - @brains/utils@0.2.0-alpha.174

## 0.2.0-alpha.173

### Patch Changes

- Updated dependencies [[`8427031`](https://github.com/rizom-ai/brains/commit/84270311c343964449d96c4cd60e4066daac4aef)]:
  - @brains/plugins@0.2.0-alpha.173
  - @brains/email-contracts@0.2.0-alpha.173
  - @brains/utils@0.2.0-alpha.173

## 0.2.0-alpha.172

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.172
  - @brains/utils@0.2.0-alpha.172
  - @brains/plugins@0.2.0-alpha.172

## 0.2.0-alpha.171

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.171
  - @brains/utils@0.2.0-alpha.171
  - @brains/plugins@0.2.0-alpha.171

## 0.2.0-alpha.170

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.170
  - @brains/utils@0.2.0-alpha.170
  - @brains/plugins@0.2.0-alpha.170

## 0.2.0-alpha.169

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.169
  - @brains/utils@0.2.0-alpha.169
  - @brains/plugins@0.2.0-alpha.169

## 0.2.0-alpha.168

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.168
  - @brains/utils@0.2.0-alpha.168
  - @brains/plugins@0.2.0-alpha.168

## 0.2.0-alpha.167

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.167
  - @brains/email-contracts@0.2.0-alpha.167
  - @brains/utils@0.2.0-alpha.167

## 0.2.0-alpha.166

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.166
  - @brains/utils@0.2.0-alpha.166
  - @brains/plugins@0.2.0-alpha.166

## 0.2.0-alpha.165

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.165
  - @brains/email-contracts@0.2.0-alpha.165
  - @brains/utils@0.2.0-alpha.165

## 0.2.0-alpha.164

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.164
  - @brains/utils@0.2.0-alpha.164
  - @brains/plugins@0.2.0-alpha.164

## 0.2.0-alpha.163

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.163
  - @brains/utils@0.2.0-alpha.163
  - @brains/plugins@0.2.0-alpha.163

## 0.2.0-alpha.162

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.162
  - @brains/utils@0.2.0-alpha.162
  - @brains/plugins@0.2.0-alpha.162

## 0.2.0-alpha.161

### Patch Changes

- Updated dependencies [[`61c6862`](https://github.com/rizom-ai/brains/commit/61c68624c0ae21f9d00d307db02ce5a1439d2765)]:
  - @brains/plugins@0.2.0-alpha.161
  - @brains/email-contracts@0.2.0-alpha.161
  - @brains/utils@0.2.0-alpha.161

## 0.2.0-alpha.160

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.160
  - @brains/email-contracts@0.2.0-alpha.160
  - @brains/utils@0.2.0-alpha.160

## 0.2.0-alpha.159

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.159
  - @brains/utils@0.2.0-alpha.159
  - @brains/plugins@0.2.0-alpha.159

## 0.2.0-alpha.158

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.158
  - @brains/utils@0.2.0-alpha.158
  - @brains/plugins@0.2.0-alpha.158

## 0.2.0-alpha.157

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.157
  - @brains/utils@0.2.0-alpha.157
  - @brains/plugins@0.2.0-alpha.157

## 0.2.0-alpha.156

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.156
  - @brains/utils@0.2.0-alpha.156
  - @brains/plugins@0.2.0-alpha.156

## 0.2.0-alpha.155

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.155
  - @brains/email-contracts@0.2.0-alpha.155
  - @brains/utils@0.2.0-alpha.155

## 0.2.0-alpha.154

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.154
  - @brains/utils@0.2.0-alpha.154
  - @brains/plugins@0.2.0-alpha.154

## 0.2.0-alpha.153

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.153
  - @brains/utils@0.2.0-alpha.153
  - @brains/plugins@0.2.0-alpha.153

## 0.2.0-alpha.152

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.152
  - @brains/utils@0.2.0-alpha.152
  - @brains/plugins@0.2.0-alpha.152

## 0.2.0-alpha.151

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.151
  - @brains/utils@0.2.0-alpha.151
  - @brains/plugins@0.2.0-alpha.151

## 0.2.0-alpha.150

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.150
  - @brains/email-contracts@0.2.0-alpha.150
  - @brains/utils@0.2.0-alpha.150

## 0.2.0-alpha.149

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.149
  - @brains/utils@0.2.0-alpha.149
  - @brains/plugins@0.2.0-alpha.149

## 0.2.0-alpha.148

### Patch Changes

- Updated dependencies [[`d82b56c`](https://github.com/rizom-ai/brains/commit/d82b56cd9729a7a1d06a1232fea0674d9853da87)]:
  - @brains/plugins@0.2.0-alpha.148
  - @brains/email-contracts@0.2.0-alpha.148
  - @brains/utils@0.2.0-alpha.148

## 0.2.0-alpha.147

### Patch Changes

- Updated dependencies [[`6d95483`](https://github.com/rizom-ai/brains/commit/6d95483c589c3e77b23c42bf9516c03be8253e1f)]:
  - @brains/plugins@0.2.0-alpha.147
  - @brains/email-contracts@0.2.0-alpha.147
  - @brains/utils@0.2.0-alpha.147

## 0.2.0-alpha.146

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.146
  - @brains/utils@0.2.0-alpha.146
  - @brains/plugins@0.2.0-alpha.146

## 0.2.0-alpha.145

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.145
  - @brains/utils@0.2.0-alpha.145
  - @brains/plugins@0.2.0-alpha.145

## 0.2.0-alpha.144

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.144
  - @brains/utils@0.2.0-alpha.144
  - @brains/plugins@0.2.0-alpha.144

## 0.2.0-alpha.143

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.143
  - @brains/utils@0.2.0-alpha.143
  - @brains/plugins@0.2.0-alpha.143

## 0.2.0-alpha.142

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.142
  - @brains/email-contracts@0.2.0-alpha.142
  - @brains/utils@0.2.0-alpha.142

## 0.2.0-alpha.141

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.141
  - @brains/email-contracts@0.2.0-alpha.141
  - @brains/utils@0.2.0-alpha.141

## 0.2.0-alpha.140

### Patch Changes

- Updated dependencies [[`070541b`](https://github.com/rizom-ai/brains/commit/070541b535e3977c8fe2d590ae7ad114cee09417), [`a30edc7`](https://github.com/rizom-ai/brains/commit/a30edc7ac66807c66cba2bc94e78206f133710d6), [`cea906c`](https://github.com/rizom-ai/brains/commit/cea906c689d40dee5f06ab949d5289c2660bfd37)]:
  - @brains/plugins@0.2.0-alpha.140
  - @brains/utils@0.2.0-alpha.140
  - @brains/email-contracts@0.2.0-alpha.140

## 0.2.0-alpha.139

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.139
  - @brains/utils@0.2.0-alpha.139
  - @brains/plugins@0.2.0-alpha.139

## 0.2.0-alpha.138

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.138
  - @brains/utils@0.2.0-alpha.138
  - @brains/plugins@0.2.0-alpha.138

## 0.2.0-alpha.137

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.137
  - @brains/utils@0.2.0-alpha.137
  - @brains/plugins@0.2.0-alpha.137

## 0.2.0-alpha.136

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.136
  - @brains/utils@0.2.0-alpha.136
  - @brains/plugins@0.2.0-alpha.136

## 0.2.0-alpha.135

### Patch Changes

- Updated dependencies [[`37db2bc`](https://github.com/rizom-ai/brains/commit/37db2bc759e606f42efacedd70056e9c2f440a4e)]:
  - @brains/plugins@0.2.0-alpha.135
  - @brains/email-contracts@0.2.0-alpha.135
  - @brains/utils@0.2.0-alpha.135

## 0.2.0-alpha.134

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.134
  - @brains/utils@0.2.0-alpha.134
  - @brains/plugins@0.2.0-alpha.134

## 0.2.0-alpha.133

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.133
  - @brains/utils@0.2.0-alpha.133
  - @brains/plugins@0.2.0-alpha.133

## 0.2.0-alpha.132

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.132
  - @brains/email-contracts@0.2.0-alpha.132
  - @brains/utils@0.2.0-alpha.132

## 0.2.0-alpha.131

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.131
  - @brains/email-contracts@0.2.0-alpha.131
  - @brains/utils@0.2.0-alpha.131

## 0.2.0-alpha.130

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.130
  - @brains/utils@0.2.0-alpha.130
  - @brains/plugins@0.2.0-alpha.130

## 0.2.0-alpha.129

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.129
  - @brains/utils@0.2.0-alpha.129
  - @brains/plugins@0.2.0-alpha.129

## 0.2.0-alpha.128

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.128
  - @brains/utils@0.2.0-alpha.128
  - @brains/plugins@0.2.0-alpha.128

## 0.2.0-alpha.127

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.127
  - @brains/utils@0.2.0-alpha.127
  - @brains/plugins@0.2.0-alpha.127

## 0.2.0-alpha.126

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.126
  - @brains/utils@0.2.0-alpha.126
  - @brains/plugins@0.2.0-alpha.126

## 0.2.0-alpha.125

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.125
  - @brains/email-contracts@0.2.0-alpha.125
  - @brains/utils@0.2.0-alpha.125

## 0.2.0-alpha.124

### Patch Changes

- Updated dependencies [[`57b025e`](https://github.com/rizom-ai/brains/commit/57b025e2bf9015c3f3e46b91fbdbef766efc3d10)]:
  - @brains/plugins@0.2.0-alpha.124
  - @brains/email-contracts@0.2.0-alpha.124
  - @brains/utils@0.2.0-alpha.124

## 0.2.0-alpha.123

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.123
  - @brains/email-contracts@0.2.0-alpha.123
  - @brains/utils@0.2.0-alpha.123

## 0.2.0-alpha.122

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.122
  - @brains/utils@0.2.0-alpha.122
  - @brains/plugins@0.2.0-alpha.122

## 0.2.0-alpha.121

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.121
  - @brains/utils@0.2.0-alpha.121
  - @brains/plugins@0.2.0-alpha.121

## 0.2.0-alpha.120

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.120
  - @brains/utils@0.2.0-alpha.120
  - @brains/plugins@0.2.0-alpha.120

## 0.2.0-alpha.119

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.119
  - @brains/email-contracts@0.2.0-alpha.119
  - @brains/utils@0.2.0-alpha.119

## 0.2.0-alpha.118

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.118
  - @brains/email-contracts@0.2.0-alpha.118
  - @brains/utils@0.2.0-alpha.118

## 0.2.0-alpha.117

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.117
  - @brains/utils@0.2.0-alpha.117
  - @brains/plugins@0.2.0-alpha.117

## 0.2.0-alpha.116

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.116
  - @brains/email-contracts@0.2.0-alpha.116
  - @brains/utils@0.2.0-alpha.116

## 0.2.0-alpha.115

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.115
  - @brains/utils@0.2.0-alpha.115
  - @brains/plugins@0.2.0-alpha.115

## 0.2.0-alpha.114

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.114
  - @brains/utils@0.2.0-alpha.114
  - @brains/plugins@0.2.0-alpha.114

## 0.2.0-alpha.113

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.113
  - @brains/utils@0.2.0-alpha.113
  - @brains/plugins@0.2.0-alpha.113

## 0.2.0-alpha.112

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.112
  - @brains/utils@0.2.0-alpha.112
  - @brains/plugins@0.2.0-alpha.112

## 0.2.0-alpha.111

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.111
  - @brains/utils@0.2.0-alpha.111
  - @brains/plugins@0.2.0-alpha.111

## 0.2.0-alpha.110

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.110
  - @brains/utils@0.2.0-alpha.110
  - @brains/plugins@0.2.0-alpha.110

## 0.2.0-alpha.109

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.109
  - @brains/utils@0.2.0-alpha.109
  - @brains/plugins@0.2.0-alpha.109

## 0.2.0-alpha.108

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.108
  - @brains/utils@0.2.0-alpha.108
  - @brains/plugins@0.2.0-alpha.108

## 0.2.0-alpha.107

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.107
  - @brains/utils@0.2.0-alpha.107
  - @brains/plugins@0.2.0-alpha.107

## 0.2.0-alpha.106

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.106
  - @brains/utils@0.2.0-alpha.106
  - @brains/plugins@0.2.0-alpha.106

## 0.2.0-alpha.105

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.105
  - @brains/utils@0.2.0-alpha.105
  - @brains/plugins@0.2.0-alpha.105

## 0.2.0-alpha.104

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.104
  - @brains/utils@0.2.0-alpha.104
  - @brains/plugins@0.2.0-alpha.104

## 0.2.0-alpha.103

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.103
  - @brains/utils@0.2.0-alpha.103
  - @brains/plugins@0.2.0-alpha.103

## 0.2.0-alpha.102

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.102
  - @brains/utils@0.2.0-alpha.102
  - @brains/plugins@0.2.0-alpha.102

## 0.2.0-alpha.101

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.101
  - @brains/utils@0.2.0-alpha.101
  - @brains/plugins@0.2.0-alpha.101

## 0.2.0-alpha.100

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.100
  - @brains/utils@0.2.0-alpha.100
  - @brains/plugins@0.2.0-alpha.100

## 0.2.0-alpha.99

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.99
  - @brains/utils@0.2.0-alpha.99
  - @brains/plugins@0.2.0-alpha.99

## 0.2.0-alpha.98

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.98
  - @brains/utils@0.2.0-alpha.98
  - @brains/plugins@0.2.0-alpha.98

## 0.2.0-alpha.97

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.97
  - @brains/utils@0.2.0-alpha.97
  - @brains/plugins@0.2.0-alpha.97

## 0.2.0-alpha.96

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.96
  - @brains/utils@0.2.0-alpha.96
  - @brains/plugins@0.2.0-alpha.96

## 0.2.0-alpha.95

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.95
  - @brains/utils@0.2.0-alpha.95
  - @brains/plugins@0.2.0-alpha.95

## 0.2.0-alpha.94

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.94
  - @brains/utils@0.2.0-alpha.94
  - @brains/plugins@0.2.0-alpha.94

## 0.2.0-alpha.93

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.93
  - @brains/utils@0.2.0-alpha.93
  - @brains/plugins@0.2.0-alpha.93

## 0.2.0-alpha.92

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.92
  - @brains/utils@0.2.0-alpha.92
  - @brains/plugins@0.2.0-alpha.92

## 0.2.0-alpha.91

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.91
  - @brains/utils@0.2.0-alpha.91
  - @brains/plugins@0.2.0-alpha.91

## 0.2.0-alpha.90

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.90
  - @brains/utils@0.2.0-alpha.90
  - @brains/plugins@0.2.0-alpha.90

## 0.2.0-alpha.89

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.89
  - @brains/utils@0.2.0-alpha.89
  - @brains/plugins@0.2.0-alpha.89

## 0.2.0-alpha.88

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.88
  - @brains/utils@0.2.0-alpha.88
  - @brains/plugins@0.2.0-alpha.88

## 0.2.0-alpha.87

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.87
  - @brains/utils@0.2.0-alpha.87
  - @brains/plugins@0.2.0-alpha.87

## 0.2.0-alpha.86

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.86
  - @brains/utils@0.2.0-alpha.86
  - @brains/plugins@0.2.0-alpha.86

## 0.2.0-alpha.85

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.85
  - @brains/utils@0.2.0-alpha.85
  - @brains/plugins@0.2.0-alpha.85

## 0.2.0-alpha.84

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.84
  - @brains/utils@0.2.0-alpha.84
  - @brains/plugins@0.2.0-alpha.84

## 0.2.0-alpha.83

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.83
  - @brains/utils@0.2.0-alpha.83
  - @brains/plugins@0.2.0-alpha.83

## 0.2.0-alpha.82

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.82
  - @brains/utils@0.2.0-alpha.82
  - @brains/plugins@0.2.0-alpha.82

## 0.2.0-alpha.81

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.81
  - @brains/utils@0.2.0-alpha.81
  - @brains/plugins@0.2.0-alpha.81

## 0.2.0-alpha.80

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.80
  - @brains/utils@0.2.0-alpha.80
  - @brains/plugins@0.2.0-alpha.80

## 0.2.0-alpha.79

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.79
  - @brains/utils@0.2.0-alpha.79
  - @brains/plugins@0.2.0-alpha.79

## 0.2.0-alpha.78

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.78
  - @brains/utils@0.2.0-alpha.78
  - @brains/plugins@0.2.0-alpha.78

## 0.2.0-alpha.77

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.77
  - @brains/utils@0.2.0-alpha.77
  - @brains/plugins@0.2.0-alpha.77

## 0.2.0-alpha.76

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.76
  - @brains/utils@0.2.0-alpha.76
  - @brains/plugins@0.2.0-alpha.76

## 0.2.0-alpha.75

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.75
  - @brains/utils@0.2.0-alpha.75
  - @brains/plugins@0.2.0-alpha.75

## 0.2.0-alpha.74

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.74
  - @brains/utils@0.2.0-alpha.74
  - @brains/plugins@0.2.0-alpha.74

## 0.2.0-alpha.73

### Patch Changes

- Updated dependencies []:
  - @brains/email-contracts@0.2.0-alpha.73
  - @brains/utils@0.2.0-alpha.73
  - @brains/plugins@0.2.0-alpha.73

## 0.2.0-alpha.72

### Minor Changes

- [`e7e4205`](https://github.com/rizom-ai/brains/commit/e7e4205282726e6c092841bc4a4c9a6b9d35efdf) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add generic notifications routing with audience-agnostic delivery intent and contact-based dispatch. Introduces `@brains/notifications` (router), `@brains/email-contracts` (shared schemas with `sensitivity` flag for log redaction), and `@brains/email-resend` (Resend channel adapter).

### Patch Changes

- Updated dependencies [[`e7e4205`](https://github.com/rizom-ai/brains/commit/e7e4205282726e6c092841bc4a4c9a6b9d35efdf)]:
  - @brains/email-contracts@0.2.0-alpha.72
  - @brains/utils@0.2.0-alpha.72
  - @brains/plugins@0.2.0-alpha.72

# @brains/ai-service

## 0.2.0-alpha.323

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.323
  - @brains/utils@0.2.0-alpha.323
  - @brains/conversation-service@0.2.0-alpha.323
  - @brains/entity-service@0.2.0-alpha.323
  - @brains/identity-service@0.2.0-alpha.323
  - @brains/mcp-service@0.2.0-alpha.323
  - @brains/messaging-service@0.2.0-alpha.323
  - @brains/templates@0.2.0-alpha.323

## 0.2.0-alpha.322

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.322
  - @brains/utils@0.2.0-alpha.322
  - @brains/conversation-service@0.2.0-alpha.322
  - @brains/entity-service@0.2.0-alpha.322
  - @brains/identity-service@0.2.0-alpha.322
  - @brains/mcp-service@0.2.0-alpha.322
  - @brains/messaging-service@0.2.0-alpha.322
  - @brains/templates@0.2.0-alpha.322

## 0.2.0-alpha.321

### Patch Changes

- Updated dependencies [[`f9bd1c6`](https://github.com/rizom-ai/brains/commit/f9bd1c6291f560a5bb679357d199f1af29005d63)]:
  - @brains/entity-service@0.2.0-alpha.321
  - @brains/identity-service@0.2.0-alpha.321
  - @brains/contracts@0.2.0-alpha.321
  - @brains/utils@0.2.0-alpha.321
  - @brains/conversation-service@0.2.0-alpha.321
  - @brains/mcp-service@0.2.0-alpha.321
  - @brains/messaging-service@0.2.0-alpha.321
  - @brains/templates@0.2.0-alpha.321

## 0.2.0-alpha.320

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.320
  - @brains/utils@0.2.0-alpha.320
  - @brains/conversation-service@0.2.0-alpha.320
  - @brains/entity-service@0.2.0-alpha.320
  - @brains/identity-service@0.2.0-alpha.320
  - @brains/mcp-service@0.2.0-alpha.320
  - @brains/messaging-service@0.2.0-alpha.320
  - @brains/templates@0.2.0-alpha.320

## 0.2.0-alpha.319

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.319
  - @brains/utils@0.2.0-alpha.319
  - @brains/conversation-service@0.2.0-alpha.319
  - @brains/entity-service@0.2.0-alpha.319
  - @brains/identity-service@0.2.0-alpha.319
  - @brains/mcp-service@0.2.0-alpha.319
  - @brains/messaging-service@0.2.0-alpha.319
  - @brains/templates@0.2.0-alpha.319

## 0.2.0-alpha.318

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.318
  - @brains/utils@0.2.0-alpha.318
  - @brains/conversation-service@0.2.0-alpha.318
  - @brains/entity-service@0.2.0-alpha.318
  - @brains/identity-service@0.2.0-alpha.318
  - @brains/mcp-service@0.2.0-alpha.318
  - @brains/messaging-service@0.2.0-alpha.318
  - @brains/templates@0.2.0-alpha.318

## 0.2.0-alpha.317

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.317
  - @brains/utils@0.2.0-alpha.317
  - @brains/conversation-service@0.2.0-alpha.317
  - @brains/entity-service@0.2.0-alpha.317
  - @brains/identity-service@0.2.0-alpha.317
  - @brains/mcp-service@0.2.0-alpha.317
  - @brains/messaging-service@0.2.0-alpha.317
  - @brains/templates@0.2.0-alpha.317

## 0.2.0-alpha.316

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.316
  - @brains/utils@0.2.0-alpha.316
  - @brains/conversation-service@0.2.0-alpha.316
  - @brains/entity-service@0.2.0-alpha.316
  - @brains/identity-service@0.2.0-alpha.316
  - @brains/mcp-service@0.2.0-alpha.316
  - @brains/messaging-service@0.2.0-alpha.316
  - @brains/templates@0.2.0-alpha.316

## 0.2.0-alpha.315

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.315
  - @brains/utils@0.2.0-alpha.315
  - @brains/conversation-service@0.2.0-alpha.315
  - @brains/entity-service@0.2.0-alpha.315
  - @brains/identity-service@0.2.0-alpha.315
  - @brains/mcp-service@0.2.0-alpha.315
  - @brains/messaging-service@0.2.0-alpha.315
  - @brains/templates@0.2.0-alpha.315

## 0.2.0-alpha.314

### Patch Changes

- [`9636536`](https://github.com/rizom-ai/brains/commit/9636536389923425cbf6ee21c3063e35eed9b5e6) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Collapse the remaining duplicate type declarations onto their canonical homes.

  - The `JsonValue`/`JsonObject` family was declared independently in ai-service,
    auth-service, and site-engine; all three now use `@brains/contracts`, whose
    copy is the tested one (the published-SDK copy keeps its parity guard).
  - `@brains/core` exported `SerializableEntity`, its schema, and the identity
    alias `SerializableQueryResult` with zero consumers anywhere — deleted.
  - job-queue declared `JobProgressEvent` twice: a 30-line hand-written interface
    in `schemas.ts` and a `z.output` alias in the progress monitor. The schema is
    now the single source; the public type derives from it.

- Updated dependencies [[`9bd1925`](https://github.com/rizom-ai/brains/commit/9bd192562923351e62909c7a0662eeeb46453303), [`d339319`](https://github.com/rizom-ai/brains/commit/d339319dabea7f856b69c829e46d3937254880d3), [`eef6a9c`](https://github.com/rizom-ai/brains/commit/eef6a9ce7e49c61b971e71457f711ce8ca3b1857), [`ae06107`](https://github.com/rizom-ai/brains/commit/ae06107694a825378e23183c26261c91166edfdf), [`17507e8`](https://github.com/rizom-ai/brains/commit/17507e806efc5fde1c30496700de74b53575d350), [`fd2855e`](https://github.com/rizom-ai/brains/commit/fd2855ea09d880ebf4268ce6f9a53d4cb9289c07), [`497fbc0`](https://github.com/rizom-ai/brains/commit/497fbc0f6d672e23afd5263a519c4e73a740c2c5)]:
  - @brains/contracts@0.2.0-alpha.314
  - @brains/identity-service@0.2.0-alpha.314
  - @brains/conversation-service@0.2.0-alpha.314
  - @brains/entity-service@0.2.0-alpha.314
  - @brains/mcp-service@0.2.0-alpha.314
  - @brains/messaging-service@0.2.0-alpha.314
  - @brains/templates@0.2.0-alpha.314
  - @brains/utils@0.2.0-alpha.314

## 0.2.0-alpha.313

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.313
  - @brains/utils@0.2.0-alpha.313
  - @brains/conversation-service@0.2.0-alpha.313
  - @brains/entity-service@0.2.0-alpha.313
  - @brains/identity-service@0.2.0-alpha.313
  - @brains/mcp-service@0.2.0-alpha.313
  - @brains/messaging-service@0.2.0-alpha.313
  - @brains/templates@0.2.0-alpha.313

## 0.2.0-alpha.312

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.312
  - @brains/utils@0.2.0-alpha.312
  - @brains/conversation-service@0.2.0-alpha.312
  - @brains/entity-service@0.2.0-alpha.312
  - @brains/identity-service@0.2.0-alpha.312
  - @brains/mcp-service@0.2.0-alpha.312
  - @brains/messaging-service@0.2.0-alpha.312
  - @brains/templates@0.2.0-alpha.312

## 0.2.0-alpha.311

### Patch Changes

- Updated dependencies [[`0b4d2bc`](https://github.com/rizom-ai/brains/commit/0b4d2bca39b83d60183c0040f63f4bb9c2f9d029)]:
  - @brains/utils@0.2.0-alpha.311
  - @brains/contracts@0.2.0-alpha.311
  - @brains/conversation-service@0.2.0-alpha.311
  - @brains/entity-service@0.2.0-alpha.311
  - @brains/identity-service@0.2.0-alpha.311
  - @brains/mcp-service@0.2.0-alpha.311
  - @brains/messaging-service@0.2.0-alpha.311
  - @brains/templates@0.2.0-alpha.311

## 0.2.0-alpha.310

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.310
  - @brains/utils@0.2.0-alpha.310
  - @brains/conversation-service@0.2.0-alpha.310
  - @brains/entity-service@0.2.0-alpha.310
  - @brains/identity-service@0.2.0-alpha.310
  - @brains/mcp-service@0.2.0-alpha.310
  - @brains/messaging-service@0.2.0-alpha.310
  - @brains/templates@0.2.0-alpha.310

## 0.2.0-alpha.309

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.309
  - @brains/utils@0.2.0-alpha.309
  - @brains/conversation-service@0.2.0-alpha.309
  - @brains/entity-service@0.2.0-alpha.309
  - @brains/identity-service@0.2.0-alpha.309
  - @brains/mcp-service@0.2.0-alpha.309
  - @brains/messaging-service@0.2.0-alpha.309
  - @brains/templates@0.2.0-alpha.309

## 0.2.0-alpha.308

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.308
  - @brains/utils@0.2.0-alpha.308
  - @brains/conversation-service@0.2.0-alpha.308
  - @brains/entity-service@0.2.0-alpha.308
  - @brains/identity-service@0.2.0-alpha.308
  - @brains/mcp-service@0.2.0-alpha.308
  - @brains/messaging-service@0.2.0-alpha.308
  - @brains/templates@0.2.0-alpha.308

## 0.2.0-alpha.307

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.307
  - @brains/utils@0.2.0-alpha.307
  - @brains/conversation-service@0.2.0-alpha.307
  - @brains/entity-service@0.2.0-alpha.307
  - @brains/identity-service@0.2.0-alpha.307
  - @brains/mcp-service@0.2.0-alpha.307
  - @brains/messaging-service@0.2.0-alpha.307
  - @brains/templates@0.2.0-alpha.307

## 0.2.0-alpha.306

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.306
  - @brains/utils@0.2.0-alpha.306
  - @brains/conversation-service@0.2.0-alpha.306
  - @brains/entity-service@0.2.0-alpha.306
  - @brains/identity-service@0.2.0-alpha.306
  - @brains/mcp-service@0.2.0-alpha.306
  - @brains/messaging-service@0.2.0-alpha.306
  - @brains/templates@0.2.0-alpha.306

## 0.2.0-alpha.305

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.305
  - @brains/utils@0.2.0-alpha.305
  - @brains/conversation-service@0.2.0-alpha.305
  - @brains/entity-service@0.2.0-alpha.305
  - @brains/identity-service@0.2.0-alpha.305
  - @brains/mcp-service@0.2.0-alpha.305
  - @brains/messaging-service@0.2.0-alpha.305
  - @brains/templates@0.2.0-alpha.305

## 0.2.0-alpha.304

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.304
  - @brains/utils@0.2.0-alpha.304
  - @brains/conversation-service@0.2.0-alpha.304
  - @brains/entity-service@0.2.0-alpha.304
  - @brains/identity-service@0.2.0-alpha.304
  - @brains/mcp-service@0.2.0-alpha.304
  - @brains/messaging-service@0.2.0-alpha.304
  - @brains/templates@0.2.0-alpha.304

## 0.2.0-alpha.303

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.303
  - @brains/utils@0.2.0-alpha.303
  - @brains/conversation-service@0.2.0-alpha.303
  - @brains/entity-service@0.2.0-alpha.303
  - @brains/identity-service@0.2.0-alpha.303
  - @brains/mcp-service@0.2.0-alpha.303
  - @brains/messaging-service@0.2.0-alpha.303
  - @brains/templates@0.2.0-alpha.303

## 0.2.0-alpha.302

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.302
  - @brains/utils@0.2.0-alpha.302
  - @brains/conversation-service@0.2.0-alpha.302
  - @brains/entity-service@0.2.0-alpha.302
  - @brains/identity-service@0.2.0-alpha.302
  - @brains/mcp-service@0.2.0-alpha.302
  - @brains/messaging-service@0.2.0-alpha.302
  - @brains/templates@0.2.0-alpha.302

## 0.2.0-alpha.301

### Patch Changes

- [`b2fd00c`](https://github.com/rizom-ai/brains/commit/b2fd00c1550e0b9a386484e07a53546106f793ce) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Narrow service dependencies to the members their consumers actually call, so a
  stand-in can be checked against them rather than asserted into place.

  Most of this is additive or loosening: a function that asked for a whole
  `IEntityService`, `IConversationService`, `IJobQueueService`, `PasskeyService`
  or `SimpleGit` now asks for the two or three methods it uses, which accepts
  strictly more than before. Several constructors dropped a lone overload that
  hid a `runtimeOptions` parameter their implementations already accepted, and a
  few internals became module-level exports.

  One change narrows rather than widens: `IRuntimeUploadsNamespace.scoped()`
  returns `ScopedRuntimeUploadStore` — the seven methods the store offers —
  instead of the concrete `RuntimeUploadStore` class. Code calling those methods
  is unaffected; code reaching into the class's private fields is not, which was
  the point.

  `shell/ai-evaluation` also drops an `eval` script that pointed at a directory
  with no eval config and so could never run. The canonical entry point,
  `cd packages/brain-cli && bun run eval`, is unchanged.

- Updated dependencies [[`b2fd00c`](https://github.com/rizom-ai/brains/commit/b2fd00c1550e0b9a386484e07a53546106f793ce)]:
  - @brains/entity-service@0.2.0-alpha.301
  - @brains/identity-service@0.2.0-alpha.301
  - @brains/contracts@0.2.0-alpha.301
  - @brains/utils@0.2.0-alpha.301
  - @brains/conversation-service@0.2.0-alpha.301
  - @brains/mcp-service@0.2.0-alpha.301
  - @brains/messaging-service@0.2.0-alpha.301
  - @brains/templates@0.2.0-alpha.301

## 0.2.0-alpha.300

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.300
  - @brains/utils@0.2.0-alpha.300
  - @brains/conversation-service@0.2.0-alpha.300
  - @brains/entity-service@0.2.0-alpha.300
  - @brains/identity-service@0.2.0-alpha.300
  - @brains/mcp-service@0.2.0-alpha.300
  - @brains/messaging-service@0.2.0-alpha.300
  - @brains/templates@0.2.0-alpha.300

## 0.2.0-alpha.299

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.299
  - @brains/utils@0.2.0-alpha.299
  - @brains/conversation-service@0.2.0-alpha.299
  - @brains/entity-service@0.2.0-alpha.299
  - @brains/identity-service@0.2.0-alpha.299
  - @brains/mcp-service@0.2.0-alpha.299
  - @brains/messaging-service@0.2.0-alpha.299
  - @brains/templates@0.2.0-alpha.299

## 0.2.0-alpha.298

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.298
  - @brains/utils@0.2.0-alpha.298
  - @brains/conversation-service@0.2.0-alpha.298
  - @brains/entity-service@0.2.0-alpha.298
  - @brains/identity-service@0.2.0-alpha.298
  - @brains/mcp-service@0.2.0-alpha.298
  - @brains/messaging-service@0.2.0-alpha.298
  - @brains/templates@0.2.0-alpha.298

## 0.2.0-alpha.297

### Patch Changes

- Updated dependencies [[`f6d93c7`](https://github.com/rizom-ai/brains/commit/f6d93c7aa49acccd691b049b090a7fdbbe7b6a1a)]:
  - @brains/contracts@0.2.0-alpha.297
  - @brains/conversation-service@0.2.0-alpha.297
  - @brains/entity-service@0.2.0-alpha.297
  - @brains/mcp-service@0.2.0-alpha.297
  - @brains/messaging-service@0.2.0-alpha.297
  - @brains/templates@0.2.0-alpha.297
  - @brains/identity-service@0.2.0-alpha.297
  - @brains/utils@0.2.0-alpha.297

## 0.2.0-alpha.296

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.296
  - @brains/utils@0.2.0-alpha.296
  - @brains/conversation-service@0.2.0-alpha.296
  - @brains/entity-service@0.2.0-alpha.296
  - @brains/identity-service@0.2.0-alpha.296
  - @brains/mcp-service@0.2.0-alpha.296
  - @brains/messaging-service@0.2.0-alpha.296
  - @brains/templates@0.2.0-alpha.296

## 0.2.0-alpha.295

### Patch Changes

- Updated dependencies []:
  - @brains/entity-service@0.2.0-alpha.295
  - @brains/identity-service@0.2.0-alpha.295
  - @brains/contracts@0.2.0-alpha.295
  - @brains/utils@0.2.0-alpha.295
  - @brains/conversation-service@0.2.0-alpha.295
  - @brains/mcp-service@0.2.0-alpha.295
  - @brains/messaging-service@0.2.0-alpha.295
  - @brains/templates@0.2.0-alpha.295

## 0.2.0-alpha.294

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.294
  - @brains/utils@0.2.0-alpha.294
  - @brains/conversation-service@0.2.0-alpha.294
  - @brains/entity-service@0.2.0-alpha.294
  - @brains/identity-service@0.2.0-alpha.294
  - @brains/mcp-service@0.2.0-alpha.294
  - @brains/messaging-service@0.2.0-alpha.294
  - @brains/templates@0.2.0-alpha.294

## 0.2.0-alpha.293

### Patch Changes

- Updated dependencies [[`f25b201`](https://github.com/rizom-ai/brains/commit/f25b2017de7be3a7eb117166ca3458237055137b)]:
  - @brains/messaging-service@0.2.0-alpha.293
  - @brains/conversation-service@0.2.0-alpha.293
  - @brains/mcp-service@0.2.0-alpha.293
  - @brains/identity-service@0.2.0-alpha.293
  - @brains/entity-service@0.2.0-alpha.293
  - @brains/contracts@0.2.0-alpha.293
  - @brains/utils@0.2.0-alpha.293
  - @brains/templates@0.2.0-alpha.293

## 0.2.0-alpha.292

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.292
  - @brains/utils@0.2.0-alpha.292
  - @brains/conversation-service@0.2.0-alpha.292
  - @brains/entity-service@0.2.0-alpha.292
  - @brains/identity-service@0.2.0-alpha.292
  - @brains/mcp-service@0.2.0-alpha.292
  - @brains/messaging-service@0.2.0-alpha.292
  - @brains/templates@0.2.0-alpha.292

## 0.2.0-alpha.291

### Patch Changes

- Updated dependencies []:
  - @brains/entity-service@0.2.0-alpha.291
  - @brains/identity-service@0.2.0-alpha.291
  - @brains/contracts@0.2.0-alpha.291
  - @brains/utils@0.2.0-alpha.291
  - @brains/conversation-service@0.2.0-alpha.291
  - @brains/mcp-service@0.2.0-alpha.291
  - @brains/messaging-service@0.2.0-alpha.291
  - @brains/templates@0.2.0-alpha.291

## 0.2.0-alpha.290

### Patch Changes

- Updated dependencies []:
  - @brains/entity-service@0.2.0-alpha.290
  - @brains/identity-service@0.2.0-alpha.290
  - @brains/contracts@0.2.0-alpha.290
  - @brains/utils@0.2.0-alpha.290
  - @brains/conversation-service@0.2.0-alpha.290
  - @brains/mcp-service@0.2.0-alpha.290
  - @brains/messaging-service@0.2.0-alpha.290
  - @brains/templates@0.2.0-alpha.290

## 0.2.0-alpha.289

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.289
  - @brains/utils@0.2.0-alpha.289
  - @brains/conversation-service@0.2.0-alpha.289
  - @brains/entity-service@0.2.0-alpha.289
  - @brains/identity-service@0.2.0-alpha.289
  - @brains/mcp-service@0.2.0-alpha.289
  - @brains/messaging-service@0.2.0-alpha.289
  - @brains/templates@0.2.0-alpha.289

## 0.2.0-alpha.288

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.288
  - @brains/utils@0.2.0-alpha.288
  - @brains/conversation-service@0.2.0-alpha.288
  - @brains/entity-service@0.2.0-alpha.288
  - @brains/identity-service@0.2.0-alpha.288
  - @brains/mcp-service@0.2.0-alpha.288
  - @brains/messaging-service@0.2.0-alpha.288
  - @brains/templates@0.2.0-alpha.288

## 0.2.0-alpha.287

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.287
  - @brains/utils@0.2.0-alpha.287
  - @brains/conversation-service@0.2.0-alpha.287
  - @brains/entity-service@0.2.0-alpha.287
  - @brains/identity-service@0.2.0-alpha.287
  - @brains/mcp-service@0.2.0-alpha.287
  - @brains/messaging-service@0.2.0-alpha.287
  - @brains/templates@0.2.0-alpha.287

## 0.2.0-alpha.286

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.286
  - @brains/utils@0.2.0-alpha.286
  - @brains/conversation-service@0.2.0-alpha.286
  - @brains/entity-service@0.2.0-alpha.286
  - @brains/identity-service@0.2.0-alpha.286
  - @brains/mcp-service@0.2.0-alpha.286
  - @brains/messaging-service@0.2.0-alpha.286
  - @brains/templates@0.2.0-alpha.286

## 0.2.0-alpha.285

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.285
  - @brains/utils@0.2.0-alpha.285
  - @brains/conversation-service@0.2.0-alpha.285
  - @brains/entity-service@0.2.0-alpha.285
  - @brains/identity-service@0.2.0-alpha.285
  - @brains/mcp-service@0.2.0-alpha.285
  - @brains/messaging-service@0.2.0-alpha.285
  - @brains/templates@0.2.0-alpha.285

## 0.2.0-alpha.284

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.284
  - @brains/utils@0.2.0-alpha.284
  - @brains/conversation-service@0.2.0-alpha.284
  - @brains/entity-service@0.2.0-alpha.284
  - @brains/identity-service@0.2.0-alpha.284
  - @brains/mcp-service@0.2.0-alpha.284
  - @brains/messaging-service@0.2.0-alpha.284
  - @brains/templates@0.2.0-alpha.284

## 0.2.0-alpha.283

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.283
  - @brains/utils@0.2.0-alpha.283
  - @brains/conversation-service@0.2.0-alpha.283
  - @brains/entity-service@0.2.0-alpha.283
  - @brains/identity-service@0.2.0-alpha.283
  - @brains/mcp-service@0.2.0-alpha.283
  - @brains/messaging-service@0.2.0-alpha.283
  - @brains/templates@0.2.0-alpha.283

## 0.2.0-alpha.282

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.282
  - @brains/utils@0.2.0-alpha.282
  - @brains/conversation-service@0.2.0-alpha.282
  - @brains/entity-service@0.2.0-alpha.282
  - @brains/identity-service@0.2.0-alpha.282
  - @brains/mcp-service@0.2.0-alpha.282
  - @brains/messaging-service@0.2.0-alpha.282
  - @brains/templates@0.2.0-alpha.282

## 0.2.0-alpha.281

### Patch Changes

- Updated dependencies [[`c6b44ae`](https://github.com/rizom-ai/brains/commit/c6b44ae420bc0c4c92c2081bfbc320c00987db79)]:
  - @brains/entity-service@0.2.0-alpha.281
  - @brains/identity-service@0.2.0-alpha.281
  - @brains/contracts@0.2.0-alpha.281
  - @brains/utils@0.2.0-alpha.281
  - @brains/conversation-service@0.2.0-alpha.281
  - @brains/mcp-service@0.2.0-alpha.281
  - @brains/messaging-service@0.2.0-alpha.281
  - @brains/templates@0.2.0-alpha.281

## 0.2.0-alpha.280

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.280
  - @brains/utils@0.2.0-alpha.280
  - @brains/conversation-service@0.2.0-alpha.280
  - @brains/entity-service@0.2.0-alpha.280
  - @brains/identity-service@0.2.0-alpha.280
  - @brains/mcp-service@0.2.0-alpha.280
  - @brains/messaging-service@0.2.0-alpha.280
  - @brains/templates@0.2.0-alpha.280

## 0.2.0-alpha.279

### Patch Changes

- Updated dependencies [[`bd1eb47`](https://github.com/rizom-ai/brains/commit/bd1eb4768ee154570f5ba144f59a145c7f00aa51), [`bd1eb47`](https://github.com/rizom-ai/brains/commit/bd1eb4768ee154570f5ba144f59a145c7f00aa51)]:
  - @brains/entity-service@0.2.0-alpha.279
  - @brains/contracts@0.2.0-alpha.279
  - @brains/identity-service@0.2.0-alpha.279
  - @brains/conversation-service@0.2.0-alpha.279
  - @brains/mcp-service@0.2.0-alpha.279
  - @brains/messaging-service@0.2.0-alpha.279
  - @brains/templates@0.2.0-alpha.279
  - @brains/utils@0.2.0-alpha.279

## 0.2.0-alpha.278

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.278
  - @brains/utils@0.2.0-alpha.278
  - @brains/conversation-service@0.2.0-alpha.278
  - @brains/entity-service@0.2.0-alpha.278
  - @brains/identity-service@0.2.0-alpha.278
  - @brains/mcp-service@0.2.0-alpha.278
  - @brains/messaging-service@0.2.0-alpha.278
  - @brains/templates@0.2.0-alpha.278

## 0.2.0-alpha.277

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.277
  - @brains/utils@0.2.0-alpha.277
  - @brains/conversation-service@0.2.0-alpha.277
  - @brains/entity-service@0.2.0-alpha.277
  - @brains/identity-service@0.2.0-alpha.277
  - @brains/mcp-service@0.2.0-alpha.277
  - @brains/messaging-service@0.2.0-alpha.277
  - @brains/templates@0.2.0-alpha.277

## 0.2.0-alpha.276

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.276
  - @brains/utils@0.2.0-alpha.276
  - @brains/conversation-service@0.2.0-alpha.276
  - @brains/entity-service@0.2.0-alpha.276
  - @brains/identity-service@0.2.0-alpha.276
  - @brains/mcp-service@0.2.0-alpha.276
  - @brains/messaging-service@0.2.0-alpha.276
  - @brains/templates@0.2.0-alpha.276

## 0.2.0-alpha.275

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.275
  - @brains/utils@0.2.0-alpha.275
  - @brains/conversation-service@0.2.0-alpha.275
  - @brains/entity-service@0.2.0-alpha.275
  - @brains/identity-service@0.2.0-alpha.275
  - @brains/mcp-service@0.2.0-alpha.275
  - @brains/messaging-service@0.2.0-alpha.275
  - @brains/templates@0.2.0-alpha.275

## 0.2.0-alpha.274

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.274
  - @brains/utils@0.2.0-alpha.274
  - @brains/conversation-service@0.2.0-alpha.274
  - @brains/entity-service@0.2.0-alpha.274
  - @brains/identity-service@0.2.0-alpha.274
  - @brains/mcp-service@0.2.0-alpha.274
  - @brains/messaging-service@0.2.0-alpha.274
  - @brains/templates@0.2.0-alpha.274

## 0.2.0-alpha.273

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.273
  - @brains/utils@0.2.0-alpha.273
  - @brains/conversation-service@0.2.0-alpha.273
  - @brains/entity-service@0.2.0-alpha.273
  - @brains/identity-service@0.2.0-alpha.273
  - @brains/mcp-service@0.2.0-alpha.273
  - @brains/messaging-service@0.2.0-alpha.273
  - @brains/templates@0.2.0-alpha.273

## 0.2.0-alpha.272

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.272
  - @brains/utils@0.2.0-alpha.272
  - @brains/conversation-service@0.2.0-alpha.272
  - @brains/entity-service@0.2.0-alpha.272
  - @brains/identity-service@0.2.0-alpha.272
  - @brains/mcp-service@0.2.0-alpha.272
  - @brains/messaging-service@0.2.0-alpha.272
  - @brains/templates@0.2.0-alpha.272

## 0.2.0-alpha.271

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.271
  - @brains/utils@0.2.0-alpha.271
  - @brains/conversation-service@0.2.0-alpha.271
  - @brains/entity-service@0.2.0-alpha.271
  - @brains/identity-service@0.2.0-alpha.271
  - @brains/mcp-service@0.2.0-alpha.271
  - @brains/messaging-service@0.2.0-alpha.271
  - @brains/templates@0.2.0-alpha.271

## 0.2.0-alpha.270

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.270
  - @brains/utils@0.2.0-alpha.270
  - @brains/conversation-service@0.2.0-alpha.270
  - @brains/entity-service@0.2.0-alpha.270
  - @brains/identity-service@0.2.0-alpha.270
  - @brains/mcp-service@0.2.0-alpha.270
  - @brains/messaging-service@0.2.0-alpha.270
  - @brains/templates@0.2.0-alpha.270

## 0.2.0-alpha.269

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.269
  - @brains/utils@0.2.0-alpha.269
  - @brains/conversation-service@0.2.0-alpha.269
  - @brains/entity-service@0.2.0-alpha.269
  - @brains/identity-service@0.2.0-alpha.269
  - @brains/mcp-service@0.2.0-alpha.269
  - @brains/messaging-service@0.2.0-alpha.269
  - @brains/templates@0.2.0-alpha.269

## 0.2.0-alpha.268

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.268
  - @brains/utils@0.2.0-alpha.268
  - @brains/conversation-service@0.2.0-alpha.268
  - @brains/entity-service@0.2.0-alpha.268
  - @brains/identity-service@0.2.0-alpha.268
  - @brains/mcp-service@0.2.0-alpha.268
  - @brains/messaging-service@0.2.0-alpha.268
  - @brains/templates@0.2.0-alpha.268

## 0.2.0-alpha.267

### Patch Changes

- Updated dependencies [[`1f94bde`](https://github.com/rizom-ai/brains/commit/1f94bdee59ea9e5a3b352657b1c74c36ca2af3ea)]:
  - @brains/mcp-service@0.2.0-alpha.267
  - @brains/entity-service@0.2.0-alpha.267
  - @brains/identity-service@0.2.0-alpha.267
  - @brains/contracts@0.2.0-alpha.267
  - @brains/utils@0.2.0-alpha.267
  - @brains/conversation-service@0.2.0-alpha.267
  - @brains/messaging-service@0.2.0-alpha.267
  - @brains/templates@0.2.0-alpha.267

## 0.2.0-alpha.266

### Patch Changes

- Updated dependencies [[`e70ab12`](https://github.com/rizom-ai/brains/commit/e70ab12745c6cf757f685389f4cd6de8991de95f)]:
  - @brains/utils@0.2.0-alpha.266
  - @brains/entity-service@0.2.0-alpha.266
  - @brains/contracts@0.2.0-alpha.266
  - @brains/conversation-service@0.2.0-alpha.266
  - @brains/identity-service@0.2.0-alpha.266
  - @brains/mcp-service@0.2.0-alpha.266
  - @brains/messaging-service@0.2.0-alpha.266
  - @brains/templates@0.2.0-alpha.266

## 0.2.0-alpha.265

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.265
  - @brains/utils@0.2.0-alpha.265
  - @brains/conversation-service@0.2.0-alpha.265
  - @brains/entity-service@0.2.0-alpha.265
  - @brains/identity-service@0.2.0-alpha.265
  - @brains/mcp-service@0.2.0-alpha.265
  - @brains/messaging-service@0.2.0-alpha.265
  - @brains/templates@0.2.0-alpha.265

## 0.2.0-alpha.264

### Patch Changes

- Updated dependencies []:
  - @brains/entity-service@0.2.0-alpha.264
  - @brains/identity-service@0.2.0-alpha.264
  - @brains/contracts@0.2.0-alpha.264
  - @brains/utils@0.2.0-alpha.264
  - @brains/conversation-service@0.2.0-alpha.264
  - @brains/mcp-service@0.2.0-alpha.264
  - @brains/messaging-service@0.2.0-alpha.264
  - @brains/templates@0.2.0-alpha.264

## 0.2.0-alpha.263

### Patch Changes

- Updated dependencies []:
  - @brains/entity-service@0.2.0-alpha.263
  - @brains/identity-service@0.2.0-alpha.263
  - @brains/contracts@0.2.0-alpha.263
  - @brains/utils@0.2.0-alpha.263
  - @brains/conversation-service@0.2.0-alpha.263
  - @brains/mcp-service@0.2.0-alpha.263
  - @brains/messaging-service@0.2.0-alpha.263
  - @brains/templates@0.2.0-alpha.263

## 0.2.0-alpha.262

### Patch Changes

- Updated dependencies []:
  - @brains/entity-service@0.2.0-alpha.262
  - @brains/identity-service@0.2.0-alpha.262
  - @brains/contracts@0.2.0-alpha.262
  - @brains/utils@0.2.0-alpha.262
  - @brains/conversation-service@0.2.0-alpha.262
  - @brains/mcp-service@0.2.0-alpha.262
  - @brains/messaging-service@0.2.0-alpha.262
  - @brains/templates@0.2.0-alpha.262

## 0.2.0-alpha.261

### Patch Changes

- Updated dependencies []:
  - @brains/entity-service@0.2.0-alpha.261
  - @brains/identity-service@0.2.0-alpha.261
  - @brains/contracts@0.2.0-alpha.261
  - @brains/utils@0.2.0-alpha.261
  - @brains/conversation-service@0.2.0-alpha.261
  - @brains/mcp-service@0.2.0-alpha.261
  - @brains/messaging-service@0.2.0-alpha.261
  - @brains/templates@0.2.0-alpha.261

## 0.2.0-alpha.260

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.260
  - @brains/utils@0.2.0-alpha.260
  - @brains/conversation-service@0.2.0-alpha.260
  - @brains/entity-service@0.2.0-alpha.260
  - @brains/identity-service@0.2.0-alpha.260
  - @brains/mcp-service@0.2.0-alpha.260
  - @brains/messaging-service@0.2.0-alpha.260
  - @brains/templates@0.2.0-alpha.260

## 0.2.0-alpha.259

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.259
  - @brains/utils@0.2.0-alpha.259
  - @brains/conversation-service@0.2.0-alpha.259
  - @brains/entity-service@0.2.0-alpha.259
  - @brains/identity-service@0.2.0-alpha.259
  - @brains/mcp-service@0.2.0-alpha.259
  - @brains/messaging-service@0.2.0-alpha.259
  - @brains/templates@0.2.0-alpha.259

## 0.2.0-alpha.258

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.258
  - @brains/utils@0.2.0-alpha.258
  - @brains/conversation-service@0.2.0-alpha.258
  - @brains/entity-service@0.2.0-alpha.258
  - @brains/identity-service@0.2.0-alpha.258
  - @brains/mcp-service@0.2.0-alpha.258
  - @brains/messaging-service@0.2.0-alpha.258
  - @brains/templates@0.2.0-alpha.258

## 0.2.0-alpha.257

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.257
  - @brains/utils@0.2.0-alpha.257
  - @brains/conversation-service@0.2.0-alpha.257
  - @brains/entity-service@0.2.0-alpha.257
  - @brains/identity-service@0.2.0-alpha.257
  - @brains/mcp-service@0.2.0-alpha.257
  - @brains/messaging-service@0.2.0-alpha.257
  - @brains/templates@0.2.0-alpha.257

## 0.2.0-alpha.256

### Patch Changes

- Updated dependencies [[`1e45eca`](https://github.com/rizom-ai/brains/commit/1e45ecaaed5351964cbf8a0754a301507b15c298)]:
  - @brains/utils@0.2.0-alpha.256
  - @brains/entity-service@0.2.0-alpha.256
  - @brains/contracts@0.2.0-alpha.256
  - @brains/conversation-service@0.2.0-alpha.256
  - @brains/identity-service@0.2.0-alpha.256
  - @brains/mcp-service@0.2.0-alpha.256
  - @brains/messaging-service@0.2.0-alpha.256
  - @brains/templates@0.2.0-alpha.256

## 0.2.0-alpha.255

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.255
  - @brains/utils@0.2.0-alpha.255
  - @brains/conversation-service@0.2.0-alpha.255
  - @brains/entity-service@0.2.0-alpha.255
  - @brains/identity-service@0.2.0-alpha.255
  - @brains/mcp-service@0.2.0-alpha.255
  - @brains/messaging-service@0.2.0-alpha.255
  - @brains/templates@0.2.0-alpha.255

## 0.2.0-alpha.254

### Patch Changes

- Updated dependencies [[`a7e1a8f`](https://github.com/rizom-ai/brains/commit/a7e1a8f9d467ad7d04aafa5c49b50aa4cae2ca99)]:
  - @brains/entity-service@0.2.0-alpha.254
  - @brains/identity-service@0.2.0-alpha.254
  - @brains/contracts@0.2.0-alpha.254
  - @brains/utils@0.2.0-alpha.254
  - @brains/conversation-service@0.2.0-alpha.254
  - @brains/mcp-service@0.2.0-alpha.254
  - @brains/messaging-service@0.2.0-alpha.254
  - @brains/templates@0.2.0-alpha.254

## 0.2.0-alpha.253

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.253
  - @brains/utils@0.2.0-alpha.253
  - @brains/conversation-service@0.2.0-alpha.253
  - @brains/entity-service@0.2.0-alpha.253
  - @brains/identity-service@0.2.0-alpha.253
  - @brains/mcp-service@0.2.0-alpha.253
  - @brains/messaging-service@0.2.0-alpha.253
  - @brains/templates@0.2.0-alpha.253

## 0.2.0-alpha.252

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.252
  - @brains/utils@0.2.0-alpha.252
  - @brains/conversation-service@0.2.0-alpha.252
  - @brains/entity-service@0.2.0-alpha.252
  - @brains/identity-service@0.2.0-alpha.252
  - @brains/mcp-service@0.2.0-alpha.252
  - @brains/messaging-service@0.2.0-alpha.252
  - @brains/templates@0.2.0-alpha.252

## 0.2.0-alpha.251

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.251
  - @brains/utils@0.2.0-alpha.251
  - @brains/conversation-service@0.2.0-alpha.251
  - @brains/entity-service@0.2.0-alpha.251
  - @brains/identity-service@0.2.0-alpha.251
  - @brains/mcp-service@0.2.0-alpha.251
  - @brains/messaging-service@0.2.0-alpha.251
  - @brains/templates@0.2.0-alpha.251

## 0.2.0-alpha.250

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.250
  - @brains/utils@0.2.0-alpha.250
  - @brains/conversation-service@0.2.0-alpha.250
  - @brains/entity-service@0.2.0-alpha.250
  - @brains/identity-service@0.2.0-alpha.250
  - @brains/mcp-service@0.2.0-alpha.250
  - @brains/messaging-service@0.2.0-alpha.250
  - @brains/templates@0.2.0-alpha.250

## 0.2.0-alpha.249

### Patch Changes

- Updated dependencies [[`84dca8c`](https://github.com/rizom-ai/brains/commit/84dca8c9ddf83fcf01784f54da479e2229eba09c)]:
  - @brains/contracts@0.2.0-alpha.249
  - @brains/conversation-service@0.2.0-alpha.249
  - @brains/entity-service@0.2.0-alpha.249
  - @brains/mcp-service@0.2.0-alpha.249
  - @brains/templates@0.2.0-alpha.249
  - @brains/identity-service@0.2.0-alpha.249
  - @brains/messaging-service@0.2.0-alpha.249
  - @brains/utils@0.2.0-alpha.249

## 0.2.0-alpha.248

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.248
  - @brains/utils@0.2.0-alpha.248
  - @brains/conversation-service@0.2.0-alpha.248
  - @brains/entity-service@0.2.0-alpha.248
  - @brains/identity-service@0.2.0-alpha.248
  - @brains/mcp-service@0.2.0-alpha.248
  - @brains/messaging-service@0.2.0-alpha.248
  - @brains/templates@0.2.0-alpha.248

## 0.2.0-alpha.247

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.247
  - @brains/utils@0.2.0-alpha.247
  - @brains/conversation-service@0.2.0-alpha.247
  - @brains/entity-service@0.2.0-alpha.247
  - @brains/identity-service@0.2.0-alpha.247
  - @brains/mcp-service@0.2.0-alpha.247
  - @brains/messaging-service@0.2.0-alpha.247
  - @brains/templates@0.2.0-alpha.247

## 0.2.0-alpha.246

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.246
  - @brains/utils@0.2.0-alpha.246
  - @brains/conversation-service@0.2.0-alpha.246
  - @brains/entity-service@0.2.0-alpha.246
  - @brains/identity-service@0.2.0-alpha.246
  - @brains/mcp-service@0.2.0-alpha.246
  - @brains/messaging-service@0.2.0-alpha.246
  - @brains/templates@0.2.0-alpha.246

## 0.2.0-alpha.245

### Patch Changes

- Updated dependencies [[`e2fa886`](https://github.com/rizom-ai/brains/commit/e2fa886134594d834582c5b55704e893fcb0988a)]:
  - @brains/contracts@0.2.0-alpha.245
  - @brains/conversation-service@0.2.0-alpha.245
  - @brains/entity-service@0.2.0-alpha.245
  - @brains/mcp-service@0.2.0-alpha.245
  - @brains/templates@0.2.0-alpha.245
  - @brains/identity-service@0.2.0-alpha.245
  - @brains/messaging-service@0.2.0-alpha.245
  - @brains/utils@0.2.0-alpha.245

## 0.2.0-alpha.244

### Patch Changes

- Updated dependencies [[`e1b4422`](https://github.com/rizom-ai/brains/commit/e1b442233e18215f096ea4d758947761ffb4b89c)]:
  - @brains/messaging-service@0.2.0-alpha.244
  - @brains/conversation-service@0.2.0-alpha.244
  - @brains/mcp-service@0.2.0-alpha.244
  - @brains/identity-service@0.2.0-alpha.244
  - @brains/entity-service@0.2.0-alpha.244
  - @brains/contracts@0.2.0-alpha.244
  - @brains/utils@0.2.0-alpha.244
  - @brains/templates@0.2.0-alpha.244

## 0.2.0-alpha.243

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.243
  - @brains/utils@0.2.0-alpha.243
  - @brains/conversation-service@0.2.0-alpha.243
  - @brains/entity-service@0.2.0-alpha.243
  - @brains/identity-service@0.2.0-alpha.243
  - @brains/mcp-service@0.2.0-alpha.243
  - @brains/messaging-service@0.2.0-alpha.243
  - @brains/templates@0.2.0-alpha.243

## 0.2.0-alpha.242

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.242
  - @brains/utils@0.2.0-alpha.242
  - @brains/conversation-service@0.2.0-alpha.242
  - @brains/entity-service@0.2.0-alpha.242
  - @brains/identity-service@0.2.0-alpha.242
  - @brains/mcp-service@0.2.0-alpha.242
  - @brains/messaging-service@0.2.0-alpha.242
  - @brains/templates@0.2.0-alpha.242

## 0.2.0-alpha.241

### Patch Changes

- Updated dependencies [[`7f5c45f`](https://github.com/rizom-ai/brains/commit/7f5c45f4cac4556fdd2abcb939b48f1a76adbe62)]:
  - @brains/contracts@0.2.0-alpha.241
  - @brains/conversation-service@0.2.0-alpha.241
  - @brains/entity-service@0.2.0-alpha.241
  - @brains/mcp-service@0.2.0-alpha.241
  - @brains/templates@0.2.0-alpha.241
  - @brains/identity-service@0.2.0-alpha.241
  - @brains/messaging-service@0.2.0-alpha.241
  - @brains/utils@0.2.0-alpha.241

## 0.2.0-alpha.240

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.240
  - @brains/utils@0.2.0-alpha.240
  - @brains/conversation-service@0.2.0-alpha.240
  - @brains/entity-service@0.2.0-alpha.240
  - @brains/identity-service@0.2.0-alpha.240
  - @brains/mcp-service@0.2.0-alpha.240
  - @brains/messaging-service@0.2.0-alpha.240
  - @brains/templates@0.2.0-alpha.240

## 0.2.0-alpha.239

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.239
  - @brains/utils@0.2.0-alpha.239
  - @brains/conversation-service@0.2.0-alpha.239
  - @brains/entity-service@0.2.0-alpha.239
  - @brains/identity-service@0.2.0-alpha.239
  - @brains/mcp-service@0.2.0-alpha.239
  - @brains/messaging-service@0.2.0-alpha.239
  - @brains/templates@0.2.0-alpha.239

## 0.2.0-alpha.238

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.238
  - @brains/utils@0.2.0-alpha.238
  - @brains/conversation-service@0.2.0-alpha.238
  - @brains/entity-service@0.2.0-alpha.238
  - @brains/identity-service@0.2.0-alpha.238
  - @brains/mcp-service@0.2.0-alpha.238
  - @brains/messaging-service@0.2.0-alpha.238
  - @brains/templates@0.2.0-alpha.238

## 0.2.0-alpha.237

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.237
  - @brains/utils@0.2.0-alpha.237
  - @brains/conversation-service@0.2.0-alpha.237
  - @brains/entity-service@0.2.0-alpha.237
  - @brains/identity-service@0.2.0-alpha.237
  - @brains/mcp-service@0.2.0-alpha.237
  - @brains/messaging-service@0.2.0-alpha.237
  - @brains/templates@0.2.0-alpha.237

## 0.2.0-alpha.236

### Patch Changes

- [`386a6ea`](https://github.com/rizom-ai/brains/commit/386a6ea2b299fcc23ea6676adc75c87d7fe0dae6) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Treat authenticated Anchor and permission facts as authoritative model context. Non-Anchor callers now receive a definitive relationship, permission answers use canonical Admin/Trusted/Public labels, and prompt-substring tests are replaced by resolved-principal integration coverage plus passing behavioral model evaluations for personal Anchor/Admin, Trusted non-Anchor, additional Admin non-Anchor, and Public callers.

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.236
  - @brains/utils@0.2.0-alpha.236
  - @brains/conversation-service@0.2.0-alpha.236
  - @brains/entity-service@0.2.0-alpha.236
  - @brains/identity-service@0.2.0-alpha.236
  - @brains/mcp-service@0.2.0-alpha.236
  - @brains/messaging-service@0.2.0-alpha.236
  - @brains/templates@0.2.0-alpha.236

## 0.2.0-alpha.235

### Patch Changes

- Updated dependencies [[`31e732a`](https://github.com/rizom-ai/brains/commit/31e732a79a394a4e385ce7b25015c3daa8bf0afd)]:
  - @brains/contracts@0.2.0-alpha.235
  - @brains/conversation-service@0.2.0-alpha.235
  - @brains/entity-service@0.2.0-alpha.235
  - @brains/mcp-service@0.2.0-alpha.235
  - @brains/templates@0.2.0-alpha.235
  - @brains/identity-service@0.2.0-alpha.235
  - @brains/messaging-service@0.2.0-alpha.235
  - @brains/utils@0.2.0-alpha.235

## 0.2.0-alpha.234

### Patch Changes

- Updated dependencies [[`afa5cf4`](https://github.com/rizom-ai/brains/commit/afa5cf4cbdf75400b180d4bb89ed46dd4e6097cc)]:
  - @brains/entity-service@0.2.0-alpha.234
  - @brains/identity-service@0.2.0-alpha.234
  - @brains/contracts@0.2.0-alpha.234
  - @brains/utils@0.2.0-alpha.234
  - @brains/conversation-service@0.2.0-alpha.234
  - @brains/mcp-service@0.2.0-alpha.234
  - @brains/messaging-service@0.2.0-alpha.234
  - @brains/templates@0.2.0-alpha.234

## 0.2.0-alpha.233

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.233
  - @brains/utils@0.2.0-alpha.233
  - @brains/conversation-service@0.2.0-alpha.233
  - @brains/entity-service@0.2.0-alpha.233
  - @brains/identity-service@0.2.0-alpha.233
  - @brains/mcp-service@0.2.0-alpha.233
  - @brains/messaging-service@0.2.0-alpha.233
  - @brains/templates@0.2.0-alpha.233

## 0.2.0-alpha.232

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.232
  - @brains/utils@0.2.0-alpha.232
  - @brains/conversation-service@0.2.0-alpha.232
  - @brains/entity-service@0.2.0-alpha.232
  - @brains/identity-service@0.2.0-alpha.232
  - @brains/mcp-service@0.2.0-alpha.232
  - @brains/messaging-service@0.2.0-alpha.232
  - @brains/templates@0.2.0-alpha.232

## 0.2.0-alpha.231

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.231
  - @brains/utils@0.2.0-alpha.231
  - @brains/conversation-service@0.2.0-alpha.231
  - @brains/entity-service@0.2.0-alpha.231
  - @brains/identity-service@0.2.0-alpha.231
  - @brains/mcp-service@0.2.0-alpha.231
  - @brains/messaging-service@0.2.0-alpha.231
  - @brains/templates@0.2.0-alpha.231

## 0.2.0-alpha.230

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.230
  - @brains/utils@0.2.0-alpha.230
  - @brains/conversation-service@0.2.0-alpha.230
  - @brains/entity-service@0.2.0-alpha.230
  - @brains/identity-service@0.2.0-alpha.230
  - @brains/mcp-service@0.2.0-alpha.230
  - @brains/messaging-service@0.2.0-alpha.230
  - @brains/templates@0.2.0-alpha.230

## 0.2.0-alpha.229

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.229
  - @brains/utils@0.2.0-alpha.229
  - @brains/conversation-service@0.2.0-alpha.229
  - @brains/entity-service@0.2.0-alpha.229
  - @brains/identity-service@0.2.0-alpha.229
  - @brains/mcp-service@0.2.0-alpha.229
  - @brains/messaging-service@0.2.0-alpha.229
  - @brains/templates@0.2.0-alpha.229

## 0.2.0-alpha.228

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.228
  - @brains/utils@0.2.0-alpha.228
  - @brains/conversation-service@0.2.0-alpha.228
  - @brains/entity-service@0.2.0-alpha.228
  - @brains/identity-service@0.2.0-alpha.228
  - @brains/mcp-service@0.2.0-alpha.228
  - @brains/messaging-service@0.2.0-alpha.228
  - @brains/templates@0.2.0-alpha.228

## 0.2.0-alpha.227

### Patch Changes

- [`500a6dc`](https://github.com/rizom-ai/brains/commit/500a6dc284a590e1e9bb6af9fa0995332eeb8c58) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Replace ambiguous flattened actor identifiers with a discriminated `ActorRef` model for authenticated users, opaque external identities, agents, and services. Require `ActorRef` through tool execution, MCP routing, AI call options, create interceptors, tool events, and job provenance; remove flattened `userId` and `canonicalId` tool-context fields rather than deprecating them. Jobs retain every requester as `requestedByActor` and project `requestedByUserId` only through the centralized authenticated-user policy. New messages and durable memory use the new model, while legacy persisted actor metadata is normalized at read boundaries.

- [`f7b3500`](https://github.com/rizom-ai/brains/commit/f7b350042c5bbcd6c5a43016d25e95e35ea3bfed) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Separate Admin authorization from Anchor ownership. Permission roles now use only `admin`, `trusted`, and `public`; a generated auth migration converts historical role rows and persists one person-or-collective brain Anchor. Principals expose `isAnchor` independently, personal Anchors must remain active Admins, collective brains can be run by any active Admin, and last-active-Admin protection stays atomic. Propagate both facets through authenticated and configured A2A, evaluation, chat, Discord, MCP, CLI, web-chat, action, tool, confirmation, and model-instruction contexts.

  Finish the standalone Admin console target model with an Anchor ownership card, Admin/Anchor member facets, profile and optional peer-brain sections, responsive roster/detail layouts, typed Anchor mutations, and a console-local TanStack Query cache with targeted mutation invalidation.

- Updated dependencies [[`500a6dc`](https://github.com/rizom-ai/brains/commit/500a6dc284a590e1e9bb6af9fa0995332eeb8c58), [`f7b3500`](https://github.com/rizom-ai/brains/commit/f7b350042c5bbcd6c5a43016d25e95e35ea3bfed), [`500a6dc`](https://github.com/rizom-ai/brains/commit/500a6dc284a590e1e9bb6af9fa0995332eeb8c58), [`fa8e4eb`](https://github.com/rizom-ai/brains/commit/fa8e4eb3a237aaec54eeeb815f68e792d3a1715b), [`5c1bed1`](https://github.com/rizom-ai/brains/commit/5c1bed1134f92701f4ead9b25a6f432cd208ac29), [`20ac901`](https://github.com/rizom-ai/brains/commit/20ac901e319ef62b38bb291de8d026b9d8ae51d7)]:
  - @brains/contracts@0.2.0-alpha.227
  - @brains/conversation-service@0.2.0-alpha.227
  - @brains/entity-service@0.2.0-alpha.227
  - @brains/identity-service@0.2.0-alpha.227
  - @brains/mcp-service@0.2.0-alpha.227
  - @brains/templates@0.2.0-alpha.227
  - @brains/utils@0.2.0-alpha.227
  - @brains/messaging-service@0.2.0-alpha.227

## 0.2.0-alpha.226

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.226
  - @brains/utils@0.2.0-alpha.226
  - @brains/conversation-service@0.2.0-alpha.226
  - @brains/entity-service@0.2.0-alpha.226
  - @brains/identity-service@0.2.0-alpha.226
  - @brains/mcp-service@0.2.0-alpha.226
  - @brains/messaging-service@0.2.0-alpha.226
  - @brains/templates@0.2.0-alpha.226

## 0.2.0-alpha.225

### Patch Changes

- Updated dependencies [[`b0001fb`](https://github.com/rizom-ai/brains/commit/b0001fb102c030855586d92c4abef67004ae7987)]:
  - @brains/entity-service@0.2.0-alpha.225
  - @brains/identity-service@0.2.0-alpha.225
  - @brains/contracts@0.2.0-alpha.225
  - @brains/utils@0.2.0-alpha.225
  - @brains/conversation-service@0.2.0-alpha.225
  - @brains/mcp-service@0.2.0-alpha.225
  - @brains/messaging-service@0.2.0-alpha.225
  - @brains/templates@0.2.0-alpha.225

## 0.2.0-alpha.224

### Patch Changes

- Updated dependencies [[`b7c5df6`](https://github.com/rizom-ai/brains/commit/b7c5df61ebe0aa44f6b786695f16daa7ee151e61)]:
  - @brains/utils@0.2.0-alpha.224
  - @brains/contracts@0.2.0-alpha.224
  - @brains/conversation-service@0.2.0-alpha.224
  - @brains/entity-service@0.2.0-alpha.224
  - @brains/identity-service@0.2.0-alpha.224
  - @brains/mcp-service@0.2.0-alpha.224
  - @brains/messaging-service@0.2.0-alpha.224
  - @brains/templates@0.2.0-alpha.224

## 0.2.0-alpha.223

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.223
  - @brains/utils@0.2.0-alpha.223
  - @brains/conversation-service@0.2.0-alpha.223
  - @brains/entity-service@0.2.0-alpha.223
  - @brains/identity-service@0.2.0-alpha.223
  - @brains/mcp-service@0.2.0-alpha.223
  - @brains/messaging-service@0.2.0-alpha.223
  - @brains/templates@0.2.0-alpha.223

## 0.2.0-alpha.222

### Patch Changes

- Updated dependencies [[`4943d79`](https://github.com/rizom-ai/brains/commit/4943d79ecf4abefd4cf79a38a526e203ea32064a)]:
  - @brains/contracts@0.2.0-alpha.222
  - @brains/conversation-service@0.2.0-alpha.222
  - @brains/entity-service@0.2.0-alpha.222
  - @brains/mcp-service@0.2.0-alpha.222
  - @brains/templates@0.2.0-alpha.222
  - @brains/identity-service@0.2.0-alpha.222
  - @brains/messaging-service@0.2.0-alpha.222
  - @brains/utils@0.2.0-alpha.222

## 0.2.0-alpha.221

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.221
  - @brains/utils@0.2.0-alpha.221
  - @brains/conversation-service@0.2.0-alpha.221
  - @brains/entity-service@0.2.0-alpha.221
  - @brains/identity-service@0.2.0-alpha.221
  - @brains/mcp-service@0.2.0-alpha.221
  - @brains/messaging-service@0.2.0-alpha.221
  - @brains/templates@0.2.0-alpha.221

## 0.2.0-alpha.220

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.220
  - @brains/utils@0.2.0-alpha.220
  - @brains/conversation-service@0.2.0-alpha.220
  - @brains/entity-service@0.2.0-alpha.220
  - @brains/identity-service@0.2.0-alpha.220
  - @brains/mcp-service@0.2.0-alpha.220
  - @brains/messaging-service@0.2.0-alpha.220
  - @brains/templates@0.2.0-alpha.220

## 0.2.0-alpha.219

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.219
  - @brains/utils@0.2.0-alpha.219
  - @brains/conversation-service@0.2.0-alpha.219
  - @brains/entity-service@0.2.0-alpha.219
  - @brains/identity-service@0.2.0-alpha.219
  - @brains/mcp-service@0.2.0-alpha.219
  - @brains/messaging-service@0.2.0-alpha.219
  - @brains/templates@0.2.0-alpha.219

## 0.2.0-alpha.218

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.218
  - @brains/utils@0.2.0-alpha.218
  - @brains/conversation-service@0.2.0-alpha.218
  - @brains/entity-service@0.2.0-alpha.218
  - @brains/identity-service@0.2.0-alpha.218
  - @brains/mcp-service@0.2.0-alpha.218
  - @brains/messaging-service@0.2.0-alpha.218
  - @brains/templates@0.2.0-alpha.218

## 0.2.0-alpha.217

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.217
  - @brains/utils@0.2.0-alpha.217
  - @brains/conversation-service@0.2.0-alpha.217
  - @brains/entity-service@0.2.0-alpha.217
  - @brains/identity-service@0.2.0-alpha.217
  - @brains/mcp-service@0.2.0-alpha.217
  - @brains/messaging-service@0.2.0-alpha.217
  - @brains/templates@0.2.0-alpha.217

## 0.2.0-alpha.216

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.216
  - @brains/utils@0.2.0-alpha.216
  - @brains/conversation-service@0.2.0-alpha.216
  - @brains/entity-service@0.2.0-alpha.216
  - @brains/identity-service@0.2.0-alpha.216
  - @brains/mcp-service@0.2.0-alpha.216
  - @brains/messaging-service@0.2.0-alpha.216
  - @brains/templates@0.2.0-alpha.216

## 0.2.0-alpha.215

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.215
  - @brains/utils@0.2.0-alpha.215
  - @brains/conversation-service@0.2.0-alpha.215
  - @brains/entity-service@0.2.0-alpha.215
  - @brains/identity-service@0.2.0-alpha.215
  - @brains/mcp-service@0.2.0-alpha.215
  - @brains/messaging-service@0.2.0-alpha.215
  - @brains/templates@0.2.0-alpha.215

## 0.2.0-alpha.214

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.214
  - @brains/utils@0.2.0-alpha.214
  - @brains/conversation-service@0.2.0-alpha.214
  - @brains/entity-service@0.2.0-alpha.214
  - @brains/identity-service@0.2.0-alpha.214
  - @brains/mcp-service@0.2.0-alpha.214
  - @brains/messaging-service@0.2.0-alpha.214
  - @brains/templates@0.2.0-alpha.214

## 0.2.0-alpha.213

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.213
  - @brains/utils@0.2.0-alpha.213
  - @brains/conversation-service@0.2.0-alpha.213
  - @brains/entity-service@0.2.0-alpha.213
  - @brains/identity-service@0.2.0-alpha.213
  - @brains/mcp-service@0.2.0-alpha.213
  - @brains/messaging-service@0.2.0-alpha.213
  - @brains/templates@0.2.0-alpha.213

## 0.2.0-alpha.212

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.212
  - @brains/utils@0.2.0-alpha.212
  - @brains/conversation-service@0.2.0-alpha.212
  - @brains/entity-service@0.2.0-alpha.212
  - @brains/identity-service@0.2.0-alpha.212
  - @brains/mcp-service@0.2.0-alpha.212
  - @brains/messaging-service@0.2.0-alpha.212
  - @brains/templates@0.2.0-alpha.212

## 0.2.0-alpha.211

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.211
  - @brains/utils@0.2.0-alpha.211
  - @brains/conversation-service@0.2.0-alpha.211
  - @brains/entity-service@0.2.0-alpha.211
  - @brains/identity-service@0.2.0-alpha.211
  - @brains/mcp-service@0.2.0-alpha.211
  - @brains/messaging-service@0.2.0-alpha.211
  - @brains/templates@0.2.0-alpha.211

## 0.2.0-alpha.210

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.210
  - @brains/utils@0.2.0-alpha.210
  - @brains/conversation-service@0.2.0-alpha.210
  - @brains/entity-service@0.2.0-alpha.210
  - @brains/identity-service@0.2.0-alpha.210
  - @brains/mcp-service@0.2.0-alpha.210
  - @brains/messaging-service@0.2.0-alpha.210
  - @brains/templates@0.2.0-alpha.210

## 0.2.0-alpha.209

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.209
  - @brains/utils@0.2.0-alpha.209
  - @brains/conversation-service@0.2.0-alpha.209
  - @brains/entity-service@0.2.0-alpha.209
  - @brains/identity-service@0.2.0-alpha.209
  - @brains/mcp-service@0.2.0-alpha.209
  - @brains/messaging-service@0.2.0-alpha.209
  - @brains/templates@0.2.0-alpha.209

## 0.2.0-alpha.208

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.208
  - @brains/utils@0.2.0-alpha.208
  - @brains/conversation-service@0.2.0-alpha.208
  - @brains/entity-service@0.2.0-alpha.208
  - @brains/identity-service@0.2.0-alpha.208
  - @brains/mcp-service@0.2.0-alpha.208
  - @brains/messaging-service@0.2.0-alpha.208
  - @brains/templates@0.2.0-alpha.208

## 0.2.0-alpha.207

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.207
  - @brains/utils@0.2.0-alpha.207
  - @brains/conversation-service@0.2.0-alpha.207
  - @brains/entity-service@0.2.0-alpha.207
  - @brains/identity-service@0.2.0-alpha.207
  - @brains/mcp-service@0.2.0-alpha.207
  - @brains/messaging-service@0.2.0-alpha.207
  - @brains/templates@0.2.0-alpha.207

## 0.2.0-alpha.206

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.206
  - @brains/utils@0.2.0-alpha.206
  - @brains/conversation-service@0.2.0-alpha.206
  - @brains/entity-service@0.2.0-alpha.206
  - @brains/identity-service@0.2.0-alpha.206
  - @brains/mcp-service@0.2.0-alpha.206
  - @brains/messaging-service@0.2.0-alpha.206
  - @brains/templates@0.2.0-alpha.206

## 0.2.0-alpha.205

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.205
  - @brains/utils@0.2.0-alpha.205
  - @brains/conversation-service@0.2.0-alpha.205
  - @brains/entity-service@0.2.0-alpha.205
  - @brains/identity-service@0.2.0-alpha.205
  - @brains/mcp-service@0.2.0-alpha.205
  - @brains/messaging-service@0.2.0-alpha.205
  - @brains/templates@0.2.0-alpha.205

## 0.2.0-alpha.204

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.204
  - @brains/utils@0.2.0-alpha.204
  - @brains/conversation-service@0.2.0-alpha.204
  - @brains/entity-service@0.2.0-alpha.204
  - @brains/identity-service@0.2.0-alpha.204
  - @brains/mcp-service@0.2.0-alpha.204
  - @brains/messaging-service@0.2.0-alpha.204
  - @brains/templates@0.2.0-alpha.204

## 0.2.0-alpha.203

### Patch Changes

- [`3e87ccf`](https://github.com/rizom-ai/brains/commit/3e87ccfea9e664c2f31fd8bfec8a1b9ce7f12e16) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Keep resolved approval actions terminal when reopening web-chat history. Reloaded sessions now reconcile earlier approval requests with later result cards, while expired, declined, and failed approval outcomes are durably recorded so completed buttons do not reappear.

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.203
  - @brains/utils@0.2.0-alpha.203
  - @brains/conversation-service@0.2.0-alpha.203
  - @brains/entity-service@0.2.0-alpha.203
  - @brains/identity-service@0.2.0-alpha.203
  - @brains/mcp-service@0.2.0-alpha.203
  - @brains/messaging-service@0.2.0-alpha.203
  - @brains/templates@0.2.0-alpha.203

## 0.2.0-alpha.202

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.202
  - @brains/utils@0.2.0-alpha.202
  - @brains/conversation-service@0.2.0-alpha.202
  - @brains/entity-service@0.2.0-alpha.202
  - @brains/identity-service@0.2.0-alpha.202
  - @brains/mcp-service@0.2.0-alpha.202
  - @brains/messaging-service@0.2.0-alpha.202
  - @brains/templates@0.2.0-alpha.202

## 0.2.0-alpha.201

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.201
  - @brains/utils@0.2.0-alpha.201
  - @brains/conversation-service@0.2.0-alpha.201
  - @brains/entity-service@0.2.0-alpha.201
  - @brains/identity-service@0.2.0-alpha.201
  - @brains/mcp-service@0.2.0-alpha.201
  - @brains/messaging-service@0.2.0-alpha.201
  - @brains/templates@0.2.0-alpha.201

## 0.2.0-alpha.200

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.200
  - @brains/utils@0.2.0-alpha.200
  - @brains/conversation-service@0.2.0-alpha.200
  - @brains/entity-service@0.2.0-alpha.200
  - @brains/identity-service@0.2.0-alpha.200
  - @brains/mcp-service@0.2.0-alpha.200
  - @brains/messaging-service@0.2.0-alpha.200
  - @brains/templates@0.2.0-alpha.200

## 0.2.0-alpha.199

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.199
  - @brains/utils@0.2.0-alpha.199
  - @brains/conversation-service@0.2.0-alpha.199
  - @brains/entity-service@0.2.0-alpha.199
  - @brains/identity-service@0.2.0-alpha.199
  - @brains/mcp-service@0.2.0-alpha.199
  - @brains/messaging-service@0.2.0-alpha.199
  - @brains/templates@0.2.0-alpha.199

## 0.2.0-alpha.198

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.198
  - @brains/utils@0.2.0-alpha.198
  - @brains/conversation-service@0.2.0-alpha.198
  - @brains/entity-service@0.2.0-alpha.198
  - @brains/identity-service@0.2.0-alpha.198
  - @brains/mcp-service@0.2.0-alpha.198
  - @brains/messaging-service@0.2.0-alpha.198
  - @brains/templates@0.2.0-alpha.198

## 0.2.0-alpha.197

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.197
  - @brains/utils@0.2.0-alpha.197
  - @brains/conversation-service@0.2.0-alpha.197
  - @brains/entity-service@0.2.0-alpha.197
  - @brains/identity-service@0.2.0-alpha.197
  - @brains/mcp-service@0.2.0-alpha.197
  - @brains/messaging-service@0.2.0-alpha.197
  - @brains/templates@0.2.0-alpha.197

## 0.2.0-alpha.196

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.196
  - @brains/utils@0.2.0-alpha.196
  - @brains/conversation-service@0.2.0-alpha.196
  - @brains/entity-service@0.2.0-alpha.196
  - @brains/identity-service@0.2.0-alpha.196
  - @brains/mcp-service@0.2.0-alpha.196
  - @brains/messaging-service@0.2.0-alpha.196
  - @brains/templates@0.2.0-alpha.196

## 0.2.0-alpha.195

### Patch Changes

- [`1ece871`](https://github.com/rizom-ai/brains/commit/1ece871c78c950ff91033cb62e34fe89987cfd2c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Make shell, daemon, worker, plugin, recurring-check, Discord-handler, site-rebuild, and conversation teardown transitions joinable and terminal; stop active agent work before plugin teardown; and prevent queued work from entering after shutdown.

- Updated dependencies []:
  - @brains/entity-service@0.2.0-alpha.195
  - @brains/identity-service@0.2.0-alpha.195
  - @brains/contracts@0.2.0-alpha.195
  - @brains/utils@0.2.0-alpha.195
  - @brains/conversation-service@0.2.0-alpha.195
  - @brains/mcp-service@0.2.0-alpha.195
  - @brains/messaging-service@0.2.0-alpha.195
  - @brains/templates@0.2.0-alpha.195

## 0.2.0-alpha.194

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.194
  - @brains/utils@0.2.0-alpha.194
  - @brains/conversation-service@0.2.0-alpha.194
  - @brains/entity-service@0.2.0-alpha.194
  - @brains/identity-service@0.2.0-alpha.194
  - @brains/mcp-service@0.2.0-alpha.194
  - @brains/messaging-service@0.2.0-alpha.194
  - @brains/templates@0.2.0-alpha.194

## 0.2.0-alpha.193

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.193
  - @brains/utils@0.2.0-alpha.193
  - @brains/conversation-service@0.2.0-alpha.193
  - @brains/entity-service@0.2.0-alpha.193
  - @brains/identity-service@0.2.0-alpha.193
  - @brains/mcp-service@0.2.0-alpha.193
  - @brains/messaging-service@0.2.0-alpha.193
  - @brains/templates@0.2.0-alpha.193

## 0.2.0-alpha.192

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.192
  - @brains/utils@0.2.0-alpha.192
  - @brains/conversation-service@0.2.0-alpha.192
  - @brains/entity-service@0.2.0-alpha.192
  - @brains/identity-service@0.2.0-alpha.192
  - @brains/mcp-service@0.2.0-alpha.192
  - @brains/messaging-service@0.2.0-alpha.192
  - @brains/templates@0.2.0-alpha.192

## 0.2.0-alpha.191

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.191
  - @brains/utils@0.2.0-alpha.191
  - @brains/conversation-service@0.2.0-alpha.191
  - @brains/entity-service@0.2.0-alpha.191
  - @brains/identity-service@0.2.0-alpha.191
  - @brains/mcp-service@0.2.0-alpha.191
  - @brains/messaging-service@0.2.0-alpha.191
  - @brains/templates@0.2.0-alpha.191

## 0.2.0-alpha.190

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.190
  - @brains/utils@0.2.0-alpha.190
  - @brains/conversation-service@0.2.0-alpha.190
  - @brains/entity-service@0.2.0-alpha.190
  - @brains/identity-service@0.2.0-alpha.190
  - @brains/mcp-service@0.2.0-alpha.190
  - @brains/messaging-service@0.2.0-alpha.190
  - @brains/templates@0.2.0-alpha.190

## 0.2.0-alpha.189

### Patch Changes

- [`a98996a`](https://github.com/rizom-ai/brains/commit/a98996a41267461f4cec7e1b40254cc1edd5798d) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Prevent lower-permission callers in shared conversations from receiving higher-permission message history or upload context.

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.189
  - @brains/utils@0.2.0-alpha.189
  - @brains/conversation-service@0.2.0-alpha.189
  - @brains/entity-service@0.2.0-alpha.189
  - @brains/identity-service@0.2.0-alpha.189
  - @brains/mcp-service@0.2.0-alpha.189
  - @brains/messaging-service@0.2.0-alpha.189
  - @brains/templates@0.2.0-alpha.189

## 0.2.0-alpha.188

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.188
  - @brains/utils@0.2.0-alpha.188
  - @brains/conversation-service@0.2.0-alpha.188
  - @brains/entity-service@0.2.0-alpha.188
  - @brains/identity-service@0.2.0-alpha.188
  - @brains/mcp-service@0.2.0-alpha.188
  - @brains/messaging-service@0.2.0-alpha.188
  - @brains/templates@0.2.0-alpha.188

## 0.2.0-alpha.187

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.187
  - @brains/utils@0.2.0-alpha.187
  - @brains/conversation-service@0.2.0-alpha.187
  - @brains/entity-service@0.2.0-alpha.187
  - @brains/identity-service@0.2.0-alpha.187
  - @brains/mcp-service@0.2.0-alpha.187
  - @brains/messaging-service@0.2.0-alpha.187
  - @brains/templates@0.2.0-alpha.187

## 0.2.0-alpha.186

### Patch Changes

- Updated dependencies [[`143788b`](https://github.com/rizom-ai/brains/commit/143788beb9544649f3d1bac16bcea605c36cd94a)]:
  - @brains/entity-service@0.2.0-alpha.186
  - @brains/identity-service@0.2.0-alpha.186
  - @brains/contracts@0.2.0-alpha.186
  - @brains/utils@0.2.0-alpha.186
  - @brains/conversation-service@0.2.0-alpha.186
  - @brains/mcp-service@0.2.0-alpha.186
  - @brains/messaging-service@0.2.0-alpha.186
  - @brains/templates@0.2.0-alpha.186

## 0.2.0-alpha.185

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.185
  - @brains/utils@0.2.0-alpha.185
  - @brains/conversation-service@0.2.0-alpha.185
  - @brains/entity-service@0.2.0-alpha.185
  - @brains/identity-service@0.2.0-alpha.185
  - @brains/mcp-service@0.2.0-alpha.185
  - @brains/messaging-service@0.2.0-alpha.185
  - @brains/templates@0.2.0-alpha.185

## 0.2.0-alpha.184

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.184
  - @brains/utils@0.2.0-alpha.184
  - @brains/conversation-service@0.2.0-alpha.184
  - @brains/entity-service@0.2.0-alpha.184
  - @brains/identity-service@0.2.0-alpha.184
  - @brains/mcp-service@0.2.0-alpha.184
  - @brains/messaging-service@0.2.0-alpha.184
  - @brains/templates@0.2.0-alpha.184

## 0.2.0-alpha.183

### Patch Changes

- Updated dependencies [[`197cc09`](https://github.com/rizom-ai/brains/commit/197cc0988a47f80e3e21b5f4adf034003ea3527e)]:
  - @brains/entity-service@0.2.0-alpha.183
  - @brains/identity-service@0.2.0-alpha.183
  - @brains/contracts@0.2.0-alpha.183
  - @brains/utils@0.2.0-alpha.183
  - @brains/conversation-service@0.2.0-alpha.183
  - @brains/mcp-service@0.2.0-alpha.183
  - @brains/messaging-service@0.2.0-alpha.183
  - @brains/templates@0.2.0-alpha.183

## 0.2.0-alpha.182

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.182
  - @brains/utils@0.2.0-alpha.182
  - @brains/conversation-service@0.2.0-alpha.182
  - @brains/entity-service@0.2.0-alpha.182
  - @brains/identity-service@0.2.0-alpha.182
  - @brains/mcp-service@0.2.0-alpha.182
  - @brains/messaging-service@0.2.0-alpha.182
  - @brains/templates@0.2.0-alpha.182

## 0.2.0-alpha.181

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.181
  - @brains/utils@0.2.0-alpha.181
  - @brains/conversation-service@0.2.0-alpha.181
  - @brains/entity-service@0.2.0-alpha.181
  - @brains/identity-service@0.2.0-alpha.181
  - @brains/mcp-service@0.2.0-alpha.181
  - @brains/messaging-service@0.2.0-alpha.181
  - @brains/templates@0.2.0-alpha.181

## 0.2.0-alpha.180

### Patch Changes

- Updated dependencies [[`2499c50`](https://github.com/rizom-ai/brains/commit/2499c5055fa73b7bce87207a7e9db6fe4c52c4c3), [`3a7bb4a`](https://github.com/rizom-ai/brains/commit/3a7bb4a6bce7789d4bf82e151aee1e35c66ac184)]:
  - @brains/conversation-service@0.2.0-alpha.180
  - @brains/entity-service@0.2.0-alpha.180
  - @brains/identity-service@0.2.0-alpha.180
  - @brains/contracts@0.2.0-alpha.180
  - @brains/utils@0.2.0-alpha.180
  - @brains/mcp-service@0.2.0-alpha.180
  - @brains/messaging-service@0.2.0-alpha.180
  - @brains/templates@0.2.0-alpha.180

## 0.2.0-alpha.179

### Patch Changes

- Updated dependencies [[`31866d8`](https://github.com/rizom-ai/brains/commit/31866d8598f83241217b9281419f36b67e9c1970)]:
  - @brains/entity-service@0.2.0-alpha.179
  - @brains/conversation-service@0.2.0-alpha.179
  - @brains/identity-service@0.2.0-alpha.179
  - @brains/contracts@0.2.0-alpha.179
  - @brains/utils@0.2.0-alpha.179
  - @brains/mcp-service@0.2.0-alpha.179
  - @brains/messaging-service@0.2.0-alpha.179
  - @brains/templates@0.2.0-alpha.179

## 0.2.0-alpha.178

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.178
  - @brains/effect-runtime@0.2.0-alpha.178
  - @brains/utils@0.2.0-alpha.178
  - @brains/conversation-service@0.2.0-alpha.178
  - @brains/entity-service@0.2.0-alpha.178
  - @brains/identity-service@0.2.0-alpha.178
  - @brains/mcp-service@0.2.0-alpha.178
  - @brains/messaging-service@0.2.0-alpha.178
  - @brains/templates@0.2.0-alpha.178

## 0.2.0-alpha.177

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.177
  - @brains/effect-runtime@0.2.0-alpha.177
  - @brains/utils@0.2.0-alpha.177
  - @brains/conversation-service@0.2.0-alpha.177
  - @brains/entity-service@0.2.0-alpha.177
  - @brains/identity-service@0.2.0-alpha.177
  - @brains/mcp-service@0.2.0-alpha.177
  - @brains/messaging-service@0.2.0-alpha.177
  - @brains/templates@0.2.0-alpha.177

## 0.2.0-alpha.176

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.176
  - @brains/effect-runtime@0.2.0-alpha.176
  - @brains/utils@0.2.0-alpha.176
  - @brains/conversation-service@0.2.0-alpha.176
  - @brains/entity-service@0.2.0-alpha.176
  - @brains/identity-service@0.2.0-alpha.176
  - @brains/mcp-service@0.2.0-alpha.176
  - @brains/messaging-service@0.2.0-alpha.176
  - @brains/templates@0.2.0-alpha.176

## 0.2.0-alpha.175

### Patch Changes

- Updated dependencies []:
  - @brains/entity-service@0.2.0-alpha.175
  - @brains/identity-service@0.2.0-alpha.175
  - @brains/contracts@0.2.0-alpha.175
  - @brains/effect-runtime@0.2.0-alpha.175
  - @brains/utils@0.2.0-alpha.175
  - @brains/conversation-service@0.2.0-alpha.175
  - @brains/mcp-service@0.2.0-alpha.175
  - @brains/messaging-service@0.2.0-alpha.175
  - @brains/templates@0.2.0-alpha.175

## 0.2.0-alpha.174

### Patch Changes

- Updated dependencies [[`eaf9f49`](https://github.com/rizom-ai/brains/commit/eaf9f490ca36f74535fd56b0f549f49de899defe)]:
  - @brains/entity-service@0.2.0-alpha.174
  - @brains/identity-service@0.2.0-alpha.174
  - @brains/contracts@0.2.0-alpha.174
  - @brains/effect-runtime@0.2.0-alpha.174
  - @brains/utils@0.2.0-alpha.174
  - @brains/conversation-service@0.2.0-alpha.174
  - @brains/mcp-service@0.2.0-alpha.174
  - @brains/messaging-service@0.2.0-alpha.174
  - @brains/templates@0.2.0-alpha.174

## 0.2.0-alpha.173

### Patch Changes

- [#56](https://github.com/rizom-ai/brains/pull/56) [`8427031`](https://github.com/rizom-ai/brains/commit/84270311c343964449d96c4cd60e4066daac4aef) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Harden shell lifecycle ownership with a centralized Effect boundary, scoped job-service layers, supervised fibers, deterministic schedules, transactional startup rollback, terminal plugin teardown, graceful job draining, daemon rollback, and end-to-end `AbortSignal` cancellation for AI requests and agent turns. Build public package subpaths with shared chunks to avoid duplicating their runtime code.

- Updated dependencies [[`8427031`](https://github.com/rizom-ai/brains/commit/84270311c343964449d96c4cd60e4066daac4aef)]:
  - @brains/effect-runtime@0.2.0-alpha.173
  - @brains/entity-service@0.2.0-alpha.173
  - @brains/mcp-service@0.2.0-alpha.173
  - @brains/identity-service@0.2.0-alpha.173
  - @brains/contracts@0.2.0-alpha.173
  - @brains/utils@0.2.0-alpha.173
  - @brains/conversation-service@0.2.0-alpha.173
  - @brains/messaging-service@0.2.0-alpha.173
  - @brains/templates@0.2.0-alpha.173

## 0.2.0-alpha.172

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.172
  - @brains/utils@0.2.0-alpha.172
  - @brains/conversation-service@0.2.0-alpha.172
  - @brains/entity-service@0.2.0-alpha.172
  - @brains/identity-service@0.2.0-alpha.172
  - @brains/mcp-service@0.2.0-alpha.172
  - @brains/messaging-service@0.2.0-alpha.172
  - @brains/templates@0.2.0-alpha.172

## 0.2.0-alpha.171

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.171
  - @brains/utils@0.2.0-alpha.171
  - @brains/conversation-service@0.2.0-alpha.171
  - @brains/entity-service@0.2.0-alpha.171
  - @brains/identity-service@0.2.0-alpha.171
  - @brains/mcp-service@0.2.0-alpha.171
  - @brains/messaging-service@0.2.0-alpha.171
  - @brains/templates@0.2.0-alpha.171

## 0.2.0-alpha.170

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.170
  - @brains/utils@0.2.0-alpha.170
  - @brains/conversation-service@0.2.0-alpha.170
  - @brains/entity-service@0.2.0-alpha.170
  - @brains/identity-service@0.2.0-alpha.170
  - @brains/mcp-service@0.2.0-alpha.170
  - @brains/messaging-service@0.2.0-alpha.170
  - @brains/templates@0.2.0-alpha.170

## 0.2.0-alpha.169

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.169
  - @brains/utils@0.2.0-alpha.169
  - @brains/conversation-service@0.2.0-alpha.169
  - @brains/entity-service@0.2.0-alpha.169
  - @brains/identity-service@0.2.0-alpha.169
  - @brains/mcp-service@0.2.0-alpha.169
  - @brains/messaging-service@0.2.0-alpha.169
  - @brains/templates@0.2.0-alpha.169

## 0.2.0-alpha.168

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.168
  - @brains/utils@0.2.0-alpha.168
  - @brains/conversation-service@0.2.0-alpha.168
  - @brains/entity-service@0.2.0-alpha.168
  - @brains/identity-service@0.2.0-alpha.168
  - @brains/mcp-service@0.2.0-alpha.168
  - @brains/messaging-service@0.2.0-alpha.168
  - @brains/templates@0.2.0-alpha.168

## 0.2.0-alpha.167

### Patch Changes

- Updated dependencies [[`eba956f`](https://github.com/rizom-ai/brains/commit/eba956f9894d549e47c6ebe5d478bae0887a2990)]:
  - @brains/templates@0.2.0-alpha.167
  - @brains/mcp-service@0.2.0-alpha.167
  - @brains/messaging-service@0.2.0-alpha.167
  - @brains/conversation-service@0.2.0-alpha.167
  - @brains/entity-service@0.2.0-alpha.167
  - @brains/identity-service@0.2.0-alpha.167
  - @brains/contracts@0.2.0-alpha.167
  - @brains/utils@0.2.0-alpha.167

## 0.2.0-alpha.166

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.166
  - @brains/utils@0.2.0-alpha.166
  - @brains/conversation-service@0.2.0-alpha.166
  - @brains/entity-service@0.2.0-alpha.166
  - @brains/identity-service@0.2.0-alpha.166
  - @brains/mcp-service@0.2.0-alpha.166
  - @brains/messaging-service@0.2.0-alpha.166
  - @brains/templates@0.2.0-alpha.166

## 0.2.0-alpha.165

### Patch Changes

- Updated dependencies [[`6484d4b`](https://github.com/rizom-ai/brains/commit/6484d4b8dc4bc2182370ddfff3e0b8594aee2b33)]:
  - @brains/templates@0.2.0-alpha.165
  - @brains/mcp-service@0.2.0-alpha.165
  - @brains/messaging-service@0.2.0-alpha.165
  - @brains/conversation-service@0.2.0-alpha.165
  - @brains/entity-service@0.2.0-alpha.165
  - @brains/identity-service@0.2.0-alpha.165
  - @brains/contracts@0.2.0-alpha.165
  - @brains/utils@0.2.0-alpha.165

## 0.2.0-alpha.164

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.164
  - @brains/utils@0.2.0-alpha.164
  - @brains/conversation-service@0.2.0-alpha.164
  - @brains/entity-service@0.2.0-alpha.164
  - @brains/identity-service@0.2.0-alpha.164
  - @brains/mcp-service@0.2.0-alpha.164
  - @brains/messaging-service@0.2.0-alpha.164
  - @brains/templates@0.2.0-alpha.164

## 0.2.0-alpha.163

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.163
  - @brains/utils@0.2.0-alpha.163
  - @brains/conversation-service@0.2.0-alpha.163
  - @brains/entity-service@0.2.0-alpha.163
  - @brains/identity-service@0.2.0-alpha.163
  - @brains/mcp-service@0.2.0-alpha.163
  - @brains/messaging-service@0.2.0-alpha.163
  - @brains/templates@0.2.0-alpha.163

## 0.2.0-alpha.162

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.162
  - @brains/utils@0.2.0-alpha.162
  - @brains/conversation-service@0.2.0-alpha.162
  - @brains/entity-service@0.2.0-alpha.162
  - @brains/identity-service@0.2.0-alpha.162
  - @brains/mcp-service@0.2.0-alpha.162
  - @brains/messaging-service@0.2.0-alpha.162
  - @brains/templates@0.2.0-alpha.162

## 0.2.0-alpha.161

### Patch Changes

- Updated dependencies [[`61c6862`](https://github.com/rizom-ai/brains/commit/61c68624c0ae21f9d00d307db02ce5a1439d2765)]:
  - @brains/entity-service@0.2.0-alpha.161
  - @brains/identity-service@0.2.0-alpha.161
  - @brains/contracts@0.2.0-alpha.161
  - @brains/utils@0.2.0-alpha.161
  - @brains/conversation-service@0.2.0-alpha.161
  - @brains/mcp-service@0.2.0-alpha.161
  - @brains/messaging-service@0.2.0-alpha.161
  - @brains/templates@0.2.0-alpha.161

## 0.2.0-alpha.160

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.160
  - @brains/utils@0.2.0-alpha.160
  - @brains/conversation-service@0.2.0-alpha.160
  - @brains/entity-service@0.2.0-alpha.160
  - @brains/identity-service@0.2.0-alpha.160
  - @brains/mcp-service@0.2.0-alpha.160
  - @brains/messaging-service@0.2.0-alpha.160
  - @brains/templates@0.2.0-alpha.160

## 0.2.0-alpha.159

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.159
  - @brains/utils@0.2.0-alpha.159
  - @brains/conversation-service@0.2.0-alpha.159
  - @brains/entity-service@0.2.0-alpha.159
  - @brains/identity-service@0.2.0-alpha.159
  - @brains/mcp-service@0.2.0-alpha.159
  - @brains/messaging-service@0.2.0-alpha.159
  - @brains/templates@0.2.0-alpha.159

## 0.2.0-alpha.158

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.158
  - @brains/utils@0.2.0-alpha.158
  - @brains/conversation-service@0.2.0-alpha.158
  - @brains/entity-service@0.2.0-alpha.158
  - @brains/identity-service@0.2.0-alpha.158
  - @brains/mcp-service@0.2.0-alpha.158
  - @brains/messaging-service@0.2.0-alpha.158
  - @brains/templates@0.2.0-alpha.158

## 0.2.0-alpha.157

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.157
  - @brains/utils@0.2.0-alpha.157
  - @brains/conversation-service@0.2.0-alpha.157
  - @brains/entity-service@0.2.0-alpha.157
  - @brains/identity-service@0.2.0-alpha.157
  - @brains/mcp-service@0.2.0-alpha.157
  - @brains/messaging-service@0.2.0-alpha.157
  - @brains/templates@0.2.0-alpha.157

## 0.2.0-alpha.156

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.156
  - @brains/utils@0.2.0-alpha.156
  - @brains/conversation-service@0.2.0-alpha.156
  - @brains/entity-service@0.2.0-alpha.156
  - @brains/identity-service@0.2.0-alpha.156
  - @brains/mcp-service@0.2.0-alpha.156
  - @brains/messaging-service@0.2.0-alpha.156
  - @brains/templates@0.2.0-alpha.156

## 0.2.0-alpha.155

### Patch Changes

- Updated dependencies [[`643847f`](https://github.com/rizom-ai/brains/commit/643847fb9ae8298fdc501da9381129c528064c03)]:
  - @brains/mcp-service@0.2.0-alpha.155
  - @brains/entity-service@0.2.0-alpha.155
  - @brains/identity-service@0.2.0-alpha.155
  - @brains/contracts@0.2.0-alpha.155
  - @brains/utils@0.2.0-alpha.155
  - @brains/conversation-service@0.2.0-alpha.155
  - @brains/messaging-service@0.2.0-alpha.155
  - @brains/templates@0.2.0-alpha.155

## 0.2.0-alpha.154

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.154
  - @brains/utils@0.2.0-alpha.154
  - @brains/conversation-service@0.2.0-alpha.154
  - @brains/entity-service@0.2.0-alpha.154
  - @brains/identity-service@0.2.0-alpha.154
  - @brains/mcp-service@0.2.0-alpha.154
  - @brains/messaging-service@0.2.0-alpha.154
  - @brains/templates@0.2.0-alpha.154

## 0.2.0-alpha.153

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.153
  - @brains/utils@0.2.0-alpha.153
  - @brains/conversation-service@0.2.0-alpha.153
  - @brains/entity-service@0.2.0-alpha.153
  - @brains/identity-service@0.2.0-alpha.153
  - @brains/mcp-service@0.2.0-alpha.153
  - @brains/messaging-service@0.2.0-alpha.153
  - @brains/templates@0.2.0-alpha.153

## 0.2.0-alpha.152

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.152
  - @brains/utils@0.2.0-alpha.152
  - @brains/conversation-service@0.2.0-alpha.152
  - @brains/entity-service@0.2.0-alpha.152
  - @brains/identity-service@0.2.0-alpha.152
  - @brains/mcp-service@0.2.0-alpha.152
  - @brains/messaging-service@0.2.0-alpha.152
  - @brains/templates@0.2.0-alpha.152

## 0.2.0-alpha.151

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.151
  - @brains/utils@0.2.0-alpha.151
  - @brains/conversation-service@0.2.0-alpha.151
  - @brains/entity-service@0.2.0-alpha.151
  - @brains/identity-service@0.2.0-alpha.151
  - @brains/mcp-service@0.2.0-alpha.151
  - @brains/messaging-service@0.2.0-alpha.151
  - @brains/templates@0.2.0-alpha.151

## 0.2.0-alpha.150

### Patch Changes

- [`a6c7004`](https://github.com/rizom-ai/brains/commit/a6c70040f23414a301c3f2c2fb3ddef11e7b825f) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Use GPT-5.6 Luna with low reasoning as the default brain model, add typed reasoning-effort configuration from brain definitions and instance overrides through the AI runtime, and simplify tool-routing prompts for more reliable status, trust, and agent recommendation workflows.

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.150
  - @brains/utils@0.2.0-alpha.150
  - @brains/conversation-service@0.2.0-alpha.150
  - @brains/entity-service@0.2.0-alpha.150
  - @brains/identity-service@0.2.0-alpha.150
  - @brains/mcp-service@0.2.0-alpha.150
  - @brains/messaging-service@0.2.0-alpha.150
  - @brains/templates@0.2.0-alpha.150

## 0.2.0-alpha.149

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.149
  - @brains/utils@0.2.0-alpha.149
  - @brains/conversation-service@0.2.0-alpha.149
  - @brains/entity-service@0.2.0-alpha.149
  - @brains/identity-service@0.2.0-alpha.149
  - @brains/mcp-service@0.2.0-alpha.149
  - @brains/messaging-service@0.2.0-alpha.149
  - @brains/templates@0.2.0-alpha.149

## 0.2.0-alpha.148

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.148
  - @brains/utils@0.2.0-alpha.148
  - @brains/conversation-service@0.2.0-alpha.148
  - @brains/entity-service@0.2.0-alpha.148
  - @brains/identity-service@0.2.0-alpha.148
  - @brains/mcp-service@0.2.0-alpha.148
  - @brains/messaging-service@0.2.0-alpha.148
  - @brains/templates@0.2.0-alpha.148

## 0.2.0-alpha.147

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.147
  - @brains/utils@0.2.0-alpha.147
  - @brains/conversation-service@0.2.0-alpha.147
  - @brains/entity-service@0.2.0-alpha.147
  - @brains/identity-service@0.2.0-alpha.147
  - @brains/mcp-service@0.2.0-alpha.147
  - @brains/messaging-service@0.2.0-alpha.147
  - @brains/templates@0.2.0-alpha.147

## 0.2.0-alpha.146

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.146
  - @brains/utils@0.2.0-alpha.146
  - @brains/conversation-service@0.2.0-alpha.146
  - @brains/entity-service@0.2.0-alpha.146
  - @brains/identity-service@0.2.0-alpha.146
  - @brains/mcp-service@0.2.0-alpha.146
  - @brains/messaging-service@0.2.0-alpha.146
  - @brains/templates@0.2.0-alpha.146

## 0.2.0-alpha.145

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.145
  - @brains/utils@0.2.0-alpha.145
  - @brains/conversation-service@0.2.0-alpha.145
  - @brains/entity-service@0.2.0-alpha.145
  - @brains/identity-service@0.2.0-alpha.145
  - @brains/mcp-service@0.2.0-alpha.145
  - @brains/messaging-service@0.2.0-alpha.145
  - @brains/templates@0.2.0-alpha.145

## 0.2.0-alpha.144

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.144
  - @brains/utils@0.2.0-alpha.144
  - @brains/conversation-service@0.2.0-alpha.144
  - @brains/entity-service@0.2.0-alpha.144
  - @brains/identity-service@0.2.0-alpha.144
  - @brains/mcp-service@0.2.0-alpha.144
  - @brains/messaging-service@0.2.0-alpha.144
  - @brains/templates@0.2.0-alpha.144

## 0.2.0-alpha.143

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.143
  - @brains/utils@0.2.0-alpha.143
  - @brains/conversation-service@0.2.0-alpha.143
  - @brains/entity-service@0.2.0-alpha.143
  - @brains/identity-service@0.2.0-alpha.143
  - @brains/mcp-service@0.2.0-alpha.143
  - @brains/messaging-service@0.2.0-alpha.143
  - @brains/templates@0.2.0-alpha.143

## 0.2.0-alpha.142

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.142
  - @brains/utils@0.2.0-alpha.142
  - @brains/conversation-service@0.2.0-alpha.142
  - @brains/entity-service@0.2.0-alpha.142
  - @brains/identity-service@0.2.0-alpha.142
  - @brains/mcp-service@0.2.0-alpha.142
  - @brains/messaging-service@0.2.0-alpha.142
  - @brains/templates@0.2.0-alpha.142

## 0.2.0-alpha.141

### Patch Changes

- Updated dependencies [[`96bd98f`](https://github.com/rizom-ai/brains/commit/96bd98f4fd20e54968c69285a69144158c460bd7)]:
  - @brains/entity-service@0.2.0-alpha.141
  - @brains/identity-service@0.2.0-alpha.141
  - @brains/contracts@0.2.0-alpha.141
  - @brains/utils@0.2.0-alpha.141
  - @brains/conversation-service@0.2.0-alpha.141
  - @brains/mcp-service@0.2.0-alpha.141
  - @brains/messaging-service@0.2.0-alpha.141
  - @brains/templates@0.2.0-alpha.141

## 0.2.0-alpha.140

### Patch Changes

- Updated dependencies [[`070541b`](https://github.com/rizom-ai/brains/commit/070541b535e3977c8fe2d590ae7ad114cee09417), [`a30edc7`](https://github.com/rizom-ai/brains/commit/a30edc7ac66807c66cba2bc94e78206f133710d6), [`cea906c`](https://github.com/rizom-ai/brains/commit/cea906c689d40dee5f06ab949d5289c2660bfd37)]:
  - @brains/entity-service@0.2.0-alpha.140
  - @brains/messaging-service@0.2.0-alpha.140
  - @brains/mcp-service@0.2.0-alpha.140
  - @brains/identity-service@0.2.0-alpha.140
  - @brains/utils@0.2.0-alpha.140
  - @brains/conversation-service@0.2.0-alpha.140
  - @brains/templates@0.2.0-alpha.140
  - @brains/contracts@0.2.0-alpha.140

## 0.2.0-alpha.139

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.139
  - @brains/utils@0.2.0-alpha.139
  - @brains/conversation-service@0.2.0-alpha.139
  - @brains/entity-service@0.2.0-alpha.139
  - @brains/identity-service@0.2.0-alpha.139
  - @brains/mcp-service@0.2.0-alpha.139
  - @brains/messaging-service@0.2.0-alpha.139
  - @brains/templates@0.2.0-alpha.139

## 0.2.0-alpha.138

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.138
  - @brains/utils@0.2.0-alpha.138
  - @brains/conversation-service@0.2.0-alpha.138
  - @brains/entity-service@0.2.0-alpha.138
  - @brains/identity-service@0.2.0-alpha.138
  - @brains/mcp-service@0.2.0-alpha.138
  - @brains/messaging-service@0.2.0-alpha.138
  - @brains/templates@0.2.0-alpha.138

## 0.2.0-alpha.137

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.137
  - @brains/utils@0.2.0-alpha.137
  - @brains/conversation-service@0.2.0-alpha.137
  - @brains/entity-service@0.2.0-alpha.137
  - @brains/identity-service@0.2.0-alpha.137
  - @brains/mcp-service@0.2.0-alpha.137
  - @brains/messaging-service@0.2.0-alpha.137
  - @brains/templates@0.2.0-alpha.137

## 0.2.0-alpha.136

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.136
  - @brains/utils@0.2.0-alpha.136
  - @brains/conversation-service@0.2.0-alpha.136
  - @brains/entity-service@0.2.0-alpha.136
  - @brains/identity-service@0.2.0-alpha.136
  - @brains/mcp-service@0.2.0-alpha.136
  - @brains/messaging-service@0.2.0-alpha.136
  - @brains/templates@0.2.0-alpha.136

## 0.2.0-alpha.135

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.135
  - @brains/utils@0.2.0-alpha.135
  - @brains/conversation-service@0.2.0-alpha.135
  - @brains/entity-service@0.2.0-alpha.135
  - @brains/identity-service@0.2.0-alpha.135
  - @brains/mcp-service@0.2.0-alpha.135
  - @brains/messaging-service@0.2.0-alpha.135
  - @brains/templates@0.2.0-alpha.135

## 0.2.0-alpha.134

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.134
  - @brains/utils@0.2.0-alpha.134
  - @brains/conversation-service@0.2.0-alpha.134
  - @brains/entity-service@0.2.0-alpha.134
  - @brains/identity-service@0.2.0-alpha.134
  - @brains/mcp-service@0.2.0-alpha.134
  - @brains/messaging-service@0.2.0-alpha.134
  - @brains/templates@0.2.0-alpha.134

## 0.2.0-alpha.133

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.133
  - @brains/utils@0.2.0-alpha.133
  - @brains/conversation-service@0.2.0-alpha.133
  - @brains/entity-service@0.2.0-alpha.133
  - @brains/identity-service@0.2.0-alpha.133
  - @brains/mcp-service@0.2.0-alpha.133
  - @brains/messaging-service@0.2.0-alpha.133
  - @brains/templates@0.2.0-alpha.133

## 0.2.0-alpha.132

### Patch Changes

- [`9988510`](https://github.com/rizom-ai/brains/commit/998851097b1606786e0b14a0ef3d2c606fbf08ea) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Split durable content generation into explicit generation tool flows so create/update/save paths can distinguish persisted user content from generated document and image artifacts.

- Updated dependencies [[`9988510`](https://github.com/rizom-ai/brains/commit/998851097b1606786e0b14a0ef3d2c606fbf08ea)]:
  - @brains/entity-service@0.2.0-alpha.132
  - @brains/identity-service@0.2.0-alpha.132
  - @brains/contracts@0.2.0-alpha.132
  - @brains/utils@0.2.0-alpha.132
  - @brains/conversation-service@0.2.0-alpha.132
  - @brains/mcp-service@0.2.0-alpha.132
  - @brains/messaging-service@0.2.0-alpha.132
  - @brains/templates@0.2.0-alpha.132

## 0.2.0-alpha.131

### Patch Changes

- [`2f0854e`](https://github.com/rizom-ai/brains/commit/2f0854ee0e76e2dcef0f8f356d26d034821b8b76) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix web-chat upload follow-ups so singular references such as “the uploaded image” and “the uploaded PDF” resolve to the newest matching live upload, and hydrate prior PDF uploads for read-only summaries even when a prior assistant response is also saveable.

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.131
  - @brains/utils@0.2.0-alpha.131
  - @brains/conversation-service@0.2.0-alpha.131
  - @brains/entity-service@0.2.0-alpha.131
  - @brains/identity-service@0.2.0-alpha.131
  - @brains/mcp-service@0.2.0-alpha.131
  - @brains/messaging-service@0.2.0-alpha.131
  - @brains/templates@0.2.0-alpha.131

## 0.2.0-alpha.130

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.130
  - @brains/utils@0.2.0-alpha.130
  - @brains/conversation-service@0.2.0-alpha.130
  - @brains/entity-service@0.2.0-alpha.130
  - @brains/identity-service@0.2.0-alpha.130
  - @brains/mcp-service@0.2.0-alpha.130
  - @brains/messaging-service@0.2.0-alpha.130
  - @brains/templates@0.2.0-alpha.130

## 0.2.0-alpha.129

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.129
  - @brains/utils@0.2.0-alpha.129
  - @brains/conversation-service@0.2.0-alpha.129
  - @brains/entity-service@0.2.0-alpha.129
  - @brains/identity-service@0.2.0-alpha.129
  - @brains/mcp-service@0.2.0-alpha.129
  - @brains/messaging-service@0.2.0-alpha.129
  - @brains/templates@0.2.0-alpha.129

## 0.2.0-alpha.128

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.128
  - @brains/utils@0.2.0-alpha.128
  - @brains/conversation-service@0.2.0-alpha.128
  - @brains/entity-service@0.2.0-alpha.128
  - @brains/identity-service@0.2.0-alpha.128
  - @brains/mcp-service@0.2.0-alpha.128
  - @brains/messaging-service@0.2.0-alpha.128
  - @brains/templates@0.2.0-alpha.128

## 0.2.0-alpha.127

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.127
  - @brains/utils@0.2.0-alpha.127
  - @brains/conversation-service@0.2.0-alpha.127
  - @brains/entity-service@0.2.0-alpha.127
  - @brains/identity-service@0.2.0-alpha.127
  - @brains/mcp-service@0.2.0-alpha.127
  - @brains/messaging-service@0.2.0-alpha.127
  - @brains/templates@0.2.0-alpha.127

## 0.2.0-alpha.126

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.126
  - @brains/utils@0.2.0-alpha.126
  - @brains/conversation-service@0.2.0-alpha.126
  - @brains/entity-service@0.2.0-alpha.126
  - @brains/identity-service@0.2.0-alpha.126
  - @brains/mcp-service@0.2.0-alpha.126
  - @brains/messaging-service@0.2.0-alpha.126
  - @brains/templates@0.2.0-alpha.126

## 0.2.0-alpha.125

### Patch Changes

- [`f9d1dc9`](https://github.com/rizom-ai/brains/commit/f9d1dc9ed7ac15f131d912202ce9d44fb4f11e32) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Stabilize Rover eval flows by preserving listed entity IDs for follow-up reads, narrowing singular upload follow-ups to the latest upload ref, and rejecting placeholder cover-image updates before confirmation.

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.125
  - @brains/utils@0.2.0-alpha.125
  - @brains/conversation-service@0.2.0-alpha.125
  - @brains/entity-service@0.2.0-alpha.125
  - @brains/identity-service@0.2.0-alpha.125
  - @brains/mcp-service@0.2.0-alpha.125
  - @brains/messaging-service@0.2.0-alpha.125
  - @brains/templates@0.2.0-alpha.125

## 0.2.0-alpha.124

### Patch Changes

- [`57b025e`](https://github.com/rizom-ai/brains/commit/57b025e2bf9015c3f3e46b91fbdbef766efc3d10) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add a confirmed `system_upload_save` path for preserving raw uploaded files as document or image entities while keeping `system_create` focused on generated content and markdown extraction.

- Updated dependencies [[`57b025e`](https://github.com/rizom-ai/brains/commit/57b025e2bf9015c3f3e46b91fbdbef766efc3d10)]:
  - @brains/entity-service@0.2.0-alpha.124
  - @brains/identity-service@0.2.0-alpha.124
  - @brains/contracts@0.2.0-alpha.124
  - @brains/utils@0.2.0-alpha.124
  - @brains/conversation-service@0.2.0-alpha.124
  - @brains/mcp-service@0.2.0-alpha.124
  - @brains/messaging-service@0.2.0-alpha.124
  - @brains/templates@0.2.0-alpha.124

## 0.2.0-alpha.123

### Patch Changes

- [`ce28ba0`](https://github.com/rizom-ai/brains/commit/ce28ba0e9b36119ff4c5e8dcad3b1d8a02391461) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Harden the assistant instructions on identity disclosure and tool routing:
  - never reveal the configured anchor/profile identity when answering "am I your anchor?" or "am I {name}?" — answer from the current permission level only, without confirming or denying via the configured profile details
  - treat an ambiguous "make one draft" follow-up as a clarification, never self-selecting a published item and never firing `system_update` to resolve it
  - for source-derived artifact saves, resolve a source named by title or slug through `system_get` first, then continue to `system_create` with the returned canonical id in the same turn instead of retrying guessed slugs or stopping after the lookup
  - when `system_extract` is unavailable to the caller, say the caller cannot generate/extract topics with their current permissions instead of substituting `system_search` and presenting existing topics as newly generated

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.123
  - @brains/utils@0.2.0-alpha.123
  - @brains/conversation-service@0.2.0-alpha.123
  - @brains/entity-service@0.2.0-alpha.123
  - @brains/identity-service@0.2.0-alpha.123
  - @brains/mcp-service@0.2.0-alpha.123
  - @brains/messaging-service@0.2.0-alpha.123
  - @brains/templates@0.2.0-alpha.123

## 0.2.0-alpha.122

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.122
  - @brains/utils@0.2.0-alpha.122
  - @brains/conversation-service@0.2.0-alpha.122
  - @brains/entity-service@0.2.0-alpha.122
  - @brains/identity-service@0.2.0-alpha.122
  - @brains/mcp-service@0.2.0-alpha.122
  - @brains/messaging-service@0.2.0-alpha.122
  - @brains/templates@0.2.0-alpha.122

## 0.2.0-alpha.121

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.121
  - @brains/utils@0.2.0-alpha.121
  - @brains/conversation-service@0.2.0-alpha.121
  - @brains/entity-service@0.2.0-alpha.121
  - @brains/identity-service@0.2.0-alpha.121
  - @brains/mcp-service@0.2.0-alpha.121
  - @brains/messaging-service@0.2.0-alpha.121
  - @brains/templates@0.2.0-alpha.121

## 0.2.0-alpha.120

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.120
  - @brains/utils@0.2.0-alpha.120
  - @brains/conversation-service@0.2.0-alpha.120
  - @brains/entity-service@0.2.0-alpha.120
  - @brains/identity-service@0.2.0-alpha.120
  - @brains/mcp-service@0.2.0-alpha.120
  - @brains/messaging-service@0.2.0-alpha.120
  - @brains/templates@0.2.0-alpha.120

## 0.2.0-alpha.119

### Patch Changes

- [`d0716d4`](https://github.com/rizom-ai/brains/commit/d0716d40b16b33e63dcdcbd3e8dcb9c280aa6e58) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Avoid reusing stale upload refs when saving image discussions as notes or generating cover images from prior conversation context.

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.119
  - @brains/utils@0.2.0-alpha.119
  - @brains/conversation-service@0.2.0-alpha.119
  - @brains/entity-service@0.2.0-alpha.119
  - @brains/identity-service@0.2.0-alpha.119
  - @brains/mcp-service@0.2.0-alpha.119
  - @brains/messaging-service@0.2.0-alpha.119
  - @brains/templates@0.2.0-alpha.119

## 0.2.0-alpha.118

### Patch Changes

- [`78171a4`](https://github.com/rizom-ai/brains/commit/78171a49698a9248fe12ceae6d8f45a5e5cc8b97) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix web-chat upload follow-ups so prior image uploads are rehydrated as native vision inputs, avoid generated-image copy for uploaded image saves, and clean completed confirmation text.

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.118
  - @brains/utils@0.2.0-alpha.118
  - @brains/conversation-service@0.2.0-alpha.118
  - @brains/entity-service@0.2.0-alpha.118
  - @brains/identity-service@0.2.0-alpha.118
  - @brains/mcp-service@0.2.0-alpha.118
  - @brains/messaging-service@0.2.0-alpha.118
  - @brains/templates@0.2.0-alpha.118

## 0.2.0-alpha.117

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.117
  - @brains/utils@0.2.0-alpha.117
  - @brains/conversation-service@0.2.0-alpha.117
  - @brains/entity-service@0.2.0-alpha.117
  - @brains/identity-service@0.2.0-alpha.117
  - @brains/mcp-service@0.2.0-alpha.117
  - @brains/messaging-service@0.2.0-alpha.117
  - @brains/templates@0.2.0-alpha.117

## 0.2.0-alpha.116

### Patch Changes

- [`2688667`](https://github.com/rizom-ai/brains/commit/26886676251bcfab6f4bbeae7e743059746e737e) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Keep raw attachment URLs out of model-visible tool results while preserving full artifact card data for chat UI rendering.

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.116
  - @brains/utils@0.2.0-alpha.116
  - @brains/conversation-service@0.2.0-alpha.116
  - @brains/entity-service@0.2.0-alpha.116
  - @brains/identity-service@0.2.0-alpha.116
  - @brains/mcp-service@0.2.0-alpha.116
  - @brains/messaging-service@0.2.0-alpha.116
  - @brains/templates@0.2.0-alpha.116

## 0.2.0-alpha.115

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.115
  - @brains/utils@0.2.0-alpha.115
  - @brains/conversation-service@0.2.0-alpha.115
  - @brains/entity-service@0.2.0-alpha.115
  - @brains/identity-service@0.2.0-alpha.115
  - @brains/mcp-service@0.2.0-alpha.115
  - @brains/messaging-service@0.2.0-alpha.115
  - @brains/templates@0.2.0-alpha.115

## 0.2.0-alpha.114

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.114
  - @brains/utils@0.2.0-alpha.114
  - @brains/conversation-service@0.2.0-alpha.114
  - @brains/entity-service@0.2.0-alpha.114
  - @brains/identity-service@0.2.0-alpha.114
  - @brains/mcp-service@0.2.0-alpha.114
  - @brains/messaging-service@0.2.0-alpha.114
  - @brains/templates@0.2.0-alpha.114

## 0.2.0-alpha.113

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.113
  - @brains/utils@0.2.0-alpha.113
  - @brains/conversation-service@0.2.0-alpha.113
  - @brains/entity-service@0.2.0-alpha.113
  - @brains/identity-service@0.2.0-alpha.113
  - @brains/mcp-service@0.2.0-alpha.113
  - @brains/messaging-service@0.2.0-alpha.113
  - @brains/templates@0.2.0-alpha.113

## 0.2.0-alpha.112

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.112
  - @brains/utils@0.2.0-alpha.112
  - @brains/conversation-service@0.2.0-alpha.112
  - @brains/entity-service@0.2.0-alpha.112
  - @brains/identity-service@0.2.0-alpha.112
  - @brains/mcp-service@0.2.0-alpha.112
  - @brains/messaging-service@0.2.0-alpha.112
  - @brains/templates@0.2.0-alpha.112

## 0.2.0-alpha.111

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.111
  - @brains/utils@0.2.0-alpha.111
  - @brains/conversation-service@0.2.0-alpha.111
  - @brains/entity-service@0.2.0-alpha.111
  - @brains/identity-service@0.2.0-alpha.111
  - @brains/mcp-service@0.2.0-alpha.111
  - @brains/messaging-service@0.2.0-alpha.111
  - @brains/templates@0.2.0-alpha.111

## 0.2.0-alpha.110

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.110
  - @brains/utils@0.2.0-alpha.110
  - @brains/conversation-service@0.2.0-alpha.110
  - @brains/entity-service@0.2.0-alpha.110
  - @brains/identity-service@0.2.0-alpha.110
  - @brains/mcp-service@0.2.0-alpha.110
  - @brains/messaging-service@0.2.0-alpha.110
  - @brains/templates@0.2.0-alpha.110

## 0.2.0-alpha.109

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.109
  - @brains/utils@0.2.0-alpha.109
  - @brains/conversation-service@0.2.0-alpha.109
  - @brains/entity-service@0.2.0-alpha.109
  - @brains/identity-service@0.2.0-alpha.109
  - @brains/mcp-service@0.2.0-alpha.109
  - @brains/messaging-service@0.2.0-alpha.109
  - @brains/templates@0.2.0-alpha.109

## 0.2.0-alpha.108

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.108
  - @brains/utils@0.2.0-alpha.108
  - @brains/conversation-service@0.2.0-alpha.108
  - @brains/entity-service@0.2.0-alpha.108
  - @brains/identity-service@0.2.0-alpha.108
  - @brains/mcp-service@0.2.0-alpha.108
  - @brains/messaging-service@0.2.0-alpha.108
  - @brains/templates@0.2.0-alpha.108

## 0.2.0-alpha.107

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.107
  - @brains/utils@0.2.0-alpha.107
  - @brains/conversation-service@0.2.0-alpha.107
  - @brains/entity-service@0.2.0-alpha.107
  - @brains/identity-service@0.2.0-alpha.107
  - @brains/mcp-service@0.2.0-alpha.107
  - @brains/messaging-service@0.2.0-alpha.107
  - @brains/templates@0.2.0-alpha.107

## 0.2.0-alpha.106

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.106
  - @brains/utils@0.2.0-alpha.106
  - @brains/conversation-service@0.2.0-alpha.106
  - @brains/entity-service@0.2.0-alpha.106
  - @brains/identity-service@0.2.0-alpha.106
  - @brains/mcp-service@0.2.0-alpha.106
  - @brains/messaging-service@0.2.0-alpha.106
  - @brains/templates@0.2.0-alpha.106

## 0.2.0-alpha.105

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.105
  - @brains/utils@0.2.0-alpha.105
  - @brains/conversation-service@0.2.0-alpha.105
  - @brains/entity-service@0.2.0-alpha.105
  - @brains/identity-service@0.2.0-alpha.105
  - @brains/mcp-service@0.2.0-alpha.105
  - @brains/messaging-service@0.2.0-alpha.105
  - @brains/templates@0.2.0-alpha.105

## 0.2.0-alpha.104

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.104
  - @brains/utils@0.2.0-alpha.104
  - @brains/conversation-service@0.2.0-alpha.104
  - @brains/entity-service@0.2.0-alpha.104
  - @brains/identity-service@0.2.0-alpha.104
  - @brains/mcp-service@0.2.0-alpha.104
  - @brains/messaging-service@0.2.0-alpha.104
  - @brains/templates@0.2.0-alpha.104

## 0.2.0-alpha.103

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.103
  - @brains/utils@0.2.0-alpha.103
  - @brains/conversation-service@0.2.0-alpha.103
  - @brains/entity-service@0.2.0-alpha.103
  - @brains/identity-service@0.2.0-alpha.103
  - @brains/mcp-service@0.2.0-alpha.103
  - @brains/messaging-service@0.2.0-alpha.103
  - @brains/templates@0.2.0-alpha.103

## 0.2.0-alpha.102

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.102
  - @brains/utils@0.2.0-alpha.102
  - @brains/conversation-service@0.2.0-alpha.102
  - @brains/entity-service@0.2.0-alpha.102
  - @brains/identity-service@0.2.0-alpha.102
  - @brains/mcp-service@0.2.0-alpha.102
  - @brains/messaging-service@0.2.0-alpha.102
  - @brains/templates@0.2.0-alpha.102

## 0.2.0-alpha.101

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.101
  - @brains/utils@0.2.0-alpha.101
  - @brains/conversation-service@0.2.0-alpha.101
  - @brains/entity-service@0.2.0-alpha.101
  - @brains/identity-service@0.2.0-alpha.101
  - @brains/mcp-service@0.2.0-alpha.101
  - @brains/messaging-service@0.2.0-alpha.101
  - @brains/templates@0.2.0-alpha.101

## 0.2.0-alpha.100

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.100
  - @brains/utils@0.2.0-alpha.100
  - @brains/conversation-service@0.2.0-alpha.100
  - @brains/entity-service@0.2.0-alpha.100
  - @brains/identity-service@0.2.0-alpha.100
  - @brains/mcp-service@0.2.0-alpha.100
  - @brains/messaging-service@0.2.0-alpha.100
  - @brains/templates@0.2.0-alpha.100

## 0.2.0-alpha.99

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.99
  - @brains/utils@0.2.0-alpha.99
  - @brains/conversation-service@0.2.0-alpha.99
  - @brains/entity-service@0.2.0-alpha.99
  - @brains/identity-service@0.2.0-alpha.99
  - @brains/mcp-service@0.2.0-alpha.99
  - @brains/messaging-service@0.2.0-alpha.99
  - @brains/templates@0.2.0-alpha.99

## 0.2.0-alpha.98

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.98
  - @brains/utils@0.2.0-alpha.98
  - @brains/conversation-service@0.2.0-alpha.98
  - @brains/entity-service@0.2.0-alpha.98
  - @brains/identity-service@0.2.0-alpha.98
  - @brains/mcp-service@0.2.0-alpha.98
  - @brains/messaging-service@0.2.0-alpha.98
  - @brains/templates@0.2.0-alpha.98

## 0.2.0-alpha.97

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.97
  - @brains/utils@0.2.0-alpha.97
  - @brains/conversation-service@0.2.0-alpha.97
  - @brains/entity-service@0.2.0-alpha.97
  - @brains/identity-service@0.2.0-alpha.97
  - @brains/mcp-service@0.2.0-alpha.97
  - @brains/messaging-service@0.2.0-alpha.97
  - @brains/templates@0.2.0-alpha.97

## 0.2.0-alpha.96

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.96
  - @brains/utils@0.2.0-alpha.96
  - @brains/conversation-service@0.2.0-alpha.96
  - @brains/entity-service@0.2.0-alpha.96
  - @brains/identity-service@0.2.0-alpha.96
  - @brains/mcp-service@0.2.0-alpha.96
  - @brains/messaging-service@0.2.0-alpha.96
  - @brains/templates@0.2.0-alpha.96

## 0.2.0-alpha.95

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.95
  - @brains/utils@0.2.0-alpha.95
  - @brains/conversation-service@0.2.0-alpha.95
  - @brains/entity-service@0.2.0-alpha.95
  - @brains/identity-service@0.2.0-alpha.95
  - @brains/mcp-service@0.2.0-alpha.95
  - @brains/messaging-service@0.2.0-alpha.95
  - @brains/templates@0.2.0-alpha.95

## 0.2.0-alpha.94

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.94
  - @brains/conversation-service@0.2.0-alpha.94
  - @brains/entity-service@0.2.0-alpha.94
  - @brains/identity-service@0.2.0-alpha.94
  - @brains/mcp-service@0.2.0-alpha.94
  - @brains/messaging-service@0.2.0-alpha.94
  - @brains/templates@0.2.0-alpha.94

## 0.2.0-alpha.93

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.93
  - @brains/conversation-service@0.2.0-alpha.93
  - @brains/entity-service@0.2.0-alpha.93
  - @brains/identity-service@0.2.0-alpha.93
  - @brains/mcp-service@0.2.0-alpha.93
  - @brains/messaging-service@0.2.0-alpha.93
  - @brains/templates@0.2.0-alpha.93

## 0.2.0-alpha.92

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.92
  - @brains/conversation-service@0.2.0-alpha.92
  - @brains/entity-service@0.2.0-alpha.92
  - @brains/identity-service@0.2.0-alpha.92
  - @brains/mcp-service@0.2.0-alpha.92
  - @brains/messaging-service@0.2.0-alpha.92
  - @brains/templates@0.2.0-alpha.92

## 0.2.0-alpha.91

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.91
  - @brains/conversation-service@0.2.0-alpha.91
  - @brains/entity-service@0.2.0-alpha.91
  - @brains/identity-service@0.2.0-alpha.91
  - @brains/mcp-service@0.2.0-alpha.91
  - @brains/messaging-service@0.2.0-alpha.91
  - @brains/templates@0.2.0-alpha.91

## 0.2.0-alpha.90

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.90
  - @brains/conversation-service@0.2.0-alpha.90
  - @brains/entity-service@0.2.0-alpha.90
  - @brains/identity-service@0.2.0-alpha.90
  - @brains/mcp-service@0.2.0-alpha.90
  - @brains/messaging-service@0.2.0-alpha.90
  - @brains/templates@0.2.0-alpha.90

## 0.2.0-alpha.89

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.89
  - @brains/conversation-service@0.2.0-alpha.89
  - @brains/entity-service@0.2.0-alpha.89
  - @brains/identity-service@0.2.0-alpha.89
  - @brains/mcp-service@0.2.0-alpha.89
  - @brains/messaging-service@0.2.0-alpha.89
  - @brains/templates@0.2.0-alpha.89

## 0.2.0-alpha.88

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.88
  - @brains/conversation-service@0.2.0-alpha.88
  - @brains/entity-service@0.2.0-alpha.88
  - @brains/identity-service@0.2.0-alpha.88
  - @brains/mcp-service@0.2.0-alpha.88
  - @brains/messaging-service@0.2.0-alpha.88
  - @brains/templates@0.2.0-alpha.88

## 0.2.0-alpha.87

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.87
  - @brains/conversation-service@0.2.0-alpha.87
  - @brains/entity-service@0.2.0-alpha.87
  - @brains/identity-service@0.2.0-alpha.87
  - @brains/mcp-service@0.2.0-alpha.87
  - @brains/messaging-service@0.2.0-alpha.87
  - @brains/templates@0.2.0-alpha.87

## 0.2.0-alpha.86

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.86
  - @brains/conversation-service@0.2.0-alpha.86
  - @brains/entity-service@0.2.0-alpha.86
  - @brains/identity-service@0.2.0-alpha.86
  - @brains/mcp-service@0.2.0-alpha.86
  - @brains/messaging-service@0.2.0-alpha.86
  - @brains/templates@0.2.0-alpha.86

## 0.2.0-alpha.85

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.85
  - @brains/conversation-service@0.2.0-alpha.85
  - @brains/entity-service@0.2.0-alpha.85
  - @brains/identity-service@0.2.0-alpha.85
  - @brains/mcp-service@0.2.0-alpha.85
  - @brains/messaging-service@0.2.0-alpha.85
  - @brains/templates@0.2.0-alpha.85

## 0.2.0-alpha.84

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.84
  - @brains/conversation-service@0.2.0-alpha.84
  - @brains/entity-service@0.2.0-alpha.84
  - @brains/identity-service@0.2.0-alpha.84
  - @brains/mcp-service@0.2.0-alpha.84
  - @brains/messaging-service@0.2.0-alpha.84
  - @brains/templates@0.2.0-alpha.84

## 0.2.0-alpha.83

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.83
  - @brains/conversation-service@0.2.0-alpha.83
  - @brains/entity-service@0.2.0-alpha.83
  - @brains/identity-service@0.2.0-alpha.83
  - @brains/mcp-service@0.2.0-alpha.83
  - @brains/messaging-service@0.2.0-alpha.83
  - @brains/templates@0.2.0-alpha.83

## 0.2.0-alpha.82

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.82
  - @brains/conversation-service@0.2.0-alpha.82
  - @brains/entity-service@0.2.0-alpha.82
  - @brains/identity-service@0.2.0-alpha.82
  - @brains/mcp-service@0.2.0-alpha.82
  - @brains/messaging-service@0.2.0-alpha.82
  - @brains/templates@0.2.0-alpha.82

## 0.2.0-alpha.81

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.81
  - @brains/conversation-service@0.2.0-alpha.81
  - @brains/entity-service@0.2.0-alpha.81
  - @brains/identity-service@0.2.0-alpha.81
  - @brains/mcp-service@0.2.0-alpha.81
  - @brains/messaging-service@0.2.0-alpha.81
  - @brains/templates@0.2.0-alpha.81

## 0.2.0-alpha.80

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.80
  - @brains/conversation-service@0.2.0-alpha.80
  - @brains/entity-service@0.2.0-alpha.80
  - @brains/identity-service@0.2.0-alpha.80
  - @brains/mcp-service@0.2.0-alpha.80
  - @brains/messaging-service@0.2.0-alpha.80
  - @brains/templates@0.2.0-alpha.80

## 0.2.0-alpha.79

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.79
  - @brains/conversation-service@0.2.0-alpha.79
  - @brains/entity-service@0.2.0-alpha.79
  - @brains/identity-service@0.2.0-alpha.79
  - @brains/mcp-service@0.2.0-alpha.79
  - @brains/messaging-service@0.2.0-alpha.79
  - @brains/templates@0.2.0-alpha.79

## 0.2.0-alpha.78

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.78
  - @brains/conversation-service@0.2.0-alpha.78
  - @brains/entity-service@0.2.0-alpha.78
  - @brains/identity-service@0.2.0-alpha.78
  - @brains/mcp-service@0.2.0-alpha.78
  - @brains/messaging-service@0.2.0-alpha.78
  - @brains/templates@0.2.0-alpha.78

## 0.2.0-alpha.77

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.77
  - @brains/conversation-service@0.2.0-alpha.77
  - @brains/entity-service@0.2.0-alpha.77
  - @brains/identity-service@0.2.0-alpha.77
  - @brains/mcp-service@0.2.0-alpha.77
  - @brains/messaging-service@0.2.0-alpha.77
  - @brains/templates@0.2.0-alpha.77

## 0.2.0-alpha.76

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.76
  - @brains/conversation-service@0.2.0-alpha.76
  - @brains/entity-service@0.2.0-alpha.76
  - @brains/identity-service@0.2.0-alpha.76
  - @brains/mcp-service@0.2.0-alpha.76
  - @brains/messaging-service@0.2.0-alpha.76
  - @brains/templates@0.2.0-alpha.76

## 0.2.0-alpha.75

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.75
  - @brains/conversation-service@0.2.0-alpha.75
  - @brains/entity-service@0.2.0-alpha.75
  - @brains/identity-service@0.2.0-alpha.75
  - @brains/mcp-service@0.2.0-alpha.75
  - @brains/messaging-service@0.2.0-alpha.75
  - @brains/templates@0.2.0-alpha.75

## 0.2.0-alpha.74

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.74
  - @brains/conversation-service@0.2.0-alpha.74
  - @brains/entity-service@0.2.0-alpha.74
  - @brains/identity-service@0.2.0-alpha.74
  - @brains/mcp-service@0.2.0-alpha.74
  - @brains/messaging-service@0.2.0-alpha.74
  - @brains/templates@0.2.0-alpha.74

## 0.2.0-alpha.73

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.73
  - @brains/conversation-service@0.2.0-alpha.73
  - @brains/entity-service@0.2.0-alpha.73
  - @brains/identity-service@0.2.0-alpha.73
  - @brains/mcp-service@0.2.0-alpha.73
  - @brains/messaging-service@0.2.0-alpha.73
  - @brains/templates@0.2.0-alpha.73

## 0.2.0-alpha.72

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.72
  - @brains/conversation-service@0.2.0-alpha.72
  - @brains/entity-service@0.2.0-alpha.72
  - @brains/identity-service@0.2.0-alpha.72
  - @brains/mcp-service@0.2.0-alpha.72
  - @brains/messaging-service@0.2.0-alpha.72
  - @brains/templates@0.2.0-alpha.72

## 0.2.0-alpha.71

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.71
  - @brains/conversation-service@0.2.0-alpha.71
  - @brains/entity-service@0.2.0-alpha.71
  - @brains/identity-service@0.2.0-alpha.71
  - @brains/mcp-service@0.2.0-alpha.71
  - @brains/messaging-service@0.2.0-alpha.71
  - @brains/templates@0.2.0-alpha.71

## 0.2.0-alpha.70

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.70
  - @brains/conversation-service@0.2.0-alpha.70
  - @brains/entity-service@0.2.0-alpha.70
  - @brains/identity-service@0.2.0-alpha.70
  - @brains/mcp-service@0.2.0-alpha.70
  - @brains/messaging-service@0.2.0-alpha.70
  - @brains/templates@0.2.0-alpha.70

## 0.2.0-alpha.69

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.69
  - @brains/conversation-service@0.2.0-alpha.69
  - @brains/entity-service@0.2.0-alpha.69
  - @brains/identity-service@0.2.0-alpha.69
  - @brains/mcp-service@0.2.0-alpha.69
  - @brains/messaging-service@0.2.0-alpha.69
  - @brains/templates@0.2.0-alpha.69

## 0.2.0-alpha.68

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.68
  - @brains/conversation-service@0.2.0-alpha.68
  - @brains/entity-service@0.2.0-alpha.68
  - @brains/identity-service@0.2.0-alpha.68
  - @brains/mcp-service@0.2.0-alpha.68
  - @brains/messaging-service@0.2.0-alpha.68
  - @brains/templates@0.2.0-alpha.68

## 0.2.0-alpha.67

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.67
  - @brains/conversation-service@0.2.0-alpha.67
  - @brains/entity-service@0.2.0-alpha.67
  - @brains/identity-service@0.2.0-alpha.67
  - @brains/mcp-service@0.2.0-alpha.67
  - @brains/messaging-service@0.2.0-alpha.67
  - @brains/templates@0.2.0-alpha.67

## 0.2.0-alpha.66

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.66
  - @brains/conversation-service@0.2.0-alpha.66
  - @brains/entity-service@0.2.0-alpha.66
  - @brains/identity-service@0.2.0-alpha.66
  - @brains/mcp-service@0.2.0-alpha.66
  - @brains/messaging-service@0.2.0-alpha.66
  - @brains/templates@0.2.0-alpha.66

## 0.2.0-alpha.65

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.65
  - @brains/conversation-service@0.2.0-alpha.65
  - @brains/entity-service@0.2.0-alpha.65
  - @brains/identity-service@0.2.0-alpha.65
  - @brains/mcp-service@0.2.0-alpha.65
  - @brains/messaging-service@0.2.0-alpha.65
  - @brains/templates@0.2.0-alpha.65

## 0.2.0-alpha.64

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.64
  - @brains/conversation-service@0.2.0-alpha.64
  - @brains/entity-service@0.2.0-alpha.64
  - @brains/identity-service@0.2.0-alpha.64
  - @brains/mcp-service@0.2.0-alpha.64
  - @brains/messaging-service@0.2.0-alpha.64
  - @brains/templates@0.2.0-alpha.64

## 0.2.0-alpha.63

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.63
  - @brains/conversation-service@0.2.0-alpha.63
  - @brains/entity-service@0.2.0-alpha.63
  - @brains/identity-service@0.2.0-alpha.63
  - @brains/mcp-service@0.2.0-alpha.63
  - @brains/messaging-service@0.2.0-alpha.63
  - @brains/templates@0.2.0-alpha.63

## 0.2.0-alpha.62

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.62
  - @brains/conversation-service@0.2.0-alpha.62
  - @brains/entity-service@0.2.0-alpha.62
  - @brains/identity-service@0.2.0-alpha.62
  - @brains/mcp-service@0.2.0-alpha.62
  - @brains/messaging-service@0.2.0-alpha.62
  - @brains/templates@0.2.0-alpha.62

## 0.2.0-alpha.61

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.61
  - @brains/conversation-service@0.2.0-alpha.61
  - @brains/entity-service@0.2.0-alpha.61
  - @brains/identity-service@0.2.0-alpha.61
  - @brains/mcp-service@0.2.0-alpha.61
  - @brains/messaging-service@0.2.0-alpha.61
  - @brains/templates@0.2.0-alpha.61

## 0.2.0-alpha.60

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.60
  - @brains/conversation-service@0.2.0-alpha.60
  - @brains/entity-service@0.2.0-alpha.60
  - @brains/identity-service@0.2.0-alpha.60
  - @brains/mcp-service@0.2.0-alpha.60
  - @brains/messaging-service@0.2.0-alpha.60
  - @brains/templates@0.2.0-alpha.60

## 0.2.0-alpha.59

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.59
  - @brains/conversation-service@0.2.0-alpha.59
  - @brains/entity-service@0.2.0-alpha.59
  - @brains/identity-service@0.2.0-alpha.59
  - @brains/mcp-service@0.2.0-alpha.59
  - @brains/messaging-service@0.2.0-alpha.59
  - @brains/templates@0.2.0-alpha.59

## 0.2.0-alpha.58

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.58
  - @brains/conversation-service@0.2.0-alpha.58
  - @brains/entity-service@0.2.0-alpha.58
  - @brains/identity-service@0.2.0-alpha.58
  - @brains/mcp-service@0.2.0-alpha.58
  - @brains/messaging-service@0.2.0-alpha.58
  - @brains/templates@0.2.0-alpha.58

## 0.2.0-alpha.57

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.57
  - @brains/conversation-service@0.2.0-alpha.57
  - @brains/entity-service@0.2.0-alpha.57
  - @brains/identity-service@0.2.0-alpha.57
  - @brains/mcp-service@0.2.0-alpha.57
  - @brains/messaging-service@0.2.0-alpha.57
  - @brains/templates@0.2.0-alpha.57

## 0.2.0-alpha.56

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.56
  - @brains/conversation-service@0.2.0-alpha.56
  - @brains/entity-service@0.2.0-alpha.56
  - @brains/identity-service@0.2.0-alpha.56
  - @brains/mcp-service@0.2.0-alpha.56
  - @brains/messaging-service@0.2.0-alpha.56
  - @brains/templates@0.2.0-alpha.56

## 0.2.0-alpha.55

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.55
  - @brains/conversation-service@0.2.0-alpha.55
  - @brains/entity-service@0.2.0-alpha.55
  - @brains/identity-service@0.2.0-alpha.55
  - @brains/mcp-service@0.2.0-alpha.55
  - @brains/messaging-service@0.2.0-alpha.55
  - @brains/templates@0.2.0-alpha.55

## 0.2.0-alpha.54

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.54
  - @brains/conversation-service@0.2.0-alpha.54
  - @brains/entity-service@0.2.0-alpha.54
  - @brains/identity-service@0.2.0-alpha.54
  - @brains/mcp-service@0.2.0-alpha.54
  - @brains/messaging-service@0.2.0-alpha.54
  - @brains/templates@0.2.0-alpha.54

## 0.2.0-alpha.53

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.53
  - @brains/conversation-service@0.2.0-alpha.53
  - @brains/entity-service@0.2.0-alpha.53
  - @brains/identity-service@0.2.0-alpha.53
  - @brains/mcp-service@0.2.0-alpha.53
  - @brains/messaging-service@0.2.0-alpha.53
  - @brains/templates@0.2.0-alpha.53

## 0.2.0-alpha.52

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.52
  - @brains/conversation-service@0.2.0-alpha.52
  - @brains/entity-service@0.2.0-alpha.52
  - @brains/identity-service@0.2.0-alpha.52
  - @brains/mcp-service@0.2.0-alpha.52
  - @brains/messaging-service@0.2.0-alpha.52
  - @brains/templates@0.2.0-alpha.52

## 0.2.0-alpha.51

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.51
  - @brains/conversation-service@0.2.0-alpha.51
  - @brains/entity-service@0.2.0-alpha.51
  - @brains/identity-service@0.2.0-alpha.51
  - @brains/mcp-service@0.2.0-alpha.51
  - @brains/messaging-service@0.2.0-alpha.51
  - @brains/templates@0.2.0-alpha.51

## 0.2.0-alpha.50

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.50
  - @brains/conversation-service@0.2.0-alpha.50
  - @brains/entity-service@0.2.0-alpha.50
  - @brains/identity-service@0.2.0-alpha.50
  - @brains/mcp-service@0.2.0-alpha.50
  - @brains/messaging-service@0.2.0-alpha.50
  - @brains/templates@0.2.0-alpha.50

## 0.2.0-alpha.49

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.49
  - @brains/conversation-service@0.2.0-alpha.49
  - @brains/entity-service@0.2.0-alpha.49
  - @brains/identity-service@0.2.0-alpha.49
  - @brains/mcp-service@0.2.0-alpha.49
  - @brains/messaging-service@0.2.0-alpha.49
  - @brains/templates@0.2.0-alpha.49

## 0.2.0-alpha.48

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.48
  - @brains/conversation-service@0.2.0-alpha.48
  - @brains/identity-service@0.2.0-alpha.48
  - @brains/mcp-service@0.2.0-alpha.48
  - @brains/messaging-service@0.2.0-alpha.48
  - @brains/templates@0.2.0-alpha.48

## 0.2.0-alpha.47

### Patch Changes

- Updated dependencies [[`a37e19e`](https://github.com/rizom-ai/brains/commit/a37e19e25194f9c8def483fd9dbc68159754229a)]:
  - @brains/identity-service@0.2.0-alpha.47
  - @brains/utils@0.2.0-alpha.47
  - @brains/conversation-service@0.2.0-alpha.47
  - @brains/mcp-service@0.2.0-alpha.47
  - @brains/messaging-service@0.2.0-alpha.47
  - @brains/templates@0.2.0-alpha.47

## 0.2.0-alpha.46

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.46
  - @brains/conversation-service@0.2.0-alpha.46
  - @brains/identity-service@0.2.0-alpha.46
  - @brains/mcp-service@0.2.0-alpha.46
  - @brains/messaging-service@0.2.0-alpha.46
  - @brains/templates@0.2.0-alpha.46

## 0.2.0-alpha.45

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.45
  - @brains/conversation-service@0.2.0-alpha.45
  - @brains/identity-service@0.2.0-alpha.45
  - @brains/mcp-service@0.2.0-alpha.45
  - @brains/messaging-service@0.2.0-alpha.45
  - @brains/templates@0.2.0-alpha.45

## 0.2.0-alpha.44

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.44
  - @brains/conversation-service@0.2.0-alpha.44
  - @brains/identity-service@0.2.0-alpha.44
  - @brains/mcp-service@0.2.0-alpha.44
  - @brains/messaging-service@0.2.0-alpha.44
  - @brains/templates@0.2.0-alpha.44

## 0.2.0-alpha.43

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.43
  - @brains/conversation-service@0.2.0-alpha.43
  - @brains/identity-service@0.2.0-alpha.43
  - @brains/mcp-service@0.2.0-alpha.43
  - @brains/messaging-service@0.2.0-alpha.43
  - @brains/templates@0.2.0-alpha.43

## 0.2.0-alpha.42

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.42
  - @brains/conversation-service@0.2.0-alpha.42
  - @brains/identity-service@0.2.0-alpha.42
  - @brains/mcp-service@0.2.0-alpha.42
  - @brains/messaging-service@0.2.0-alpha.42
  - @brains/templates@0.2.0-alpha.42

## 0.2.0-alpha.41

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.41
  - @brains/conversation-service@0.2.0-alpha.41
  - @brains/identity-service@0.2.0-alpha.41
  - @brains/mcp-service@0.2.0-alpha.41
  - @brains/messaging-service@0.2.0-alpha.41
  - @brains/templates@0.2.0-alpha.41

## 0.2.0-alpha.40

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.40
  - @brains/conversation-service@0.2.0-alpha.40
  - @brains/identity-service@0.2.0-alpha.40
  - @brains/mcp-service@0.2.0-alpha.40
  - @brains/messaging-service@0.2.0-alpha.40
  - @brains/templates@0.2.0-alpha.40

## 0.2.0-alpha.39

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.39
  - @brains/conversation-service@0.2.0-alpha.39
  - @brains/identity-service@0.2.0-alpha.39
  - @brains/mcp-service@0.2.0-alpha.39
  - @brains/messaging-service@0.2.0-alpha.39
  - @brains/templates@0.2.0-alpha.39

## 0.2.0-alpha.38

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.38
  - @brains/conversation-service@0.2.0-alpha.38
  - @brains/identity-service@0.2.0-alpha.38
  - @brains/mcp-service@0.2.0-alpha.38
  - @brains/messaging-service@0.2.0-alpha.38
  - @brains/templates@0.2.0-alpha.38

## 0.2.0-alpha.37

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.37
  - @brains/conversation-service@0.2.0-alpha.37
  - @brains/identity-service@0.2.0-alpha.37
  - @brains/mcp-service@0.2.0-alpha.37
  - @brains/messaging-service@0.2.0-alpha.37
  - @brains/templates@0.2.0-alpha.37

## 0.2.0-alpha.36

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.36
  - @brains/conversation-service@0.2.0-alpha.36
  - @brains/identity-service@0.2.0-alpha.36
  - @brains/mcp-service@0.2.0-alpha.36
  - @brains/messaging-service@0.2.0-alpha.36
  - @brains/templates@0.2.0-alpha.36

## 0.2.0-alpha.35

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.35
  - @brains/conversation-service@0.2.0-alpha.35
  - @brains/identity-service@0.2.0-alpha.35
  - @brains/mcp-service@0.2.0-alpha.35
  - @brains/messaging-service@0.2.0-alpha.35
  - @brains/templates@0.2.0-alpha.35

## 0.2.0-alpha.34

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.34
  - @brains/conversation-service@0.2.0-alpha.34
  - @brains/identity-service@0.2.0-alpha.34
  - @brains/mcp-service@0.2.0-alpha.34
  - @brains/messaging-service@0.2.0-alpha.34
  - @brains/templates@0.2.0-alpha.34

## 0.2.0-alpha.33

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.33
  - @brains/conversation-service@0.2.0-alpha.33
  - @brains/identity-service@0.2.0-alpha.33
  - @brains/mcp-service@0.2.0-alpha.33
  - @brains/messaging-service@0.2.0-alpha.33
  - @brains/templates@0.2.0-alpha.33

## 0.2.0-alpha.32

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.32
  - @brains/conversation-service@0.2.0-alpha.32
  - @brains/identity-service@0.2.0-alpha.32
  - @brains/mcp-service@0.2.0-alpha.32
  - @brains/messaging-service@0.2.0-alpha.32
  - @brains/templates@0.2.0-alpha.32

## 0.2.0-alpha.31

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.31
  - @brains/conversation-service@0.2.0-alpha.31
  - @brains/identity-service@0.2.0-alpha.31
  - @brains/mcp-service@0.2.0-alpha.31
  - @brains/messaging-service@0.2.0-alpha.31
  - @brains/templates@0.2.0-alpha.31

## 0.2.0-alpha.30

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.30
  - @brains/conversation-service@0.2.0-alpha.30
  - @brains/identity-service@0.2.0-alpha.30
  - @brains/mcp-service@0.2.0-alpha.30
  - @brains/messaging-service@0.2.0-alpha.30
  - @brains/templates@0.2.0-alpha.30

## 0.2.0-alpha.29

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.29
  - @brains/conversation-service@0.2.0-alpha.29
  - @brains/identity-service@0.2.0-alpha.29
  - @brains/mcp-service@0.2.0-alpha.29
  - @brains/messaging-service@0.2.0-alpha.29
  - @brains/templates@0.2.0-alpha.29

## 0.2.0-alpha.28

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.28
  - @brains/conversation-service@0.2.0-alpha.28
  - @brains/identity-service@0.2.0-alpha.28
  - @brains/mcp-service@0.2.0-alpha.28
  - @brains/messaging-service@0.2.0-alpha.28
  - @brains/templates@0.2.0-alpha.28

## 0.2.0-alpha.27

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.27
  - @brains/conversation-service@0.2.0-alpha.27
  - @brains/identity-service@0.2.0-alpha.27
  - @brains/mcp-service@0.2.0-alpha.27
  - @brains/messaging-service@0.2.0-alpha.27
  - @brains/templates@0.2.0-alpha.27

## 0.2.0-alpha.26

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.26
  - @brains/conversation-service@0.2.0-alpha.26
  - @brains/identity-service@0.2.0-alpha.26
  - @brains/mcp-service@0.2.0-alpha.26
  - @brains/messaging-service@0.2.0-alpha.26
  - @brains/templates@0.2.0-alpha.26

## 0.2.0-alpha.25

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.25
  - @brains/conversation-service@0.2.0-alpha.25
  - @brains/identity-service@0.2.0-alpha.25
  - @brains/mcp-service@0.2.0-alpha.25
  - @brains/messaging-service@0.2.0-alpha.25
  - @brains/templates@0.2.0-alpha.25

## 0.2.0-alpha.24

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.24
  - @brains/conversation-service@0.2.0-alpha.24
  - @brains/identity-service@0.2.0-alpha.24
  - @brains/mcp-service@0.2.0-alpha.24
  - @brains/messaging-service@0.2.0-alpha.24
  - @brains/templates@0.2.0-alpha.24

## 0.2.0-alpha.23

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.23
  - @brains/conversation-service@0.2.0-alpha.23
  - @brains/identity-service@0.2.0-alpha.23
  - @brains/mcp-service@0.2.0-alpha.23
  - @brains/messaging-service@0.2.0-alpha.23
  - @brains/templates@0.2.0-alpha.23

## 0.2.0-alpha.22

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.22
  - @brains/conversation-service@0.2.0-alpha.22
  - @brains/identity-service@0.2.0-alpha.22
  - @brains/mcp-service@0.2.0-alpha.22
  - @brains/messaging-service@0.2.0-alpha.22
  - @brains/templates@0.2.0-alpha.22

## 0.2.0-alpha.21

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.21
  - @brains/conversation-service@0.2.0-alpha.21
  - @brains/identity-service@0.2.0-alpha.21
  - @brains/mcp-service@0.2.0-alpha.21
  - @brains/messaging-service@0.2.0-alpha.21
  - @brains/templates@0.2.0-alpha.21

## 0.2.0-alpha.20

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.20
  - @brains/conversation-service@0.2.0-alpha.20
  - @brains/identity-service@0.2.0-alpha.20
  - @brains/mcp-service@0.2.0-alpha.20
  - @brains/messaging-service@0.2.0-alpha.20
  - @brains/templates@0.2.0-alpha.20

## 0.2.0-alpha.19

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.19
  - @brains/conversation-service@0.2.0-alpha.19
  - @brains/identity-service@0.2.0-alpha.19
  - @brains/mcp-service@0.2.0-alpha.19
  - @brains/messaging-service@0.2.0-alpha.19
  - @brains/templates@0.2.0-alpha.19

## 0.2.0-alpha.18

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.18
  - @brains/conversation-service@0.2.0-alpha.18
  - @brains/identity-service@0.2.0-alpha.18
  - @brains/mcp-service@0.2.0-alpha.18
  - @brains/messaging-service@0.2.0-alpha.18
  - @brains/templates@0.2.0-alpha.18

## 0.2.0-alpha.17

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.17
  - @brains/conversation-service@0.2.0-alpha.17
  - @brains/identity-service@0.2.0-alpha.17
  - @brains/mcp-service@0.2.0-alpha.17
  - @brains/messaging-service@0.2.0-alpha.17
  - @brains/templates@0.2.0-alpha.17

## 0.2.0-alpha.16

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.16
  - @brains/conversation-service@0.2.0-alpha.16
  - @brains/identity-service@0.2.0-alpha.16
  - @brains/mcp-service@0.2.0-alpha.16
  - @brains/messaging-service@0.2.0-alpha.16
  - @brains/templates@0.2.0-alpha.16

## 0.2.0-alpha.15

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.15
  - @brains/conversation-service@0.2.0-alpha.15
  - @brains/identity-service@0.2.0-alpha.15
  - @brains/mcp-service@0.2.0-alpha.15
  - @brains/messaging-service@0.2.0-alpha.15
  - @brains/templates@0.2.0-alpha.15

## 0.2.0-alpha.14

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.14
  - @brains/conversation-service@0.2.0-alpha.14
  - @brains/identity-service@0.2.0-alpha.14
  - @brains/mcp-service@0.2.0-alpha.14
  - @brains/messaging-service@0.2.0-alpha.14
  - @brains/templates@0.2.0-alpha.14

## 0.2.0-alpha.13

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.13
  - @brains/conversation-service@0.2.0-alpha.13
  - @brains/identity-service@0.2.0-alpha.13
  - @brains/mcp-service@0.2.0-alpha.13
  - @brains/messaging-service@0.2.0-alpha.13
  - @brains/templates@0.2.0-alpha.13

## 0.2.0-alpha.12

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.12
  - @brains/conversation-service@0.2.0-alpha.12
  - @brains/identity-service@0.2.0-alpha.12
  - @brains/mcp-service@0.2.0-alpha.12
  - @brains/messaging-service@0.2.0-alpha.12
  - @brains/templates@0.2.0-alpha.12

## 0.2.0-alpha.11

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.11
  - @brains/conversation-service@0.2.0-alpha.11
  - @brains/identity-service@0.2.0-alpha.11
  - @brains/mcp-service@0.2.0-alpha.11
  - @brains/messaging-service@0.2.0-alpha.11
  - @brains/templates@0.2.0-alpha.11

## 0.2.0-alpha.10

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.10
  - @brains/conversation-service@0.2.0-alpha.10
  - @brains/identity-service@0.2.0-alpha.10
  - @brains/mcp-service@0.2.0-alpha.10
  - @brains/messaging-service@0.2.0-alpha.10
  - @brains/templates@0.2.0-alpha.10

## 0.2.0-alpha.9

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.9
  - @brains/conversation-service@0.2.0-alpha.9
  - @brains/identity-service@0.2.0-alpha.9
  - @brains/mcp-service@0.2.0-alpha.9
  - @brains/messaging-service@0.2.0-alpha.9
  - @brains/templates@0.2.0-alpha.9

## 0.2.0-alpha.8

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.8
  - @brains/conversation-service@0.2.0-alpha.8
  - @brains/identity-service@0.2.0-alpha.8
  - @brains/mcp-service@0.2.0-alpha.8
  - @brains/messaging-service@0.2.0-alpha.8
  - @brains/templates@0.2.0-alpha.8

## 0.2.0-alpha.7

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.7
  - @brains/conversation-service@0.2.0-alpha.7
  - @brains/identity-service@0.2.0-alpha.7
  - @brains/mcp-service@0.2.0-alpha.7
  - @brains/messaging-service@0.2.0-alpha.7
  - @brains/templates@0.2.0-alpha.7

## 0.2.0-alpha.6

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.6
  - @brains/conversation-service@0.2.0-alpha.6
  - @brains/identity-service@0.2.0-alpha.6
  - @brains/mcp-service@0.2.0-alpha.6
  - @brains/messaging-service@0.2.0-alpha.6
  - @brains/templates@0.2.0-alpha.6

## 0.2.0-alpha.5

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.5
  - @brains/conversation-service@0.2.0-alpha.5
  - @brains/identity-service@0.2.0-alpha.5
  - @brains/mcp-service@0.2.0-alpha.5
  - @brains/messaging-service@0.2.0-alpha.5
  - @brains/templates@0.2.0-alpha.5

## 0.2.0-alpha.4

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.4
  - @brains/conversation-service@0.2.0-alpha.4
  - @brains/identity-service@0.2.0-alpha.4
  - @brains/mcp-service@0.2.0-alpha.4
  - @brains/messaging-service@0.2.0-alpha.4
  - @brains/templates@0.2.0-alpha.4

## 0.2.0-alpha.3

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.3
  - @brains/conversation-service@0.2.0-alpha.3
  - @brains/identity-service@0.2.0-alpha.3
  - @brains/mcp-service@0.2.0-alpha.3
  - @brains/messaging-service@0.2.0-alpha.3
  - @brains/templates@0.2.0-alpha.3

## 0.2.0-alpha.2

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.2
  - @brains/conversation-service@0.2.0-alpha.2
  - @brains/identity-service@0.2.0-alpha.2
  - @brains/mcp-service@0.2.0-alpha.2
  - @brains/messaging-service@0.2.0-alpha.2
  - @brains/templates@0.2.0-alpha.2

## 0.2.0-alpha.1

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.1
  - @brains/conversation-service@0.2.0-alpha.1
  - @brains/identity-service@0.2.0-alpha.1
  - @brains/mcp-service@0.2.0-alpha.1
  - @brains/messaging-service@0.2.0-alpha.1
  - @brains/templates@0.2.0-alpha.1

## 1.0.1-alpha.17

### Patch Changes

- Updated dependencies []:
  - @brains/utils@1.0.1-alpha.17
  - @brains/conversation-service@1.0.1-alpha.17
  - @brains/identity-service@1.0.1-alpha.17
  - @brains/mcp-service@1.0.1-alpha.17
  - @brains/messaging-service@1.0.1-alpha.17
  - @brains/templates@1.0.1-alpha.17

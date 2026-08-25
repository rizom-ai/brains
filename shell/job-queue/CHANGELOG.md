# @brains/job-queue

## 0.2.0-alpha.322

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.322
  - @brains/db@0.2.0-alpha.322
  - @brains/operation-context@0.2.0-alpha.322
  - @brains/utils@0.2.0-alpha.322
  - @brains/mcp-service@0.2.0-alpha.322

## 0.2.0-alpha.321

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.321
  - @brains/db@0.2.0-alpha.321
  - @brains/operation-context@0.2.0-alpha.321
  - @brains/utils@0.2.0-alpha.321
  - @brains/mcp-service@0.2.0-alpha.321

## 0.2.0-alpha.320

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.320
  - @brains/db@0.2.0-alpha.320
  - @brains/operation-context@0.2.0-alpha.320
  - @brains/utils@0.2.0-alpha.320
  - @brains/mcp-service@0.2.0-alpha.320

## 0.2.0-alpha.319

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.319
  - @brains/db@0.2.0-alpha.319
  - @brains/operation-context@0.2.0-alpha.319
  - @brains/utils@0.2.0-alpha.319
  - @brains/mcp-service@0.2.0-alpha.319

## 0.2.0-alpha.318

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.318
  - @brains/db@0.2.0-alpha.318
  - @brains/operation-context@0.2.0-alpha.318
  - @brains/utils@0.2.0-alpha.318
  - @brains/mcp-service@0.2.0-alpha.318

## 0.2.0-alpha.317

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.317
  - @brains/db@0.2.0-alpha.317
  - @brains/operation-context@0.2.0-alpha.317
  - @brains/utils@0.2.0-alpha.317
  - @brains/mcp-service@0.2.0-alpha.317

## 0.2.0-alpha.316

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.316
  - @brains/db@0.2.0-alpha.316
  - @brains/operation-context@0.2.0-alpha.316
  - @brains/utils@0.2.0-alpha.316
  - @brains/mcp-service@0.2.0-alpha.316

## 0.2.0-alpha.315

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.315
  - @brains/db@0.2.0-alpha.315
  - @brains/operation-context@0.2.0-alpha.315
  - @brains/utils@0.2.0-alpha.315
  - @brains/mcp-service@0.2.0-alpha.315

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

- [`fd2855e`](https://github.com/rizom-ai/brains/commit/fd2855ea09d880ebf4268ce6f9a53d4cb9289c07) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Declare the drizzle column-annotation aliases once, in `@brains/db`.

  `isolatedDeclarations` makes exported tables carry explicit column types, and
  five packages had each hand-written the same sixteen-key `SQLiteColumn` config
  literal per column kind — ~420 lines of identical type machinery across seven
  schema files, drifting on which axes they exposed. The literals now live once in
  `@brains/db` (`SqliteTextColumn`, `SqliteIntegerColumn`, `SqliteJsonColumn`,
  `SqliteBooleanColumn`, `SqliteTable`) with every axis the schemas vary on as a
  parameter; schema files keep one-line local aliases that bind their table name.

- Updated dependencies [[`9bd1925`](https://github.com/rizom-ai/brains/commit/9bd192562923351e62909c7a0662eeeb46453303), [`d339319`](https://github.com/rizom-ai/brains/commit/d339319dabea7f856b69c829e46d3937254880d3), [`ae06107`](https://github.com/rizom-ai/brains/commit/ae06107694a825378e23183c26261c91166edfdf), [`17507e8`](https://github.com/rizom-ai/brains/commit/17507e806efc5fde1c30496700de74b53575d350), [`fd2855e`](https://github.com/rizom-ai/brains/commit/fd2855ea09d880ebf4268ce6f9a53d4cb9289c07), [`497fbc0`](https://github.com/rizom-ai/brains/commit/497fbc0f6d672e23afd5263a519c4e73a740c2c5)]:
  - @brains/contracts@0.2.0-alpha.314
  - @brains/db@0.2.0-alpha.314
  - @brains/operation-context@0.2.0-alpha.314
  - @brains/mcp-service@0.2.0-alpha.314
  - @brains/utils@0.2.0-alpha.314

## 0.2.0-alpha.313

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.313
  - @brains/db@0.2.0-alpha.313
  - @brains/operation-context@0.2.0-alpha.313
  - @brains/utils@0.2.0-alpha.313
  - @brains/mcp-service@0.2.0-alpha.313

## 0.2.0-alpha.312

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.312
  - @brains/db@0.2.0-alpha.312
  - @brains/operation-context@0.2.0-alpha.312
  - @brains/utils@0.2.0-alpha.312
  - @brains/mcp-service@0.2.0-alpha.312

## 0.2.0-alpha.311

### Patch Changes

- Updated dependencies [[`0b4d2bc`](https://github.com/rizom-ai/brains/commit/0b4d2bca39b83d60183c0040f63f4bb9c2f9d029)]:
  - @brains/utils@0.2.0-alpha.311
  - @brains/contracts@0.2.0-alpha.311
  - @brains/db@0.2.0-alpha.311
  - @brains/mcp-service@0.2.0-alpha.311
  - @brains/operation-context@0.2.0-alpha.311

## 0.2.0-alpha.310

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.310
  - @brains/db@0.2.0-alpha.310
  - @brains/operation-context@0.2.0-alpha.310
  - @brains/utils@0.2.0-alpha.310
  - @brains/mcp-service@0.2.0-alpha.310

## 0.2.0-alpha.309

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.309
  - @brains/db@0.2.0-alpha.309
  - @brains/operation-context@0.2.0-alpha.309
  - @brains/utils@0.2.0-alpha.309
  - @brains/mcp-service@0.2.0-alpha.309

## 0.2.0-alpha.308

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.308
  - @brains/db@0.2.0-alpha.308
  - @brains/operation-context@0.2.0-alpha.308
  - @brains/utils@0.2.0-alpha.308
  - @brains/mcp-service@0.2.0-alpha.308

## 0.2.0-alpha.307

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.307
  - @brains/db@0.2.0-alpha.307
  - @brains/operation-context@0.2.0-alpha.307
  - @brains/utils@0.2.0-alpha.307
  - @brains/mcp-service@0.2.0-alpha.307

## 0.2.0-alpha.306

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.306
  - @brains/db@0.2.0-alpha.306
  - @brains/operation-context@0.2.0-alpha.306
  - @brains/utils@0.2.0-alpha.306
  - @brains/mcp-service@0.2.0-alpha.306

## 0.2.0-alpha.305

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.305
  - @brains/db@0.2.0-alpha.305
  - @brains/operation-context@0.2.0-alpha.305
  - @brains/utils@0.2.0-alpha.305
  - @brains/mcp-service@0.2.0-alpha.305

## 0.2.0-alpha.304

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.304
  - @brains/db@0.2.0-alpha.304
  - @brains/operation-context@0.2.0-alpha.304
  - @brains/utils@0.2.0-alpha.304
  - @brains/mcp-service@0.2.0-alpha.304

## 0.2.0-alpha.303

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.303
  - @brains/db@0.2.0-alpha.303
  - @brains/operation-context@0.2.0-alpha.303
  - @brains/utils@0.2.0-alpha.303
  - @brains/mcp-service@0.2.0-alpha.303

## 0.2.0-alpha.302

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.302
  - @brains/db@0.2.0-alpha.302
  - @brains/operation-context@0.2.0-alpha.302
  - @brains/utils@0.2.0-alpha.302
  - @brains/mcp-service@0.2.0-alpha.302

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

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.301
  - @brains/db@0.2.0-alpha.301
  - @brains/operation-context@0.2.0-alpha.301
  - @brains/utils@0.2.0-alpha.301
  - @brains/mcp-service@0.2.0-alpha.301

## 0.2.0-alpha.300

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.300
  - @brains/db@0.2.0-alpha.300
  - @brains/operation-context@0.2.0-alpha.300
  - @brains/utils@0.2.0-alpha.300
  - @brains/mcp-service@0.2.0-alpha.300

## 0.2.0-alpha.299

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.299
  - @brains/db@0.2.0-alpha.299
  - @brains/operation-context@0.2.0-alpha.299
  - @brains/utils@0.2.0-alpha.299
  - @brains/mcp-service@0.2.0-alpha.299

## 0.2.0-alpha.298

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.298
  - @brains/db@0.2.0-alpha.298
  - @brains/operation-context@0.2.0-alpha.298
  - @brains/utils@0.2.0-alpha.298
  - @brains/mcp-service@0.2.0-alpha.298

## 0.2.0-alpha.297

### Patch Changes

- Updated dependencies [[`f6d93c7`](https://github.com/rizom-ai/brains/commit/f6d93c7aa49acccd691b049b090a7fdbbe7b6a1a)]:
  - @brains/contracts@0.2.0-alpha.297
  - @brains/operation-context@0.2.0-alpha.297
  - @brains/mcp-service@0.2.0-alpha.297
  - @brains/db@0.2.0-alpha.297
  - @brains/utils@0.2.0-alpha.297

## 0.2.0-alpha.296

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.296
  - @brains/db@0.2.0-alpha.296
  - @brains/operation-context@0.2.0-alpha.296
  - @brains/utils@0.2.0-alpha.296
  - @brains/mcp-service@0.2.0-alpha.296

## 0.2.0-alpha.295

### Patch Changes

- [`476dfe2`](https://github.com/rizom-ai/brains/commit/476dfe27107d5bf39008dd4eb2cfba86396270aa) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Recover atomic enqueue from retryable libSQL commit conflicts by rolling back and replaying the complete write transaction. Release projection-admission reservations between attempts so replay cannot leak or double-commit admission state.

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.295
  - @brains/db@0.2.0-alpha.295
  - @brains/operation-context@0.2.0-alpha.295
  - @brains/utils@0.2.0-alpha.295
  - @brains/mcp-service@0.2.0-alpha.295

## 0.2.0-alpha.294

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.294
  - @brains/db@0.2.0-alpha.294
  - @brains/operation-context@0.2.0-alpha.294
  - @brains/utils@0.2.0-alpha.294
  - @brains/mcp-service@0.2.0-alpha.294

## 0.2.0-alpha.293

### Patch Changes

- Updated dependencies []:
  - @brains/mcp-service@0.2.0-alpha.293
  - @brains/contracts@0.2.0-alpha.293
  - @brains/db@0.2.0-alpha.293
  - @brains/operation-context@0.2.0-alpha.293
  - @brains/utils@0.2.0-alpha.293

## 0.2.0-alpha.292

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.292
  - @brains/db@0.2.0-alpha.292
  - @brains/operation-context@0.2.0-alpha.292
  - @brains/utils@0.2.0-alpha.292
  - @brains/mcp-service@0.2.0-alpha.292

## 0.2.0-alpha.291

### Patch Changes

- [#136](https://github.com/rizom-ai/brains/pull/136) [`3ed9cfe`](https://github.com/rizom-ai/brains/commit/3ed9cfe0636ee55dac9bf74506d743a6a84eb6f8) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Run background jobs with schema-configured bounded parallelism and honor the existing topic source-change batch delay before projection-wave admission, preventing parallel imports from causing repeated full-corpus topic extraction.

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.291
  - @brains/db@0.2.0-alpha.291
  - @brains/operation-context@0.2.0-alpha.291
  - @brains/utils@0.2.0-alpha.291
  - @brains/mcp-service@0.2.0-alpha.291

## 0.2.0-alpha.290

### Patch Changes

- [`878b6e2`](https://github.com/rizom-ai/brains/commit/878b6e227b26f3c59996a9042080c37598b5ffdf) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add `waitForIdle` to the job queue so callers can await a settled queue instead of sampling counters. Work here cascades — completing a job can enqueue the next — so idle means the queue stayed empty for a quiet window rather than being momentarily empty, and a timeout reports what is still outstanding.

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.290
  - @brains/db@0.2.0-alpha.290
  - @brains/operation-context@0.2.0-alpha.290
  - @brains/utils@0.2.0-alpha.290
  - @brains/mcp-service@0.2.0-alpha.290

## 0.2.0-alpha.289

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.289
  - @brains/db@0.2.0-alpha.289
  - @brains/operation-context@0.2.0-alpha.289
  - @brains/utils@0.2.0-alpha.289
  - @brains/mcp-service@0.2.0-alpha.289

## 0.2.0-alpha.288

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.288
  - @brains/db@0.2.0-alpha.288
  - @brains/operation-context@0.2.0-alpha.288
  - @brains/utils@0.2.0-alpha.288
  - @brains/mcp-service@0.2.0-alpha.288

## 0.2.0-alpha.287

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.287
  - @brains/db@0.2.0-alpha.287
  - @brains/operation-context@0.2.0-alpha.287
  - @brains/utils@0.2.0-alpha.287
  - @brains/mcp-service@0.2.0-alpha.287

## 0.2.0-alpha.286

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.286
  - @brains/db@0.2.0-alpha.286
  - @brains/operation-context@0.2.0-alpha.286
  - @brains/utils@0.2.0-alpha.286
  - @brains/mcp-service@0.2.0-alpha.286

## 0.2.0-alpha.285

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.285
  - @brains/db@0.2.0-alpha.285
  - @brains/operation-context@0.2.0-alpha.285
  - @brains/utils@0.2.0-alpha.285
  - @brains/mcp-service@0.2.0-alpha.285

## 0.2.0-alpha.284

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.284
  - @brains/db@0.2.0-alpha.284
  - @brains/operation-context@0.2.0-alpha.284
  - @brains/utils@0.2.0-alpha.284
  - @brains/mcp-service@0.2.0-alpha.284

## 0.2.0-alpha.283

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.283
  - @brains/db@0.2.0-alpha.283
  - @brains/operation-context@0.2.0-alpha.283
  - @brains/utils@0.2.0-alpha.283
  - @brains/mcp-service@0.2.0-alpha.283

## 0.2.0-alpha.282

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.282
  - @brains/db@0.2.0-alpha.282
  - @brains/operation-context@0.2.0-alpha.282
  - @brains/utils@0.2.0-alpha.282
  - @brains/mcp-service@0.2.0-alpha.282

## 0.2.0-alpha.281

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.281
  - @brains/db@0.2.0-alpha.281
  - @brains/operation-context@0.2.0-alpha.281
  - @brains/utils@0.2.0-alpha.281
  - @brains/mcp-service@0.2.0-alpha.281

## 0.2.0-alpha.280

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.280
  - @brains/db@0.2.0-alpha.280
  - @brains/operation-context@0.2.0-alpha.280
  - @brains/utils@0.2.0-alpha.280
  - @brains/mcp-service@0.2.0-alpha.280

## 0.2.0-alpha.279

### Patch Changes

- Updated dependencies [[`bd1eb47`](https://github.com/rizom-ai/brains/commit/bd1eb4768ee154570f5ba144f59a145c7f00aa51)]:
  - @brains/contracts@0.2.0-alpha.279
  - @brains/operation-context@0.2.0-alpha.279
  - @brains/mcp-service@0.2.0-alpha.279
  - @brains/db@0.2.0-alpha.279
  - @brains/utils@0.2.0-alpha.279

## 0.2.0-alpha.278

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.278
  - @brains/db@0.2.0-alpha.278
  - @brains/operation-context@0.2.0-alpha.278
  - @brains/utils@0.2.0-alpha.278
  - @brains/mcp-service@0.2.0-alpha.278

## 0.2.0-alpha.277

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.277
  - @brains/db@0.2.0-alpha.277
  - @brains/operation-context@0.2.0-alpha.277
  - @brains/utils@0.2.0-alpha.277
  - @brains/mcp-service@0.2.0-alpha.277

## 0.2.0-alpha.276

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.276
  - @brains/db@0.2.0-alpha.276
  - @brains/operation-context@0.2.0-alpha.276
  - @brains/utils@0.2.0-alpha.276
  - @brains/mcp-service@0.2.0-alpha.276

## 0.2.0-alpha.275

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.275
  - @brains/db@0.2.0-alpha.275
  - @brains/operation-context@0.2.0-alpha.275
  - @brains/utils@0.2.0-alpha.275
  - @brains/mcp-service@0.2.0-alpha.275

## 0.2.0-alpha.274

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.274
  - @brains/db@0.2.0-alpha.274
  - @brains/operation-context@0.2.0-alpha.274
  - @brains/utils@0.2.0-alpha.274
  - @brains/mcp-service@0.2.0-alpha.274

## 0.2.0-alpha.273

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.273
  - @brains/db@0.2.0-alpha.273
  - @brains/operation-context@0.2.0-alpha.273
  - @brains/utils@0.2.0-alpha.273
  - @brains/mcp-service@0.2.0-alpha.273

## 0.2.0-alpha.272

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.272
  - @brains/db@0.2.0-alpha.272
  - @brains/operation-context@0.2.0-alpha.272
  - @brains/utils@0.2.0-alpha.272
  - @brains/mcp-service@0.2.0-alpha.272

## 0.2.0-alpha.271

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.271
  - @brains/db@0.2.0-alpha.271
  - @brains/operation-context@0.2.0-alpha.271
  - @brains/utils@0.2.0-alpha.271
  - @brains/mcp-service@0.2.0-alpha.271

## 0.2.0-alpha.270

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.270
  - @brains/db@0.2.0-alpha.270
  - @brains/operation-context@0.2.0-alpha.270
  - @brains/utils@0.2.0-alpha.270
  - @brains/mcp-service@0.2.0-alpha.270

## 0.2.0-alpha.269

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.269
  - @brains/db@0.2.0-alpha.269
  - @brains/operation-context@0.2.0-alpha.269
  - @brains/utils@0.2.0-alpha.269
  - @brains/mcp-service@0.2.0-alpha.269

## 0.2.0-alpha.268

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.268
  - @brains/db@0.2.0-alpha.268
  - @brains/operation-context@0.2.0-alpha.268
  - @brains/utils@0.2.0-alpha.268
  - @brains/mcp-service@0.2.0-alpha.268

## 0.2.0-alpha.267

### Patch Changes

- Updated dependencies [[`1f94bde`](https://github.com/rizom-ai/brains/commit/1f94bdee59ea9e5a3b352657b1c74c36ca2af3ea)]:
  - @brains/mcp-service@0.2.0-alpha.267
  - @brains/contracts@0.2.0-alpha.267
  - @brains/db@0.2.0-alpha.267
  - @brains/operation-context@0.2.0-alpha.267
  - @brains/utils@0.2.0-alpha.267

## 0.2.0-alpha.266

### Patch Changes

- [`e70ab12`](https://github.com/rizom-ai/brains/commit/e70ab12745c6cf757f685389f4cd6de8991de95f) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Behavior-preserving quality refactors: shared SerialQueue/KeyedSerialQueue primitive in @brains/utils replacing five hand-rolled promise-tail mutexes; directory-sync stress system split into command runner, git checkout, and health monitor modules; job-queue worker heartbeat/deadline/error-callback dedup and table-generic schema column helpers; consolidated pilot starter staleness detection; single-pass HTTP route registry views; projection wave planning simplification with indexed graph edges.

- Updated dependencies [[`e70ab12`](https://github.com/rizom-ai/brains/commit/e70ab12745c6cf757f685389f4cd6de8991de95f)]:
  - @brains/utils@0.2.0-alpha.266
  - @brains/contracts@0.2.0-alpha.266
  - @brains/db@0.2.0-alpha.266
  - @brains/mcp-service@0.2.0-alpha.266
  - @brains/operation-context@0.2.0-alpha.266

## 0.2.0-alpha.265

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.265
  - @brains/db@0.2.0-alpha.265
  - @brains/operation-context@0.2.0-alpha.265
  - @brains/utils@0.2.0-alpha.265
  - @brains/mcp-service@0.2.0-alpha.265

## 0.2.0-alpha.264

### Patch Changes

- [`f096118`](https://github.com/rizom-ai/brains/commit/f096118a902af6921546c748f8418964135d3645) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Retry atomic-enqueue write-transaction conflicts against a time budget (2s, jittered exponential backoff) instead of a fixed attempt cap, in both the acquire and commit phases. App-level retries stand in for SQLite's busy_timeout here, so any attempt cap was a latent failure under slow-runner contention.

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.264
  - @brains/db@0.2.0-alpha.264
  - @brains/operation-context@0.2.0-alpha.264
  - @brains/utils@0.2.0-alpha.264
  - @brains/mcp-service@0.2.0-alpha.264

## 0.2.0-alpha.263

### Patch Changes

- [`cfbec3b`](https://github.com/rizom-ai/brains/commit/cfbec3b4dcafc5d67f7f905d2c4fd3bf082df600) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Serialize durable job deduplication in explicit database write transactions across queue clients and processes. Validate duplicate requests before selection, reserve projection budget only for committed inserts, and preserve in-flight enqueue transactions during service shutdown.

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.263
  - @brains/db@0.2.0-alpha.263
  - @brains/operation-context@0.2.0-alpha.263
  - @brains/utils@0.2.0-alpha.263
  - @brains/mcp-service@0.2.0-alpha.263

## 0.2.0-alpha.262

### Patch Changes

- [`3c4ac3a`](https://github.com/rizom-ai/brains/commit/3c4ac3afd69e300ac1bb1aeebe25210fe87255c9) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Route-registry review follow-ups: the rover-pilot deploy template's origin-TLS check probes `/health/live` instead of the removed aggregate `/health`, and enqueue-side preflights report "No job type declared" instead of the stale "No handler registered" message now that they check declared validators rather than executable handlers.

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.262
  - @brains/db@0.2.0-alpha.262
  - @brains/operation-context@0.2.0-alpha.262
  - @brains/utils@0.2.0-alpha.262
  - @brains/mcp-service@0.2.0-alpha.262

## 0.2.0-alpha.261

### Patch Changes

- [#88](https://github.com/rizom-ai/brains/pull/88) [`58b614a`](https://github.com/rizom-ai/brains/commit/58b614a7f0dfc47b80ebaa63bc337bc9eef20676) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix batch enqueueing from validation-only processes: BatchJobManager preflight now checks the declared validator instead of requiring an executable handler. Since the web/worker runtime split, the web process registers job handlers in validation-only mode, so every enqueueBatch from web (directory-sync imports, deletes, cleanups via periodic git sync and the file watcher) threw "No handler registered for job type" and pulled git content was never imported.

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.261
  - @brains/db@0.2.0-alpha.261
  - @brains/operation-context@0.2.0-alpha.261
  - @brains/utils@0.2.0-alpha.261
  - @brains/mcp-service@0.2.0-alpha.261

## 0.2.0-alpha.260

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.260
  - @brains/db@0.2.0-alpha.260
  - @brains/operation-context@0.2.0-alpha.260
  - @brains/utils@0.2.0-alpha.260
  - @brains/mcp-service@0.2.0-alpha.260

## 0.2.0-alpha.259

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.259
  - @brains/db@0.2.0-alpha.259
  - @brains/operation-context@0.2.0-alpha.259
  - @brains/utils@0.2.0-alpha.259
  - @brains/mcp-service@0.2.0-alpha.259

## 0.2.0-alpha.258

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.258
  - @brains/db@0.2.0-alpha.258
  - @brains/operation-context@0.2.0-alpha.258
  - @brains/utils@0.2.0-alpha.258
  - @brains/mcp-service@0.2.0-alpha.258

## 0.2.0-alpha.257

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.257
  - @brains/db@0.2.0-alpha.257
  - @brains/operation-context@0.2.0-alpha.257
  - @brains/utils@0.2.0-alpha.257
  - @brains/mcp-service@0.2.0-alpha.257

## 0.2.0-alpha.256

### Patch Changes

- [#84](https://github.com/rizom-ai/brains/pull/84) [`b155d93`](https://github.com/rizom-ai/brains/commit/b155d938c240bcc9500c2395f11763ab49a017c9) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Persist fenced job progress and terminal updates for bounded, indexed cross-process publication, and mark internal subscriptions required by durable execution separately from ordinary ingress subscriptions.

- [#84](https://github.com/rizom-ai/brains/pull/84) [`1e45eca`](https://github.com/rizom-ai/brains/commit/1e45ecaaed5351964cbf8a0754a301507b15c298) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Bound background job execution with per-handler deadlines and required cancellation signals. Persist worker sessions and renewable attempt leases, fence completion, failure, progress, and heartbeat writes by unique attempt token, and immediately recover attempts when a stable worker slot starts a replacement session.

- [#84](https://github.com/rizom-ai/brains/pull/84) [`b155d93`](https://github.com/rizom-ai/brains/commit/b155d938c240bcc9500c2395f11763ab49a017c9) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Separate web routing readiness from full operational health, expose durable worker-session degradation, and add `/health/operate` for operator alerting.

- [#84](https://github.com/rizom-ai/brains/pull/84) [`b155d93`](https://github.com/rizom-ai/brains/commit/b155d938c240bcc9500c2395f11763ab49a017c9) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Keep SWOT projection inputs JSON-compatible when optional evidence is absent, and start each durable projection wave with a fresh causal root so successor waves cannot falsely trip repeated-lineage circuits.

- [#84](https://github.com/rizom-ai/brains/pull/84) [`b155d93`](https://github.com/rizom-ai/brains/commit/b155d938c240bcc9500c2395f11763ab49a017c9) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Split the bundled runtime into supervised web and durable execution children, with immutable handler inventory, execution-only plugin registration, web-owned enqueue validation, and budgeted worker restart isolation.

- Updated dependencies [[`1e45eca`](https://github.com/rizom-ai/brains/commit/1e45ecaaed5351964cbf8a0754a301507b15c298)]:
  - @brains/utils@0.2.0-alpha.256
  - @brains/contracts@0.2.0-alpha.256
  - @brains/db@0.2.0-alpha.256
  - @brains/mcp-service@0.2.0-alpha.256
  - @brains/operation-context@0.2.0-alpha.256

## 0.2.0-alpha.255

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.255
  - @brains/db@0.2.0-alpha.255
  - @brains/utils@0.2.0-alpha.255
  - @brains/mcp-service@0.2.0-alpha.255

## 0.2.0-alpha.254

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.254
  - @brains/db@0.2.0-alpha.254
  - @brains/utils@0.2.0-alpha.254
  - @brains/mcp-service@0.2.0-alpha.254

## 0.2.0-alpha.253

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.253
  - @brains/db@0.2.0-alpha.253
  - @brains/utils@0.2.0-alpha.253
  - @brains/mcp-service@0.2.0-alpha.253

## 0.2.0-alpha.252

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.252
  - @brains/db@0.2.0-alpha.252
  - @brains/utils@0.2.0-alpha.252
  - @brains/mcp-service@0.2.0-alpha.252

## 0.2.0-alpha.251

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.251
  - @brains/db@0.2.0-alpha.251
  - @brains/utils@0.2.0-alpha.251
  - @brains/mcp-service@0.2.0-alpha.251

## 0.2.0-alpha.250

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.250
  - @brains/db@0.2.0-alpha.250
  - @brains/utils@0.2.0-alpha.250
  - @brains/mcp-service@0.2.0-alpha.250

## 0.2.0-alpha.249

### Patch Changes

- Updated dependencies [[`84dca8c`](https://github.com/rizom-ai/brains/commit/84dca8c9ddf83fcf01784f54da479e2229eba09c)]:
  - @brains/contracts@0.2.0-alpha.249
  - @brains/mcp-service@0.2.0-alpha.249
  - @brains/db@0.2.0-alpha.249
  - @brains/utils@0.2.0-alpha.249

## 0.2.0-alpha.248

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.248
  - @brains/db@0.2.0-alpha.248
  - @brains/utils@0.2.0-alpha.248
  - @brains/mcp-service@0.2.0-alpha.248

## 0.2.0-alpha.247

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.247
  - @brains/db@0.2.0-alpha.247
  - @brains/utils@0.2.0-alpha.247
  - @brains/mcp-service@0.2.0-alpha.247

## 0.2.0-alpha.246

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.246
  - @brains/db@0.2.0-alpha.246
  - @brains/utils@0.2.0-alpha.246
  - @brains/mcp-service@0.2.0-alpha.246

## 0.2.0-alpha.245

### Patch Changes

- Updated dependencies [[`e2fa886`](https://github.com/rizom-ai/brains/commit/e2fa886134594d834582c5b55704e893fcb0988a)]:
  - @brains/contracts@0.2.0-alpha.245
  - @brains/mcp-service@0.2.0-alpha.245
  - @brains/db@0.2.0-alpha.245
  - @brains/utils@0.2.0-alpha.245

## 0.2.0-alpha.244

### Patch Changes

- Updated dependencies []:
  - @brains/mcp-service@0.2.0-alpha.244
  - @brains/contracts@0.2.0-alpha.244
  - @brains/db@0.2.0-alpha.244
  - @brains/utils@0.2.0-alpha.244

## 0.2.0-alpha.243

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.243
  - @brains/db@0.2.0-alpha.243
  - @brains/utils@0.2.0-alpha.243
  - @brains/mcp-service@0.2.0-alpha.243

## 0.2.0-alpha.242

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.242
  - @brains/db@0.2.0-alpha.242
  - @brains/utils@0.2.0-alpha.242
  - @brains/mcp-service@0.2.0-alpha.242

## 0.2.0-alpha.241

### Patch Changes

- Updated dependencies [[`7f5c45f`](https://github.com/rizom-ai/brains/commit/7f5c45f4cac4556fdd2abcb939b48f1a76adbe62)]:
  - @brains/contracts@0.2.0-alpha.241
  - @brains/mcp-service@0.2.0-alpha.241
  - @brains/db@0.2.0-alpha.241
  - @brains/utils@0.2.0-alpha.241

## 0.2.0-alpha.240

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.240
  - @brains/utils@0.2.0-alpha.240
  - @brains/mcp-service@0.2.0-alpha.240

## 0.2.0-alpha.239

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.239
  - @brains/utils@0.2.0-alpha.239
  - @brains/mcp-service@0.2.0-alpha.239

## 0.2.0-alpha.238

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.238
  - @brains/utils@0.2.0-alpha.238
  - @brains/mcp-service@0.2.0-alpha.238

## 0.2.0-alpha.237

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.237
  - @brains/utils@0.2.0-alpha.237
  - @brains/mcp-service@0.2.0-alpha.237

## 0.2.0-alpha.236

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.236
  - @brains/utils@0.2.0-alpha.236
  - @brains/mcp-service@0.2.0-alpha.236

## 0.2.0-alpha.235

### Patch Changes

- Updated dependencies [[`31e732a`](https://github.com/rizom-ai/brains/commit/31e732a79a394a4e385ce7b25015c3daa8bf0afd)]:
  - @brains/contracts@0.2.0-alpha.235
  - @brains/mcp-service@0.2.0-alpha.235
  - @brains/utils@0.2.0-alpha.235

## 0.2.0-alpha.234

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.234
  - @brains/utils@0.2.0-alpha.234
  - @brains/mcp-service@0.2.0-alpha.234

## 0.2.0-alpha.233

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.233
  - @brains/utils@0.2.0-alpha.233
  - @brains/mcp-service@0.2.0-alpha.233

## 0.2.0-alpha.232

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.232
  - @brains/utils@0.2.0-alpha.232
  - @brains/mcp-service@0.2.0-alpha.232

## 0.2.0-alpha.231

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.231
  - @brains/utils@0.2.0-alpha.231
  - @brains/mcp-service@0.2.0-alpha.231

## 0.2.0-alpha.230

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.230
  - @brains/utils@0.2.0-alpha.230
  - @brains/mcp-service@0.2.0-alpha.230

## 0.2.0-alpha.229

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.229
  - @brains/utils@0.2.0-alpha.229
  - @brains/mcp-service@0.2.0-alpha.229

## 0.2.0-alpha.228

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.228
  - @brains/utils@0.2.0-alpha.228
  - @brains/mcp-service@0.2.0-alpha.228

## 0.2.0-alpha.227

### Patch Changes

- [`500a6dc`](https://github.com/rizom-ai/brains/commit/500a6dc284a590e1e9bb6af9fa0995332eeb8c58) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Replace ambiguous flattened actor identifiers with a discriminated `ActorRef` model for authenticated users, opaque external identities, agents, and services. Require `ActorRef` through tool execution, MCP routing, AI call options, create interceptors, tool events, and job provenance; remove flattened `userId` and `canonicalId` tool-context fields rather than deprecating them. Jobs retain every requester as `requestedByActor` and project `requestedByUserId` only through the centralized authenticated-user policy. New messages and durable memory use the new model, while legacy persisted actor metadata is normalized at read boundaries.

- Updated dependencies [[`500a6dc`](https://github.com/rizom-ai/brains/commit/500a6dc284a590e1e9bb6af9fa0995332eeb8c58), [`f7b3500`](https://github.com/rizom-ai/brains/commit/f7b350042c5bbcd6c5a43016d25e95e35ea3bfed), [`fa8e4eb`](https://github.com/rizom-ai/brains/commit/fa8e4eb3a237aaec54eeeb815f68e792d3a1715b), [`5c1bed1`](https://github.com/rizom-ai/brains/commit/5c1bed1134f92701f4ead9b25a6f432cd208ac29)]:
  - @brains/contracts@0.2.0-alpha.227
  - @brains/mcp-service@0.2.0-alpha.227
  - @brains/utils@0.2.0-alpha.227

## 0.2.0-alpha.226

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.226
  - @brains/utils@0.2.0-alpha.226
  - @brains/mcp-service@0.2.0-alpha.226

## 0.2.0-alpha.225

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.225
  - @brains/utils@0.2.0-alpha.225
  - @brains/mcp-service@0.2.0-alpha.225

## 0.2.0-alpha.224

### Patch Changes

- Updated dependencies [[`b7c5df6`](https://github.com/rizom-ai/brains/commit/b7c5df61ebe0aa44f6b786695f16daa7ee151e61)]:
  - @brains/utils@0.2.0-alpha.224
  - @brains/contracts@0.2.0-alpha.224
  - @brains/mcp-service@0.2.0-alpha.224

## 0.2.0-alpha.223

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.223
  - @brains/utils@0.2.0-alpha.223
  - @brains/mcp-service@0.2.0-alpha.223

## 0.2.0-alpha.222

### Patch Changes

- Updated dependencies [[`4943d79`](https://github.com/rizom-ai/brains/commit/4943d79ecf4abefd4cf79a38a526e203ea32064a)]:
  - @brains/contracts@0.2.0-alpha.222
  - @brains/mcp-service@0.2.0-alpha.222
  - @brains/utils@0.2.0-alpha.222

## 0.2.0-alpha.221

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.221
  - @brains/utils@0.2.0-alpha.221
  - @brains/mcp-service@0.2.0-alpha.221

## 0.2.0-alpha.220

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.220
  - @brains/utils@0.2.0-alpha.220
  - @brains/mcp-service@0.2.0-alpha.220

## 0.2.0-alpha.219

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.219
  - @brains/utils@0.2.0-alpha.219
  - @brains/mcp-service@0.2.0-alpha.219

## 0.2.0-alpha.218

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.218
  - @brains/utils@0.2.0-alpha.218
  - @brains/mcp-service@0.2.0-alpha.218

## 0.2.0-alpha.217

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.217
  - @brains/utils@0.2.0-alpha.217
  - @brains/mcp-service@0.2.0-alpha.217

## 0.2.0-alpha.216

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.216
  - @brains/utils@0.2.0-alpha.216
  - @brains/mcp-service@0.2.0-alpha.216

## 0.2.0-alpha.215

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.215
  - @brains/utils@0.2.0-alpha.215
  - @brains/mcp-service@0.2.0-alpha.215

## 0.2.0-alpha.214

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.214
  - @brains/utils@0.2.0-alpha.214
  - @brains/mcp-service@0.2.0-alpha.214

## 0.2.0-alpha.213

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.213
  - @brains/utils@0.2.0-alpha.213
  - @brains/mcp-service@0.2.0-alpha.213

## 0.2.0-alpha.212

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.212
  - @brains/utils@0.2.0-alpha.212
  - @brains/mcp-service@0.2.0-alpha.212

## 0.2.0-alpha.211

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.211
  - @brains/utils@0.2.0-alpha.211
  - @brains/mcp-service@0.2.0-alpha.211

## 0.2.0-alpha.210

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.210
  - @brains/utils@0.2.0-alpha.210
  - @brains/mcp-service@0.2.0-alpha.210

## 0.2.0-alpha.209

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.209
  - @brains/utils@0.2.0-alpha.209
  - @brains/mcp-service@0.2.0-alpha.209

## 0.2.0-alpha.208

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.208
  - @brains/utils@0.2.0-alpha.208
  - @brains/mcp-service@0.2.0-alpha.208

## 0.2.0-alpha.207

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.207
  - @brains/utils@0.2.0-alpha.207
  - @brains/mcp-service@0.2.0-alpha.207

## 0.2.0-alpha.206

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.206
  - @brains/utils@0.2.0-alpha.206
  - @brains/mcp-service@0.2.0-alpha.206

## 0.2.0-alpha.205

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.205
  - @brains/utils@0.2.0-alpha.205
  - @brains/mcp-service@0.2.0-alpha.205

## 0.2.0-alpha.204

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.204
  - @brains/utils@0.2.0-alpha.204
  - @brains/mcp-service@0.2.0-alpha.204

## 0.2.0-alpha.203

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.203
  - @brains/utils@0.2.0-alpha.203
  - @brains/mcp-service@0.2.0-alpha.203

## 0.2.0-alpha.202

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.202
  - @brains/utils@0.2.0-alpha.202
  - @brains/mcp-service@0.2.0-alpha.202

## 0.2.0-alpha.201

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.201
  - @brains/utils@0.2.0-alpha.201
  - @brains/mcp-service@0.2.0-alpha.201

## 0.2.0-alpha.200

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.200
  - @brains/utils@0.2.0-alpha.200
  - @brains/mcp-service@0.2.0-alpha.200

## 0.2.0-alpha.199

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.199
  - @brains/utils@0.2.0-alpha.199
  - @brains/mcp-service@0.2.0-alpha.199

## 0.2.0-alpha.198

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.198
  - @brains/utils@0.2.0-alpha.198
  - @brains/mcp-service@0.2.0-alpha.198

## 0.2.0-alpha.197

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.197
  - @brains/utils@0.2.0-alpha.197
  - @brains/mcp-service@0.2.0-alpha.197

## 0.2.0-alpha.196

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.196
  - @brains/utils@0.2.0-alpha.196
  - @brains/mcp-service@0.2.0-alpha.196

## 0.2.0-alpha.195

### Patch Changes

- [`1ece871`](https://github.com/rizom-ai/brains/commit/1ece871c78c950ff91033cb62e34fe89987cfd2c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Make shell, daemon, worker, plugin, recurring-check, Discord-handler, site-rebuild, and conversation teardown transitions joinable and terminal; stop active agent work before plugin teardown; and prevent queued work from entering after shutdown.

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.195
  - @brains/utils@0.2.0-alpha.195
  - @brains/mcp-service@0.2.0-alpha.195

## 0.2.0-alpha.194

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.194
  - @brains/utils@0.2.0-alpha.194
  - @brains/mcp-service@0.2.0-alpha.194

## 0.2.0-alpha.193

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.193
  - @brains/utils@0.2.0-alpha.193
  - @brains/mcp-service@0.2.0-alpha.193

## 0.2.0-alpha.192

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.192
  - @brains/utils@0.2.0-alpha.192
  - @brains/mcp-service@0.2.0-alpha.192

## 0.2.0-alpha.191

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.191
  - @brains/utils@0.2.0-alpha.191
  - @brains/mcp-service@0.2.0-alpha.191

## 0.2.0-alpha.190

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.190
  - @brains/utils@0.2.0-alpha.190
  - @brains/mcp-service@0.2.0-alpha.190

## 0.2.0-alpha.189

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.189
  - @brains/utils@0.2.0-alpha.189
  - @brains/mcp-service@0.2.0-alpha.189

## 0.2.0-alpha.188

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.188
  - @brains/utils@0.2.0-alpha.188
  - @brains/mcp-service@0.2.0-alpha.188

## 0.2.0-alpha.187

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.187
  - @brains/utils@0.2.0-alpha.187
  - @brains/mcp-service@0.2.0-alpha.187

## 0.2.0-alpha.186

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.186
  - @brains/utils@0.2.0-alpha.186
  - @brains/mcp-service@0.2.0-alpha.186

## 0.2.0-alpha.185

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.185
  - @brains/utils@0.2.0-alpha.185
  - @brains/mcp-service@0.2.0-alpha.185

## 0.2.0-alpha.184

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.184
  - @brains/utils@0.2.0-alpha.184
  - @brains/mcp-service@0.2.0-alpha.184

## 0.2.0-alpha.183

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.183
  - @brains/utils@0.2.0-alpha.183
  - @brains/mcp-service@0.2.0-alpha.183

## 0.2.0-alpha.182

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.182
  - @brains/utils@0.2.0-alpha.182
  - @brains/mcp-service@0.2.0-alpha.182

## 0.2.0-alpha.181

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.181
  - @brains/utils@0.2.0-alpha.181
  - @brains/mcp-service@0.2.0-alpha.181

## 0.2.0-alpha.180

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.180
  - @brains/utils@0.2.0-alpha.180
  - @brains/mcp-service@0.2.0-alpha.180

## 0.2.0-alpha.179

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.179
  - @brains/utils@0.2.0-alpha.179
  - @brains/mcp-service@0.2.0-alpha.179

## 0.2.0-alpha.178

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.178
  - @brains/effect-runtime@0.2.0-alpha.178
  - @brains/utils@0.2.0-alpha.178
  - @brains/mcp-service@0.2.0-alpha.178

## 0.2.0-alpha.177

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.177
  - @brains/effect-runtime@0.2.0-alpha.177
  - @brains/utils@0.2.0-alpha.177
  - @brains/mcp-service@0.2.0-alpha.177

## 0.2.0-alpha.176

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.176
  - @brains/effect-runtime@0.2.0-alpha.176
  - @brains/utils@0.2.0-alpha.176
  - @brains/mcp-service@0.2.0-alpha.176

## 0.2.0-alpha.175

### Patch Changes

- [#57](https://github.com/rizom-ai/brains/pull/57) [`b148151`](https://github.com/rizom-ai/brains/commit/b148151a76a1e7cab2030f0a9916375de40b74d1) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Move the internal job-service tags and scoped Layers into an `@brains/job-queue/effect` surface so shell packages can compose queue and runtime ownership across package boundaries without exposing Effect through public runtime APIs.

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.175
  - @brains/effect-runtime@0.2.0-alpha.175
  - @brains/utils@0.2.0-alpha.175
  - @brains/mcp-service@0.2.0-alpha.175

## 0.2.0-alpha.174

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.174
  - @brains/effect-runtime@0.2.0-alpha.174
  - @brains/utils@0.2.0-alpha.174
  - @brains/mcp-service@0.2.0-alpha.174

## 0.2.0-alpha.173

### Patch Changes

- [#56](https://github.com/rizom-ai/brains/pull/56) [`8427031`](https://github.com/rizom-ai/brains/commit/84270311c343964449d96c4cd60e4066daac4aef) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Harden shell lifecycle ownership with a centralized Effect boundary, scoped job-service layers, supervised fibers, deterministic schedules, transactional startup rollback, terminal plugin teardown, graceful job draining, daemon rollback, and end-to-end `AbortSignal` cancellation for AI requests and agent turns. Build public package subpaths with shared chunks to avoid duplicating their runtime code.

- Updated dependencies [[`8427031`](https://github.com/rizom-ai/brains/commit/84270311c343964449d96c4cd60e4066daac4aef)]:
  - @brains/effect-runtime@0.2.0-alpha.173
  - @brains/mcp-service@0.2.0-alpha.173
  - @brains/contracts@0.2.0-alpha.173
  - @brains/utils@0.2.0-alpha.173

## 0.2.0-alpha.172

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.172
  - @brains/utils@0.2.0-alpha.172
  - @brains/mcp-service@0.2.0-alpha.172

## 0.2.0-alpha.171

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.171
  - @brains/utils@0.2.0-alpha.171
  - @brains/mcp-service@0.2.0-alpha.171

## 0.2.0-alpha.170

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.170
  - @brains/utils@0.2.0-alpha.170
  - @brains/mcp-service@0.2.0-alpha.170

## 0.2.0-alpha.169

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.169
  - @brains/utils@0.2.0-alpha.169
  - @brains/mcp-service@0.2.0-alpha.169

## 0.2.0-alpha.168

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.168
  - @brains/utils@0.2.0-alpha.168
  - @brains/mcp-service@0.2.0-alpha.168

## 0.2.0-alpha.167

### Patch Changes

- Updated dependencies []:
  - @brains/mcp-service@0.2.0-alpha.167
  - @brains/contracts@0.2.0-alpha.167
  - @brains/utils@0.2.0-alpha.167

## 0.2.0-alpha.166

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.166
  - @brains/utils@0.2.0-alpha.166
  - @brains/mcp-service@0.2.0-alpha.166

## 0.2.0-alpha.165

### Patch Changes

- Updated dependencies []:
  - @brains/mcp-service@0.2.0-alpha.165
  - @brains/contracts@0.2.0-alpha.165
  - @brains/utils@0.2.0-alpha.165

## 0.2.0-alpha.164

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.164
  - @brains/utils@0.2.0-alpha.164
  - @brains/mcp-service@0.2.0-alpha.164

## 0.2.0-alpha.163

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.163
  - @brains/utils@0.2.0-alpha.163
  - @brains/mcp-service@0.2.0-alpha.163

## 0.2.0-alpha.162

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.162
  - @brains/utils@0.2.0-alpha.162
  - @brains/mcp-service@0.2.0-alpha.162

## 0.2.0-alpha.161

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.161
  - @brains/utils@0.2.0-alpha.161
  - @brains/mcp-service@0.2.0-alpha.161

## 0.2.0-alpha.160

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.160
  - @brains/utils@0.2.0-alpha.160
  - @brains/mcp-service@0.2.0-alpha.160

## 0.2.0-alpha.159

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.159
  - @brains/utils@0.2.0-alpha.159
  - @brains/mcp-service@0.2.0-alpha.159

## 0.2.0-alpha.158

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.158
  - @brains/utils@0.2.0-alpha.158
  - @brains/mcp-service@0.2.0-alpha.158

## 0.2.0-alpha.157

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.157
  - @brains/utils@0.2.0-alpha.157
  - @brains/mcp-service@0.2.0-alpha.157

## 0.2.0-alpha.156

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.156
  - @brains/utils@0.2.0-alpha.156
  - @brains/mcp-service@0.2.0-alpha.156

## 0.2.0-alpha.155

### Patch Changes

- Updated dependencies [[`643847f`](https://github.com/rizom-ai/brains/commit/643847fb9ae8298fdc501da9381129c528064c03)]:
  - @brains/mcp-service@0.2.0-alpha.155
  - @brains/contracts@0.2.0-alpha.155
  - @brains/utils@0.2.0-alpha.155

## 0.2.0-alpha.154

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.154
  - @brains/utils@0.2.0-alpha.154
  - @brains/mcp-service@0.2.0-alpha.154

## 0.2.0-alpha.153

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.153
  - @brains/utils@0.2.0-alpha.153
  - @brains/mcp-service@0.2.0-alpha.153

## 0.2.0-alpha.152

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.152
  - @brains/utils@0.2.0-alpha.152
  - @brains/mcp-service@0.2.0-alpha.152

## 0.2.0-alpha.151

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.151
  - @brains/utils@0.2.0-alpha.151
  - @brains/mcp-service@0.2.0-alpha.151

## 0.2.0-alpha.150

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.150
  - @brains/utils@0.2.0-alpha.150
  - @brains/mcp-service@0.2.0-alpha.150

## 0.2.0-alpha.149

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.149
  - @brains/utils@0.2.0-alpha.149
  - @brains/mcp-service@0.2.0-alpha.149

## 0.2.0-alpha.148

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.148
  - @brains/utils@0.2.0-alpha.148
  - @brains/mcp-service@0.2.0-alpha.148

## 0.2.0-alpha.147

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.147
  - @brains/utils@0.2.0-alpha.147
  - @brains/mcp-service@0.2.0-alpha.147

## 0.2.0-alpha.146

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.146
  - @brains/utils@0.2.0-alpha.146
  - @brains/mcp-service@0.2.0-alpha.146

## 0.2.0-alpha.145

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.145
  - @brains/utils@0.2.0-alpha.145
  - @brains/mcp-service@0.2.0-alpha.145

## 0.2.0-alpha.144

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.144
  - @brains/utils@0.2.0-alpha.144
  - @brains/mcp-service@0.2.0-alpha.144

## 0.2.0-alpha.143

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.143
  - @brains/utils@0.2.0-alpha.143
  - @brains/mcp-service@0.2.0-alpha.143

## 0.2.0-alpha.142

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.142
  - @brains/utils@0.2.0-alpha.142
  - @brains/mcp-service@0.2.0-alpha.142

## 0.2.0-alpha.141

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.141
  - @brains/utils@0.2.0-alpha.141
  - @brains/mcp-service@0.2.0-alpha.141

## 0.2.0-alpha.140

### Patch Changes

- [`070541b`](https://github.com/rizom-ai/brains/commit/070541b535e3977c8fe2d590ae7ad114cee09417) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Codebase review fixes: validate A2A agent card endpoints before posting (SSRF guard); fail entity/embedding DB migration loudly at boot; report entity-not-found on update instead of phantom success; replace fake batch roots with explicit silent jobs; make broadcast dispatch concurrent; atomic JSON stores in auth-service with corrupt-file quarantine; honest buttondown duplicate detection and auto-send failure reporting; honest stock-photo cover status; MCP session idle eviction, dead handler removal, constant-time token compare; Discord typing indicator leak fix; note upload/generation id collision fixes; preserve zod error detail in structured content formatter; fold cms-config into cms plugin; remove dead packages (product-site-content, rizom-ui) and dead exports.

- Updated dependencies [[`070541b`](https://github.com/rizom-ai/brains/commit/070541b535e3977c8fe2d590ae7ad114cee09417), [`a30edc7`](https://github.com/rizom-ai/brains/commit/a30edc7ac66807c66cba2bc94e78206f133710d6), [`cea906c`](https://github.com/rizom-ai/brains/commit/cea906c689d40dee5f06ab949d5289c2660bfd37)]:
  - @brains/mcp-service@0.2.0-alpha.140
  - @brains/utils@0.2.0-alpha.140
  - @brains/contracts@0.2.0-alpha.140

## 0.2.0-alpha.139

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.139
  - @brains/utils@0.2.0-alpha.139
  - @brains/mcp-service@0.2.0-alpha.139

## 0.2.0-alpha.138

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.138
  - @brains/utils@0.2.0-alpha.138
  - @brains/mcp-service@0.2.0-alpha.138

## 0.2.0-alpha.137

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.137
  - @brains/utils@0.2.0-alpha.137
  - @brains/mcp-service@0.2.0-alpha.137

## 0.2.0-alpha.136

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.136
  - @brains/utils@0.2.0-alpha.136
  - @brains/mcp-service@0.2.0-alpha.136

## 0.2.0-alpha.135

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.135
  - @brains/utils@0.2.0-alpha.135
  - @brains/mcp-service@0.2.0-alpha.135

## 0.2.0-alpha.134

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.134
  - @brains/utils@0.2.0-alpha.134
  - @brains/mcp-service@0.2.0-alpha.134

## 0.2.0-alpha.133

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.133
  - @brains/utils@0.2.0-alpha.133
  - @brains/mcp-service@0.2.0-alpha.133

## 0.2.0-alpha.132

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.132
  - @brains/utils@0.2.0-alpha.132
  - @brains/mcp-service@0.2.0-alpha.132

## 0.2.0-alpha.131

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.131
  - @brains/utils@0.2.0-alpha.131
  - @brains/mcp-service@0.2.0-alpha.131

## 0.2.0-alpha.130

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.130
  - @brains/utils@0.2.0-alpha.130
  - @brains/mcp-service@0.2.0-alpha.130

## 0.2.0-alpha.129

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.129
  - @brains/utils@0.2.0-alpha.129
  - @brains/mcp-service@0.2.0-alpha.129

## 0.2.0-alpha.128

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.128
  - @brains/utils@0.2.0-alpha.128
  - @brains/mcp-service@0.2.0-alpha.128

## 0.2.0-alpha.127

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.127
  - @brains/utils@0.2.0-alpha.127
  - @brains/mcp-service@0.2.0-alpha.127

## 0.2.0-alpha.126

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.126
  - @brains/utils@0.2.0-alpha.126
  - @brains/mcp-service@0.2.0-alpha.126

## 0.2.0-alpha.125

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.125
  - @brains/utils@0.2.0-alpha.125
  - @brains/mcp-service@0.2.0-alpha.125

## 0.2.0-alpha.124

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.124
  - @brains/utils@0.2.0-alpha.124
  - @brains/mcp-service@0.2.0-alpha.124

## 0.2.0-alpha.123

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.123
  - @brains/utils@0.2.0-alpha.123
  - @brains/mcp-service@0.2.0-alpha.123

## 0.2.0-alpha.122

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.122
  - @brains/utils@0.2.0-alpha.122
  - @brains/mcp-service@0.2.0-alpha.122

## 0.2.0-alpha.121

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.121
  - @brains/utils@0.2.0-alpha.121
  - @brains/mcp-service@0.2.0-alpha.121

## 0.2.0-alpha.120

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.120
  - @brains/utils@0.2.0-alpha.120
  - @brains/mcp-service@0.2.0-alpha.120

## 0.2.0-alpha.119

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.119
  - @brains/utils@0.2.0-alpha.119
  - @brains/mcp-service@0.2.0-alpha.119

## 0.2.0-alpha.118

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.118
  - @brains/utils@0.2.0-alpha.118
  - @brains/mcp-service@0.2.0-alpha.118

## 0.2.0-alpha.117

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.117
  - @brains/utils@0.2.0-alpha.117
  - @brains/mcp-service@0.2.0-alpha.117

## 0.2.0-alpha.116

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.116
  - @brains/utils@0.2.0-alpha.116
  - @brains/mcp-service@0.2.0-alpha.116

## 0.2.0-alpha.115

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.115
  - @brains/utils@0.2.0-alpha.115
  - @brains/mcp-service@0.2.0-alpha.115

## 0.2.0-alpha.114

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.114
  - @brains/utils@0.2.0-alpha.114
  - @brains/mcp-service@0.2.0-alpha.114

## 0.2.0-alpha.113

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.113
  - @brains/utils@0.2.0-alpha.113
  - @brains/mcp-service@0.2.0-alpha.113

## 0.2.0-alpha.112

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.112
  - @brains/utils@0.2.0-alpha.112
  - @brains/mcp-service@0.2.0-alpha.112

## 0.2.0-alpha.111

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.111
  - @brains/utils@0.2.0-alpha.111
  - @brains/mcp-service@0.2.0-alpha.111

## 0.2.0-alpha.110

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.110
  - @brains/utils@0.2.0-alpha.110
  - @brains/mcp-service@0.2.0-alpha.110

## 0.2.0-alpha.109

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.109
  - @brains/utils@0.2.0-alpha.109
  - @brains/mcp-service@0.2.0-alpha.109

## 0.2.0-alpha.108

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.108
  - @brains/utils@0.2.0-alpha.108
  - @brains/mcp-service@0.2.0-alpha.108

## 0.2.0-alpha.107

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.107
  - @brains/utils@0.2.0-alpha.107
  - @brains/mcp-service@0.2.0-alpha.107

## 0.2.0-alpha.106

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.106
  - @brains/utils@0.2.0-alpha.106
  - @brains/mcp-service@0.2.0-alpha.106

## 0.2.0-alpha.105

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.105
  - @brains/utils@0.2.0-alpha.105
  - @brains/mcp-service@0.2.0-alpha.105

## 0.2.0-alpha.104

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.104
  - @brains/utils@0.2.0-alpha.104
  - @brains/mcp-service@0.2.0-alpha.104

## 0.2.0-alpha.103

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.103
  - @brains/utils@0.2.0-alpha.103
  - @brains/mcp-service@0.2.0-alpha.103

## 0.2.0-alpha.102

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.102
  - @brains/utils@0.2.0-alpha.102
  - @brains/mcp-service@0.2.0-alpha.102

## 0.2.0-alpha.101

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.101
  - @brains/utils@0.2.0-alpha.101
  - @brains/mcp-service@0.2.0-alpha.101

## 0.2.0-alpha.100

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.100
  - @brains/utils@0.2.0-alpha.100
  - @brains/mcp-service@0.2.0-alpha.100

## 0.2.0-alpha.99

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.99
  - @brains/utils@0.2.0-alpha.99
  - @brains/mcp-service@0.2.0-alpha.99

## 0.2.0-alpha.98

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.98
  - @brains/utils@0.2.0-alpha.98
  - @brains/mcp-service@0.2.0-alpha.98

## 0.2.0-alpha.97

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.97
  - @brains/utils@0.2.0-alpha.97
  - @brains/mcp-service@0.2.0-alpha.97

## 0.2.0-alpha.96

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.96
  - @brains/utils@0.2.0-alpha.96
  - @brains/mcp-service@0.2.0-alpha.96

## 0.2.0-alpha.95

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.95
  - @brains/utils@0.2.0-alpha.95
  - @brains/mcp-service@0.2.0-alpha.95

## 0.2.0-alpha.94

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.94
  - @brains/utils@0.2.0-alpha.94
  - @brains/mcp-service@0.2.0-alpha.94

## 0.2.0-alpha.93

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.93
  - @brains/utils@0.2.0-alpha.93
  - @brains/mcp-service@0.2.0-alpha.93

## 0.2.0-alpha.92

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.92
  - @brains/utils@0.2.0-alpha.92
  - @brains/mcp-service@0.2.0-alpha.92

## 0.2.0-alpha.91

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.91
  - @brains/utils@0.2.0-alpha.91
  - @brains/mcp-service@0.2.0-alpha.91

## 0.2.0-alpha.90

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.90
  - @brains/utils@0.2.0-alpha.90
  - @brains/mcp-service@0.2.0-alpha.90

## 0.2.0-alpha.89

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.89
  - @brains/utils@0.2.0-alpha.89
  - @brains/mcp-service@0.2.0-alpha.89

## 0.2.0-alpha.88

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.88
  - @brains/utils@0.2.0-alpha.88
  - @brains/mcp-service@0.2.0-alpha.88

## 0.2.0-alpha.87

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.87
  - @brains/utils@0.2.0-alpha.87
  - @brains/mcp-service@0.2.0-alpha.87

## 0.2.0-alpha.86

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.86
  - @brains/utils@0.2.0-alpha.86
  - @brains/mcp-service@0.2.0-alpha.86

## 0.2.0-alpha.85

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.85
  - @brains/utils@0.2.0-alpha.85
  - @brains/mcp-service@0.2.0-alpha.85

## 0.2.0-alpha.84

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.84
  - @brains/utils@0.2.0-alpha.84
  - @brains/mcp-service@0.2.0-alpha.84

## 0.2.0-alpha.83

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.83
  - @brains/utils@0.2.0-alpha.83
  - @brains/mcp-service@0.2.0-alpha.83

## 0.2.0-alpha.82

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.82
  - @brains/utils@0.2.0-alpha.82
  - @brains/mcp-service@0.2.0-alpha.82

## 0.2.0-alpha.81

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.81
  - @brains/utils@0.2.0-alpha.81
  - @brains/mcp-service@0.2.0-alpha.81

## 0.2.0-alpha.80

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.80
  - @brains/utils@0.2.0-alpha.80
  - @brains/mcp-service@0.2.0-alpha.80

## 0.2.0-alpha.79

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.79
  - @brains/utils@0.2.0-alpha.79
  - @brains/mcp-service@0.2.0-alpha.79

## 0.2.0-alpha.78

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.78
  - @brains/utils@0.2.0-alpha.78
  - @brains/mcp-service@0.2.0-alpha.78

## 0.2.0-alpha.77

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.77
  - @brains/utils@0.2.0-alpha.77
  - @brains/mcp-service@0.2.0-alpha.77

## 0.2.0-alpha.76

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.76
  - @brains/utils@0.2.0-alpha.76
  - @brains/mcp-service@0.2.0-alpha.76

## 0.2.0-alpha.75

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.75
  - @brains/utils@0.2.0-alpha.75
  - @brains/mcp-service@0.2.0-alpha.75

## 0.2.0-alpha.74

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.74
  - @brains/utils@0.2.0-alpha.74
  - @brains/mcp-service@0.2.0-alpha.74

## 0.2.0-alpha.73

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.73
  - @brains/utils@0.2.0-alpha.73
  - @brains/mcp-service@0.2.0-alpha.73

## 0.2.0-alpha.72

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.72
  - @brains/utils@0.2.0-alpha.72
  - @brains/mcp-service@0.2.0-alpha.72

## 0.2.0-alpha.71

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.71
  - @brains/utils@0.2.0-alpha.71
  - @brains/mcp-service@0.2.0-alpha.71

## 0.2.0-alpha.70

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.70
  - @brains/utils@0.2.0-alpha.70
  - @brains/mcp-service@0.2.0-alpha.70

## 0.2.0-alpha.69

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.69
  - @brains/utils@0.2.0-alpha.69
  - @brains/mcp-service@0.2.0-alpha.69

## 0.2.0-alpha.68

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.68
  - @brains/utils@0.2.0-alpha.68
  - @brains/mcp-service@0.2.0-alpha.68

## 0.2.0-alpha.67

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.67
  - @brains/utils@0.2.0-alpha.67
  - @brains/mcp-service@0.2.0-alpha.67

## 0.2.0-alpha.66

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.66
  - @brains/utils@0.2.0-alpha.66
  - @brains/mcp-service@0.2.0-alpha.66

## 0.2.0-alpha.65

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.65
  - @brains/mcp-service@0.2.0-alpha.65

## 0.2.0-alpha.64

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.64
  - @brains/mcp-service@0.2.0-alpha.64

## 0.2.0-alpha.63

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.63
  - @brains/mcp-service@0.2.0-alpha.63

## 0.2.0-alpha.62

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.62
  - @brains/mcp-service@0.2.0-alpha.62

## 0.2.0-alpha.61

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.61
  - @brains/mcp-service@0.2.0-alpha.61

## 0.2.0-alpha.60

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.60
  - @brains/mcp-service@0.2.0-alpha.60

## 0.2.0-alpha.59

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.59
  - @brains/mcp-service@0.2.0-alpha.59

## 0.2.0-alpha.58

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.58
  - @brains/mcp-service@0.2.0-alpha.58

## 0.2.0-alpha.57

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.57
  - @brains/mcp-service@0.2.0-alpha.57

## 0.2.0-alpha.56

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.56
  - @brains/mcp-service@0.2.0-alpha.56

## 0.2.0-alpha.55

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.55
  - @brains/mcp-service@0.2.0-alpha.55

## 0.2.0-alpha.54

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.54
  - @brains/mcp-service@0.2.0-alpha.54

## 0.2.0-alpha.53

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.53
  - @brains/mcp-service@0.2.0-alpha.53

## 0.2.0-alpha.52

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.52
  - @brains/mcp-service@0.2.0-alpha.52

## 0.2.0-alpha.51

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.51
  - @brains/mcp-service@0.2.0-alpha.51

## 0.2.0-alpha.50

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.50
  - @brains/mcp-service@0.2.0-alpha.50

## 0.2.0-alpha.49

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.49
  - @brains/mcp-service@0.2.0-alpha.49

## 0.2.0-alpha.48

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.48
  - @brains/mcp-service@0.2.0-alpha.48

## 0.2.0-alpha.47

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.47
  - @brains/mcp-service@0.2.0-alpha.47

## 0.2.0-alpha.46

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.46
  - @brains/mcp-service@0.2.0-alpha.46

## 0.2.0-alpha.45

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.45
  - @brains/mcp-service@0.2.0-alpha.45

## 0.2.0-alpha.44

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.44
  - @brains/mcp-service@0.2.0-alpha.44

## 0.2.0-alpha.43

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.43
  - @brains/mcp-service@0.2.0-alpha.43

## 0.2.0-alpha.42

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.42
  - @brains/mcp-service@0.2.0-alpha.42

## 0.2.0-alpha.41

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.41
  - @brains/mcp-service@0.2.0-alpha.41

## 0.2.0-alpha.40

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.40
  - @brains/mcp-service@0.2.0-alpha.40

## 0.2.0-alpha.39

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.39
  - @brains/mcp-service@0.2.0-alpha.39

## 0.2.0-alpha.38

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.38
  - @brains/mcp-service@0.2.0-alpha.38

## 0.2.0-alpha.37

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.37
  - @brains/mcp-service@0.2.0-alpha.37

## 0.2.0-alpha.36

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.36
  - @brains/mcp-service@0.2.0-alpha.36

## 0.2.0-alpha.35

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.35
  - @brains/mcp-service@0.2.0-alpha.35

## 0.2.0-alpha.34

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.34
  - @brains/mcp-service@0.2.0-alpha.34

## 0.2.0-alpha.33

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.33
  - @brains/mcp-service@0.2.0-alpha.33

## 0.2.0-alpha.32

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.32
  - @brains/mcp-service@0.2.0-alpha.32

## 0.2.0-alpha.31

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.31
  - @brains/mcp-service@0.2.0-alpha.31

## 0.2.0-alpha.30

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.30
  - @brains/mcp-service@0.2.0-alpha.30

## 0.2.0-alpha.29

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.29
  - @brains/mcp-service@0.2.0-alpha.29

## 0.2.0-alpha.28

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.28
  - @brains/mcp-service@0.2.0-alpha.28

## 0.2.0-alpha.27

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.27
  - @brains/mcp-service@0.2.0-alpha.27

## 0.2.0-alpha.26

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.26
  - @brains/mcp-service@0.2.0-alpha.26

## 0.2.0-alpha.25

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.25
  - @brains/mcp-service@0.2.0-alpha.25

## 0.2.0-alpha.24

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.24
  - @brains/mcp-service@0.2.0-alpha.24

## 0.2.0-alpha.23

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.23
  - @brains/mcp-service@0.2.0-alpha.23

## 0.2.0-alpha.22

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.22
  - @brains/mcp-service@0.2.0-alpha.22

## 0.2.0-alpha.21

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.21
  - @brains/mcp-service@0.2.0-alpha.21

## 0.2.0-alpha.20

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.20
  - @brains/mcp-service@0.2.0-alpha.20

## 0.2.0-alpha.19

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.19
  - @brains/mcp-service@0.2.0-alpha.19

## 0.2.0-alpha.18

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.18
  - @brains/mcp-service@0.2.0-alpha.18

## 0.2.0-alpha.17

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.17
  - @brains/mcp-service@0.2.0-alpha.17

## 0.2.0-alpha.16

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.16
  - @brains/mcp-service@0.2.0-alpha.16

## 0.2.0-alpha.15

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.15
  - @brains/mcp-service@0.2.0-alpha.15

## 0.2.0-alpha.14

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.14
  - @brains/mcp-service@0.2.0-alpha.14

## 0.2.0-alpha.13

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.13
  - @brains/mcp-service@0.2.0-alpha.13

## 0.2.0-alpha.12

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.12
  - @brains/mcp-service@0.2.0-alpha.12

## 0.2.0-alpha.11

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.11
  - @brains/mcp-service@0.2.0-alpha.11

## 0.2.0-alpha.10

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.10
  - @brains/mcp-service@0.2.0-alpha.10

## 0.2.0-alpha.9

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.9
  - @brains/mcp-service@0.2.0-alpha.9

## 0.2.0-alpha.8

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.8
  - @brains/mcp-service@0.2.0-alpha.8

## 0.2.0-alpha.7

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.7
  - @brains/mcp-service@0.2.0-alpha.7

## 0.2.0-alpha.6

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.6
  - @brains/mcp-service@0.2.0-alpha.6

## 0.2.0-alpha.5

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.5
  - @brains/mcp-service@0.2.0-alpha.5

## 0.2.0-alpha.4

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.4
  - @brains/mcp-service@0.2.0-alpha.4

## 0.2.0-alpha.3

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.3
  - @brains/mcp-service@0.2.0-alpha.3

## 0.2.0-alpha.2

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.2
  - @brains/mcp-service@0.2.0-alpha.2

## 0.2.0-alpha.1

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.1
  - @brains/mcp-service@0.2.0-alpha.1

## 1.0.1-alpha.17

### Patch Changes

- Updated dependencies []:
  - @brains/utils@1.0.1-alpha.17
  - @brains/mcp-service@1.0.1-alpha.17

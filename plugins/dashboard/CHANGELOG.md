# @brains/dashboard

## 0.2.0-alpha.316

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.316
  - @brains/contracts@0.2.0-alpha.316
  - @brains/ui-library@0.2.0-alpha.316
  - @brains/utils@0.2.0-alpha.316
  - @brains/auth-service@0.2.0-alpha.316
  - @brains/plugins@0.2.0-alpha.316

## 0.2.0-alpha.315

### Patch Changes

- Updated dependencies [[`efa711c`](https://github.com/rizom-ai/brains/commit/efa711cfa7a63fc9fac9da586f9e7f749fe53b76)]:
  - @brains/plugins@0.2.0-alpha.315
  - @brains/auth-service@0.2.0-alpha.315
  - @brains/console-theme@0.2.0-alpha.315
  - @brains/contracts@0.2.0-alpha.315
  - @brains/ui-library@0.2.0-alpha.315
  - @brains/utils@0.2.0-alpha.315

## 0.2.0-alpha.314

### Patch Changes

- [`f37d7ed`](https://github.com/rizom-ai/brains/commit/f37d7ed2f39245b2263967fcb03f1885cefcad40) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Render the console strip from one implementation.

  The strip existed twice — an HTML string in `@brains/console-theme` for the
  server-rendered shells and a parallel Preact component in the dashboard — with
  a comment asking to "keep the two in step". They had already drifted: the
  string version hardcoded an "Authenticated / AU" session chip while the
  dashboard showed the principal's name, role, and initials, and a visitor state.

  `renderConsoleStripHtml` now owns the full behavior (principal chip, visitor
  chip, HTML-escaped interpolation) and the dashboard injects the shared inner
  markup instead of restating it. The CMS editor and the admin and account
  consoles pass the principal they already hold, so their chips now show the
  signed-in user instead of the generic copy; web-chat keeps the role-neutral
  chip until its interface threads the principal through.

- [`9bd1925`](https://github.com/rizom-ai/brains/commit/9bd192562923351e62909c7a0662eeeb46453303) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Move the console-surface topology out of the theme package.

  `@brains/console-theme` — described as a token sheet — hardcoded the console
  plugin ids, their permission tiers, and a structural copy of
  `RegisteredWebRoute`, so adding a console surface meant editing a CSS package.
  `deriveConsoleSurfaces` and its table now live in `@brains/plugins`, next to
  the web-route registry the doors derive from and typed against the real
  `RegisteredWebRoute`; the presentational `ConsoleSurface` shape moves to
  `@brains/contracts`, shared by the derivation and the strip renderer.
  console-theme keeps exactly what its description claims: CSS, fonts, boot
  scripts, and strip rendering. Per-plugin surface declaration at route
  registration remains the end state, governed by the HTTP route registry plan.

- Updated dependencies [[`35fe9fc`](https://github.com/rizom-ai/brains/commit/35fe9fc25b6ff3182d6f39f8725787d2f73777ea), [`f37d7ed`](https://github.com/rizom-ai/brains/commit/f37d7ed2f39245b2263967fcb03f1885cefcad40), [`9bd1925`](https://github.com/rizom-ai/brains/commit/9bd192562923351e62909c7a0662eeeb46453303), [`ae06107`](https://github.com/rizom-ai/brains/commit/ae06107694a825378e23183c26261c91166edfdf), [`d339319`](https://github.com/rizom-ai/brains/commit/d339319dabea7f856b69c829e46d3937254880d3), [`ae06107`](https://github.com/rizom-ai/brains/commit/ae06107694a825378e23183c26261c91166edfdf), [`9636536`](https://github.com/rizom-ai/brains/commit/9636536389923425cbf6ee21c3063e35eed9b5e6), [`ae06107`](https://github.com/rizom-ai/brains/commit/ae06107694a825378e23183c26261c91166edfdf), [`17507e8`](https://github.com/rizom-ai/brains/commit/17507e806efc5fde1c30496700de74b53575d350), [`fd2855e`](https://github.com/rizom-ai/brains/commit/fd2855ea09d880ebf4268ce6f9a53d4cb9289c07), [`b1263e7`](https://github.com/rizom-ai/brains/commit/b1263e72c9448cbff519732cf001a0cd1c2203ec), [`497fbc0`](https://github.com/rizom-ai/brains/commit/497fbc0f6d672e23afd5263a519c4e73a740c2c5)]:
  - @brains/auth-service@0.2.0-alpha.314
  - @brains/console-theme@0.2.0-alpha.314
  - @brains/contracts@0.2.0-alpha.314
  - @brains/plugins@0.2.0-alpha.314
  - @brains/ui-library@0.2.0-alpha.314
  - @brains/utils@0.2.0-alpha.314

## 0.2.0-alpha.313

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.313
  - @brains/contracts@0.2.0-alpha.313
  - @brains/ui-library@0.2.0-alpha.313
  - @brains/utils@0.2.0-alpha.313
  - @brains/auth-service@0.2.0-alpha.313
  - @brains/plugins@0.2.0-alpha.313

## 0.2.0-alpha.312

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.312
  - @brains/contracts@0.2.0-alpha.312
  - @brains/ui-library@0.2.0-alpha.312
  - @brains/utils@0.2.0-alpha.312
  - @brains/auth-service@0.2.0-alpha.312
  - @brains/plugins@0.2.0-alpha.312

## 0.2.0-alpha.311

### Patch Changes

- Updated dependencies [[`0b4d2bc`](https://github.com/rizom-ai/brains/commit/0b4d2bca39b83d60183c0040f63f4bb9c2f9d029)]:
  - @brains/utils@0.2.0-alpha.311
  - @brains/contracts@0.2.0-alpha.311
  - @brains/ui-library@0.2.0-alpha.311
  - @brains/auth-service@0.2.0-alpha.311
  - @brains/plugins@0.2.0-alpha.311
  - @brains/console-theme@0.2.0-alpha.311

## 0.2.0-alpha.310

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.310
  - @brains/contracts@0.2.0-alpha.310
  - @brains/ui-library@0.2.0-alpha.310
  - @brains/utils@0.2.0-alpha.310
  - @brains/auth-service@0.2.0-alpha.310
  - @brains/plugins@0.2.0-alpha.310

## 0.2.0-alpha.309

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.309
  - @brains/contracts@0.2.0-alpha.309
  - @brains/ui-library@0.2.0-alpha.309
  - @brains/utils@0.2.0-alpha.309
  - @brains/auth-service@0.2.0-alpha.309
  - @brains/plugins@0.2.0-alpha.309

## 0.2.0-alpha.308

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.308
  - @brains/contracts@0.2.0-alpha.308
  - @brains/ui-library@0.2.0-alpha.308
  - @brains/utils@0.2.0-alpha.308
  - @brains/auth-service@0.2.0-alpha.308
  - @brains/plugins@0.2.0-alpha.308

## 0.2.0-alpha.307

### Patch Changes

- Updated dependencies [[`947bd44`](https://github.com/rizom-ai/brains/commit/947bd44edf379b9dfa70732dfd0b98c2655dae38)]:
  - @brains/plugins@0.2.0-alpha.307
  - @brains/auth-service@0.2.0-alpha.307
  - @brains/console-theme@0.2.0-alpha.307
  - @brains/contracts@0.2.0-alpha.307
  - @brains/ui-library@0.2.0-alpha.307
  - @brains/utils@0.2.0-alpha.307

## 0.2.0-alpha.306

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.306
  - @brains/contracts@0.2.0-alpha.306
  - @brains/ui-library@0.2.0-alpha.306
  - @brains/utils@0.2.0-alpha.306
  - @brains/auth-service@0.2.0-alpha.306
  - @brains/plugins@0.2.0-alpha.306

## 0.2.0-alpha.305

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.305
  - @brains/auth-service@0.2.0-alpha.305
  - @brains/console-theme@0.2.0-alpha.305
  - @brains/contracts@0.2.0-alpha.305
  - @brains/ui-library@0.2.0-alpha.305
  - @brains/utils@0.2.0-alpha.305

## 0.2.0-alpha.304

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.304
  - @brains/contracts@0.2.0-alpha.304
  - @brains/ui-library@0.2.0-alpha.304
  - @brains/utils@0.2.0-alpha.304
  - @brains/auth-service@0.2.0-alpha.304
  - @brains/plugins@0.2.0-alpha.304

## 0.2.0-alpha.303

### Patch Changes

- Updated dependencies [[`5ff2420`](https://github.com/rizom-ai/brains/commit/5ff2420e2173df8b9add5bfc05a91033ddd1d976)]:
  - @brains/plugins@0.2.0-alpha.303
  - @brains/auth-service@0.2.0-alpha.303
  - @brains/console-theme@0.2.0-alpha.303
  - @brains/contracts@0.2.0-alpha.303
  - @brains/ui-library@0.2.0-alpha.303
  - @brains/utils@0.2.0-alpha.303

## 0.2.0-alpha.302

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.302
  - @brains/contracts@0.2.0-alpha.302
  - @brains/ui-library@0.2.0-alpha.302
  - @brains/utils@0.2.0-alpha.302
  - @brains/auth-service@0.2.0-alpha.302
  - @brains/plugins@0.2.0-alpha.302

## 0.2.0-alpha.301

### Patch Changes

- Updated dependencies [[`b2fd00c`](https://github.com/rizom-ai/brains/commit/b2fd00c1550e0b9a386484e07a53546106f793ce)]:
  - @brains/plugins@0.2.0-alpha.301
  - @brains/auth-service@0.2.0-alpha.301
  - @brains/console-theme@0.2.0-alpha.301
  - @brains/contracts@0.2.0-alpha.301
  - @brains/ui-library@0.2.0-alpha.301
  - @brains/utils@0.2.0-alpha.301

## 0.2.0-alpha.300

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.300
  - @brains/contracts@0.2.0-alpha.300
  - @brains/ui-library@0.2.0-alpha.300
  - @brains/utils@0.2.0-alpha.300
  - @brains/auth-service@0.2.0-alpha.300
  - @brains/plugins@0.2.0-alpha.300

## 0.2.0-alpha.299

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.299
  - @brains/contracts@0.2.0-alpha.299
  - @brains/ui-library@0.2.0-alpha.299
  - @brains/utils@0.2.0-alpha.299
  - @brains/auth-service@0.2.0-alpha.299
  - @brains/plugins@0.2.0-alpha.299

## 0.2.0-alpha.298

### Patch Changes

- Updated dependencies [[`9666d4a`](https://github.com/rizom-ai/brains/commit/9666d4af711d4a65ea2f071e757178f2639c6325)]:
  - @brains/plugins@0.2.0-alpha.298
  - @brains/auth-service@0.2.0-alpha.298
  - @brains/console-theme@0.2.0-alpha.298
  - @brains/contracts@0.2.0-alpha.298
  - @brains/ui-library@0.2.0-alpha.298
  - @brains/utils@0.2.0-alpha.298

## 0.2.0-alpha.297

### Patch Changes

- Updated dependencies [[`f6d93c7`](https://github.com/rizom-ai/brains/commit/f6d93c7aa49acccd691b049b090a7fdbbe7b6a1a)]:
  - @brains/contracts@0.2.0-alpha.297
  - @brains/plugins@0.2.0-alpha.297
  - @brains/auth-service@0.2.0-alpha.297
  - @brains/console-theme@0.2.0-alpha.297
  - @brains/ui-library@0.2.0-alpha.297
  - @brains/utils@0.2.0-alpha.297

## 0.2.0-alpha.296

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.296
  - @brains/contracts@0.2.0-alpha.296
  - @brains/ui-library@0.2.0-alpha.296
  - @brains/utils@0.2.0-alpha.296
  - @brains/auth-service@0.2.0-alpha.296
  - @brains/plugins@0.2.0-alpha.296

## 0.2.0-alpha.295

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.295
  - @brains/auth-service@0.2.0-alpha.295
  - @brains/console-theme@0.2.0-alpha.295
  - @brains/contracts@0.2.0-alpha.295
  - @brains/ui-library@0.2.0-alpha.295
  - @brains/utils@0.2.0-alpha.295

## 0.2.0-alpha.294

### Patch Changes

- Updated dependencies [[`995d491`](https://github.com/rizom-ai/brains/commit/995d4910a2d6b10e3524664dd557ce2100d48173)]:
  - @brains/plugins@0.2.0-alpha.294
  - @brains/auth-service@0.2.0-alpha.294
  - @brains/console-theme@0.2.0-alpha.294
  - @brains/contracts@0.2.0-alpha.294
  - @brains/ui-library@0.2.0-alpha.294
  - @brains/utils@0.2.0-alpha.294

## 0.2.0-alpha.293

### Patch Changes

- [`f25b201`](https://github.com/rizom-ai/brains/commit/f25b2017de7be3a7eb117166ca3458237055137b) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Run public declarative Dashboard widgets through a host-owned runtime and semantic renderer. Providers receive canonical caller facts, secret-redacted current-account settings, visibility-scoped entity reads, typed jobs, and request/lifecycle cancellation; the runtime validates data and views, owns finalization, rollback, and shutdown, remains inert without Dashboard, and excludes execution-only workers.

- Updated dependencies [[`f25b201`](https://github.com/rizom-ai/brains/commit/f25b2017de7be3a7eb117166ca3458237055137b)]:
  - @brains/plugins@0.2.0-alpha.293
  - @brains/auth-service@0.2.0-alpha.293
  - @brains/console-theme@0.2.0-alpha.293
  - @brains/contracts@0.2.0-alpha.293
  - @brains/ui-library@0.2.0-alpha.293
  - @brains/utils@0.2.0-alpha.293

## 0.2.0-alpha.292

### Patch Changes

- Updated dependencies [[`7fc21a2`](https://github.com/rizom-ai/brains/commit/7fc21a277c3e81779c65d9a95809c0d53682406f)]:
  - @brains/plugins@0.2.0-alpha.292
  - @brains/auth-service@0.2.0-alpha.292
  - @brains/console-theme@0.2.0-alpha.292
  - @brains/contracts@0.2.0-alpha.292
  - @brains/ui-library@0.2.0-alpha.292
  - @brains/utils@0.2.0-alpha.292

## 0.2.0-alpha.291

### Patch Changes

- Updated dependencies [[`3ed9cfe`](https://github.com/rizom-ai/brains/commit/3ed9cfe0636ee55dac9bf74506d743a6a84eb6f8)]:
  - @brains/plugins@0.2.0-alpha.291
  - @brains/auth-service@0.2.0-alpha.291
  - @brains/console-theme@0.2.0-alpha.291
  - @brains/contracts@0.2.0-alpha.291
  - @brains/ui-library@0.2.0-alpha.291
  - @brains/utils@0.2.0-alpha.291

## 0.2.0-alpha.290

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.290
  - @brains/auth-service@0.2.0-alpha.290
  - @brains/console-theme@0.2.0-alpha.290
  - @brains/contracts@0.2.0-alpha.290
  - @brains/ui-library@0.2.0-alpha.290
  - @brains/utils@0.2.0-alpha.290

## 0.2.0-alpha.289

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.289
  - @brains/contracts@0.2.0-alpha.289
  - @brains/ui-library@0.2.0-alpha.289
  - @brains/utils@0.2.0-alpha.289
  - @brains/auth-service@0.2.0-alpha.289
  - @brains/plugins@0.2.0-alpha.289

## 0.2.0-alpha.288

### Patch Changes

- Updated dependencies [[`b06bc78`](https://github.com/rizom-ai/brains/commit/b06bc78514aa163b3a86c5c6d62d4500aa7c7e3b)]:
  - @brains/plugins@0.2.0-alpha.288
  - @brains/auth-service@0.2.0-alpha.288
  - @brains/console-theme@0.2.0-alpha.288
  - @brains/contracts@0.2.0-alpha.288
  - @brains/ui-library@0.2.0-alpha.288
  - @brains/utils@0.2.0-alpha.288

## 0.2.0-alpha.287

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.287
  - @brains/contracts@0.2.0-alpha.287
  - @brains/ui-library@0.2.0-alpha.287
  - @brains/utils@0.2.0-alpha.287
  - @brains/auth-service@0.2.0-alpha.287
  - @brains/plugins@0.2.0-alpha.287

## 0.2.0-alpha.286

### Patch Changes

- Updated dependencies [[`b7cda6c`](https://github.com/rizom-ai/brains/commit/b7cda6cd64c1a7400b16bf4faacb36d0244c58f9)]:
  - @brains/plugins@0.2.0-alpha.286
  - @brains/auth-service@0.2.0-alpha.286
  - @brains/console-theme@0.2.0-alpha.286
  - @brains/contracts@0.2.0-alpha.286
  - @brains/ui-library@0.2.0-alpha.286
  - @brains/utils@0.2.0-alpha.286

## 0.2.0-alpha.285

### Patch Changes

- Updated dependencies [[`c41168e`](https://github.com/rizom-ai/brains/commit/c41168ea6058686541e3bd3abde1699d86687eb0)]:
  - @brains/plugins@0.2.0-alpha.285
  - @brains/auth-service@0.2.0-alpha.285
  - @brains/console-theme@0.2.0-alpha.285
  - @brains/contracts@0.2.0-alpha.285
  - @brains/ui-library@0.2.0-alpha.285
  - @brains/utils@0.2.0-alpha.285

## 0.2.0-alpha.284

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.284
  - @brains/contracts@0.2.0-alpha.284
  - @brains/ui-library@0.2.0-alpha.284
  - @brains/utils@0.2.0-alpha.284
  - @brains/auth-service@0.2.0-alpha.284
  - @brains/plugins@0.2.0-alpha.284

## 0.2.0-alpha.283

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.283
  - @brains/contracts@0.2.0-alpha.283
  - @brains/ui-library@0.2.0-alpha.283
  - @brains/utils@0.2.0-alpha.283
  - @brains/auth-service@0.2.0-alpha.283
  - @brains/plugins@0.2.0-alpha.283

## 0.2.0-alpha.282

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.282
  - @brains/contracts@0.2.0-alpha.282
  - @brains/ui-library@0.2.0-alpha.282
  - @brains/utils@0.2.0-alpha.282
  - @brains/auth-service@0.2.0-alpha.282
  - @brains/plugins@0.2.0-alpha.282

## 0.2.0-alpha.281

### Patch Changes

- Updated dependencies [[`c6b44ae`](https://github.com/rizom-ai/brains/commit/c6b44ae420bc0c4c92c2081bfbc320c00987db79)]:
  - @brains/plugins@0.2.0-alpha.281
  - @brains/auth-service@0.2.0-alpha.281
  - @brains/console-theme@0.2.0-alpha.281
  - @brains/contracts@0.2.0-alpha.281
  - @brains/ui-library@0.2.0-alpha.281
  - @brains/utils@0.2.0-alpha.281

## 0.2.0-alpha.280

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.280
  - @brains/auth-service@0.2.0-alpha.280
  - @brains/console-theme@0.2.0-alpha.280
  - @brains/contracts@0.2.0-alpha.280
  - @brains/ui-library@0.2.0-alpha.280
  - @brains/utils@0.2.0-alpha.280

## 0.2.0-alpha.279

### Minor Changes

- [#111](https://github.com/rizom-ai/brains/pull/111) [`bd1eb47`](https://github.com/rizom-ai/brains/commit/bd1eb4768ee154570f5ba144f59a145c7f00aa51) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Quality pass on the unified-inbox surfaces. Email triage serves its rail badge
  through the CMS `badgeProvider` and shares the admin list-tool envelope and
  workspace-admin guard from `@brains/plugins`. The dashboard package re-exports
  `formatDate` beside the other widget primitives. App resolution recognizes
  plugin configuration validation errors across separately bundled runtime
  entrypoints.

### Patch Changes

- Updated dependencies [[`bd1eb47`](https://github.com/rizom-ai/brains/commit/bd1eb4768ee154570f5ba144f59a145c7f00aa51), [`d0211d9`](https://github.com/rizom-ai/brains/commit/d0211d97253360ead7cfdeb957650e7ff8369afc)]:
  - @brains/contracts@0.2.0-alpha.279
  - @brains/plugins@0.2.0-alpha.279
  - @brains/auth-service@0.2.0-alpha.279
  - @brains/console-theme@0.2.0-alpha.279
  - @brains/ui-library@0.2.0-alpha.279
  - @brains/utils@0.2.0-alpha.279

## 0.2.0-alpha.278

### Patch Changes

- Updated dependencies [[`f2d2775`](https://github.com/rizom-ai/brains/commit/f2d2775d61177d5af16e3a839aed6d18de10a511)]:
  - @brains/plugins@0.2.0-alpha.278
  - @brains/auth-service@0.2.0-alpha.278
  - @brains/console-theme@0.2.0-alpha.278
  - @brains/contracts@0.2.0-alpha.278
  - @brains/ui-library@0.2.0-alpha.278
  - @brains/utils@0.2.0-alpha.278

## 0.2.0-alpha.277

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.277
  - @brains/contracts@0.2.0-alpha.277
  - @brains/ui-library@0.2.0-alpha.277
  - @brains/utils@0.2.0-alpha.277
  - @brains/auth-service@0.2.0-alpha.277
  - @brains/plugins@0.2.0-alpha.277

## 0.2.0-alpha.276

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.276
  - @brains/contracts@0.2.0-alpha.276
  - @brains/ui-library@0.2.0-alpha.276
  - @brains/utils@0.2.0-alpha.276
  - @brains/auth-service@0.2.0-alpha.276
  - @brains/plugins@0.2.0-alpha.276

## 0.2.0-alpha.275

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.275
  - @brains/contracts@0.2.0-alpha.275
  - @brains/ui-library@0.2.0-alpha.275
  - @brains/utils@0.2.0-alpha.275
  - @brains/auth-service@0.2.0-alpha.275
  - @brains/plugins@0.2.0-alpha.275

## 0.2.0-alpha.274

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.274
  - @brains/contracts@0.2.0-alpha.274
  - @brains/ui-library@0.2.0-alpha.274
  - @brains/utils@0.2.0-alpha.274
  - @brains/auth-service@0.2.0-alpha.274
  - @brains/plugins@0.2.0-alpha.274

## 0.2.0-alpha.273

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.273
  - @brains/contracts@0.2.0-alpha.273
  - @brains/ui-library@0.2.0-alpha.273
  - @brains/utils@0.2.0-alpha.273
  - @brains/auth-service@0.2.0-alpha.273
  - @brains/plugins@0.2.0-alpha.273

## 0.2.0-alpha.272

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.272
  - @brains/contracts@0.2.0-alpha.272
  - @brains/ui-library@0.2.0-alpha.272
  - @brains/utils@0.2.0-alpha.272
  - @brains/auth-service@0.2.0-alpha.272
  - @brains/plugins@0.2.0-alpha.272

## 0.2.0-alpha.271

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.271
  - @brains/contracts@0.2.0-alpha.271
  - @brains/ui-library@0.2.0-alpha.271
  - @brains/utils@0.2.0-alpha.271
  - @brains/auth-service@0.2.0-alpha.271
  - @brains/plugins@0.2.0-alpha.271

## 0.2.0-alpha.270

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.270
  - @brains/contracts@0.2.0-alpha.270
  - @brains/ui-library@0.2.0-alpha.270
  - @brains/utils@0.2.0-alpha.270
  - @brains/auth-service@0.2.0-alpha.270
  - @brains/plugins@0.2.0-alpha.270

## 0.2.0-alpha.269

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.269
  - @brains/contracts@0.2.0-alpha.269
  - @brains/ui-library@0.2.0-alpha.269
  - @brains/utils@0.2.0-alpha.269
  - @brains/auth-service@0.2.0-alpha.269
  - @brains/plugins@0.2.0-alpha.269

## 0.2.0-alpha.268

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.268
  - @brains/contracts@0.2.0-alpha.268
  - @brains/ui-library@0.2.0-alpha.268
  - @brains/utils@0.2.0-alpha.268
  - @brains/auth-service@0.2.0-alpha.268
  - @brains/plugins@0.2.0-alpha.268

## 0.2.0-alpha.267

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.267
  - @brains/auth-service@0.2.0-alpha.267
  - @brains/console-theme@0.2.0-alpha.267
  - @brains/contracts@0.2.0-alpha.267
  - @brains/ui-library@0.2.0-alpha.267
  - @brains/utils@0.2.0-alpha.267

## 0.2.0-alpha.266

### Patch Changes

- Updated dependencies [[`e70ab12`](https://github.com/rizom-ai/brains/commit/e70ab12745c6cf757f685389f4cd6de8991de95f)]:
  - @brains/utils@0.2.0-alpha.266
  - @brains/contracts@0.2.0-alpha.266
  - @brains/ui-library@0.2.0-alpha.266
  - @brains/auth-service@0.2.0-alpha.266
  - @brains/plugins@0.2.0-alpha.266
  - @brains/console-theme@0.2.0-alpha.266

## 0.2.0-alpha.265

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.265
  - @brains/contracts@0.2.0-alpha.265
  - @brains/ui-library@0.2.0-alpha.265
  - @brains/utils@0.2.0-alpha.265
  - @brains/auth-service@0.2.0-alpha.265
  - @brains/plugins@0.2.0-alpha.265

## 0.2.0-alpha.264

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.264
  - @brains/auth-service@0.2.0-alpha.264
  - @brains/console-theme@0.2.0-alpha.264
  - @brains/contracts@0.2.0-alpha.264
  - @brains/ui-library@0.2.0-alpha.264
  - @brains/utils@0.2.0-alpha.264

## 0.2.0-alpha.263

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.263
  - @brains/auth-service@0.2.0-alpha.263
  - @brains/console-theme@0.2.0-alpha.263
  - @brains/contracts@0.2.0-alpha.263
  - @brains/ui-library@0.2.0-alpha.263
  - @brains/utils@0.2.0-alpha.263

## 0.2.0-alpha.262

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.262
  - @brains/auth-service@0.2.0-alpha.262
  - @brains/console-theme@0.2.0-alpha.262
  - @brains/contracts@0.2.0-alpha.262
  - @brains/utils@0.2.0-alpha.262

## 0.2.0-alpha.261

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.261
  - @brains/auth-service@0.2.0-alpha.261
  - @brains/console-theme@0.2.0-alpha.261
  - @brains/contracts@0.2.0-alpha.261
  - @brains/utils@0.2.0-alpha.261

## 0.2.0-alpha.260

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.260
  - @brains/contracts@0.2.0-alpha.260
  - @brains/utils@0.2.0-alpha.260
  - @brains/auth-service@0.2.0-alpha.260
  - @brains/plugins@0.2.0-alpha.260

## 0.2.0-alpha.259

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.259
  - @brains/contracts@0.2.0-alpha.259
  - @brains/utils@0.2.0-alpha.259
  - @brains/auth-service@0.2.0-alpha.259
  - @brains/plugins@0.2.0-alpha.259

## 0.2.0-alpha.258

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.258
  - @brains/contracts@0.2.0-alpha.258
  - @brains/utils@0.2.0-alpha.258
  - @brains/auth-service@0.2.0-alpha.258
  - @brains/plugins@0.2.0-alpha.258

## 0.2.0-alpha.257

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.257
  - @brains/contracts@0.2.0-alpha.257
  - @brains/utils@0.2.0-alpha.257
  - @brains/auth-service@0.2.0-alpha.257
  - @brains/plugins@0.2.0-alpha.257

## 0.2.0-alpha.256

### Patch Changes

- Updated dependencies [[`b155d93`](https://github.com/rizom-ai/brains/commit/b155d938c240bcc9500c2395f11763ab49a017c9), [`1e45eca`](https://github.com/rizom-ai/brains/commit/1e45ecaaed5351964cbf8a0754a301507b15c298), [`b155d93`](https://github.com/rizom-ai/brains/commit/b155d938c240bcc9500c2395f11763ab49a017c9), [`b155d93`](https://github.com/rizom-ai/brains/commit/b155d938c240bcc9500c2395f11763ab49a017c9)]:
  - @brains/plugins@0.2.0-alpha.256
  - @brains/utils@0.2.0-alpha.256
  - @brains/auth-service@0.2.0-alpha.256
  - @brains/contracts@0.2.0-alpha.256
  - @brains/console-theme@0.2.0-alpha.256

## 0.2.0-alpha.255

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.255
  - @brains/contracts@0.2.0-alpha.255
  - @brains/utils@0.2.0-alpha.255
  - @brains/auth-service@0.2.0-alpha.255
  - @brains/plugins@0.2.0-alpha.255

## 0.2.0-alpha.254

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.254
  - @brains/auth-service@0.2.0-alpha.254
  - @brains/console-theme@0.2.0-alpha.254
  - @brains/contracts@0.2.0-alpha.254
  - @brains/utils@0.2.0-alpha.254

## 0.2.0-alpha.253

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.253
  - @brains/contracts@0.2.0-alpha.253
  - @brains/utils@0.2.0-alpha.253
  - @brains/auth-service@0.2.0-alpha.253
  - @brains/plugins@0.2.0-alpha.253

## 0.2.0-alpha.252

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.252
  - @brains/contracts@0.2.0-alpha.252
  - @brains/utils@0.2.0-alpha.252
  - @brains/auth-service@0.2.0-alpha.252
  - @brains/plugins@0.2.0-alpha.252

## 0.2.0-alpha.251

### Patch Changes

- Updated dependencies [[`ca41276`](https://github.com/rizom-ai/brains/commit/ca412762e73ca8391d8a77a6c08b20c63b30848e)]:
  - @brains/plugins@0.2.0-alpha.251
  - @brains/auth-service@0.2.0-alpha.251
  - @brains/console-theme@0.2.0-alpha.251
  - @brains/contracts@0.2.0-alpha.251
  - @brains/utils@0.2.0-alpha.251

## 0.2.0-alpha.250

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.250
  - @brains/contracts@0.2.0-alpha.250
  - @brains/utils@0.2.0-alpha.250
  - @brains/auth-service@0.2.0-alpha.250
  - @brains/plugins@0.2.0-alpha.250

## 0.2.0-alpha.249

### Patch Changes

- Updated dependencies [[`84dca8c`](https://github.com/rizom-ai/brains/commit/84dca8c9ddf83fcf01784f54da479e2229eba09c)]:
  - @brains/contracts@0.2.0-alpha.249
  - @brains/plugins@0.2.0-alpha.249
  - @brains/auth-service@0.2.0-alpha.249
  - @brains/console-theme@0.2.0-alpha.249
  - @brains/utils@0.2.0-alpha.249

## 0.2.0-alpha.248

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.248
  - @brains/contracts@0.2.0-alpha.248
  - @brains/utils@0.2.0-alpha.248
  - @brains/auth-service@0.2.0-alpha.248
  - @brains/plugins@0.2.0-alpha.248

## 0.2.0-alpha.247

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.247
  - @brains/contracts@0.2.0-alpha.247
  - @brains/utils@0.2.0-alpha.247
  - @brains/auth-service@0.2.0-alpha.247
  - @brains/plugins@0.2.0-alpha.247

## 0.2.0-alpha.246

### Patch Changes

- [`2b6197f`](https://github.com/rizom-ai/brains/commit/2b6197f1f596b5ce0a41892fd4a4282648f73ddb) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix the console paper climate against dark-default site themes by synchronizing climate changes with the matching semantic theme mode and applying the dashboard preference before styles load.

- Updated dependencies [[`2b6197f`](https://github.com/rizom-ai/brains/commit/2b6197f1f596b5ce0a41892fd4a4282648f73ddb)]:
  - @brains/console-theme@0.2.0-alpha.246
  - @brains/contracts@0.2.0-alpha.246
  - @brains/utils@0.2.0-alpha.246
  - @brains/auth-service@0.2.0-alpha.246
  - @brains/plugins@0.2.0-alpha.246

## 0.2.0-alpha.245

### Patch Changes

- Updated dependencies [[`e2fa886`](https://github.com/rizom-ai/brains/commit/e2fa886134594d834582c5b55704e893fcb0988a)]:
  - @brains/contracts@0.2.0-alpha.245
  - @brains/auth-service@0.2.0-alpha.245
  - @brains/plugins@0.2.0-alpha.245
  - @brains/console-theme@0.2.0-alpha.245
  - @brains/utils@0.2.0-alpha.245

## 0.2.0-alpha.244

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.244
  - @brains/auth-service@0.2.0-alpha.244
  - @brains/console-theme@0.2.0-alpha.244
  - @brains/contracts@0.2.0-alpha.244
  - @brains/utils@0.2.0-alpha.244

## 0.2.0-alpha.243

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.243
  - @brains/contracts@0.2.0-alpha.243
  - @brains/utils@0.2.0-alpha.243
  - @brains/auth-service@0.2.0-alpha.243
  - @brains/plugins@0.2.0-alpha.243

## 0.2.0-alpha.242

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.242
  - @brains/contracts@0.2.0-alpha.242
  - @brains/utils@0.2.0-alpha.242
  - @brains/auth-service@0.2.0-alpha.242
  - @brains/plugins@0.2.0-alpha.242

## 0.2.0-alpha.241

### Patch Changes

- Updated dependencies [[`7f5c45f`](https://github.com/rizom-ai/brains/commit/7f5c45f4cac4556fdd2abcb939b48f1a76adbe62), [`7f5c45f`](https://github.com/rizom-ai/brains/commit/7f5c45f4cac4556fdd2abcb939b48f1a76adbe62)]:
  - @brains/contracts@0.2.0-alpha.241
  - @brains/plugins@0.2.0-alpha.241
  - @brains/auth-service@0.2.0-alpha.241
  - @brains/console-theme@0.2.0-alpha.241
  - @brains/utils@0.2.0-alpha.241

## 0.2.0-alpha.240

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.240
  - @brains/utils@0.2.0-alpha.240
  - @brains/auth-service@0.2.0-alpha.240
  - @brains/plugins@0.2.0-alpha.240

## 0.2.0-alpha.239

### Patch Changes

- Updated dependencies [[`086d6c0`](https://github.com/rizom-ai/brains/commit/086d6c03bba79846858b942ceffb6c9057ba62eb)]:
  - @brains/auth-service@0.2.0-alpha.239
  - @brains/console-theme@0.2.0-alpha.239
  - @brains/utils@0.2.0-alpha.239
  - @brains/plugins@0.2.0-alpha.239

## 0.2.0-alpha.238

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.238
  - @brains/utils@0.2.0-alpha.238
  - @brains/auth-service@0.2.0-alpha.238
  - @brains/plugins@0.2.0-alpha.238

## 0.2.0-alpha.237

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.237
  - @brains/utils@0.2.0-alpha.237
  - @brains/auth-service@0.2.0-alpha.237
  - @brains/plugins@0.2.0-alpha.237

## 0.2.0-alpha.236

### Patch Changes

- Updated dependencies [[`a6ca836`](https://github.com/rizom-ai/brains/commit/a6ca836f4cd5abef038584de13944765d7b4843a), [`4d9a36b`](https://github.com/rizom-ai/brains/commit/4d9a36b618782071c8fe3c685907fbd4767c34da), [`8bd7c18`](https://github.com/rizom-ai/brains/commit/8bd7c18678822bafdb796f20c44db3220a7c1d0f), [`9655faf`](https://github.com/rizom-ai/brains/commit/9655faf210917e322ce2bdce0a95adaabd816a8d)]:
  - @brains/plugins@0.2.0-alpha.236
  - @brains/auth-service@0.2.0-alpha.236
  - @brains/console-theme@0.2.0-alpha.236
  - @brains/utils@0.2.0-alpha.236

## 0.2.0-alpha.235

### Patch Changes

- Updated dependencies []:
  - @brains/auth-service@0.2.0-alpha.235
  - @brains/plugins@0.2.0-alpha.235
  - @brains/console-theme@0.2.0-alpha.235
  - @brains/utils@0.2.0-alpha.235

## 0.2.0-alpha.234

### Patch Changes

- Updated dependencies [[`afa5cf4`](https://github.com/rizom-ai/brains/commit/afa5cf4cbdf75400b180d4bb89ed46dd4e6097cc)]:
  - @brains/auth-service@0.2.0-alpha.234
  - @brains/plugins@0.2.0-alpha.234
  - @brains/console-theme@0.2.0-alpha.234
  - @brains/utils@0.2.0-alpha.234

## 0.2.0-alpha.233

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.233
  - @brains/utils@0.2.0-alpha.233
  - @brains/auth-service@0.2.0-alpha.233
  - @brains/plugins@0.2.0-alpha.233

## 0.2.0-alpha.232

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.232
  - @brains/utils@0.2.0-alpha.232
  - @brains/auth-service@0.2.0-alpha.232
  - @brains/plugins@0.2.0-alpha.232

## 0.2.0-alpha.231

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.231
  - @brains/utils@0.2.0-alpha.231
  - @brains/auth-service@0.2.0-alpha.231
  - @brains/plugins@0.2.0-alpha.231

## 0.2.0-alpha.230

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.230
  - @brains/utils@0.2.0-alpha.230
  - @brains/auth-service@0.2.0-alpha.230
  - @brains/plugins@0.2.0-alpha.230

## 0.2.0-alpha.229

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.229
  - @brains/utils@0.2.0-alpha.229
  - @brains/auth-service@0.2.0-alpha.229
  - @brains/plugins@0.2.0-alpha.229

## 0.2.0-alpha.228

### Patch Changes

- Updated dependencies [[`db6650f`](https://github.com/rizom-ai/brains/commit/db6650f02557ff02d04111a240d0dd2903c0b87b)]:
  - @brains/auth-service@0.2.0-alpha.228
  - @brains/console-theme@0.2.0-alpha.228
  - @brains/utils@0.2.0-alpha.228
  - @brains/plugins@0.2.0-alpha.228

## 0.2.0-alpha.227

### Patch Changes

- [`f7b3500`](https://github.com/rizom-ai/brains/commit/f7b350042c5bbcd6c5a43016d25e95e35ea3bfed) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Separate Admin authorization from Anchor ownership. Permission roles now use only `admin`, `trusted`, and `public`; a generated auth migration converts historical role rows and persists one person-or-collective brain Anchor. Principals expose `isAnchor` independently, personal Anchors must remain active Admins, collective brains can be run by any active Admin, and last-active-Admin protection stays atomic. Propagate both facets through authenticated and configured A2A, evaluation, chat, Discord, MCP, CLI, web-chat, action, tool, confirmation, and model-instruction contexts.

  Finish the standalone Admin console target model with an Anchor ownership card, Admin/Anchor member facets, profile and optional peer-brain sections, responsive roster/detail layouts, typed Anchor mutations, and a console-local TanStack Query cache with targeted mutation invalidation.

- [`500a6dc`](https://github.com/rizom-ai/brains/commit/500a6dc284a590e1e9bb6af9fa0995332eeb8c58) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add the Admin-only People section in the standalone Admin console and migrate browser authentication from legacy operator terminology to role-aware auth sessions. Existing session rows and legacy browser cookies remain compatible through an explicit, release-gated migration window. Legacy dashboard `needsOperator` registration inputs remain accepted and normalize to `needsAttention`.

- [`d48cf69`](https://github.com/rizom-ai/brains/commit/d48cf69098a6ef7715e79784775b16e33d8f89bb) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Filter the console surface strip by the caller's permission level so a Trusted user no longer sees an Admin-only door. `deriveConsoleSurfaces` now takes the caller's level and omits surfaces above it (failing closed to public-only when unavailable), and every console surface (Dashboard, Chat, CMS, Admin) passes its resolved level. Authenticated non-Admins who reach `/admin` directly are redirected to their own `/account` surface instead of a bare, unstyled denial.

- [`5c1bed1`](https://github.com/rizom-ai/brains/commit/5c1bed1134f92701f4ead9b25a6f432cd208ac29) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Introduce stable person subjects for auth users and normalized canonical identity claims with independent assertion and verification evidence. Align auth persistence with generated Drizzle Kit migrations and a release-gated, row-preserving bridge for pre-Drizzle databases. Add access-neutral links between local people and independent external peer brains, including atomic peer-first invitations and existing-account linking, without inherited roles, identity claims, or attribution. Because the former representation model never shipped outside the feature branch, replace it through a clean generated schema correction rather than a historical data-copy transform or permanent dual-read path.

  Replace the unreleased My agents and representation-consent flow with the permanent Overview, Members/People, Invitations, and Audit Admin sections. Show passkeys under Sign-in, verified human-facing email and Discord under Connected channels, and optional external peers as a separate account facet. Keep hosted members without peers profileless, retain CMS ownership of the Anchor profile, omit internal IDs and generic Advanced identity tooling, expose actor-attributed audit events through an Admin-only endpoint and plain-language viewer, and bridge approved directory peers into the Admin invitation flow. Keep the monitoring dashboard free of management UI and expose Admin through route-derived console navigation and the Admin-gated command palette.

  Harden the internet-facing OAuth flow by rejecting suspended-user sessions at both authorization endpoints, returning MCP bearer claims plus the active principal from one JWT verification, requiring client-bound revocation, applying per-caller and runtime-wide bounds to open dynamic registration, and pruning stale unconsented clients at startup and on supervised maintenance. Deprecate ambiguous identity-resolution projection in favor of explicit resolved, denied, or unbound access results; bulk-load the Admin roster without per-user query fan-out; avoid duplicate browser-session resolution in web chat; preserve hash-only setup-delivery dedupe per recipient; centralize legacy imports, private mutation guards, safe error projection, mutation feedback, and persisted SHA-256 encodings; and retain exact private identity reconciliation without exposing canonical provider subjects.

- Updated dependencies [[`219e273`](https://github.com/rizom-ai/brains/commit/219e27392f7322ba3349c8d234e42f537d02aa6e), [`81d84ef`](https://github.com/rizom-ai/brains/commit/81d84ef5675db3099f2db5ed13e6a4e81d3b7d4f), [`500a6dc`](https://github.com/rizom-ai/brains/commit/500a6dc284a590e1e9bb6af9fa0995332eeb8c58), [`f7b3500`](https://github.com/rizom-ai/brains/commit/f7b350042c5bbcd6c5a43016d25e95e35ea3bfed), [`f9d7705`](https://github.com/rizom-ai/brains/commit/f9d7705a23f89a99332414093903899af0293e96), [`c0ab44b`](https://github.com/rizom-ai/brains/commit/c0ab44b35c481d053fafdf6c802141f365487aa5), [`500a6dc`](https://github.com/rizom-ai/brains/commit/500a6dc284a590e1e9bb6af9fa0995332eeb8c58), [`8176ef0`](https://github.com/rizom-ai/brains/commit/8176ef0c77d77bf753b1d0a8b0464105f713a232), [`b34aaa8`](https://github.com/rizom-ai/brains/commit/b34aaa8abb3dc65baf39c7c887185584e38dec74), [`7d18545`](https://github.com/rizom-ai/brains/commit/7d18545696fc5dd3908107cbeecc9bfdc2f17655), [`0265d69`](https://github.com/rizom-ai/brains/commit/0265d69c4c69d3331a029ddfe951002c2861d221), [`fa8e4eb`](https://github.com/rizom-ai/brains/commit/fa8e4eb3a237aaec54eeeb815f68e792d3a1715b), [`d48cf69`](https://github.com/rizom-ai/brains/commit/d48cf69098a6ef7715e79784775b16e33d8f89bb), [`5c1bed1`](https://github.com/rizom-ai/brains/commit/5c1bed1134f92701f4ead9b25a6f432cd208ac29), [`20ac901`](https://github.com/rizom-ai/brains/commit/20ac901e319ef62b38bb291de8d026b9d8ae51d7), [`f9d7705`](https://github.com/rizom-ai/brains/commit/f9d7705a23f89a99332414093903899af0293e96), [`85d2336`](https://github.com/rizom-ai/brains/commit/85d23364f686a176fff606c0ff90907c2f9b3cb3)]:
  - @brains/auth-service@0.2.0-alpha.227
  - @brains/console-theme@0.2.0-alpha.227
  - @brains/plugins@0.2.0-alpha.227
  - @brains/utils@0.2.0-alpha.227

## 0.2.0-alpha.226

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.226
  - @brains/utils@0.2.0-alpha.226
  - @brains/auth-service@0.2.0-alpha.226
  - @brains/plugins@0.2.0-alpha.226

## 0.2.0-alpha.225

### Patch Changes

- Updated dependencies [[`b0001fb`](https://github.com/rizom-ai/brains/commit/b0001fb102c030855586d92c4abef67004ae7987)]:
  - @brains/plugins@0.2.0-alpha.225
  - @brains/auth-service@0.2.0-alpha.225
  - @brains/console-theme@0.2.0-alpha.225
  - @brains/utils@0.2.0-alpha.225

## 0.2.0-alpha.224

### Patch Changes

- Updated dependencies [[`b7c5df6`](https://github.com/rizom-ai/brains/commit/b7c5df61ebe0aa44f6b786695f16daa7ee151e61)]:
  - @brains/utils@0.2.0-alpha.224
  - @brains/auth-service@0.2.0-alpha.224
  - @brains/plugins@0.2.0-alpha.224
  - @brains/console-theme@0.2.0-alpha.224

## 0.2.0-alpha.223

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.223
  - @brains/utils@0.2.0-alpha.223
  - @brains/auth-service@0.2.0-alpha.223
  - @brains/plugins@0.2.0-alpha.223

## 0.2.0-alpha.222

### Patch Changes

- Updated dependencies [[`4943d79`](https://github.com/rizom-ai/brains/commit/4943d79ecf4abefd4cf79a38a526e203ea32064a)]:
  - @brains/plugins@0.2.0-alpha.222
  - @brains/auth-service@0.2.0-alpha.222
  - @brains/console-theme@0.2.0-alpha.222
  - @brains/utils@0.2.0-alpha.222

## 0.2.0-alpha.221

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.221
  - @brains/utils@0.2.0-alpha.221
  - @brains/auth-service@0.2.0-alpha.221
  - @brains/plugins@0.2.0-alpha.221

## 0.2.0-alpha.220

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.220
  - @brains/utils@0.2.0-alpha.220
  - @brains/auth-service@0.2.0-alpha.220
  - @brains/plugins@0.2.0-alpha.220

## 0.2.0-alpha.219

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.219
  - @brains/utils@0.2.0-alpha.219
  - @brains/auth-service@0.2.0-alpha.219
  - @brains/plugins@0.2.0-alpha.219

## 0.2.0-alpha.218

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.218
  - @brains/utils@0.2.0-alpha.218
  - @brains/auth-service@0.2.0-alpha.218
  - @brains/plugins@0.2.0-alpha.218

## 0.2.0-alpha.217

### Patch Changes

- [#64](https://github.com/rizom-ai/brains/pull/64) [`b737ed9`](https://github.com/rizom-ai/brains/commit/b737ed9b37f0cd38b0e5387e2fb3795ca5eeec04) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Replace CMS hash doors with canonical path routing. Collections, entities, and optional workspaces now support direct loading, refresh, browser Back and Forward, custom CMS mounts, and dirty-draft navigation protection. Dashboard entity doors use canonical CMS detail paths, and the web route contract supports explicit segment-aware prefix routes for authenticated SPA shells.

- Updated dependencies [[`b737ed9`](https://github.com/rizom-ai/brains/commit/b737ed9b37f0cd38b0e5387e2fb3795ca5eeec04)]:
  - @brains/plugins@0.2.0-alpha.217
  - @brains/auth-service@0.2.0-alpha.217
  - @brains/console-theme@0.2.0-alpha.217
  - @brains/utils@0.2.0-alpha.217

## 0.2.0-alpha.216

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.216
  - @brains/utils@0.2.0-alpha.216
  - @brains/auth-service@0.2.0-alpha.216
  - @brains/plugins@0.2.0-alpha.216

## 0.2.0-alpha.215

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.215
  - @brains/utils@0.2.0-alpha.215
  - @brains/auth-service@0.2.0-alpha.215
  - @brains/plugins@0.2.0-alpha.215

## 0.2.0-alpha.214

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.214
  - @brains/utils@0.2.0-alpha.214
  - @brains/auth-service@0.2.0-alpha.214
  - @brains/plugins@0.2.0-alpha.214

## 0.2.0-alpha.213

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.213
  - @brains/utils@0.2.0-alpha.213
  - @brains/auth-service@0.2.0-alpha.213
  - @brains/plugins@0.2.0-alpha.213

## 0.2.0-alpha.212

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.212
  - @brains/utils@0.2.0-alpha.212
  - @brains/auth-service@0.2.0-alpha.212
  - @brains/plugins@0.2.0-alpha.212

## 0.2.0-alpha.211

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.211
  - @brains/utils@0.2.0-alpha.211
  - @brains/auth-service@0.2.0-alpha.211
  - @brains/plugins@0.2.0-alpha.211

## 0.2.0-alpha.210

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.210
  - @brains/utils@0.2.0-alpha.210
  - @brains/auth-service@0.2.0-alpha.210
  - @brains/plugins@0.2.0-alpha.210

## 0.2.0-alpha.209

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.209
  - @brains/utils@0.2.0-alpha.209
  - @brains/auth-service@0.2.0-alpha.209
  - @brains/plugins@0.2.0-alpha.209

## 0.2.0-alpha.208

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.208
  - @brains/utils@0.2.0-alpha.208
  - @brains/auth-service@0.2.0-alpha.208
  - @brains/plugins@0.2.0-alpha.208

## 0.2.0-alpha.207

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.207
  - @brains/utils@0.2.0-alpha.207
  - @brains/auth-service@0.2.0-alpha.207
  - @brains/plugins@0.2.0-alpha.207

## 0.2.0-alpha.206

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.206
  - @brains/utils@0.2.0-alpha.206
  - @brains/auth-service@0.2.0-alpha.206
  - @brains/plugins@0.2.0-alpha.206

## 0.2.0-alpha.205

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.205
  - @brains/utils@0.2.0-alpha.205
  - @brains/auth-service@0.2.0-alpha.205
  - @brains/plugins@0.2.0-alpha.205

## 0.2.0-alpha.204

### Patch Changes

- Updated dependencies [[`998a786`](https://github.com/rizom-ai/brains/commit/998a78694a06c7796fefcca09e258cc90eb62ce9)]:
  - @brains/plugins@0.2.0-alpha.204
  - @brains/auth-service@0.2.0-alpha.204
  - @brains/console-theme@0.2.0-alpha.204
  - @brains/utils@0.2.0-alpha.204

## 0.2.0-alpha.203

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.203
  - @brains/console-theme@0.2.0-alpha.203
  - @brains/utils@0.2.0-alpha.203
  - @brains/auth-service@0.2.0-alpha.203

## 0.2.0-alpha.202

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.202
  - @brains/utils@0.2.0-alpha.202
  - @brains/auth-service@0.2.0-alpha.202
  - @brains/plugins@0.2.0-alpha.202

## 0.2.0-alpha.201

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.201
  - @brains/utils@0.2.0-alpha.201
  - @brains/auth-service@0.2.0-alpha.201
  - @brains/plugins@0.2.0-alpha.201

## 0.2.0-alpha.200

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.200
  - @brains/utils@0.2.0-alpha.200
  - @brains/auth-service@0.2.0-alpha.200
  - @brains/plugins@0.2.0-alpha.200

## 0.2.0-alpha.199

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.199
  - @brains/utils@0.2.0-alpha.199
  - @brains/auth-service@0.2.0-alpha.199
  - @brains/plugins@0.2.0-alpha.199

## 0.2.0-alpha.198

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.198
  - @brains/utils@0.2.0-alpha.198
  - @brains/auth-service@0.2.0-alpha.198
  - @brains/plugins@0.2.0-alpha.198

## 0.2.0-alpha.197

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.197
  - @brains/utils@0.2.0-alpha.197
  - @brains/auth-service@0.2.0-alpha.197
  - @brains/plugins@0.2.0-alpha.197

## 0.2.0-alpha.196

### Patch Changes

- Updated dependencies [[`21b70b7`](https://github.com/rizom-ai/brains/commit/21b70b7962af2c815b51259e3a5d3afb7e900ba6)]:
  - @brains/console-theme@0.2.0-alpha.196
  - @brains/utils@0.2.0-alpha.196
  - @brains/auth-service@0.2.0-alpha.196
  - @brains/plugins@0.2.0-alpha.196

## 0.2.0-alpha.195

### Patch Changes

- Updated dependencies [[`1ece871`](https://github.com/rizom-ai/brains/commit/1ece871c78c950ff91033cb62e34fe89987cfd2c)]:
  - @brains/plugins@0.2.0-alpha.195
  - @brains/auth-service@0.2.0-alpha.195
  - @brains/console-theme@0.2.0-alpha.195
  - @brains/utils@0.2.0-alpha.195

## 0.2.0-alpha.194

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.194
  - @brains/utils@0.2.0-alpha.194
  - @brains/auth-service@0.2.0-alpha.194
  - @brains/plugins@0.2.0-alpha.194

## 0.2.0-alpha.193

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.193
  - @brains/utils@0.2.0-alpha.193
  - @brains/auth-service@0.2.0-alpha.193
  - @brains/plugins@0.2.0-alpha.193

## 0.2.0-alpha.192

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.192
  - @brains/utils@0.2.0-alpha.192
  - @brains/auth-service@0.2.0-alpha.192
  - @brains/plugins@0.2.0-alpha.192

## 0.2.0-alpha.191

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.191
  - @brains/utils@0.2.0-alpha.191
  - @brains/auth-service@0.2.0-alpha.191
  - @brains/plugins@0.2.0-alpha.191

## 0.2.0-alpha.190

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.190
  - @brains/utils@0.2.0-alpha.190
  - @brains/auth-service@0.2.0-alpha.190
  - @brains/plugins@0.2.0-alpha.190

## 0.2.0-alpha.189

### Patch Changes

- [`5294aec`](https://github.com/rizom-ai/brains/commit/5294aec7eab3b98ddfa68fc3aadc4b966355740e) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add an optional CMS Sync workspace backed by a sanitized directory-sync operational snapshot. Operators can inspect watcher, file, Git, recent-run, and quarantine state and request the existing normal sync flow from CMS, while Dashboard remains read-only and links to the workspace when available.

- Updated dependencies [[`5294aec`](https://github.com/rizom-ai/brains/commit/5294aec7eab3b98ddfa68fc3aadc4b966355740e)]:
  - @brains/plugins@0.2.0-alpha.189
  - @brains/auth-service@0.2.0-alpha.189
  - @brains/console-theme@0.2.0-alpha.189
  - @brains/utils@0.2.0-alpha.189

## 0.2.0-alpha.188

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.188
  - @brains/utils@0.2.0-alpha.188
  - @brains/auth-service@0.2.0-alpha.188
  - @brains/plugins@0.2.0-alpha.188

## 0.2.0-alpha.187

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.187
  - @brains/utils@0.2.0-alpha.187
  - @brains/auth-service@0.2.0-alpha.187
  - @brains/plugins@0.2.0-alpha.187

## 0.2.0-alpha.186

### Patch Changes

- Updated dependencies [[`45c57a1`](https://github.com/rizom-ai/brains/commit/45c57a1330e11fb79ea376a82924c9f02e4a84d4), [`143788b`](https://github.com/rizom-ai/brains/commit/143788beb9544649f3d1bac16bcea605c36cd94a)]:
  - @brains/plugins@0.2.0-alpha.186
  - @brains/auth-service@0.2.0-alpha.186
  - @brains/console-theme@0.2.0-alpha.186
  - @brains/utils@0.2.0-alpha.186

## 0.2.0-alpha.185

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.185
  - @brains/utils@0.2.0-alpha.185
  - @brains/auth-service@0.2.0-alpha.185
  - @brains/plugins@0.2.0-alpha.185

## 0.2.0-alpha.184

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.184
  - @brains/auth-service@0.2.0-alpha.184
  - @brains/console-theme@0.2.0-alpha.184
  - @brains/utils@0.2.0-alpha.184

## 0.2.0-alpha.183

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.183
  - @brains/auth-service@0.2.0-alpha.183
  - @brains/console-theme@0.2.0-alpha.183
  - @brains/utils@0.2.0-alpha.183

## 0.2.0-alpha.182

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.182
  - @brains/utils@0.2.0-alpha.182
  - @brains/auth-service@0.2.0-alpha.182
  - @brains/plugins@0.2.0-alpha.182

## 0.2.0-alpha.181

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.181
  - @brains/utils@0.2.0-alpha.181
  - @brains/auth-service@0.2.0-alpha.181
  - @brains/plugins@0.2.0-alpha.181

## 0.2.0-alpha.180

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.180
  - @brains/auth-service@0.2.0-alpha.180
  - @brains/console-theme@0.2.0-alpha.180
  - @brains/utils@0.2.0-alpha.180

## 0.2.0-alpha.179

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.179
  - @brains/auth-service@0.2.0-alpha.179
  - @brains/console-theme@0.2.0-alpha.179
  - @brains/utils@0.2.0-alpha.179

## 0.2.0-alpha.178

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.178
  - @brains/utils@0.2.0-alpha.178
  - @brains/auth-service@0.2.0-alpha.178
  - @brains/plugins@0.2.0-alpha.178

## 0.2.0-alpha.177

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.177
  - @brains/utils@0.2.0-alpha.177
  - @brains/auth-service@0.2.0-alpha.177
  - @brains/plugins@0.2.0-alpha.177

## 0.2.0-alpha.176

### Patch Changes

- [`de494c9`](https://github.com/rizom-ai/brains/commit/de494c964bef7a85e4f6c88f17577d56fc1bc6fb) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add an optional CMS publishing workspace with durable queue operations, confirmed direct publishing, and a compact read-only Dashboard digest.

- Updated dependencies [[`de494c9`](https://github.com/rizom-ai/brains/commit/de494c964bef7a85e4f6c88f17577d56fc1bc6fb)]:
  - @brains/plugins@0.2.0-alpha.176
  - @brains/auth-service@0.2.0-alpha.176
  - @brains/console-theme@0.2.0-alpha.176
  - @brains/utils@0.2.0-alpha.176

## 0.2.0-alpha.175

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.175
  - @brains/auth-service@0.2.0-alpha.175
  - @brains/console-theme@0.2.0-alpha.175
  - @brains/utils@0.2.0-alpha.175

## 0.2.0-alpha.174

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.174
  - @brains/auth-service@0.2.0-alpha.174
  - @brains/console-theme@0.2.0-alpha.174
  - @brains/utils@0.2.0-alpha.174

## 0.2.0-alpha.173

### Patch Changes

- Updated dependencies [[`8427031`](https://github.com/rizom-ai/brains/commit/84270311c343964449d96c4cd60e4066daac4aef)]:
  - @brains/plugins@0.2.0-alpha.173
  - @brains/auth-service@0.2.0-alpha.173
  - @brains/console-theme@0.2.0-alpha.173
  - @brains/utils@0.2.0-alpha.173

## 0.2.0-alpha.172

### Patch Changes

- [`0ce1257`](https://github.com/rizom-ai/brains/commit/0ce1257934837f984c3e418eab4dc6edac6dab51) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Second-order agent discovery. Brains serve their approved public agents as minimal name/url pointers at /.well-known/agent-directory.json, and the trusted agent_scan_directories tool walks each approved peer's directory, verifies each pointee's own Agent Card, and saves sightings as discovered agents carrying provenance (introducedBy, hops) — skipping self and known agents, merging introducers on repeat sightings. Sighted agents chart on the proximity map at half light, threads growing from their introducers, germinating only within semantic reach with an active introducer; approving one (agent_connect) promotes it to a full first-order contact.

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.172
  - @brains/utils@0.2.0-alpha.172
  - @brains/auth-service@0.2.0-alpha.172
  - @brains/plugins@0.2.0-alpha.172

## 0.2.0-alpha.171

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.171
  - @brains/utils@0.2.0-alpha.171
  - @brains/auth-service@0.2.0-alpha.171
  - @brains/plugins@0.2.0-alpha.171

## 0.2.0-alpha.170

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.170
  - @brains/utils@0.2.0-alpha.170
  - @brains/auth-service@0.2.0-alpha.170
  - @brains/plugins@0.2.0-alpha.170

## 0.2.0-alpha.169

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.169
  - @brains/utils@0.2.0-alpha.169
  - @brains/auth-service@0.2.0-alpha.169
  - @brains/plugins@0.2.0-alpha.169

## 0.2.0-alpha.168

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.168
  - @brains/utils@0.2.0-alpha.168
  - @brains/auth-service@0.2.0-alpha.168
  - @brains/plugins@0.2.0-alpha.168

## 0.2.0-alpha.167

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.167
  - @brains/auth-service@0.2.0-alpha.167
  - @brains/console-theme@0.2.0-alpha.167
  - @brains/utils@0.2.0-alpha.167

## 0.2.0-alpha.166

### Patch Changes

- [`14120e9`](https://github.com/rizom-ai/brains/commit/14120e9c487f9fe19c974e320bbd49e70900e6ff) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Give the proximity map the full card width and let it breathe: the chart column duplicated what the map already says (constellation labels, member names, hover-wake on the mists), so it is gone along with its styles and script handlers. The disc recenters for the wide field and the site crop follows the map center. The console soil is no longer a dark rectangle — it pools, dense at the disc and dissolving into the card with no geometric boundary, grain and outer content fading with it. And every eight seconds a ripple of light leaves the center; each bulb shimmers as the wavefront crosses its radius, so the arrival order is the proximity order — archived traces give no answer. Ripple, shimmer, and nutrient pulses all stop under prefers-reduced-motion.

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.166
  - @brains/utils@0.2.0-alpha.166
  - @brains/auth-service@0.2.0-alpha.166
  - @brains/plugins@0.2.0-alpha.166

## 0.2.0-alpha.165

### Patch Changes

- [`6484d4b`](https://github.com/rizom-ai/brains/commit/6484d4b8dc4bc2182370ddfff3e0b8594aee2b33) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Polish the agent proximity map: templates can now declare `staticAssets` that site-builder emits for routes using them, so the map's interaction script ships as a real file instead of a CSP-hostile data: URI. The chart HUD gains a free-agents row with hover linkage, nutrient pulses ride approved threads (hidden under reduced motion), SVG defs are namespaced per surface, the tooltip is structured and injection-safe, node labels thin out past the label budget, and interactive elements drop the button role they could not honor.

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.165
  - @brains/auth-service@0.2.0-alpha.165
  - @brains/console-theme@0.2.0-alpha.165
  - @brains/utils@0.2.0-alpha.165

## 0.2.0-alpha.164

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.164
  - @brains/utils@0.2.0-alpha.164
  - @brains/auth-service@0.2.0-alpha.164
  - @brains/plugins@0.2.0-alpha.164

## 0.2.0-alpha.163

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.163
  - @brains/utils@0.2.0-alpha.163
  - @brains/auth-service@0.2.0-alpha.163
  - @brains/plugins@0.2.0-alpha.163

## 0.2.0-alpha.162

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.162
  - @brains/utils@0.2.0-alpha.162
  - @brains/auth-service@0.2.0-alpha.162
  - @brains/plugins@0.2.0-alpha.162

## 0.2.0-alpha.161

### Patch Changes

- [`61c6862`](https://github.com/rizom-ai/brains/commit/61c68624c0ae21f9d00d307db02ce5a1439d2765) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Expose a visibility-scoped `context.semantic.project()` API for provider-independent semantic projections without exposing raw embeddings to plugins, add an interactive agent proximity map to the dashboard, and support archived agent lifecycle state with faint historical traces.

- Updated dependencies [[`61c6862`](https://github.com/rizom-ai/brains/commit/61c68624c0ae21f9d00d307db02ce5a1439d2765)]:
  - @brains/plugins@0.2.0-alpha.161
  - @brains/auth-service@0.2.0-alpha.161
  - @brains/console-theme@0.2.0-alpha.161
  - @brains/utils@0.2.0-alpha.161

## 0.2.0-alpha.160

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.160
  - @brains/auth-service@0.2.0-alpha.160
  - @brains/console-theme@0.2.0-alpha.160
  - @brains/utils@0.2.0-alpha.160

## 0.2.0-alpha.159

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.159
  - @brains/utils@0.2.0-alpha.159
  - @brains/auth-service@0.2.0-alpha.159
  - @brains/plugins@0.2.0-alpha.159

## 0.2.0-alpha.158

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.158
  - @brains/utils@0.2.0-alpha.158
  - @brains/auth-service@0.2.0-alpha.158
  - @brains/plugins@0.2.0-alpha.158

## 0.2.0-alpha.157

### Patch Changes

- [`b13774a`](https://github.com/rizom-ai/brains/commit/b13774afda0ba85356ab07ee29cdd09b19071054) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Operator-review fixes across the console: the climate toggle moves into the shared strip on all three surfaces (replacing the dashboard masthead button and chat's local toggle), the session chip gains a neutral visitor variant and quiet phone treatment, sign-in controls adopt the console button language, and the CMS library groups brain machinery under a System rail section, hides publication chips for types without a publication lifecycle, and repairs the phone type pills and row meta alignment.

- Updated dependencies [[`f6dc969`](https://github.com/rizom-ai/brains/commit/f6dc96973a64c3f40694ae80fe4529a20d423e5d), [`b13774a`](https://github.com/rizom-ai/brains/commit/b13774afda0ba85356ab07ee29cdd09b19071054)]:
  - @brains/console-theme@0.2.0-alpha.157
  - @brains/auth-service@0.2.0-alpha.157
  - @brains/utils@0.2.0-alpha.157
  - @brains/plugins@0.2.0-alpha.157

## 0.2.0-alpha.156

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.156
  - @brains/utils@0.2.0-alpha.156
  - @brains/auth-service@0.2.0-alpha.156
  - @brains/plugins@0.2.0-alpha.156

## 0.2.0-alpha.155

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.155
  - @brains/auth-service@0.2.0-alpha.155
  - @brains/console-theme@0.2.0-alpha.155
  - @brains/utils@0.2.0-alpha.155

## 0.2.0-alpha.154

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.154
  - @brains/utils@0.2.0-alpha.154
  - @brains/auth-service@0.2.0-alpha.154
  - @brains/plugins@0.2.0-alpha.154

## 0.2.0-alpha.153

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.153
  - @brains/utils@0.2.0-alpha.153
  - @brains/auth-service@0.2.0-alpha.153
  - @brains/plugins@0.2.0-alpha.153

## 0.2.0-alpha.152

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.152
  - @brains/utils@0.2.0-alpha.152
  - @brains/auth-service@0.2.0-alpha.152
  - @brains/plugins@0.2.0-alpha.152

## 0.2.0-alpha.151

### Patch Changes

- Updated dependencies []:
  - @brains/console-theme@0.2.0-alpha.151
  - @brains/utils@0.2.0-alpha.151
  - @brains/auth-service@0.2.0-alpha.151
  - @brains/plugins@0.2.0-alpha.151

## 0.2.0-alpha.150

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.150
  - @brains/console-theme@0.2.0-alpha.150
  - @brains/utils@0.2.0-alpha.150
  - @brains/auth-service@0.2.0-alpha.150

## 0.2.0-alpha.149

### Patch Changes

- [`70ff530`](https://github.com/rizom-ai/brains/commit/70ff53084c5bb8d021e2a4f898e108b2de220d2a) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Align the operator console with the canonical navy instrument and warm paper mockups, and add deliberate tablet and phone compositions across the shared strip, command palette, dashboard, chat shell, and CMS editor. Refactor responsive styles into surface-local modules, make CMS controls climate-safe, and preserve the historical and responsive console mockups as implementation references.

- Updated dependencies [[`70ff530`](https://github.com/rizom-ai/brains/commit/70ff53084c5bb8d021e2a4f898e108b2de220d2a)]:
  - @brains/console-theme@0.2.0-alpha.149
  - @brains/utils@0.2.0-alpha.149
  - @brains/auth-service@0.2.0-alpha.149
  - @brains/plugins@0.2.0-alpha.149

## 0.2.0-alpha.148

### Patch Changes

- [`f7054af`](https://github.com/rizom-ai/brains/commit/f7054af14705adb7690def03c70009bf95b91b8b) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The CMS editor joins the console: its shell serves the shared
  @brains/console-theme sheet (paper climate default, console-wide
  console.climate preference wins) and the console strip with route-derived
  surface links; the appbar slims to a surface-local crumb bar; the local
  paper palette and IBM Plex Mono are replaced by console tokens and
  JetBrains Mono. The strip's HTML renderer and the console fonts URL move
  into @brains/console-theme, shared by web-chat and the CMS shell.

- [`d4e0245`](https://github.com/rizom-ai/brains/commit/d4e0245a37741bed6cfd7d588b77f951e36e38f2) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Cross-surface ⌘K jump: an operator-gated /api/console/jump endpoint on
  the dashboard returns grouped doors (entity search hits open in the CMS
  editor via hash deep-links, widget groups open dashboard tabs), and a
  shared vanilla palette in @brains/console-theme — wired to the strip's
  ⌘K on all three surfaces — renders them. The CMS editor honors
  #/{type}/{id} deep-links, and chat appends its local conversations to
  the palette and resumes sessions from #s/{id} doors.

- [`d82b56c`](https://github.com/rizom-ai/brains/commit/d82b56cd9729a7a1d06a1232fea0674d9853da87) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Extract the operator-console token sheet into @brains/console-theme: one
  --console-\* vocabulary with two climates (instrument/paper) plus the shared
  console-strip chrome, replacing the dashboard's --dashboard-\* tokens. The
  strip's surface links now derive from registered web routes (service plugin
  contexts gain read access to the web-route registry), and the light/dark
  toggle becomes the console-wide climate preference persisted as
  console.climate.

- [`acc1f5a`](https://github.com/rizom-ai/brains/commit/acc1f5a3c0216dc4f33990e775334a4d5e8837a0) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Web-chat joins the console: the chat page serves the shared
  @brains/console-theme sheet and the console strip (route-derived surface
  links, operator session chip), its --chat-\* palette copies are replaced by
  console tokens plus a thin chat-only block, and the in-app theme toggle
  becomes the console-wide climate toggle (console.climate,
  instrument/paper). Surface derivation and the climate script move into
  @brains/console-theme; the dashboard imports them from there.
- Updated dependencies [[`f7054af`](https://github.com/rizom-ai/brains/commit/f7054af14705adb7690def03c70009bf95b91b8b), [`d4e0245`](https://github.com/rizom-ai/brains/commit/d4e0245a37741bed6cfd7d588b77f951e36e38f2), [`d82b56c`](https://github.com/rizom-ai/brains/commit/d82b56cd9729a7a1d06a1232fea0674d9853da87), [`acc1f5a`](https://github.com/rizom-ai/brains/commit/acc1f5a3c0216dc4f33990e775334a4d5e8837a0)]:
  - @brains/console-theme@0.2.0-alpha.148
  - @brains/plugins@0.2.0-alpha.148
  - @brains/auth-service@0.2.0-alpha.148
  - @brains/utils@0.2.0-alpha.148

## 0.2.0-alpha.147

### Patch Changes

- Updated dependencies [[`6d95483`](https://github.com/rizom-ai/brains/commit/6d95483c589c3e77b23c42bf9516c03be8253e1f)]:
  - @brains/plugins@0.2.0-alpha.147
  - @brains/auth-service@0.2.0-alpha.147
  - @brains/utils@0.2.0-alpha.147

## 0.2.0-alpha.146

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.146
  - @brains/auth-service@0.2.0-alpha.146
  - @brains/plugins@0.2.0-alpha.146

## 0.2.0-alpha.145

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.145
  - @brains/auth-service@0.2.0-alpha.145
  - @brains/plugins@0.2.0-alpha.145

## 0.2.0-alpha.144

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.144
  - @brains/auth-service@0.2.0-alpha.144
  - @brains/plugins@0.2.0-alpha.144

## 0.2.0-alpha.143

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.143
  - @brains/auth-service@0.2.0-alpha.143
  - @brains/plugins@0.2.0-alpha.143

## 0.2.0-alpha.142

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.142
  - @brains/auth-service@0.2.0-alpha.142
  - @brains/utils@0.2.0-alpha.142

## 0.2.0-alpha.141

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.141
  - @brains/auth-service@0.2.0-alpha.141
  - @brains/utils@0.2.0-alpha.141

## 0.2.0-alpha.140

### Patch Changes

- [`070541b`](https://github.com/rizom-ai/brains/commit/070541b535e3977c8fe2d590ae7ad114cee09417) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Codebase review fixes: validate A2A agent card endpoints before posting (SSRF guard); fail entity/embedding DB migration loudly at boot; report entity-not-found on update instead of phantom success; replace fake batch roots with explicit silent jobs; make broadcast dispatch concurrent; atomic JSON stores in auth-service with corrupt-file quarantine; honest buttondown duplicate detection and auto-send failure reporting; honest stock-photo cover status; MCP session idle eviction, dead handler removal, constant-time token compare; Discord typing indicator leak fix; note upload/generation id collision fixes; preserve zod error detail in structured content formatter; fold cms-config into cms plugin; remove dead packages (product-site-content, rizom-ui) and dead exports.

- [`f30d603`](https://github.com/rizom-ai/brains/commit/f30d603ef2384df63381227754f8178ef6b88a06) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Tech-debt sweep: dashboard CSS extracted to a real stylesheet; deploy scaffolding forks (push-target, run-subprocess, push-secrets, ssh-key-bootstrap) consolidated into @brains/deploy-support with drift-guard tests; atproto-contracts split into modules with the @brains/plugins dependency removed; hackmd, notion, plugin-examples, and mcp-bridge plugins deleted (zero consumers).

- Updated dependencies [[`070541b`](https://github.com/rizom-ai/brains/commit/070541b535e3977c8fe2d590ae7ad114cee09417), [`a30edc7`](https://github.com/rizom-ai/brains/commit/a30edc7ac66807c66cba2bc94e78206f133710d6), [`cea906c`](https://github.com/rizom-ai/brains/commit/cea906c689d40dee5f06ab949d5289c2660bfd37)]:
  - @brains/plugins@0.2.0-alpha.140
  - @brains/auth-service@0.2.0-alpha.140
  - @brains/utils@0.2.0-alpha.140

## 0.2.0-alpha.139

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.139
  - @brains/auth-service@0.2.0-alpha.139
  - @brains/plugins@0.2.0-alpha.139

## 0.2.0-alpha.138

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.138
  - @brains/auth-service@0.2.0-alpha.138
  - @brains/plugins@0.2.0-alpha.138

## 0.2.0-alpha.137

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.137
  - @brains/auth-service@0.2.0-alpha.137
  - @brains/plugins@0.2.0-alpha.137

## 0.2.0-alpha.136

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.136
  - @brains/auth-service@0.2.0-alpha.136
  - @brains/plugins@0.2.0-alpha.136

## 0.2.0-alpha.135

### Patch Changes

- Updated dependencies [[`37db2bc`](https://github.com/rizom-ai/brains/commit/37db2bc759e606f42efacedd70056e9c2f440a4e)]:
  - @brains/plugins@0.2.0-alpha.135
  - @brains/auth-service@0.2.0-alpha.135
  - @brains/utils@0.2.0-alpha.135

## 0.2.0-alpha.134

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.134
  - @brains/auth-service@0.2.0-alpha.134
  - @brains/plugins@0.2.0-alpha.134

## 0.2.0-alpha.133

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.133
  - @brains/auth-service@0.2.0-alpha.133
  - @brains/plugins@0.2.0-alpha.133

## 0.2.0-alpha.132

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.132
  - @brains/auth-service@0.2.0-alpha.132
  - @brains/utils@0.2.0-alpha.132

## 0.2.0-alpha.131

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.131
  - @brains/utils@0.2.0-alpha.131
  - @brains/auth-service@0.2.0-alpha.131

## 0.2.0-alpha.130

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.130
  - @brains/auth-service@0.2.0-alpha.130
  - @brains/plugins@0.2.0-alpha.130

## 0.2.0-alpha.129

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.129
  - @brains/auth-service@0.2.0-alpha.129
  - @brains/plugins@0.2.0-alpha.129

## 0.2.0-alpha.128

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.128
  - @brains/auth-service@0.2.0-alpha.128
  - @brains/plugins@0.2.0-alpha.128

## 0.2.0-alpha.127

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.127
  - @brains/auth-service@0.2.0-alpha.127
  - @brains/plugins@0.2.0-alpha.127

## 0.2.0-alpha.126

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.126
  - @brains/auth-service@0.2.0-alpha.126
  - @brains/plugins@0.2.0-alpha.126

## 0.2.0-alpha.125

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.125
  - @brains/utils@0.2.0-alpha.125
  - @brains/auth-service@0.2.0-alpha.125

## 0.2.0-alpha.124

### Patch Changes

- Updated dependencies [[`57b025e`](https://github.com/rizom-ai/brains/commit/57b025e2bf9015c3f3e46b91fbdbef766efc3d10)]:
  - @brains/plugins@0.2.0-alpha.124
  - @brains/auth-service@0.2.0-alpha.124
  - @brains/utils@0.2.0-alpha.124

## 0.2.0-alpha.123

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.123
  - @brains/utils@0.2.0-alpha.123
  - @brains/auth-service@0.2.0-alpha.123

## 0.2.0-alpha.122

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.122
  - @brains/auth-service@0.2.0-alpha.122
  - @brains/plugins@0.2.0-alpha.122

## 0.2.0-alpha.121

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.121
  - @brains/auth-service@0.2.0-alpha.121
  - @brains/plugins@0.2.0-alpha.121

## 0.2.0-alpha.120

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.120
  - @brains/auth-service@0.2.0-alpha.120
  - @brains/plugins@0.2.0-alpha.120

## 0.2.0-alpha.119

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.119
  - @brains/utils@0.2.0-alpha.119
  - @brains/auth-service@0.2.0-alpha.119

## 0.2.0-alpha.118

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.118
  - @brains/utils@0.2.0-alpha.118
  - @brains/auth-service@0.2.0-alpha.118

## 0.2.0-alpha.117

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.117
  - @brains/auth-service@0.2.0-alpha.117
  - @brains/plugins@0.2.0-alpha.117

## 0.2.0-alpha.116

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.116
  - @brains/utils@0.2.0-alpha.116
  - @brains/auth-service@0.2.0-alpha.116

## 0.2.0-alpha.115

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.115
  - @brains/auth-service@0.2.0-alpha.115
  - @brains/plugins@0.2.0-alpha.115

## 0.2.0-alpha.114

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.114
  - @brains/auth-service@0.2.0-alpha.114
  - @brains/plugins@0.2.0-alpha.114

## 0.2.0-alpha.113

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.113
  - @brains/auth-service@0.2.0-alpha.113
  - @brains/plugins@0.2.0-alpha.113

## 0.2.0-alpha.112

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.112
  - @brains/auth-service@0.2.0-alpha.112
  - @brains/plugins@0.2.0-alpha.112

## 0.2.0-alpha.111

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.111
  - @brains/auth-service@0.2.0-alpha.111
  - @brains/plugins@0.2.0-alpha.111

## 0.2.0-alpha.110

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.110
  - @brains/auth-service@0.2.0-alpha.110
  - @brains/plugins@0.2.0-alpha.110

## 0.2.0-alpha.109

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.109
  - @brains/auth-service@0.2.0-alpha.109
  - @brains/plugins@0.2.0-alpha.109

## 0.2.0-alpha.108

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.108
  - @brains/auth-service@0.2.0-alpha.108
  - @brains/plugins@0.2.0-alpha.108

## 0.2.0-alpha.107

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.107
  - @brains/auth-service@0.2.0-alpha.107
  - @brains/plugins@0.2.0-alpha.107

## 0.2.0-alpha.106

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.106
  - @brains/auth-service@0.2.0-alpha.106
  - @brains/plugins@0.2.0-alpha.106

## 0.2.0-alpha.105

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.105
  - @brains/auth-service@0.2.0-alpha.105
  - @brains/plugins@0.2.0-alpha.105

## 0.2.0-alpha.104

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.104
  - @brains/auth-service@0.2.0-alpha.104
  - @brains/plugins@0.2.0-alpha.104

## 0.2.0-alpha.103

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.103
  - @brains/auth-service@0.2.0-alpha.103
  - @brains/plugins@0.2.0-alpha.103

## 0.2.0-alpha.102

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.102
  - @brains/auth-service@0.2.0-alpha.102
  - @brains/plugins@0.2.0-alpha.102

## 0.2.0-alpha.101

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.101
  - @brains/auth-service@0.2.0-alpha.101
  - @brains/plugins@0.2.0-alpha.101

## 0.2.0-alpha.100

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.100
  - @brains/auth-service@0.2.0-alpha.100
  - @brains/plugins@0.2.0-alpha.100

## 0.2.0-alpha.99

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.99
  - @brains/auth-service@0.2.0-alpha.99
  - @brains/plugins@0.2.0-alpha.99

## 0.2.0-alpha.98

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.98
  - @brains/auth-service@0.2.0-alpha.98
  - @brains/plugins@0.2.0-alpha.98

## 0.2.0-alpha.97

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.97
  - @brains/auth-service@0.2.0-alpha.97
  - @brains/plugins@0.2.0-alpha.97

## 0.2.0-alpha.96

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.96
  - @brains/auth-service@0.2.0-alpha.96
  - @brains/plugins@0.2.0-alpha.96

## 0.2.0-alpha.95

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.95
  - @brains/auth-service@0.2.0-alpha.95
  - @brains/plugins@0.2.0-alpha.95

## 0.2.0-alpha.94

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.94
  - @brains/auth-service@0.2.0-alpha.94
  - @brains/plugins@0.2.0-alpha.94

## 0.2.0-alpha.93

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.93
  - @brains/auth-service@0.2.0-alpha.93
  - @brains/plugins@0.2.0-alpha.93

## 0.2.0-alpha.92

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.92
  - @brains/auth-service@0.2.0-alpha.92
  - @brains/plugins@0.2.0-alpha.92

## 0.2.0-alpha.91

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.91
  - @brains/auth-service@0.2.0-alpha.91
  - @brains/plugins@0.2.0-alpha.91

## 0.2.0-alpha.90

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.90
  - @brains/auth-service@0.2.0-alpha.90
  - @brains/plugins@0.2.0-alpha.90

## 0.2.0-alpha.89

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.89
  - @brains/auth-service@0.2.0-alpha.89
  - @brains/plugins@0.2.0-alpha.89

## 0.2.0-alpha.88

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.88
  - @brains/auth-service@0.2.0-alpha.88
  - @brains/plugins@0.2.0-alpha.88

## 0.2.0-alpha.87

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.87
  - @brains/auth-service@0.2.0-alpha.87
  - @brains/plugins@0.2.0-alpha.87

## 0.2.0-alpha.86

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.86
  - @brains/auth-service@0.2.0-alpha.86
  - @brains/plugins@0.2.0-alpha.86

## 0.2.0-alpha.85

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.85
  - @brains/auth-service@0.2.0-alpha.85
  - @brains/plugins@0.2.0-alpha.85

## 0.2.0-alpha.84

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.84
  - @brains/auth-service@0.2.0-alpha.84
  - @brains/plugins@0.2.0-alpha.84

## 0.2.0-alpha.83

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.83
  - @brains/auth-service@0.2.0-alpha.83
  - @brains/plugins@0.2.0-alpha.83

## 0.2.0-alpha.82

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.82
  - @brains/auth-service@0.2.0-alpha.82
  - @brains/plugins@0.2.0-alpha.82

## 0.2.0-alpha.81

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.81
  - @brains/auth-service@0.2.0-alpha.81
  - @brains/plugins@0.2.0-alpha.81

## 0.2.0-alpha.80

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.80
  - @brains/auth-service@0.2.0-alpha.80
  - @brains/plugins@0.2.0-alpha.80

## 0.2.0-alpha.79

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.79
  - @brains/auth-service@0.2.0-alpha.79
  - @brains/plugins@0.2.0-alpha.79

## 0.2.0-alpha.78

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.78
  - @brains/auth-service@0.2.0-alpha.78
  - @brains/plugins@0.2.0-alpha.78

## 0.2.0-alpha.77

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.77
  - @brains/auth-service@0.2.0-alpha.77
  - @brains/plugins@0.2.0-alpha.77

## 0.2.0-alpha.76

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.76
  - @brains/auth-service@0.2.0-alpha.76
  - @brains/plugins@0.2.0-alpha.76

## 0.2.0-alpha.75

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.75
  - @brains/auth-service@0.2.0-alpha.75
  - @brains/plugins@0.2.0-alpha.75

## 0.2.0-alpha.74

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.74
  - @brains/auth-service@0.2.0-alpha.74
  - @brains/plugins@0.2.0-alpha.74

## 0.2.0-alpha.73

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.73
  - @brains/auth-service@0.2.0-alpha.73
  - @brains/plugins@0.2.0-alpha.73

## 0.2.0-alpha.72

### Patch Changes

- Updated dependencies [[`e7e4205`](https://github.com/rizom-ai/brains/commit/e7e4205282726e6c092841bc4a4c9a6b9d35efdf)]:
  - @brains/auth-service@0.2.0-alpha.72
  - @brains/utils@0.2.0-alpha.72
  - @brains/plugins@0.2.0-alpha.72

## 0.2.0-alpha.71

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.71
  - @brains/auth-service@0.2.0-alpha.71
  - @brains/plugins@0.2.0-alpha.71

## 0.2.0-alpha.70

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.70
  - @brains/auth-service@0.2.0-alpha.70
  - @brains/plugins@0.2.0-alpha.70

## 0.2.0-alpha.69

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.69
  - @brains/auth-service@0.2.0-alpha.69
  - @brains/plugins@0.2.0-alpha.69

## 0.2.0-alpha.68

### Patch Changes

- [`1642455`](https://github.com/rizom-ai/brains/commit/16424552b04fe04dab37654fe581c3995e54c887) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix dashboard light mode so plugin-owned surfaces consume light theme surface tokens instead of inverse/dark background tokens.

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.68
  - @brains/auth-service@0.2.0-alpha.68
  - @brains/plugins@0.2.0-alpha.68

## 0.2.0-alpha.67

### Patch Changes

- Updated dependencies [[`ace43f9`](https://github.com/rizom-ai/brains/commit/ace43f9c2c34db1159d6b91ba76411691e596c9f)]:
  - @brains/auth-service@0.2.0-alpha.67
  - @brains/plugins@0.2.0-alpha.67
  - @brains/utils@0.2.0-alpha.67

## 0.2.0-alpha.66

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.66
  - @brains/auth-service@0.2.0-alpha.66
  - @brains/plugins@0.2.0-alpha.66

## 0.2.0-alpha.65

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.65
  - @brains/auth-service@0.2.0-alpha.65
  - @brains/plugins@0.2.0-alpha.65

## 0.2.0-alpha.64

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.64
  - @brains/auth-service@0.2.0-alpha.64
  - @brains/plugins@0.2.0-alpha.64

## 0.2.0-alpha.63

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.63
  - @brains/auth-service@0.2.0-alpha.63
  - @brains/plugins@0.2.0-alpha.63

## 0.2.0-alpha.62

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.62
  - @brains/auth-service@0.2.0-alpha.62
  - @brains/plugins@0.2.0-alpha.62

## 0.2.0-alpha.61

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.61
  - @brains/auth-service@0.2.0-alpha.61
  - @brains/plugins@0.2.0-alpha.61

## 0.2.0-alpha.60

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.60
  - @brains/auth-service@0.2.0-alpha.60
  - @brains/plugins@0.2.0-alpha.60

## 0.2.0-alpha.59

### Patch Changes

- Updated dependencies [[`6eef964`](https://github.com/rizom-ai/brains/commit/6eef964c712f71f30301bbbaedb9b8a019f8ead5)]:
  - @brains/auth-service@0.2.0-alpha.59
  - @brains/utils@0.2.0-alpha.59
  - @brains/plugins@0.2.0-alpha.59

## 0.2.0-alpha.58

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.58
  - @brains/auth-service@0.2.0-alpha.58
  - @brains/plugins@0.2.0-alpha.58

## 0.2.0-alpha.57

### Patch Changes

- Updated dependencies [[`3a7978b`](https://github.com/rizom-ai/brains/commit/3a7978b1e53e21ddc22046ed3f421df772de4e76)]:
  - @brains/auth-service@0.2.0-alpha.57
  - @brains/utils@0.2.0-alpha.57
  - @brains/plugins@0.2.0-alpha.57

## 0.2.0-alpha.56

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.56
  - @brains/auth-service@0.2.0-alpha.56
  - @brains/plugins@0.2.0-alpha.56

## 0.2.0-alpha.55

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.55
  - @brains/auth-service@0.2.0-alpha.55
  - @brains/plugins@0.2.0-alpha.55

## 0.2.0-alpha.54

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.54
  - @brains/plugins@0.2.0-alpha.54

## 0.2.0-alpha.53

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.53
  - @brains/plugins@0.2.0-alpha.53

## 0.2.0-alpha.52

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.52
  - @brains/plugins@0.2.0-alpha.52

## 0.2.0-alpha.51

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.51
  - @brains/plugins@0.2.0-alpha.51

## 0.2.0-alpha.50

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.50
  - @brains/plugins@0.2.0-alpha.50

## 0.2.0-alpha.49

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.49
  - @brains/plugins@0.2.0-alpha.49

## 0.2.0-alpha.48

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.48
  - @brains/plugins@0.2.0-alpha.48

## 0.2.0-alpha.47

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.47
  - @brains/utils@0.2.0-alpha.47

## 0.2.0-alpha.46

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.46
  - @brains/plugins@0.2.0-alpha.46

## 0.2.0-alpha.45

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.45
  - @brains/plugins@0.2.0-alpha.45

## 0.2.0-alpha.44

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.44
  - @brains/plugins@0.2.0-alpha.44

## 0.2.0-alpha.43

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.43
  - @brains/plugins@0.2.0-alpha.43

## 0.2.0-alpha.42

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.42
  - @brains/plugins@0.2.0-alpha.42

## 0.2.0-alpha.41

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.41
  - @brains/plugins@0.2.0-alpha.41

## 0.2.0-alpha.40

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.40
  - @brains/plugins@0.2.0-alpha.40

## 0.2.0-alpha.39

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.39
  - @brains/plugins@0.2.0-alpha.39

## 0.2.0-alpha.38

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.38
  - @brains/plugins@0.2.0-alpha.38

## 0.2.0-alpha.37

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.37
  - @brains/plugins@0.2.0-alpha.37

## 0.2.0-alpha.36

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.36
  - @brains/plugins@0.2.0-alpha.36

## 0.2.0-alpha.35

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.35
  - @brains/plugins@0.2.0-alpha.35

## 0.2.0-alpha.34

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.34
  - @brains/plugins@0.2.0-alpha.34

## 0.2.0-alpha.33

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.33
  - @brains/plugins@0.2.0-alpha.33

## 0.2.0-alpha.32

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.32
  - @brains/plugins@0.2.0-alpha.32

## 0.2.0-alpha.31

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.31
  - @brains/plugins@0.2.0-alpha.31

## 0.2.0-alpha.30

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.30
  - @brains/plugins@0.2.0-alpha.30

## 0.2.0-alpha.29

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.29
  - @brains/utils@0.2.0-alpha.29
  - @brains/plugins@0.2.0-alpha.29

## 0.2.0-alpha.28

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.28
  - @brains/utils@0.2.0-alpha.28
  - @brains/plugins@0.2.0-alpha.28

## 0.2.0-alpha.27

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.27
  - @brains/utils@0.2.0-alpha.27
  - @brains/plugins@0.2.0-alpha.27

## 0.2.0-alpha.26

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.26
  - @brains/utils@0.2.0-alpha.26
  - @brains/plugins@0.2.0-alpha.26

## 0.2.0-alpha.25

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.25
  - @brains/utils@0.2.0-alpha.25
  - @brains/plugins@0.2.0-alpha.25

## 0.2.0-alpha.24

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.24
  - @brains/utils@0.2.0-alpha.24
  - @brains/plugins@0.2.0-alpha.24

## 0.2.0-alpha.23

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.23
  - @brains/utils@0.2.0-alpha.23
  - @brains/plugins@0.2.0-alpha.23

## 0.2.0-alpha.22

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.22
  - @brains/utils@0.2.0-alpha.22
  - @brains/plugins@0.2.0-alpha.22

## 0.2.0-alpha.21

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.21
  - @brains/utils@0.2.0-alpha.21
  - @brains/plugins@0.2.0-alpha.21

## 0.2.0-alpha.20

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.20
  - @brains/utils@0.2.0-alpha.20
  - @brains/plugins@0.2.0-alpha.20

## 0.2.0-alpha.19

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.19
  - @brains/utils@0.2.0-alpha.19
  - @brains/plugins@0.2.0-alpha.19

## 0.2.0-alpha.18

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.18
  - @brains/utils@0.2.0-alpha.18
  - @brains/plugins@0.2.0-alpha.18

## 0.2.0-alpha.17

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.17
  - @brains/utils@0.2.0-alpha.17
  - @brains/plugins@0.2.0-alpha.17

## 0.2.0-alpha.16

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.16
  - @brains/utils@0.2.0-alpha.16
  - @brains/plugins@0.2.0-alpha.16

## 0.2.0-alpha.15

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.15
  - @brains/utils@0.2.0-alpha.15
  - @brains/plugins@0.2.0-alpha.15

## 0.2.0-alpha.14

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.14
  - @brains/utils@0.2.0-alpha.14
  - @brains/plugins@0.2.0-alpha.14

## 0.2.0-alpha.13

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.13
  - @brains/utils@0.2.0-alpha.13
  - @brains/plugins@0.2.0-alpha.13

## 0.2.0-alpha.12

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.12
  - @brains/utils@0.2.0-alpha.12
  - @brains/plugins@0.2.0-alpha.12

## 0.2.0-alpha.11

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.11
  - @brains/utils@0.2.0-alpha.11
  - @brains/plugins@0.2.0-alpha.11

## 0.2.0-alpha.10

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.10
  - @brains/utils@0.2.0-alpha.10
  - @brains/plugins@0.2.0-alpha.10

## 0.2.0-alpha.9

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.9
  - @brains/utils@0.2.0-alpha.9
  - @brains/plugins@0.2.0-alpha.9

## 0.2.0-alpha.8

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.8
  - @brains/utils@0.2.0-alpha.8
  - @brains/plugins@0.2.0-alpha.8

## 0.2.0-alpha.7

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.7
  - @brains/utils@0.2.0-alpha.7
  - @brains/plugins@0.2.0-alpha.7

## 0.2.0-alpha.6

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.6
  - @brains/utils@0.2.0-alpha.6
  - @brains/plugins@0.2.0-alpha.6

## 0.2.0-alpha.5

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.5
  - @brains/utils@0.2.0-alpha.5
  - @brains/plugins@0.2.0-alpha.5

## 0.2.0-alpha.4

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.4
  - @brains/utils@0.2.0-alpha.4
  - @brains/plugins@0.2.0-alpha.4

## 0.2.0-alpha.3

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.3
  - @brains/utils@0.2.0-alpha.3
  - @brains/plugins@0.2.0-alpha.3

## 0.2.0-alpha.2

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.2
  - @brains/utils@0.2.0-alpha.2
  - @brains/plugins@0.2.0-alpha.2

## 0.2.0-alpha.1

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.1
  - @brains/utils@0.2.0-alpha.1
  - @brains/plugins@0.2.0-alpha.1

## 1.0.1-alpha.17

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@1.0.1-alpha.17
  - @brains/utils@1.0.1-alpha.17
  - @brains/plugins@1.0.1-alpha.17

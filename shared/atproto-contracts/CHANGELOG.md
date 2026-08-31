# @brains/atproto-contracts

## 0.2.0-alpha.340

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.340
  - @brains/entity-service@0.2.0-alpha.340

## 0.2.0-alpha.339

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.339
  - @brains/entity-service@0.2.0-alpha.339

## 0.2.0-alpha.338

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.338
  - @brains/entity-service@0.2.0-alpha.338

## 0.2.0-alpha.337

### Patch Changes

- Updated dependencies [[`a7396a4`](https://github.com/rizom-ai/brains/commit/a7396a4a8896361c8fe4228528e3ff846e5bec56)]:
  - @brains/entity-service@0.2.0-alpha.337
  - @brains/utils@0.2.0-alpha.337

## 0.2.0-alpha.336

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.336
  - @brains/entity-service@0.2.0-alpha.336

## 0.2.0-alpha.335

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.335
  - @brains/entity-service@0.2.0-alpha.335

## 0.2.0-alpha.334

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.334
  - @brains/entity-service@0.2.0-alpha.334

## 0.2.0-alpha.333

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.333
  - @brains/entity-service@0.2.0-alpha.333

## 0.2.0-alpha.332

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.332
  - @brains/entity-service@0.2.0-alpha.332

## 0.2.0-alpha.331

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.331
  - @brains/entity-service@0.2.0-alpha.331

## 0.2.0-alpha.330

### Patch Changes

- Updated dependencies []:
  - @brains/entity-service@0.2.0-alpha.330
  - @brains/utils@0.2.0-alpha.330

## 0.2.0-alpha.329

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.329
  - @brains/entity-service@0.2.0-alpha.329

## 0.2.0-alpha.328

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.328
  - @brains/entity-service@0.2.0-alpha.328

## 0.2.0-alpha.327

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.327
  - @brains/entity-service@0.2.0-alpha.327

## 0.2.0-alpha.326

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.326
  - @brains/entity-service@0.2.0-alpha.326

## 0.2.0-alpha.325

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.325
  - @brains/entity-service@0.2.0-alpha.325

## 0.2.0-alpha.324

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.324
  - @brains/entity-service@0.2.0-alpha.324

## 0.2.0-alpha.323

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.323
  - @brains/entity-service@0.2.0-alpha.323

## 0.2.0-alpha.322

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.322
  - @brains/entity-service@0.2.0-alpha.322

## 0.2.0-alpha.321

### Patch Changes

- Updated dependencies [[`f9bd1c6`](https://github.com/rizom-ai/brains/commit/f9bd1c6291f560a5bb679357d199f1af29005d63)]:
  - @brains/entity-service@0.2.0-alpha.321
  - @brains/utils@0.2.0-alpha.321

## 0.2.0-alpha.320

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.320
  - @brains/entity-service@0.2.0-alpha.320

## 0.2.0-alpha.319

### Patch Changes

- [#157](https://github.com/rizom-ai/brains/pull/157) [`df1af02`](https://github.com/rizom-ai/brains/commit/df1af02e2e0f0e1c3c7fe0580bde1aa65edbccc7) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Unify public skill extraction across A2A and ATProto cards, and allow federation-only brains to publish cards without a web channel or site URL.

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.319
  - @brains/entity-service@0.2.0-alpha.319

## 0.2.0-alpha.318

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.318
  - @brains/entity-service@0.2.0-alpha.318

## 0.2.0-alpha.317

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.317
  - @brains/entity-service@0.2.0-alpha.317

## 0.2.0-alpha.316

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.316
  - @brains/entity-service@0.2.0-alpha.316

## 0.2.0-alpha.315

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.315
  - @brains/entity-service@0.2.0-alpha.315

## 0.2.0-alpha.314

### Patch Changes

- [`ae06107`](https://github.com/rizom-ai/brains/commit/ae06107694a825378e23183c26261c91166edfdf) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Reject record fields the lexicon does not declare.

  Record schemas were built with `.passthrough()` and strictness was reinstated
  for `ai.rizom.brain.card` alone, through a hardcoded list of allowed field names
  that duplicated the card lexicon. Eight of the nine canonical records therefore
  accepted and retained arbitrary undeclared fields, and adding a property to the
  card lexicon without editing that list would have made valid records fail.

  Strictness now comes from each lexicon's own property set, so it covers nested
  objects and any lexicon added later. `refineBrainCardRecord` and its field lists
  are gone.

  Publishing a record carrying a field its lexicon does not declare now fails
  locally instead of reaching the PDS. The canonical projections were checked and
  already conform; only a narrow test stub did not.

- Updated dependencies [[`fd2855e`](https://github.com/rizom-ai/brains/commit/fd2855ea09d880ebf4268ce6f9a53d4cb9289c07)]:
  - @brains/entity-service@0.2.0-alpha.314
  - @brains/utils@0.2.0-alpha.314

## 0.2.0-alpha.313

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.313
  - @brains/entity-service@0.2.0-alpha.313

## 0.2.0-alpha.312

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.312
  - @brains/entity-service@0.2.0-alpha.312

## 0.2.0-alpha.311

### Patch Changes

- Updated dependencies [[`0b4d2bc`](https://github.com/rizom-ai/brains/commit/0b4d2bca39b83d60183c0040f63f4bb9c2f9d029)]:
  - @brains/utils@0.2.0-alpha.311
  - @brains/entity-service@0.2.0-alpha.311

## 0.2.0-alpha.310

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.310
  - @brains/entity-service@0.2.0-alpha.310

## 0.2.0-alpha.309

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.309
  - @brains/entity-service@0.2.0-alpha.309

## 0.2.0-alpha.308

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.308
  - @brains/entity-service@0.2.0-alpha.308

## 0.2.0-alpha.307

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.307
  - @brains/entity-service@0.2.0-alpha.307

## 0.2.0-alpha.306

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.306
  - @brains/entity-service@0.2.0-alpha.306

## 0.2.0-alpha.305

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.305
  - @brains/entity-service@0.2.0-alpha.305

## 0.2.0-alpha.304

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.304
  - @brains/entity-service@0.2.0-alpha.304

## 0.2.0-alpha.303

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.303
  - @brains/entity-service@0.2.0-alpha.303

## 0.2.0-alpha.302

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.302
  - @brains/entity-service@0.2.0-alpha.302

## 0.2.0-alpha.301

### Patch Changes

- Updated dependencies [[`b2fd00c`](https://github.com/rizom-ai/brains/commit/b2fd00c1550e0b9a386484e07a53546106f793ce)]:
  - @brains/entity-service@0.2.0-alpha.301
  - @brains/utils@0.2.0-alpha.301

## 0.2.0-alpha.300

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.300
  - @brains/entity-service@0.2.0-alpha.300

## 0.2.0-alpha.299

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.299
  - @brains/entity-service@0.2.0-alpha.299

## 0.2.0-alpha.298

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.298
  - @brains/entity-service@0.2.0-alpha.298

## 0.2.0-alpha.297

### Patch Changes

- Updated dependencies []:
  - @brains/entity-service@0.2.0-alpha.297
  - @brains/utils@0.2.0-alpha.297

## 0.2.0-alpha.296

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.296
  - @brains/entity-service@0.2.0-alpha.296

## 0.2.0-alpha.295

### Patch Changes

- Updated dependencies []:
  - @brains/entity-service@0.2.0-alpha.295
  - @brains/utils@0.2.0-alpha.295

## 0.2.0-alpha.294

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.294
  - @brains/entity-service@0.2.0-alpha.294

## 0.2.0-alpha.293

### Patch Changes

- Updated dependencies []:
  - @brains/entity-service@0.2.0-alpha.293
  - @brains/utils@0.2.0-alpha.293

## 0.2.0-alpha.292

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.292
  - @brains/entity-service@0.2.0-alpha.292

## 0.2.0-alpha.291

### Patch Changes

- Updated dependencies []:
  - @brains/entity-service@0.2.0-alpha.291
  - @brains/utils@0.2.0-alpha.291

## 0.2.0-alpha.290

### Patch Changes

- Updated dependencies []:
  - @brains/entity-service@0.2.0-alpha.290
  - @brains/utils@0.2.0-alpha.290

## 0.2.0-alpha.289

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.289
  - @brains/entity-service@0.2.0-alpha.289

## 0.2.0-alpha.288

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.288
  - @brains/entity-service@0.2.0-alpha.288

## 0.2.0-alpha.287

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.287
  - @brains/entity-service@0.2.0-alpha.287

## 0.2.0-alpha.286

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.286
  - @brains/entity-service@0.2.0-alpha.286

## 0.2.0-alpha.285

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.285
  - @brains/entity-service@0.2.0-alpha.285

## 0.2.0-alpha.284

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.284
  - @brains/entity-service@0.2.0-alpha.284

## 0.2.0-alpha.283

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.283
  - @brains/entity-service@0.2.0-alpha.283

## 0.2.0-alpha.282

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.282
  - @brains/entity-service@0.2.0-alpha.282

## 0.2.0-alpha.281

### Patch Changes

- Updated dependencies [[`c6b44ae`](https://github.com/rizom-ai/brains/commit/c6b44ae420bc0c4c92c2081bfbc320c00987db79)]:
  - @brains/entity-service@0.2.0-alpha.281
  - @brains/utils@0.2.0-alpha.281

## 0.2.0-alpha.280

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.280
  - @brains/entity-service@0.2.0-alpha.280

## 0.2.0-alpha.279

### Patch Changes

- Updated dependencies [[`bd1eb47`](https://github.com/rizom-ai/brains/commit/bd1eb4768ee154570f5ba144f59a145c7f00aa51)]:
  - @brains/entity-service@0.2.0-alpha.279
  - @brains/utils@0.2.0-alpha.279

## 0.2.0-alpha.278

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.278
  - @brains/entity-service@0.2.0-alpha.278

## 0.2.0-alpha.277

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.277
  - @brains/entity-service@0.2.0-alpha.277

## 0.2.0-alpha.276

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.276
  - @brains/entity-service@0.2.0-alpha.276

## 0.2.0-alpha.275

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.275
  - @brains/entity-service@0.2.0-alpha.275

## 0.2.0-alpha.274

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.274
  - @brains/entity-service@0.2.0-alpha.274

## 0.2.0-alpha.273

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.273
  - @brains/entity-service@0.2.0-alpha.273

## 0.2.0-alpha.272

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.272
  - @brains/entity-service@0.2.0-alpha.272

## 0.2.0-alpha.271

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.271
  - @brains/entity-service@0.2.0-alpha.271

## 0.2.0-alpha.270

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.270
  - @brains/entity-service@0.2.0-alpha.270

## 0.2.0-alpha.269

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.269
  - @brains/entity-service@0.2.0-alpha.269

## 0.2.0-alpha.268

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.268
  - @brains/entity-service@0.2.0-alpha.268

## 0.2.0-alpha.267

### Patch Changes

- Updated dependencies []:
  - @brains/entity-service@0.2.0-alpha.267
  - @brains/utils@0.2.0-alpha.267

## 0.2.0-alpha.266

### Patch Changes

- Updated dependencies [[`e70ab12`](https://github.com/rizom-ai/brains/commit/e70ab12745c6cf757f685389f4cd6de8991de95f)]:
  - @brains/utils@0.2.0-alpha.266
  - @brains/entity-service@0.2.0-alpha.266

## 0.2.0-alpha.265

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.265
  - @brains/entity-service@0.2.0-alpha.265

## 0.2.0-alpha.264

### Patch Changes

- Updated dependencies []:
  - @brains/entity-service@0.2.0-alpha.264
  - @brains/utils@0.2.0-alpha.264

## 0.2.0-alpha.263

### Patch Changes

- Updated dependencies []:
  - @brains/entity-service@0.2.0-alpha.263
  - @brains/utils@0.2.0-alpha.263

## 0.2.0-alpha.262

### Patch Changes

- Updated dependencies []:
  - @brains/entity-service@0.2.0-alpha.262
  - @brains/utils@0.2.0-alpha.262

## 0.2.0-alpha.261

### Patch Changes

- Updated dependencies []:
  - @brains/entity-service@0.2.0-alpha.261
  - @brains/utils@0.2.0-alpha.261

## 0.2.0-alpha.260

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.260
  - @brains/entity-service@0.2.0-alpha.260

## 0.2.0-alpha.259

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.259
  - @brains/entity-service@0.2.0-alpha.259

## 0.2.0-alpha.258

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.258
  - @brains/entity-service@0.2.0-alpha.258

## 0.2.0-alpha.257

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.257
  - @brains/entity-service@0.2.0-alpha.257

## 0.2.0-alpha.256

### Patch Changes

- Updated dependencies [[`1e45eca`](https://github.com/rizom-ai/brains/commit/1e45ecaaed5351964cbf8a0754a301507b15c298)]:
  - @brains/utils@0.2.0-alpha.256
  - @brains/entity-service@0.2.0-alpha.256

## 0.2.0-alpha.255

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.255
  - @brains/entity-service@0.2.0-alpha.255

## 0.2.0-alpha.254

### Patch Changes

- Updated dependencies [[`a7e1a8f`](https://github.com/rizom-ai/brains/commit/a7e1a8f9d467ad7d04aafa5c49b50aa4cae2ca99)]:
  - @brains/entity-service@0.2.0-alpha.254
  - @brains/utils@0.2.0-alpha.254

## 0.2.0-alpha.253

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.253
  - @brains/entity-service@0.2.0-alpha.253

## 0.2.0-alpha.252

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.252
  - @brains/entity-service@0.2.0-alpha.252

## 0.2.0-alpha.251

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.251
  - @brains/entity-service@0.2.0-alpha.251

## 0.2.0-alpha.250

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.250
  - @brains/entity-service@0.2.0-alpha.250

## 0.2.0-alpha.249

### Patch Changes

- Updated dependencies []:
  - @brains/entity-service@0.2.0-alpha.249
  - @brains/utils@0.2.0-alpha.249

## 0.2.0-alpha.248

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.248
  - @brains/entity-service@0.2.0-alpha.248

## 0.2.0-alpha.247

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.247
  - @brains/entity-service@0.2.0-alpha.247

## 0.2.0-alpha.246

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.246
  - @brains/entity-service@0.2.0-alpha.246

## 0.2.0-alpha.245

### Patch Changes

- Updated dependencies []:
  - @brains/entity-service@0.2.0-alpha.245
  - @brains/utils@0.2.0-alpha.245

## 0.2.0-alpha.244

### Patch Changes

- Updated dependencies []:
  - @brains/entity-service@0.2.0-alpha.244
  - @brains/utils@0.2.0-alpha.244

## 0.2.0-alpha.243

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.243
  - @brains/entity-service@0.2.0-alpha.243

## 0.2.0-alpha.242

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.242
  - @brains/entity-service@0.2.0-alpha.242

## 0.2.0-alpha.241

### Patch Changes

- Updated dependencies []:
  - @brains/entity-service@0.2.0-alpha.241
  - @brains/utils@0.2.0-alpha.241

## 0.2.0-alpha.240

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.240
  - @brains/entity-service@0.2.0-alpha.240

## 0.2.0-alpha.239

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.239
  - @brains/entity-service@0.2.0-alpha.239

## 0.2.0-alpha.238

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.238
  - @brains/entity-service@0.2.0-alpha.238

## 0.2.0-alpha.237

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.237
  - @brains/entity-service@0.2.0-alpha.237

## 0.2.0-alpha.236

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.236
  - @brains/entity-service@0.2.0-alpha.236

## 0.2.0-alpha.235

### Patch Changes

- Updated dependencies []:
  - @brains/entity-service@0.2.0-alpha.235
  - @brains/utils@0.2.0-alpha.235

## 0.2.0-alpha.234

### Patch Changes

- Updated dependencies [[`afa5cf4`](https://github.com/rizom-ai/brains/commit/afa5cf4cbdf75400b180d4bb89ed46dd4e6097cc)]:
  - @brains/entity-service@0.2.0-alpha.234
  - @brains/utils@0.2.0-alpha.234

## 0.2.0-alpha.233

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.233
  - @brains/entity-service@0.2.0-alpha.233

## 0.2.0-alpha.232

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.232
  - @brains/entity-service@0.2.0-alpha.232

## 0.2.0-alpha.231

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.231
  - @brains/entity-service@0.2.0-alpha.231

## 0.2.0-alpha.230

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.230
  - @brains/entity-service@0.2.0-alpha.230

## 0.2.0-alpha.229

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.229
  - @brains/entity-service@0.2.0-alpha.229

## 0.2.0-alpha.228

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.228
  - @brains/entity-service@0.2.0-alpha.228

## 0.2.0-alpha.227

### Patch Changes

- [`500a6dc`](https://github.com/rizom-ai/brains/commit/500a6dc284a590e1e9bb6af9fa0995332eeb8c58) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add the Admin-only People section in the standalone Admin console and migrate browser authentication from legacy operator terminology to role-aware auth sessions. Existing session rows and legacy browser cookies remain compatible through an explicit, release-gated migration window. Legacy dashboard `needsOperator` registration inputs remain accepted and normalize to `needsAttention`.

- Updated dependencies [[`500a6dc`](https://github.com/rizom-ai/brains/commit/500a6dc284a590e1e9bb6af9fa0995332eeb8c58), [`5c1bed1`](https://github.com/rizom-ai/brains/commit/5c1bed1134f92701f4ead9b25a6f432cd208ac29)]:
  - @brains/entity-service@0.2.0-alpha.227
  - @brains/utils@0.2.0-alpha.227

## 0.2.0-alpha.226

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.226
  - @brains/entity-service@0.2.0-alpha.226

## 0.2.0-alpha.225

### Patch Changes

- [`b0001fb`](https://github.com/rizom-ai/brains/commit/b0001fb102c030855586d92c4abef67004ae7987) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Move optional semantic profile kind selection into `brain.yaml`, derive a closed structural category through an app-scoped finalized registry, validate profile persistence with the selected kind schema, and publish the new `{ kind, category }` A2A and ATProto card contract.

- Updated dependencies [[`b0001fb`](https://github.com/rizom-ai/brains/commit/b0001fb102c030855586d92c4abef67004ae7987)]:
  - @brains/entity-service@0.2.0-alpha.225
  - @brains/utils@0.2.0-alpha.225

## 0.2.0-alpha.224

### Patch Changes

- [`b7c5df6`](https://github.com/rizom-ai/brains/commit/b7c5df61ebe0aa44f6b786695f16daa7ee151e61) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add bounded, authority-refetched ATProto Jetstream discovery with safe public egress, durable replay state, identity-collision protection, staleness handling, heartbeat publishing, review digests, and per-brain canary configuration.

- Updated dependencies [[`b7c5df6`](https://github.com/rizom-ai/brains/commit/b7c5df61ebe0aa44f6b786695f16daa7ee151e61)]:
  - @brains/utils@0.2.0-alpha.224
  - @brains/entity-service@0.2.0-alpha.224

## 0.2.0-alpha.223

### Patch Changes

- [`09ee4c2`](https://github.com/rizom-ai/brains/commit/09ee4c2d56b5f5c7044aa1ee3785a0ec74d29328) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Harden atproto boot publishing and cross-version discovery. `ready()` now
  schedules its card/lexicon publishes instead of awaiting them (an
  unresponsive PDS can no longer stall startup), publishes only on a full boot
  (startup-check mode stays side-effect free), and every PDS request carries a
  30s timeout. Discovery converts cross-version anchor kinds
  (`person`→`professional`, `organization`→`collective`) into the running
  build's vocabulary via `normalizeDiscoveredBrainCard`, so the upcoming kind
  rename cannot break card exchange between fleet versions.
- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.223
  - @brains/entity-service@0.2.0-alpha.223

## 0.2.0-alpha.222

### Patch Changes

- Updated dependencies []:
  - @brains/entity-service@0.2.0-alpha.222
  - @brains/utils@0.2.0-alpha.222

## 0.2.0-alpha.221

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.221
  - @brains/entity-service@0.2.0-alpha.221

## 0.2.0-alpha.220

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.220
  - @brains/entity-service@0.2.0-alpha.220

## 0.2.0-alpha.219

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.219
  - @brains/entity-service@0.2.0-alpha.219

## 0.2.0-alpha.218

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.218
  - @brains/entity-service@0.2.0-alpha.218

## 0.2.0-alpha.217

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.217
  - @brains/entity-service@0.2.0-alpha.217

## 0.2.0-alpha.216

### Patch Changes

- [`6cce234`](https://github.com/rizom-ai/brains/commit/6cce2342c28f7e68be2b047afcb9d82bbba540b2) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Validate ref-typed lexicon fields against their named object defs. The ref
  restructure left `buildAtprotoFieldSchema` without a `ref` case, so nested
  card/anchor/skill, post coverImage, and link source shapes fell through to
  `z.unknown()` and untrusted discovery input passed record validation
  unchecked. Local `#name` refs now resolve against `lexicon.defs`;
  unresolvable refs fail closed.
- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.216
  - @brains/entity-service@0.2.0-alpha.216

## 0.2.0-alpha.215

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.215
  - @brains/entity-service@0.2.0-alpha.215

## 0.2.0-alpha.214

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.214
  - @brains/entity-service@0.2.0-alpha.214

## 0.2.0-alpha.213

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.213
  - @brains/entity-service@0.2.0-alpha.213

## 0.2.0-alpha.212

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.212
  - @brains/entity-service@0.2.0-alpha.212

## 0.2.0-alpha.211

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.211
  - @brains/entity-service@0.2.0-alpha.211

## 0.2.0-alpha.210

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.210
  - @brains/entity-service@0.2.0-alpha.210

## 0.2.0-alpha.209

### Patch Changes

- [`80ac02e`](https://github.com/rizom-ai/brains/commit/80ac02e00bfea91ae1495f1aab1dde97756be6a7) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Restructure the card, link, and post lexicons to hoist inline nested objects into named defs referenced via `type: "ref"`, making every canonical lexicon valid under the official AT Protocol lexicon parser (third-party viewers rejected the published schemas as invalid), and gate spec validity with an `@atproto/lexicon` conformance test.

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.209
  - @brains/entity-service@0.2.0-alpha.209

## 0.2.0-alpha.208

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.208
  - @brains/entity-service@0.2.0-alpha.208

## 0.2.0-alpha.207

### Patch Changes

- [#60](https://github.com/rizom-ai/brains/pull/60) [`2311745`](https://github.com/rizom-ai/brains/commit/2311745a5b07b4315eda2b7e963675a1703a0d5f) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Wire AT Protocol publishing to runtime events so configured brains refresh their card, mirror public projected entities, remove stale records, and isolate PDS failures from local operations.

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.207
  - @brains/entity-service@0.2.0-alpha.207

## 0.2.0-alpha.206

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.206
  - @brains/entity-service@0.2.0-alpha.206

## 0.2.0-alpha.205

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.205
  - @brains/entity-service@0.2.0-alpha.205

## 0.2.0-alpha.204

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.204
  - @brains/entity-service@0.2.0-alpha.204

## 0.2.0-alpha.203

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.203
  - @brains/entity-service@0.2.0-alpha.203

## 0.2.0-alpha.202

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.202
  - @brains/entity-service@0.2.0-alpha.202

## 0.2.0-alpha.201

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.201
  - @brains/entity-service@0.2.0-alpha.201

## 0.2.0-alpha.200

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.200
  - @brains/entity-service@0.2.0-alpha.200

## 0.2.0-alpha.199

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.199
  - @brains/entity-service@0.2.0-alpha.199

## 0.2.0-alpha.198

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.198
  - @brains/entity-service@0.2.0-alpha.198

## 0.2.0-alpha.197

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.197
  - @brains/entity-service@0.2.0-alpha.197

## 0.2.0-alpha.196

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.196
  - @brains/entity-service@0.2.0-alpha.196

## 0.2.0-alpha.195

### Patch Changes

- Updated dependencies []:
  - @brains/entity-service@0.2.0-alpha.195
  - @brains/utils@0.2.0-alpha.195

## 0.2.0-alpha.194

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.194
  - @brains/entity-service@0.2.0-alpha.194

## 0.2.0-alpha.193

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.193
  - @brains/entity-service@0.2.0-alpha.193

## 0.2.0-alpha.192

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.192
  - @brains/entity-service@0.2.0-alpha.192

## 0.2.0-alpha.191

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.191
  - @brains/entity-service@0.2.0-alpha.191

## 0.2.0-alpha.190

### Patch Changes

- [`a49c285`](https://github.com/rizom-ai/brains/commit/a49c285cc11b4a8e1c5640e267de8076953b15ba) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Preserve defs.main.description when parsing canonical lexicons. zod strips
  undeclared keys, so the registry published all nine ai.rizom.brain.* lexicons
  shorn of their authored descriptions.
- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.190
  - @brains/entity-service@0.2.0-alpha.190

## 0.2.0-alpha.189

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.189
  - @brains/entity-service@0.2.0-alpha.189

## 0.2.0-alpha.188

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.188
  - @brains/entity-service@0.2.0-alpha.188

## 0.2.0-alpha.187

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.187
  - @brains/entity-service@0.2.0-alpha.187

## 0.2.0-alpha.186

### Patch Changes

- Updated dependencies [[`143788b`](https://github.com/rizom-ai/brains/commit/143788beb9544649f3d1bac16bcea605c36cd94a)]:
  - @brains/entity-service@0.2.0-alpha.186
  - @brains/utils@0.2.0-alpha.186

## 0.2.0-alpha.185

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.185
  - @brains/entity-service@0.2.0-alpha.185

## 0.2.0-alpha.184

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.184
  - @brains/entity-service@0.2.0-alpha.184

## 0.2.0-alpha.183

### Patch Changes

- Updated dependencies [[`197cc09`](https://github.com/rizom-ai/brains/commit/197cc0988a47f80e3e21b5f4adf034003ea3527e)]:
  - @brains/entity-service@0.2.0-alpha.183
  - @brains/utils@0.2.0-alpha.183

## 0.2.0-alpha.182

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.182
  - @brains/entity-service@0.2.0-alpha.182

## 0.2.0-alpha.181

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.181
  - @brains/entity-service@0.2.0-alpha.181

## 0.2.0-alpha.180

### Patch Changes

- Updated dependencies [[`3a7bb4a`](https://github.com/rizom-ai/brains/commit/3a7bb4a6bce7789d4bf82e151aee1e35c66ac184)]:
  - @brains/entity-service@0.2.0-alpha.180
  - @brains/utils@0.2.0-alpha.180

## 0.2.0-alpha.179

### Patch Changes

- Updated dependencies [[`31866d8`](https://github.com/rizom-ai/brains/commit/31866d8598f83241217b9281419f36b67e9c1970)]:
  - @brains/entity-service@0.2.0-alpha.179
  - @brains/utils@0.2.0-alpha.179

## 0.2.0-alpha.178

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.178
  - @brains/entity-service@0.2.0-alpha.178

## 0.2.0-alpha.177

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.177
  - @brains/entity-service@0.2.0-alpha.177

## 0.2.0-alpha.176

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.176
  - @brains/entity-service@0.2.0-alpha.176

## 0.2.0-alpha.175

### Patch Changes

- Updated dependencies []:
  - @brains/entity-service@0.2.0-alpha.175
  - @brains/utils@0.2.0-alpha.175

## 0.2.0-alpha.174

### Patch Changes

- Updated dependencies [[`eaf9f49`](https://github.com/rizom-ai/brains/commit/eaf9f490ca36f74535fd56b0f549f49de899defe)]:
  - @brains/entity-service@0.2.0-alpha.174
  - @brains/utils@0.2.0-alpha.174

## 0.2.0-alpha.173

### Patch Changes

- Updated dependencies [[`8427031`](https://github.com/rizom-ai/brains/commit/84270311c343964449d96c4cd60e4066daac4aef)]:
  - @brains/entity-service@0.2.0-alpha.173
  - @brains/utils@0.2.0-alpha.173

## 0.2.0-alpha.172

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.172
  - @brains/entity-service@0.2.0-alpha.172

## 0.2.0-alpha.171

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.171
  - @brains/entity-service@0.2.0-alpha.171

## 0.2.0-alpha.170

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.170
  - @brains/entity-service@0.2.0-alpha.170

## 0.2.0-alpha.169

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.169
  - @brains/entity-service@0.2.0-alpha.169

## 0.2.0-alpha.168

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.168
  - @brains/entity-service@0.2.0-alpha.168

## 0.2.0-alpha.167

### Patch Changes

- Updated dependencies []:
  - @brains/entity-service@0.2.0-alpha.167
  - @brains/utils@0.2.0-alpha.167

## 0.2.0-alpha.166

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.166
  - @brains/entity-service@0.2.0-alpha.166

## 0.2.0-alpha.165

### Patch Changes

- Updated dependencies []:
  - @brains/entity-service@0.2.0-alpha.165
  - @brains/utils@0.2.0-alpha.165

## 0.2.0-alpha.164

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.164
  - @brains/entity-service@0.2.0-alpha.164

## 0.2.0-alpha.163

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.163
  - @brains/entity-service@0.2.0-alpha.163

## 0.2.0-alpha.162

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.162
  - @brains/entity-service@0.2.0-alpha.162

## 0.2.0-alpha.161

### Patch Changes

- Updated dependencies [[`61c6862`](https://github.com/rizom-ai/brains/commit/61c68624c0ae21f9d00d307db02ce5a1439d2765)]:
  - @brains/entity-service@0.2.0-alpha.161
  - @brains/utils@0.2.0-alpha.161

## 0.2.0-alpha.160

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.160
  - @brains/entity-service@0.2.0-alpha.160

## 0.2.0-alpha.159

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.159
  - @brains/entity-service@0.2.0-alpha.159

## 0.2.0-alpha.158

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.158
  - @brains/entity-service@0.2.0-alpha.158

## 0.2.0-alpha.157

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.157
  - @brains/entity-service@0.2.0-alpha.157

## 0.2.0-alpha.156

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.156
  - @brains/entity-service@0.2.0-alpha.156

## 0.2.0-alpha.155

### Patch Changes

- Updated dependencies []:
  - @brains/entity-service@0.2.0-alpha.155
  - @brains/utils@0.2.0-alpha.155

## 0.2.0-alpha.154

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.154
  - @brains/entity-service@0.2.0-alpha.154

## 0.2.0-alpha.153

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.153
  - @brains/entity-service@0.2.0-alpha.153

## 0.2.0-alpha.152

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.152
  - @brains/entity-service@0.2.0-alpha.152

## 0.2.0-alpha.151

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.151
  - @brains/entity-service@0.2.0-alpha.151

## 0.2.0-alpha.150

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.150
  - @brains/entity-service@0.2.0-alpha.150

## 0.2.0-alpha.149

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.149
  - @brains/entity-service@0.2.0-alpha.149

## 0.2.0-alpha.148

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.148
  - @brains/entity-service@0.2.0-alpha.148

## 0.2.0-alpha.147

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.147
  - @brains/entity-service@0.2.0-alpha.147

## 0.2.0-alpha.146

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.146
  - @brains/entity-service@0.2.0-alpha.146

## 0.2.0-alpha.145

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.145
  - @brains/entity-service@0.2.0-alpha.145

## 0.2.0-alpha.144

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.144
  - @brains/entity-service@0.2.0-alpha.144

## 0.2.0-alpha.143

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.143
  - @brains/entity-service@0.2.0-alpha.143

## 0.2.0-alpha.142

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.142
  - @brains/entity-service@0.2.0-alpha.142

## 0.2.0-alpha.141

### Patch Changes

- Updated dependencies [[`96bd98f`](https://github.com/rizom-ai/brains/commit/96bd98f4fd20e54968c69285a69144158c460bd7)]:
  - @brains/entity-service@0.2.0-alpha.141
  - @brains/utils@0.2.0-alpha.141

## 0.2.0-alpha.140

### Patch Changes

- [`070541b`](https://github.com/rizom-ai/brains/commit/070541b535e3977c8fe2d590ae7ad114cee09417) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Codebase review fixes: validate A2A agent card endpoints before posting (SSRF guard); fail entity/embedding DB migration loudly at boot; report entity-not-found on update instead of phantom success; replace fake batch roots with explicit silent jobs; make broadcast dispatch concurrent; atomic JSON stores in auth-service with corrupt-file quarantine; honest buttondown duplicate detection and auto-send failure reporting; honest stock-photo cover status; MCP session idle eviction, dead handler removal, constant-time token compare; Discord typing indicator leak fix; note upload/generation id collision fixes; preserve zod error detail in structured content formatter; fold cms-config into cms plugin; remove dead packages (product-site-content, rizom-ui) and dead exports.

- [`f30d603`](https://github.com/rizom-ai/brains/commit/f30d603ef2384df63381227754f8178ef6b88a06) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Tech-debt sweep: dashboard CSS extracted to a real stylesheet; deploy scaffolding forks (push-target, run-subprocess, push-secrets, ssh-key-bootstrap) consolidated into @brains/deploy-support with drift-guard tests; atproto-contracts split into modules with the @brains/plugins dependency removed; hackmd, notion, plugin-examples, and mcp-bridge plugins deleted (zero consumers).

- Updated dependencies [[`070541b`](https://github.com/rizom-ai/brains/commit/070541b535e3977c8fe2d590ae7ad114cee09417), [`a30edc7`](https://github.com/rizom-ai/brains/commit/a30edc7ac66807c66cba2bc94e78206f133710d6), [`cea906c`](https://github.com/rizom-ai/brains/commit/cea906c689d40dee5f06ab949d5289c2660bfd37)]:
  - @brains/entity-service@0.2.0-alpha.140
  - @brains/utils@0.2.0-alpha.140

## 0.2.0-alpha.139

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.139
  - @brains/plugins@0.2.0-alpha.139

## 0.2.0-alpha.138

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.138
  - @brains/plugins@0.2.0-alpha.138

## 0.2.0-alpha.137

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.137
  - @brains/plugins@0.2.0-alpha.137

## 0.2.0-alpha.136

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.136
  - @brains/plugins@0.2.0-alpha.136

## 0.2.0-alpha.135

### Patch Changes

- Updated dependencies [[`37db2bc`](https://github.com/rizom-ai/brains/commit/37db2bc759e606f42efacedd70056e9c2f440a4e)]:
  - @brains/plugins@0.2.0-alpha.135
  - @brains/utils@0.2.0-alpha.135

## 0.2.0-alpha.134

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.134
  - @brains/plugins@0.2.0-alpha.134

## 0.2.0-alpha.133

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.133
  - @brains/plugins@0.2.0-alpha.133

## 0.2.0-alpha.132

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.132
  - @brains/utils@0.2.0-alpha.132

## 0.2.0-alpha.131

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.131
  - @brains/utils@0.2.0-alpha.131

## 0.2.0-alpha.130

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.130
  - @brains/plugins@0.2.0-alpha.130

## 0.2.0-alpha.129

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.129
  - @brains/plugins@0.2.0-alpha.129

## 0.2.0-alpha.128

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.128
  - @brains/plugins@0.2.0-alpha.128

## 0.2.0-alpha.127

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.127
  - @brains/plugins@0.2.0-alpha.127

## 0.2.0-alpha.126

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.126
  - @brains/plugins@0.2.0-alpha.126

## 0.2.0-alpha.125

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.125
  - @brains/utils@0.2.0-alpha.125

## 0.2.0-alpha.124

### Patch Changes

- Updated dependencies [[`57b025e`](https://github.com/rizom-ai/brains/commit/57b025e2bf9015c3f3e46b91fbdbef766efc3d10)]:
  - @brains/plugins@0.2.0-alpha.124
  - @brains/utils@0.2.0-alpha.124

## 0.2.0-alpha.123

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.123
  - @brains/utils@0.2.0-alpha.123

## 0.2.0-alpha.122

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.122
  - @brains/plugins@0.2.0-alpha.122

## 0.2.0-alpha.121

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.121
  - @brains/plugins@0.2.0-alpha.121

## 0.2.0-alpha.120

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.120
  - @brains/plugins@0.2.0-alpha.120

## 0.2.0-alpha.119

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.119
  - @brains/utils@0.2.0-alpha.119

## 0.2.0-alpha.118

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.118
  - @brains/utils@0.2.0-alpha.118

## 0.2.0-alpha.117

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.117
  - @brains/plugins@0.2.0-alpha.117

## 0.2.0-alpha.116

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.116
  - @brains/utils@0.2.0-alpha.116

## 0.2.0-alpha.115

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.115
  - @brains/plugins@0.2.0-alpha.115

## 0.2.0-alpha.114

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.114
  - @brains/plugins@0.2.0-alpha.114

## 0.2.0-alpha.113

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.113
  - @brains/plugins@0.2.0-alpha.113

## 0.2.0-alpha.112

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.112
  - @brains/plugins@0.2.0-alpha.112

## 0.2.0-alpha.111

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.111
  - @brains/plugins@0.2.0-alpha.111

## 0.2.0-alpha.110

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.110
  - @brains/plugins@0.2.0-alpha.110

## 0.2.0-alpha.109

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.109
  - @brains/plugins@0.2.0-alpha.109

## 0.2.0-alpha.108

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.108
  - @brains/plugins@0.2.0-alpha.108

## 0.2.0-alpha.107

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.107
  - @brains/plugins@0.2.0-alpha.107

## 0.2.0-alpha.106

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.106
  - @brains/plugins@0.2.0-alpha.106

## 0.2.0-alpha.105

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.105
  - @brains/plugins@0.2.0-alpha.105

## 0.2.0-alpha.104

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.104
  - @brains/plugins@0.2.0-alpha.104

## 0.2.0-alpha.103

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.103
  - @brains/plugins@0.2.0-alpha.103

## 0.2.0-alpha.102

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.102
  - @brains/plugins@0.2.0-alpha.102

## 0.2.0-alpha.101

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.101
  - @brains/plugins@0.2.0-alpha.101

## 0.2.0-alpha.100

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.100
  - @brains/plugins@0.2.0-alpha.100

## 0.2.0-alpha.99

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.99
  - @brains/plugins@0.2.0-alpha.99

## 0.2.0-alpha.98

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.98
  - @brains/plugins@0.2.0-alpha.98

# @brains/db

## 0.2.0-alpha.321

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.321

## 0.2.0-alpha.320

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.320

## 0.2.0-alpha.319

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.319

## 0.2.0-alpha.318

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.318

## 0.2.0-alpha.317

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.317

## 0.2.0-alpha.316

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.316

## 0.2.0-alpha.315

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.315

## 0.2.0-alpha.314

### Patch Changes

- [`fd2855e`](https://github.com/rizom-ai/brains/commit/fd2855ea09d880ebf4268ce6f9a53d4cb9289c07) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Declare the drizzle column-annotation aliases once, in `@brains/db`.

  `isolatedDeclarations` makes exported tables carry explicit column types, and
  five packages had each hand-written the same sixteen-key `SQLiteColumn` config
  literal per column kind — ~420 lines of identical type machinery across seven
  schema files, drifting on which axes they exposed. The literals now live once in
  `@brains/db` (`SqliteTextColumn`, `SqliteIntegerColumn`, `SqliteJsonColumn`,
  `SqliteBooleanColumn`, `SqliteTable`) with every axis the schemas vary on as a
  parameter; schema files keep one-line local aliases that bind their table name.

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.314

## 0.2.0-alpha.313

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.313

## 0.2.0-alpha.312

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.312

## 0.2.0-alpha.311

### Patch Changes

- Updated dependencies [[`0b4d2bc`](https://github.com/rizom-ai/brains/commit/0b4d2bca39b83d60183c0040f63f4bb9c2f9d029)]:
  - @brains/utils@0.2.0-alpha.311

## 0.2.0-alpha.310

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.310

## 0.2.0-alpha.309

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.309

## 0.2.0-alpha.308

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.308

## 0.2.0-alpha.307

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.307

## 0.2.0-alpha.306

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.306

## 0.2.0-alpha.305

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.305

## 0.2.0-alpha.304

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.304

## 0.2.0-alpha.303

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.303

## 0.2.0-alpha.302

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.302

## 0.2.0-alpha.301

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.301

## 0.2.0-alpha.300

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.300

## 0.2.0-alpha.299

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.299

## 0.2.0-alpha.298

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.298

## 0.2.0-alpha.297

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.297

## 0.2.0-alpha.296

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.296

## 0.2.0-alpha.295

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.295

## 0.2.0-alpha.294

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.294

## 0.2.0-alpha.293

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.293

## 0.2.0-alpha.292

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.292

## 0.2.0-alpha.291

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.291

## 0.2.0-alpha.290

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.290

## 0.2.0-alpha.289

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.289

## 0.2.0-alpha.288

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.288

## 0.2.0-alpha.287

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.287

## 0.2.0-alpha.286

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.286

## 0.2.0-alpha.285

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.285

## 0.2.0-alpha.284

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.284

## 0.2.0-alpha.283

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.283

## 0.2.0-alpha.282

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.282

## 0.2.0-alpha.281

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.281

## 0.2.0-alpha.280

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.280

## 0.2.0-alpha.279

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.279

## 0.2.0-alpha.278

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.278

## 0.2.0-alpha.277

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.277

## 0.2.0-alpha.276

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.276

## 0.2.0-alpha.275

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.275

## 0.2.0-alpha.274

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.274

## 0.2.0-alpha.273

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.273

## 0.2.0-alpha.272

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.272

## 0.2.0-alpha.271

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.271

## 0.2.0-alpha.270

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.270

## 0.2.0-alpha.269

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.269

## 0.2.0-alpha.268

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.268

## 0.2.0-alpha.267

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.267

## 0.2.0-alpha.266

### Patch Changes

- Updated dependencies [[`e70ab12`](https://github.com/rizom-ai/brains/commit/e70ab12745c6cf757f685389f4cd6de8991de95f)]:
  - @brains/utils@0.2.0-alpha.266

## 0.2.0-alpha.265

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.265

## 0.2.0-alpha.264

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.264

## 0.2.0-alpha.263

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.263

## 0.2.0-alpha.262

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.262

## 0.2.0-alpha.261

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.261

## 0.2.0-alpha.260

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.260

## 0.2.0-alpha.259

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.259

## 0.2.0-alpha.258

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.258

## 0.2.0-alpha.257

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.257

## 0.2.0-alpha.256

### Patch Changes

- Updated dependencies [[`1e45eca`](https://github.com/rizom-ai/brains/commit/1e45ecaaed5351964cbf8a0754a301507b15c298)]:
  - @brains/utils@0.2.0-alpha.256

## 0.2.0-alpha.255

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.255

## 0.2.0-alpha.254

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.254

## 0.2.0-alpha.253

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.253

## 0.2.0-alpha.252

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.252

## 0.2.0-alpha.251

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.251

## 0.2.0-alpha.250

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.250

## 0.2.0-alpha.249

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.249

## 0.2.0-alpha.248

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.248

## 0.2.0-alpha.247

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.247

## 0.2.0-alpha.246

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.246

## 0.2.0-alpha.245

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.245

## 0.2.0-alpha.244

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.244

## 0.2.0-alpha.243

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.243

## 0.2.0-alpha.242

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.242

## 0.2.0-alpha.241

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.241

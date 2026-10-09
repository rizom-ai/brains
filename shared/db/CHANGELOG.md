# @brains/db

## 0.2.0-alpha.510

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.510

## 0.2.0-alpha.509

### Patch Changes

- Updated dependencies [[`010d171`](https://github.com/rizom-ai/brains/commit/010d1713adba894a2151af948016a2073f0cc72c)]:
  - @brains/utils@0.2.0-alpha.509

## 0.2.0-alpha.508

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.508

## 0.2.0-alpha.507

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.507

## 0.2.0-alpha.506

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.506

## 0.2.0-alpha.505

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.505

## 0.2.0-alpha.504

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.504

## 0.2.0-alpha.503

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.503

## 0.2.0-alpha.502

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.502

## 0.2.0-alpha.501

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.501

## 0.2.0-alpha.500

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.500

## 0.2.0-alpha.499

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.499

## 0.2.0-alpha.498

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.498

## 0.2.0-alpha.497

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.497

## 0.2.0-alpha.496

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.496

## 0.2.0-alpha.495

### Patch Changes

- Updated dependencies [[`a3f4b3d`](https://github.com/rizom-ai/brains/commit/a3f4b3de998dd79d4dc58f0c4bc3956960c42892), [`7d956d4`](https://github.com/rizom-ai/brains/commit/7d956d4310615b3b04d005ff11281e897731efde)]:
  - @brains/utils@0.2.0-alpha.495

## 0.2.0-alpha.494

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.494

## 0.2.0-alpha.493

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.493

## 0.2.0-alpha.492

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.492

## 0.2.0-alpha.491

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.491

## 0.2.0-alpha.490

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.490

## 0.2.0-alpha.489

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.489

## 0.2.0-alpha.488

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.488

## 0.2.0-alpha.487

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.487

## 0.2.0-alpha.486

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.486

## 0.2.0-alpha.485

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.485

## 0.2.0-alpha.484

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.484

## 0.2.0-alpha.483

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.483

## 0.2.0-alpha.482

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.482

## 0.2.0-alpha.481

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.481

## 0.2.0-alpha.480

### Patch Changes

- [#498](https://github.com/rizom-ai/brains/pull/498) [`6b1190b`](https://github.com/rizom-ai/brains/commit/6b1190b3b7f5f7274d54e4255a50a45d85fbeb78) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Local SQLite clients wait out a briefly held lock on every write path, not only when starting a transaction. Since connections stopped waiting on locks natively, a single statement, a batch or a migration that met another connection's write lock failed at once with `SQLITE_BUSY`; in production, embedding writes failed this way and the semantic index came up degraded. Standalone statements, batches and migrations now retry asynchronously under the same policy as transactions, and the retry budget is 5 seconds, as long as the native busy timeout it replaced. Statements inside an open transaction and multi-statement scripts are still never retried.

  A refused batch or migration now reopens its connection, as a refused transaction start already did, so the client stays usable for later commits. The job queue keeps its own transaction-level retries as its only contention policy: its client sets `contentionRetryBudgetMs: 0` and surfaces each refusal at once. The entity service's separate write retry is removed; its writes rely on the client's.

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.480

## 0.2.0-alpha.479

### Patch Changes

- [#497](https://github.com/rizom-ai/brains/pull/497) [`48e2464`](https://github.com/rizom-ai/brains/commit/48e2464c5531d6b9b9ee9e3b69b44f1c5df5805c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Opening a local SQLite database retries its connection pragmas when another connection briefly holds a lock, instead of failing at once. Since connections stopped waiting on locks, entering WAL mode, which needs an exclusive lock, failed immediately whenever another process was mid-write or closing the same file, so a start-up or migration racing another process could fail. Refused pragmas now retry asynchronously with the same budget and backoff as a refused transaction begin.

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.479

## 0.2.0-alpha.478

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.478

## 0.2.0-alpha.477

### Patch Changes

- [#471](https://github.com/rizom-ai/brains/pull/471) [`93832d8`](https://github.com/rizom-ai/brains/commit/93832d829d34bf719587b10c3d3d206cfb020b49) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Disable native SQLite busy waiting on application-thread connections, including local auth replicas. Retry refused BEGIN acquisition asynchronously for non-replica local clients within a two-second budget, covering auth, conversation and entity transactions without replaying callbacks or commits. Reset only refused local BEGIN connections so libSQL's retained failed statements cannot poison a later commit. Embedded replicas retain SDK-owned transaction acquisition and reconnect behavior. Route formerly unguarded export acknowledgements and projection-rule scheduling writes through BEGIN-only transaction retries, avoiding libSQL's retained stale snapshots after refused implicit writes. Preserve foreign keys, FULL synchronization, automatic checkpoints and replica configuration.

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.477

## 0.2.0-alpha.476

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.476

## 0.2.0-alpha.475

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.475

## 0.2.0-alpha.474

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.474

## 0.2.0-alpha.473

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.473

## 0.2.0-alpha.472

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.472

## 0.2.0-alpha.471

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.471

## 0.2.0-alpha.470

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.470

## 0.2.0-alpha.469

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.469

## 0.2.0-alpha.468

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.468

## 0.2.0-alpha.467

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.467

## 0.2.0-alpha.466

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.466

## 0.2.0-alpha.465

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.465

## 0.2.0-alpha.464

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.464

## 0.2.0-alpha.463

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.463

## 0.2.0-alpha.462

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.462

## 0.2.0-alpha.461

### Patch Changes

- Updated dependencies [[`a294aa5`](https://github.com/rizom-ai/brains/commit/a294aa5756acd7a44d55971e30c62becf15708e0)]:
  - @brains/utils@0.2.0-alpha.461

## 0.2.0-alpha.460

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.460

## 0.2.0-alpha.459

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.459

## 0.2.0-alpha.458

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.458

## 0.2.0-alpha.457

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.457

## 0.2.0-alpha.456

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.456

## 0.2.0-alpha.455

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.455

## 0.2.0-alpha.454

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.454

## 0.2.0-alpha.453

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.453

## 0.2.0-alpha.452

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.452

## 0.2.0-alpha.451

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.451

## 0.2.0-alpha.450

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.450

## 0.2.0-alpha.449

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.449

## 0.2.0-alpha.448

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.448

## 0.2.0-alpha.447

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.447

## 0.2.0-alpha.446

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.446

## 0.2.0-alpha.445

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.445

## 0.2.0-alpha.444

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.444

## 0.2.0-alpha.443

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.443

## 0.2.0-alpha.442

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.442

## 0.2.0-alpha.441

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.441

## 0.2.0-alpha.440

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.440

## 0.2.0-alpha.439

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.439

## 0.2.0-alpha.438

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.438

## 0.2.0-alpha.437

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.437

## 0.2.0-alpha.436

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.436

## 0.2.0-alpha.435

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.435

## 0.2.0-alpha.434

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.434

## 0.2.0-alpha.433

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.433

## 0.2.0-alpha.432

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.432

## 0.2.0-alpha.431

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.431

## 0.2.0-alpha.430

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.430

## 0.2.0-alpha.429

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.429

## 0.2.0-alpha.428

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.428

## 0.2.0-alpha.427

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.427

## 0.2.0-alpha.426

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.426

## 0.2.0-alpha.425

### Patch Changes

- Updated dependencies [[`125d96f`](https://github.com/rizom-ai/brains/commit/125d96f90cf388ab7e5eaef26d341c40bd4b0f1c)]:
  - @brains/utils@0.2.0-alpha.425

## 0.2.0-alpha.424

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.424

## 0.2.0-alpha.423

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.423

## 0.2.0-alpha.422

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.422

## 0.2.0-alpha.421

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.421

## 0.2.0-alpha.420

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.420

## 0.2.0-alpha.419

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.419

## 0.2.0-alpha.418

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.418

## 0.2.0-alpha.417

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.417

## 0.2.0-alpha.416

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.416

## 0.2.0-alpha.415

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.415

## 0.2.0-alpha.414

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.414

## 0.2.0-alpha.413

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.413

## 0.2.0-alpha.412

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.412

## 0.2.0-alpha.411

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.411

## 0.2.0-alpha.410

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.410

## 0.2.0-alpha.409

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.409

## 0.2.0-alpha.408

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.408

## 0.2.0-alpha.407

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.407

## 0.2.0-alpha.406

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.406

## 0.2.0-alpha.405

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.405

## 0.2.0-alpha.404

### Patch Changes

- Updated dependencies [[`18f2586`](https://github.com/rizom-ai/brains/commit/18f2586ba20a15400402d34d4289d6035c6f9e3b)]:
  - @brains/utils@0.2.0-alpha.404

## 0.2.0-alpha.403

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.403

## 0.2.0-alpha.402

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.402

## 0.2.0-alpha.401

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.401

## 0.2.0-alpha.400

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.400

## 0.2.0-alpha.399

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.399

## 0.2.0-alpha.398

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.398

## 0.2.0-alpha.397

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.397

## 0.2.0-alpha.396

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.396

## 0.2.0-alpha.395

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.395

## 0.2.0-alpha.394

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.394

## 0.2.0-alpha.393

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.393

## 0.2.0-alpha.392

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.392

## 0.2.0-alpha.391

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.391

## 0.2.0-alpha.390

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.390

## 0.2.0-alpha.389

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.389

## 0.2.0-alpha.388

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.388

## 0.2.0-alpha.387

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.387

## 0.2.0-alpha.386

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.386

## 0.2.0-alpha.385

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.385

## 0.2.0-alpha.384

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.384

## 0.2.0-alpha.383

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.383

## 0.2.0-alpha.382

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.382

## 0.2.0-alpha.381

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.381

## 0.2.0-alpha.380

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.380

## 0.2.0-alpha.379

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.379

## 0.2.0-alpha.378

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.378

## 0.2.0-alpha.377

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.377

## 0.2.0-alpha.376

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.376

## 0.2.0-alpha.375

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.375

## 0.2.0-alpha.374

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.374

## 0.2.0-alpha.373

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.373

## 0.2.0-alpha.372

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.372

## 0.2.0-alpha.371

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.371

## 0.2.0-alpha.370

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.370

## 0.2.0-alpha.369

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.369

## 0.2.0-alpha.368

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.368

## 0.2.0-alpha.367

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.367

## 0.2.0-alpha.366

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.366

## 0.2.0-alpha.365

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.365

## 0.2.0-alpha.364

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.364

## 0.2.0-alpha.363

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.363

## 0.2.0-alpha.362

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.362

## 0.2.0-alpha.361

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.361

## 0.2.0-alpha.360

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.360

## 0.2.0-alpha.359

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.359

## 0.2.0-alpha.358

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.358

## 0.2.0-alpha.357

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.357

## 0.2.0-alpha.356

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.356

## 0.2.0-alpha.355

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.355

## 0.2.0-alpha.354

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.354

## 0.2.0-alpha.353

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.353

## 0.2.0-alpha.352

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.352

## 0.2.0-alpha.351

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.351

## 0.2.0-alpha.350

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.350

## 0.2.0-alpha.349

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.349

## 0.2.0-alpha.348

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.348

## 0.2.0-alpha.347

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.347

## 0.2.0-alpha.346

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.346

## 0.2.0-alpha.345

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.345

## 0.2.0-alpha.344

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.344

## 0.2.0-alpha.343

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.343

## 0.2.0-alpha.342

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.342

## 0.2.0-alpha.341

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.341

## 0.2.0-alpha.340

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.340

## 0.2.0-alpha.339

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.339

## 0.2.0-alpha.338

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.338

## 0.2.0-alpha.337

### Patch Changes

- [#187](https://github.com/rizom-ai/brains/pull/187) [`a7396a4`](https://github.com/rizom-ai/brains/commit/a7396a4a8896361c8fe4228528e3ff846e5bec56) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add content-addressed asset contracts and same-database SQLite BLOB persistence with atomic entity mutations, explicit reads, independent FTS policy, and verified snapshot restore coverage.

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.337

## 0.2.0-alpha.336

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.336

## 0.2.0-alpha.335

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.335

## 0.2.0-alpha.334

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.334

## 0.2.0-alpha.333

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.333

## 0.2.0-alpha.332

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.332

## 0.2.0-alpha.331

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.331

## 0.2.0-alpha.330

### Patch Changes

- [#178](https://github.com/rizom-ai/brains/pull/178) [`64f112e`](https://github.com/rizom-ai/brains/commit/64f112e170ca39f36764eadfba69421d6fc50bdb) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Adopt Bun 1.4 across the runtime and published brain package. Replace Sharp image optimization with `Bun.Image`, replace Playwright media rendering with `Bun.WebView`, enable measured test parallelism, make time-based tests deterministic, and apply SQLite busy timeouts before contended WAL initialization.

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.330

## 0.2.0-alpha.329

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.329

## 0.2.0-alpha.328

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.328

## 0.2.0-alpha.327

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.327

## 0.2.0-alpha.326

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.326

## 0.2.0-alpha.325

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.325

## 0.2.0-alpha.324

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.324

## 0.2.0-alpha.323

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.323

## 0.2.0-alpha.322

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.322

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

# @brains/contracts

## 0.2.0-alpha.514

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.514

## 0.2.0-alpha.513

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.513

## 0.2.0-alpha.512

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.512

## 0.2.0-alpha.511

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.511

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

- [#577](https://github.com/rizom-ai/brains/pull/577) [`44addbc`](https://github.com/rizom-ai/brains/commit/44addbc8095c8be96762f7eabeadd291c00a253b) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The network can be asked. `network_ask`, a public side-effect-free tool in agent-discovery, picks the approved peers whose skills fit a question (at most three, or the two nearest when none fit), asks them in parallel over a new A2A ask channel for a brief cited answer, with a 30 s budget each (`networkAskTimeoutMs`), and returns every answer with its sources attributed to the brain that gave it, plus who did not answer. Guest turns may use it and are told so; a tool's own `sources` now reach the answer's sources card, so the room lights the answering brain.

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

- [#546](https://github.com/rizom-ai/brains/pull/546) [`f3d28c7`](https://github.com/rizom-ai/brains/commit/f3d28c7e7a42182edef83b05780b16c4713e7b3a) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Every brain's pages carry the lantern as their icon. The default icon lives in the contracts; the console page links it; the webserver answers `/favicon.svg` with it when the served output has no icon of its own, and no longer stamps a year's immutable caching on a 404 for an image or icon path, which had let an edge hide the file long after it existed.

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

- [#516](https://github.com/rizom-ai/brains/pull/516) [`284bc37`](https://github.com/rizom-ai/brains/commit/284bc3738665e4e452fabb6af41d161292cd8a76) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Onboarding emails are shorter and personal. The anchor setup email greets a person anchor by name, and invitations say what the brain is for. Instead of listing MCP connection steps, both point to Studio → Account → AI tools. Chat, Studio and AI tools links come from the interactions the brain registers, and a sentence is left out when its page is not served. The chat, Studio and Account AI tools ids and link builder are shared contracts.

- [#514](https://github.com/rizom-ai/brains/pull/514) [`f513b77`](https://github.com/rizom-ai/brains/commit/f513b779dfcbba13ff48bec3f0ba373855f030e3) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Studio's Account workspace gains an AI tools tab when the brain serves MCP over HTTP and the person's role can use it. It shows the brain's MCP address and how to connect Claude and ChatGPT, with Claude Code, Cursor, VS Code and any other OAuth MCP client in a collapsed developer section. Commands and configuration snippets name the server after the brain's host and copy exactly as shown. `?section=ai-tools` opens the tab directly.

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

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.480

## 0.2.0-alpha.479

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.479

## 0.2.0-alpha.478

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.478

## 0.2.0-alpha.477

### Patch Changes

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

- Give every unbounded loop an explicit shape. Schema unwrapping, workspace version resolution, redirect following, job-drain polling, SQLite write retries and atomic enqueue retries now recurse once per step, so each step's exit condition sits in its own signature. Stream reading and checkpoint draining keep a loop, but one with a real condition in its head rather than an open `for (;;)` and an interior break.

  Behaviour is unchanged: the same retry budgets, backoff, redirect limits and cursor advancement apply. The atomic enqueue retry now closes its failed transaction before opening the next one rather than after, which was already the intent.

- [#302](https://github.com/rizom-ai/brains/pull/302) [`18f2586`](https://github.com/rizom-ai/brains/commit/18f2586ba20a15400402d34d4289d6035c6f9e3b) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Build the browser-safe Chat export separately from server library chunks. Server subpaths still share their runtime, while browser consumers no longer inherit Node-only imports through shared chunks. Keep frontmatter-only contract parsing independent of Markdown AST initialization, so the export also loads in headless runtimes without a DOM. Verify the exact packed export with the existing browser-build and headless canary.

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

- Make valid entity export paths injective: retain type-prefixed ID segments and limit exported notes to one segment at the sync root. Refuse historical invalid placements before file writes, deletion, or cleanup, and retain placement diagnostics independently of successful exports. Studio previews the placement verdict, refuses explicitly invalid destinations, and keeps note creation flat. Collection rows without an authored title display their structured leaf segment while preserving full stored IDs for links and identity details.

  Existing IDs are not rewritten and existing files are not moved or migrated. Files created under the previous prefix-stripping or nested-note conventions require operator review.

- Add Studio virtual-folder navigation, explicit folder/collection search, and folder-aware creation with server-encoded IDs and conditional writes. Preserve direct entity links, history, permissions, and ordinary singleton/capture flows.

  Directory-sync supplies read-only destination previews and creates missing parent directories for nested notes without changing placement. No folder entities, ID rewrites, file moves, or database migrations are introduced.

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

- [`d339319`](https://github.com/rizom-ai/brains/commit/d339319dabea7f856b69c829e46d3937254880d3) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fold `@brains/notification-contracts` into `@brains/contracts`.

  A private 67-line package with three in-repo consumers has no cohesion argument
  under the single-brain model — the email contracts already live inside
  `@brains/contracts`, and this was the only contracts module holding its own
  package boundary without lexicons or assets to justify it. The module moves to
  `shared/contracts/src/notification.ts` with its types now derived from the
  schemas (`z.input`/`z.output`) instead of hand-mirrored beside them.

- [`ae06107`](https://github.com/rizom-ai/brains/commit/ae06107694a825378e23183c26261c91166edfdf) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Pin the published copy of the JSON type machinery to the canonical one.

  `@rizom/site` is published and may not depend on private `@brains/*` packages,
  so it carries its own copy of `JsonValue`, `JsonObject`, `IsJsonValue`, and
  `JsonObjectOutputGuard` — 54 lines of recursive conditional types including a
  depth cap. The copy is deliberate; nothing held the two together, and only the
  `@brains/contracts` side had tests.

  A typecheck-time parity assertion now fails the build if either side gains,
  loses, or reshapes a member, which is the same guarantee the deploy scripts get
  from their generator plus drift test.

- [`17507e8`](https://github.com/rizom-ai/brains/commit/17507e806efc5fde1c30496700de74b53575d350) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Renderer-neutral SSR contracts.

  `ImageRenderer` was `marked`'s `renderer.image` callback signature —
  `(href, title: string | null, text)` — re-exported from the component library
  and made the build engine's public contract, so swapping the markdown library
  would have been a breaking change to `@brains/site-engine`'s API.
  `HeadProps`/`HeadCollectorInterface` had the same inverted ownership.

  Both now live in `@brains/contracts` with library-neutral shapes:
  `ImageRenderer` takes a `RenderedImageRef` (`{href, alt, title?}`), and
  `markdown-html` adapts marked's AST to it at the boundary that owns the marked
  dependency. ui-library re-exports the types, so template imports are unchanged.

- [`497fbc0`](https://github.com/rizom-ai/brains/commit/497fbc0f6d672e23afd5263a519c4e73a740c2c5) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Declare the site-build manifest filename once, in `@brains/contracts`.

  The manifest must never be served: the webserver blocks its path and the HTTP
  route registry reserves it. But the filename was a string literal in three
  packages that cannot import each other, so renaming it in the site builder
  would have left two dead reservations behind and silently started serving the
  build manifest publicly. All three now derive from one constant next to the
  other site-build contracts.

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

### Minor Changes

- [#144](https://github.com/rizom-ai/brains/pull/144) [`f6d93c7`](https://github.com/rizom-ai/brains/commit/f6d93c7aa49acccd691b049b090a7fdbbe7b6a1a) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Rename the email workflow package, add destination-resolved source-specific Inbox follow-ups, and ship private locator-backed IMAP detail reads plus an Admin-only reply drafting workspace. Original messages remain mailbox-owned and non-persistent; only operator-authored reply drafts are stored.

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

### Minor Changes

- [#111](https://github.com/rizom-ai/brains/pull/111) [`bd1eb47`](https://github.com/rizom-ai/brains/commit/bd1eb4768ee154570f5ba144f59a145c7f00aa51) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Connect recognizable Inbox senders to verified People identities. Normalize privacy-safe inbound email identity resolution, derive bounded sender labels without retaining mailbox addresses, carry a structured optional contact through the Inbox contract, and link resolved contacts to the exact person through the registered Admin surface while keeping Dashboard and digest projections redacted. Consume shared Dashboard widget primitives from the UI library rather than importing across plugin boundaries.

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

### Minor Changes

- [#77](https://github.com/rizom-ai/brains/pull/77) [`84dca8c`](https://github.com/rizom-ai/brains/commit/84dca8c9ddf83fcf01784f54da479e2229eba09c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add the shared inbound-email source reference contract and the opt-in email-triage capability. Meaningful inbound mail is conservatively filtered, classified into a restricted derived mail item, persisted before acknowledgement, and retried with a safe unclassified fallback without copying mailbox content into Brain storage or logs. Admins can review the derived queue through a typed CMS workspace, a combined-filter tool, status actions, and a compact dashboard contribution.

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

- [#76](https://github.com/rizom-ai/brains/pull/76) [`e2fa886`](https://github.com/rizom-ai/brains/commit/e2fa886134594d834582c5b55704e893fcb0988a) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add optional IMAP intake to the Email interface. Configured interfaces now connect to a read-only mailbox, parse MIME messages, publish the exported `EMAIL_INBOUND` contract, and persist an acknowledgement-gated, UIDVALIDITY-scoped cursor for at-least-once delivery. Poison messages no longer block later mail. Intake stays live through per-connection IDLE fallback and capped reconnect backoff, including failed initial connections, and enriches known senders through the auth principal registry. Outbound-only setups remain unchanged, and mailbox content, addresses, and credentials stay out of logs.

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

## 0.2.0-alpha.239

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.239

## 0.2.0-alpha.238

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.238

## 0.2.0-alpha.237

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.237

## 0.2.0-alpha.236

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.236

## 0.2.0-alpha.235

### Patch Changes

- [`31e732a`](https://github.com/rizom-ai/brains/commit/31e732a79a394a4e385ce7b25015c3daa8bf0afd) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Render site builds into isolated generation directories, validate a complete artifact manifest, and publish successful generations through an active-output symlink. Preserve the previous site on renderer, validation, and pointer-switch failures. Generate RSS and SEO files in staging so post-build events do not mutate committed generations. Snapshot binary app `public/` files during preparation within a bounded size budget and account for them explicitly in the artifact manifest. Stamp the one-time migration backup at migration time and retire it through the stale sweep once a committed generation exists to roll back to. Cancel superseded and shutdown builds across preparation, image work, rendering, CSS, assets, and SEO without interrupting an admitted output commit. Preserve each environment's configured public URL in staged RSS, robots, and sitemap output. Hash every committed artifact, derive sitemap timestamps from the prepared snapshot, and remove stale uncommitted generations safely. Keep the schema-complete build manifest out of the public site while continuing to serve legitimate dot-prefixed paths such as `/.well-known/` discovery and verification assets. Fail a build whose staged artifacts could not be written, so a swallowed RSS failure can no longer publish a generation with no feed, and reject a deployed production build that has no configured site URL instead of publishing sitemap, robots, and feed links against a placeholder domain. Use the runtime's explicit localhost URL for locally served builds so production-output verification still works without configuring a public domain.

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.235

## 0.2.0-alpha.234

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.234

## 0.2.0-alpha.233

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.233

## 0.2.0-alpha.232

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.232

## 0.2.0-alpha.231

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.231

## 0.2.0-alpha.230

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.230

## 0.2.0-alpha.229

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.229

## 0.2.0-alpha.228

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.228

## 0.2.0-alpha.227

### Minor Changes

- [`f7b3500`](https://github.com/rizom-ai/brains/commit/f7b350042c5bbcd6c5a43016d25e95e35ea3bfed) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Separate Admin authorization from Anchor ownership. Permission roles now use only `admin`, `trusted`, and `public`; a generated auth migration converts historical role rows and persists one person-or-collective brain Anchor. Principals expose `isAnchor` independently, personal Anchors must remain active Admins, collective brains can be run by any active Admin, and last-active-Admin protection stays atomic. Propagate both facets through authenticated and configured A2A, evaluation, chat, Discord, MCP, CLI, web-chat, action, tool, confirmation, and model-instruction contexts.

  Finish the standalone Admin console target model with an Anchor ownership card, Admin/Anchor member facets, profile and optional peer-brain sections, responsive roster/detail layouts, typed Anchor mutations, and a console-local TanStack Query cache with targeted mutation invalidation.

- [`fa8e4eb`](https://github.com/rizom-ai/brains/commit/fa8e4eb3a237aaec54eeeb815f68e792d3a1715b) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Persist exact interface grants and Anchor bindings in private auth runtime storage, seed declarations only on first initialization, make connected accounts authoritative, keep the no-login channel allowlist out of the person-centered Admin console, and provide explicit access-only CLI recovery.

### Patch Changes

- [`500a6dc`](https://github.com/rizom-ai/brains/commit/500a6dc284a590e1e9bb6af9fa0995332eeb8c58) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Replace ambiguous flattened actor identifiers with a discriminated `ActorRef` model for authenticated users, opaque external identities, agents, and services. Require `ActorRef` through tool execution, MCP routing, AI call options, create interceptors, tool events, and job provenance; remove flattened `userId` and `canonicalId` tool-context fields rather than deprecating them. Jobs retain every requester as `requestedByActor` and project `requestedByUserId` only through the centralized authenticated-user policy. New messages and durable memory use the new model, while legacy persisted actor metadata is normalized at read boundaries.

- Updated dependencies [[`5c1bed1`](https://github.com/rizom-ai/brains/commit/5c1bed1134f92701f4ead9b25a6f432cd208ac29)]:
  - @brains/utils@0.2.0-alpha.227

## 0.2.0-alpha.226

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.226

## 0.2.0-alpha.225

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.225

## 0.2.0-alpha.224

### Patch Changes

- Updated dependencies [[`b7c5df6`](https://github.com/rizom-ai/brains/commit/b7c5df61ebe0aa44f6b786695f16daa7ee151e61)]:
  - @brains/utils@0.2.0-alpha.224

## 0.2.0-alpha.223

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.223

## 0.2.0-alpha.222

### Patch Changes

- [#70](https://github.com/rizom-ai/brains/pull/70) [`4943d79`](https://github.com/rizom-ai/brains/commit/4943d79ecf4abefd4cf79a38a526e203ea32064a) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Refresh known ATProto agent cards from a daily recurring check, preserving local relationship metadata while updating remote-owned snapshots and centralizing domain message-channel constants.

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.222

## 0.2.0-alpha.221

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.221

## 0.2.0-alpha.220

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.220

## 0.2.0-alpha.219

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.219

## 0.2.0-alpha.218

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.218

## 0.2.0-alpha.217

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.217

## 0.2.0-alpha.216

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.216

## 0.2.0-alpha.215

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.215

## 0.2.0-alpha.214

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.214

## 0.2.0-alpha.213

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.213

## 0.2.0-alpha.212

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.212

## 0.2.0-alpha.211

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.211

## 0.2.0-alpha.210

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.210

## 0.2.0-alpha.209

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.209

## 0.2.0-alpha.208

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.208

## 0.2.0-alpha.207

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.207

## 0.2.0-alpha.206

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.206

## 0.2.0-alpha.205

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.205

## 0.2.0-alpha.204

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.204

## 0.2.0-alpha.203

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.203

## 0.2.0-alpha.202

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.202

## 0.2.0-alpha.201

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.201

## 0.2.0-alpha.200

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.200

## 0.2.0-alpha.199

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.199

## 0.2.0-alpha.198

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.198

## 0.2.0-alpha.197

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.197

## 0.2.0-alpha.196

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.196

## 0.2.0-alpha.195

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.195

## 0.2.0-alpha.194

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.194

## 0.2.0-alpha.193

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.193

## 0.2.0-alpha.192

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.192

## 0.2.0-alpha.191

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.191

## 0.2.0-alpha.190

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.190

## 0.2.0-alpha.189

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.189

## 0.2.0-alpha.188

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.188

## 0.2.0-alpha.187

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.187

## 0.2.0-alpha.186

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.186

## 0.2.0-alpha.185

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.185

## 0.2.0-alpha.184

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.184

## 0.2.0-alpha.183

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.183

## 0.2.0-alpha.182

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.182

## 0.2.0-alpha.181

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.181

## 0.2.0-alpha.180

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.180

## 0.2.0-alpha.179

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.179

## 0.2.0-alpha.178

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.178

## 0.2.0-alpha.177

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.177

## 0.2.0-alpha.176

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.176

## 0.2.0-alpha.175

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.175

## 0.2.0-alpha.174

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.174

## 0.2.0-alpha.173

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.173

## 0.2.0-alpha.172

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.172

## 0.2.0-alpha.171

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.171

## 0.2.0-alpha.170

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.170

## 0.2.0-alpha.169

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.169

## 0.2.0-alpha.168

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.168

## 0.2.0-alpha.167

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.167

## 0.2.0-alpha.166

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.166

## 0.2.0-alpha.165

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.165

## 0.2.0-alpha.164

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.164

## 0.2.0-alpha.163

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.163

## 0.2.0-alpha.162

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.162

## 0.2.0-alpha.161

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.161

## 0.2.0-alpha.160

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.160

## 0.2.0-alpha.159

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.159

## 0.2.0-alpha.158

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.158

## 0.2.0-alpha.157

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.157

## 0.2.0-alpha.156

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.156

## 0.2.0-alpha.155

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.155

## 0.2.0-alpha.154

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.154

## 0.2.0-alpha.153

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.153

## 0.2.0-alpha.152

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.152

## 0.2.0-alpha.151

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.151

## 0.2.0-alpha.150

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.150

## 0.2.0-alpha.149

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.149

## 0.2.0-alpha.148

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.148

## 0.2.0-alpha.147

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.147

## 0.2.0-alpha.146

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.146

## 0.2.0-alpha.145

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.145

## 0.2.0-alpha.144

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.144

## 0.2.0-alpha.143

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.143

## 0.2.0-alpha.142

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.142

## 0.2.0-alpha.141

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.141

## 0.2.0-alpha.140

### Patch Changes

- Updated dependencies [[`a30edc7`](https://github.com/rizom-ai/brains/commit/a30edc7ac66807c66cba2bc94e78206f133710d6), [`cea906c`](https://github.com/rizom-ai/brains/commit/cea906c689d40dee5f06ab949d5289c2660bfd37)]:
  - @brains/utils@0.2.0-alpha.140

## 0.2.0-alpha.139

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.139

## 0.2.0-alpha.138

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.138

## 0.2.0-alpha.137

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.137

## 0.2.0-alpha.136

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.136

## 0.2.0-alpha.135

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.135

## 0.2.0-alpha.134

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.134

## 0.2.0-alpha.133

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.133

## 0.2.0-alpha.132

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.132

## 0.2.0-alpha.131

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.131

## 0.2.0-alpha.130

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.130

## 0.2.0-alpha.129

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.129

## 0.2.0-alpha.128

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.128

## 0.2.0-alpha.127

## 0.2.0-alpha.126

## 0.2.0-alpha.125

## 0.2.0-alpha.124

## 0.2.0-alpha.123

## 0.2.0-alpha.122

## 0.2.0-alpha.121

## 0.2.0-alpha.120

## 0.2.0-alpha.119

## 0.2.0-alpha.118

## 0.2.0-alpha.117

## 0.2.0-alpha.116

## 0.2.0-alpha.115

## 0.2.0-alpha.114

## 0.2.0-alpha.113

## 0.2.0-alpha.112

## 0.2.0-alpha.111

## 0.2.0-alpha.110

## 0.2.0-alpha.109

## 0.2.0-alpha.108

## 0.2.0-alpha.107

## 0.2.0-alpha.106

## 0.2.0-alpha.105

## 0.2.0-alpha.104

## 0.2.0-alpha.103

## 0.2.0-alpha.102

## 0.2.0-alpha.101

## 0.2.0-alpha.100

## 0.2.0-alpha.99

## 0.2.0-alpha.98

## 0.2.0-alpha.97

## 0.2.0-alpha.96

## 0.2.0-alpha.95

## 0.2.0-alpha.94

## 0.2.0-alpha.93

## 0.2.0-alpha.92

## 0.2.0-alpha.91

## 0.2.0-alpha.90

## 0.2.0-alpha.89

## 0.2.0-alpha.88

## 0.2.0-alpha.87

## 0.2.0-alpha.86

## 0.2.0-alpha.85

## 0.2.0-alpha.84

## 0.2.0-alpha.83

## 0.2.0-alpha.82

## 0.2.0-alpha.81

## 0.2.0-alpha.80

## 0.2.0-alpha.79

## 0.2.0-alpha.78

## 0.2.0-alpha.77

## 0.2.0-alpha.76

## 0.2.0-alpha.75

## 0.2.0-alpha.74

## 0.2.0-alpha.73

## 0.2.0-alpha.72

## 0.2.0-alpha.71

## 0.2.0-alpha.70

## 0.2.0-alpha.69

## 0.2.0-alpha.68

## 0.2.0-alpha.67

## 0.2.0-alpha.66

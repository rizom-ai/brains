# Package Quickstart

This walks through one package from an empty directory to a brain that runs it: a service that keeps memos, owns their entity type, archives them as durable work, and tests itself on the runtime. Every step uses only the public `@rizom/brain` entries.

## 1. The package

```text
memos/
├── package.json
├── tsconfig.json
├── src/
│   └── index.ts
└── test/
    └── memos.test.ts
```

`package.json`:

```json
{
  "name": "@example/memos",
  "version": "0.1.0",
  "type": "module",
  "files": ["dist"],
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "bun test"
  },
  "peerDependencies": {
    "@rizom/brain": ">=0.2.0 <0.3.0"
  },
  "devDependencies": {
    "@rizom/brain": "0.2.0",
    "@types/bun": "^1.4.0",
    "typescript": "^7.0.2"
  }
}
```

The peer range is the brains the package runs on; the development dependency is the one it is built and tested against. Before `0.2.0` is published, use the exact alpha you develop against for both, such as `>=0.2.0-alpha.700 <0.3.0` and `0.2.0-alpha.700`.

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "declaration": true,
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"]
}
```

## 2. The definition, in two stages

A service is defined with two arguments. The header says what the package is: its `id`, its `config` schema, the entity types it owns and its `setup`. The behavior says what it does with that: here its `tools` and its `jobs`.

`src/index.ts`:

<!-- public-authoring-example: quickstart-package file=src/index.ts -->

```ts
import { defineEntity } from "@rizom/brain/entities";
import {
  SdkError,
  defineJob,
  defineServicePlugin,
  defineTool,
  z,
} from "@rizom/brain/services";

// A type the package owns: it alone writes memos.
export const memo = defineEntity({
  type: "memo",
  purpose: "A short note worth keeping",
  metadata: z.object({ archived: z.boolean().default(false) }),
});

// Durable work, declared once so a tool, a route or another package can queue it.
export const archiveMemo = defineJob({
  name: "archive",
  input: z.object({ id: z.string() }),
  output: z.object({ archived: z.number().int() }),
});

export default defineServicePlugin(
  // The header: what the package is.
  {
    id: "memos",
    config: z.object({ maxLength: z.number().int().default(280) }),
    entities: [memo],
    // Runs once when the package registers; what it returns is `state`.
    setup: ({ runtimeState }) => ({
      archived: runtimeState({
        namespace: "archived",
        schema: z.object({ count: z.number().int() }),
      }),
    }),
  },
  // The behavior: each slot is given the package's capabilities once, and
  // the handlers it returns are given only their call's data.
  {
    tools: ({ config, entities, jobs }) => [
      defineTool({
        name: "keep",
        description: "Keep a memo",
        input: z.object({ id: z.string(), content: z.string() }),
        output: z.object({ id: z.string() }),
        sideEffects: "writes",
        execute: ({ input }) => {
          if (input.content.length > config.maxLength) {
            throw new SdkError("invalid_input", {
              publicMessage: `A memo holds at most ${config.maxLength} characters`,
            });
          }
          return entities.create(memo, {
            id: input.id,
            content: input.content,
            metadata: {},
          });
        },
      }),
      defineTool({
        name: "archive",
        description: "Archive a memo, as durable work",
        input: archiveMemo.input,
        output: z.object({ jobId: z.string() }),
        sideEffects: "writes",
        execute: async ({ input }) => ({
          jobId: (await jobs.enqueue(archiveMemo, input)).id,
        }),
      }),
    ],
    jobs: ({ state, entities }) => [
      archiveMemo.handle(async ({ input }) => {
        const kept = await entities.get(memo, input.id);
        if (!kept) {
          throw new SdkError("not_found", {
            message: `Memo ${input.id} is missing`,
          });
        }
        await entities.update(memo, kept, { metadata: { archived: true } });
        const count = ((await state.archived.get("total"))?.count ?? 0) + 1;
        await state.archived.set("total", { count });
        return { archived: count };
      }),
    ],
  },
);
```

What the two stages give you:

- `config` is declared once and inferred everywhere: a brain configures it with the schema's input, and the slots read its parsed output.
- `entities` in the header installs the `memo` type with the package. The slots' `entities` reads any type and writes the header's types, as the current caller: the tool's caller in a tool, the job's requester in a job.
- `setup` builds what the slots share. Its runtime state is kept under the package's name, so no other package reads it.
- A failure is an `SdkError`: the caller is told its code and its `publicMessage`, and the message it was thrown with stays in the brain's logs.
- `memos`, `keep` and `archive` are local names; the runtime scopes them to the installed package.

## 3. A test on the runtime

`@rizom/brain/testing` starts a brain in the test's own process, on the runtime's own services and a temporary storage of its own. It runs the packages under the name the working directory's `package.json` gives them.

`test/memos.test.ts`:

<!-- public-authoring-example: quickstart-test file=test/memos.test.ts -->

```ts
import { expect, test } from "bun:test";
import { use } from "@rizom/brain";
import { z } from "@rizom/brain/services";
import { startTestBrain } from "@rizom/brain/testing";
import memos, { archiveMemo, memo } from "../src/index";

// What the archive tool answers: the job it queued.
const queued = z.object({
  success: z.literal(true),
  data: z.object({ jobId: z.string() }),
});

test("keeps a memo, and archives it as durable work", async () => {
  const brain = await startTestBrain({
    plugins: [use(memos, { maxLength: 40 })],
  });
  try {
    expect(
      await brain.tool("memos_keep", { id: "milk", content: "Buy milk" }),
    ).toEqual({ success: true, data: { id: "milk" } });
    expect(
      await brain.tool("memos_keep", { id: "long", content: "x".repeat(41) }),
    ).toEqual({
      success: false,
      code: "invalid_input",
      error: "A memo holds at most 40 characters",
    });

    const { data } = queued.parse(
      await brain.tool("memos_archive", { id: "milk" }),
    );
    expect(await brain.jobs.wait(archiveMemo, data.jobId)).toMatchObject({
      status: "completed",
      result: { archived: 1 },
    });
    const archived = await brain.entities.get(memo, "milk");
    expect(archived?.metadata).toEqual({ archived: true });
  } finally {
    await brain.stop();
  }
});
```

Run it with `bun test` from the package's directory. The brain calls a tool by the name it gives it, `memos_keep`, as the brain's operator; its worker runs the queued job, and `jobs.wait` answers the job's status, typed by its definition. A test brain reaches no AI provider, and `stop()` deletes what it stored.

## 4. A brain that runs it

Build and publish the package (`bun run build`, then `bun pm pack` or `npm publish`). A brain definition imports it and configures it with `use()`:

<!-- public-authoring-example: quickstart-brain -->

```ts
import memos from "@example/memos";
import { defineBrain, use } from "@rizom/brain";

const keptMemos = use(memos, { maxLength: 140 });

export default defineBrain({
  name: "memo-brain",
  plugins: [keptMemos],
});
```

## Next

- [External Package Authoring](./external-plugin-authoring.md) covers every package family: entities, services, interfaces, message interfaces and operator surfaces.
- [External Site and Theme Authoring](./external-site-authoring.md) covers sites, themes and `@rizom/brain-ui`.
- The [public API ledger](./public-release/AUTHORING_API_0.2.md) states every stable contract.

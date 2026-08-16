#!/usr/bin/env bun

import { join } from "node:path";

const args = process.argv.slice(2);
const separatorIndex = args.indexOf("--");
const turboArgs = separatorIndex === -1 ? args : args.slice(0, separatorIndex);
const eslintArgs = separatorIndex === -1 ? [] : args.slice(separatorIndex + 1);

const compatLoader = join(import.meta.dir, "eslint-typescript-compat.cjs");
const existingNodeOptions = process.env.NODE_OPTIONS?.trim();
const nodeOptions = [
  existingNodeOptions,
  `--require=${compatLoader}`,
]
  .filter(Boolean)
  .join(" ");

const proc = Bun.spawn(
  [
    "bunx",
    "turbo",
    "run",
    "lint",
    ...turboArgs,
    "--",
    "--max-warnings",
    "0",
    ...eslintArgs,
  ],
  {
    env: {
      ...process.env,
      NODE_OPTIONS: nodeOptions,
    },
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  },
);

const turboExit = await proc.exited;

/*
 * Turbo only visits workspace packages, so this directory linted nothing —
 * including the guard tests that protect every other package. eslint runs over
 * it directly here, under the same compat loader, so one command still covers
 * the whole repository.
 *
 * It runs even when turbo failed, so a lint run reports every problem rather
 * than only those in whichever half failed first.
 */
const scriptsProc = Bun.spawn(
  ["bunx", "eslint", "scripts", "--max-warnings", "0", ...eslintArgs],
  {
    env: { ...process.env, NODE_OPTIONS: nodeOptions },
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  },
);

const scriptsExit = await scriptsProc.exited;

process.exit(turboExit !== 0 ? turboExit : scriptsExit);

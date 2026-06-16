#!/usr/bin/env bun

const args = process.argv.slice(2);
const separatorIndex = args.indexOf("--");
const turboArgs = separatorIndex === -1 ? args : args.slice(0, separatorIndex);
const eslintArgs = separatorIndex === -1 ? [] : args.slice(separatorIndex + 1);

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
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  },
);

process.exit(await proc.exited);

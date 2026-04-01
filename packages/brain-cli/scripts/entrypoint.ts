#!/usr/bin/env bun
/**
 * Build entrypoint for @rizom/brain.
 *
 * This file is the single entry point that the build script compiles
 * into dist/brain.js. It wires together:
 *
 * 1. Brain model definitions (rover, ranger, relay)
 * 2. The boot function (reads brain.yaml, resolves config, boots App)
 * 3. The CLI (parseArgs, runCommand)
 *
 * In the monorepo, this file is NOT used — `bun run brain` runs
 * src/index.ts directly (no models registered, subprocess runner path).
 */

// ─── Register brain models ────────────────────────────────────────────────

import { registerModel } from "../src/lib/model-registry";

import rover from "@brains/rover";
import ranger from "@brains/ranger";
import relay from "@brains/relay";

registerModel("rover", rover);
registerModel("ranger", ranger);
registerModel("relay", relay);

// ─── Register boot function ───────────────────────────────────────────────

import { setBootFn } from "../src/lib/boot";
import { readFileSync } from "fs";
import { join } from "path";

setBootFn(async (cwd, _modelName, definition, flags) => {
  const { resolve, parseInstanceOverrides, App, handleCLI } =
    await import("@brains/app");

  const yaml = readFileSync(join(cwd, "brain.yaml"), "utf-8");
  const overrides = parseInstanceOverrides(yaml);
  const config = resolve(definition, process.env, overrides);

  if (flags.registerOnly) {
    const app = App.create(config);
    await app.initialize({ registerOnly: true });
    return;
  }

  if (flags.chat) {
    await handleCLI({ ...config, args: ["--cli"] });
  } else {
    await handleCLI(config);
  }
});

// ─── Run CLI ──────────────────────────────────────────────────────────────

import { parseArgs } from "../src/parse-args";
import { runCommand } from "../src/run-command";

const parsed = parseArgs(process.argv.slice(2));
const result = await runCommand(parsed);

if (!result.success) {
  console.error(result.message);
  process.exit(1);
}

if (result.message) {
  console.log(result.message);
}

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

registerModel("rover", rover);

// ─── Register boot function ───────────────────────────────────────────────

import { setBootFn } from "../src/lib/boot";
import { readFileSync } from "fs";
import { join } from "path";

setBootFn(async (cwd, _modelName, definition, flags) => {
  const {
    resolve,
    parseInstanceOverrides,
    InstanceOverridesParseError,
    App,
    handleCLI,
  } = await import("@brains/app");

  const yaml = readFileSync(join(cwd, "brain.yaml"), "utf-8");
  let overrides;
  try {
    overrides = parseInstanceOverrides(yaml);
  } catch (err) {
    if (err instanceof InstanceOverridesParseError) {
      console.error(`❌ ${err.message}`);
    } else {
      console.error(
        `❌ unexpected error parsing brain.yaml: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    process.exit(1);
  }
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

// ─── Run CLI ──────────────────────────────────────────────────────

import { execSync } from "child_process";
import { parseArgs } from "../src/parse-args";
import { runCommand } from "../src/run-command";
import { findLocalBrain } from "../src/lib/local-reexec";
import { getInvocationCwd } from "../src/lib/invocation-cwd";

// Resolve the directory the user invoked us from. Mirrors src/index.ts —
// must be passed explicitly into runCommand because the minifier may inline
// away the `cwd ?? process.cwd()` fallback inside runCommand otherwise.
const cwd = getInvocationCwd();

// Local-over-global: if ./node_modules/@rizom/brain exists and isn't us, re-exec
if (!process.env["BRAIN_SKIP_LOCAL_REEXEC"]) {
  const localBrain = findLocalBrain(cwd);
  if (localBrain && localBrain !== __filename) {
    try {
      execSync(`bun ${localBrain} ${process.argv.slice(2).join(" ")}`, {
        cwd,
        stdio: "inherit",
        env: { ...process.env, BRAIN_SKIP_LOCAL_REEXEC: "1" },
      });
      process.exit(0);
    } catch (err) {
      const code =
        err && typeof err === "object" && "status" in err
          ? (err.status as number)
          : 1;
      process.exit(code);
    }
  }
}

const parsed = parseArgs(process.argv.slice(2));
const result = await runCommand(parsed, cwd);

if (!result.success) {
  console.error(result.message);
  process.exit(1);
}

if (result.message) {
  console.log(result.message);
}

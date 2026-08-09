#!/usr/bin/env bun
/**
 * Build entrypoint for @rizom/brain.
 *
 * This file is the single entry point that the build script compiles
 * into dist/brain.js. It wires together:
 *
 * 1. The canonical brain definition
 * 2. The boot function (reads brain.yaml, resolves config, boots App)
 * 3. The CLI (parseArgs, runCommand)
 *
 * In the monorepo, this file is NOT used — `bun run brain` runs
 * src/index.ts directly (no models registered, subprocess runner path).
 */

// ─── Register the canonical definition and built-in package refs ─────────

import { setCanonicalDefinition } from "../src/lib/definition-registry";
import canonicalBrain from "../src/model/canonical-brain";
import { registerPackage } from "@brains/app";

import defaultSite from "@brains/site-default";
import defaultTheme from "@rizom/theme-default";
import rizomTheme from "@brains/theme-rizom";

setCanonicalDefinition(canonicalBrain);

registerPackage("@brains/site-default", defaultSite);
registerPackage("@rizom/theme-default", defaultTheme);
registerPackage("@brains/theme-rizom", rizomTheme);

// ─── Register boot function ───────────────────────────────────────────────

import { setBootFn } from "../src/lib/boot";
import { startWorkerHeartbeat } from "../src/lib/process-supervisor";
import { readFileSync } from "fs";
import { join } from "path";

setBootFn(async (cwd, definition, flags) => {
  const {
    resolve,
    parseInstanceOverrides,
    InstanceOverridesParseError,
    App,
    handleCLI,
    registerOverridePackages,
  } = await import("@brains/app");
  const { registerConventionalSiteTheme } =
    await import("../src/lib/register-conventional-site-theme");

  const yaml = readFileSync(join(cwd, "brain.yaml"), "utf-8");
  let overrides;
  try {
    overrides = parseInstanceOverrides(yaml);
  } catch (err) {
    if (err instanceof InstanceOverridesParseError) {
      console.error(`❌ ${err.message}`);
    } else {
      console.error(
        `❌ unexpected error parsing brain.yaml: ${getErrorMessage(err)}`,
      );
    }
    process.exit(1);
  }

  // Dynamically import @-prefixed package refs from brain.yaml
  // (site.package, plugin config values) and register them in the
  // package registry so resolve() can find them. Without this step,
  // brain.yaml's site.package override silently falls back to the
  // brain definition's default site.
  await registerOverridePackages(overrides);

  // Convention-based local authoring: if brain.yaml does not pick a site
  // package or theme explicitly, use ./src/site.tsx and ./src/theme.css.
  const effectiveOverrides = await registerConventionalSiteTheme(
    cwd,
    overrides,
  );

  const config = resolve(definition, process.env, effectiveOverrides);

  if (flags.operation === "migrate") {
    const app = App.create(config);
    await app.migrate();
    return;
  }

  if (flags.mode) {
    const app = App.create(config);
    await app.initialize({ mode: flags.mode });
    return app;
  }

  if (flags.chat) {
    await handleCLI({ ...config, args: ["--cli"] });
  } else {
    await handleCLI(config, {
      ...(flags.migrationsCompleted && { migrationsCompleted: true }),
      ...(flags.childRole && { processRole: flags.childRole }),
      ...(flags.localDatabaseEndpoint && {
        localDatabaseEndpoint: flags.localDatabaseEndpoint,
      }),
      ...(flags.childRole && {
        onRuntimeReady: (): void => {
          const sendSupervisorMessage = (
            type: "runtime-ready" | "worker-ready" | "worker-heartbeat",
          ): void => {
            if (!process.send) {
              throw new Error(
                `Supervised Brain ${flags.childRole} child has no IPC channel`,
              );
            }
            process.send({ type });
          };

          sendSupervisorMessage(
            flags.childRole === "web" ? "runtime-ready" : "worker-ready",
          );
          if (flags.childRole === "worker") {
            startWorkerHeartbeat((): void =>
              sendSupervisorMessage("worker-heartbeat"),
            );
          }
        },
      }),
    });
  }
});

// ─── Run CLI ──────────────────────────────────────────────────────

import { execSync } from "child_process";
import { parseArgs } from "../src/parse-args";
import { runCommand } from "../src/run-command";
import { findLocalBrain } from "../src/lib/local-reexec";
import { getInvocationCwd } from "../src/lib/invocation-cwd";
import { getErrorMessage } from "@brains/utils/error";

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
  process.exit(result.exitCode ?? 1);
}

if (result.message) {
  console.log(result.message);
}

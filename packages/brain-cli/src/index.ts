#!/usr/bin/env bun
import { execSync } from "child_process";
import { parseArgs } from "./parse-args";
import { runCommand } from "./run-command";
import { checkBunVersion } from "./lib/preflight";
import { findLocalBrain } from "./lib/local-reexec";
import { getInvocationCwd } from "./lib/invocation-cwd";

const bunCheck = checkBunVersion(Bun.version);
if (!bunCheck.ok) {
  console.error(bunCheck.message);
  process.exit(1);
}

// The directory the user invoked us from. When `bun run brain` resolves a
// script in a parent package.json, bun chdirs to that package's directory and
// stores the original in INIT_CWD. We want the original.
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

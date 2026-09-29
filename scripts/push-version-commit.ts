#!/usr/bin/env bun
import { getErrorMessage } from "@brains/utils/error";
import { gitIn, pushVersionCommit } from "./lib/version-commit";

const [message, mode] = process.argv.slice(2);
if (!message || !mode) {
  console.error(
    'Usage: bun scripts/push-version-commit.ts "<commit message>" <release mode>',
  );
  process.exit(2);
}

await pushVersionCommit({
  git: gitIn(process.cwd()),
  message,
  mergeWhenMainMoved: mode === "standard",
}).catch((error: unknown) => {
  console.error(`::error title=Version push failed::${getErrorMessage(error)}`);
  process.exit(1);
});

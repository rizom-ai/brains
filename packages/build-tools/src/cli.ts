#!/usr/bin/env bun
import {
  preparePublishManifest,
  restorePublishManifest,
} from "./publish-manifest";

const [mode, dirArg] = process.argv.slice(2);
const packageDir = dirArg ?? process.cwd();

if (mode === "prepare") {
  await preparePublishManifest(packageDir);
} else if (mode === "restore") {
  await restorePublishManifest(packageDir);
} else {
  console.error("Usage: publish-manifest <prepare|restore> [package-dir]");
  process.exit(1);
}

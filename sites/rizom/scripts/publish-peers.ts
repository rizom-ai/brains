#!/usr/bin/env bun
// The runtime peer range must ship in the published manifest, but it
// cannot live in the repo manifest: @rizom/brain depends on the brains,
// the brains depend on this package, so an in-repo peer edge closes a
// workspace dependency cycle. prepack copies publishPeerDependencies
// into peerDependencies; postpack removes it again.
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const mode = process.argv[2];
if (mode !== "inject" && mode !== "restore") {
  console.error("Usage: publish-peers.ts <inject|restore>");
  process.exit(1);
}

const manifestPath = join(import.meta.dir, "../package.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

if (mode === "inject") {
  if (!manifest.publishPeerDependencies) {
    console.error("publishPeerDependencies missing from package.json");
    process.exit(1);
  }
  manifest.peerDependencies = manifest.publishPeerDependencies;
} else {
  delete manifest.peerDependencies;
}

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

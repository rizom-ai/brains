#!/usr/bin/env bun
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  downloadPublishedArtifact,
  packageIdentitySchema,
} from "./lib/published-artifact";

const root = resolve(import.meta.dir, "..");
const temporary = await mkdtemp(join(tmpdir(), "published-core-verification-"));
try {
  for (const [directory, archiveName] of [
    ["brain-cli", "brain"],
    ["brains-ops", "ops"],
  ] as const) {
    const target = packageIdentitySchema.parse(
      await Bun.file(join(root, "packages", directory, "package.json")).json(),
    );
    const bytes = await downloadPublishedArtifact(target);
    await Bun.write(join(temporary, `${archiveName}.tgz`), bytes);
    console.log(
      `Verified registry identity, SHA512 and archive identity: ${target.name}@${target.version}`,
    );
  }

  await run(
    ["test", "packages/brain-cli/test/public-chat-packed.test.ts"],
    root,
    {
      ...process.env,
      RIZOM_PUBLIC_API_PACKED_EVIDENCE: "1",
      RIZOM_PUBLIC_API_PACKED_BRAIN_TARBALL: join(temporary, "brain.tgz"),
    },
  );

  // Install only the downloaded Ops archive and its production dependencies.
  await Bun.write(
    join(temporary, "package.json"),
    JSON.stringify({
      private: true,
      dependencies: { "@rizom/ops": "file:./ops.tgz" },
    }),
  );
  await run(["install", "--production", "--ignore-scripts"], temporary);
  const help = await run(
    ["node_modules/@rizom/ops/dist/brains-ops.js", "--help"],
    temporary,
  );
  if (!help.includes("Usage: brains-ops")) {
    throw new Error("Published Ops CLI did not print its help text");
  }
  console.log(
    "Published core artifacts verified; downloaded Brain and Ops smoke checks passed.",
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}

async function run(
  args: string[],
  cwd: string,
  env = process.env,
): Promise<string> {
  const child = Bun.spawn([process.execPath, ...args], {
    cwd,
    env,
    stdout: "pipe",
    stderr: "inherit",
  });
  const output = await new Response(child.stdout).text();
  process.stdout.write(output);
  const code = await child.exited;
  if (code !== 0)
    throw new Error(
      `Published artifact check failed (${code}): bun ${args.join(" ")}`,
    );
  return output;
}

import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  preparedManifestPackageDirs,
  runWithPreparedPublishManifests,
} from "@brains/build-tools";
import { getPackages } from "@manypkg/get-packages";
import {
  PACKED_BRAIN_TARBALL_ENV,
  PACKED_COMPATIBILITY_EVIDENCE_ENV,
} from "../test/helpers/packed-evidence";

const packageDirectory = join(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = join(packageDirectory, "../..");
const compatibilityTests = [
  "packages/brain-cli/test/public-chat-packed.test.ts",
  "packages/brain-cli/test/studio-groupings-packed.test.ts",
  "packages/brain-cli/test/public-authoring-phase1-packed.test.ts",
  "packages/brain-cli/test/public-authoring-phase2-packed.test.ts",
  "packages/brain-cli/test/public-authoring-phase3-packed.test.ts",
  "packages/brain-cli/test/public-authoring-phase4-packed.test.ts",
  "packages/brain-cli/test/public-authoring-phase5-packed.test.ts",
  "packages/brain-cli/test/public-authoring-phase6-packed.test.ts",
  "packages/brain-cli/test/public-authoring-testing-packed.test.ts",
] as const;

let activeChild: ReturnType<typeof Bun.spawn> | undefined;
let interruptedSignal: NodeJS.Signals | undefined;

function forwardSignal(signal: NodeJS.Signals): void {
  interruptedSignal ??= signal;
  activeChild?.kill(signal);
}

const onSigint = (): void => forwardSignal("SIGINT");
const onSigterm = (): void => forwardSignal("SIGTERM");

async function run(
  command: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const child = Bun.spawn([...command], {
    cwd,
    env,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  activeChild = child;
  const exitCode = await child.exited;
  activeChild = undefined;

  if (interruptedSignal !== undefined) {
    throw new Error(
      `Packed compatibility run interrupted by ${interruptedSignal}`,
    );
  }
  if (exitCode !== 0) {
    throw new Error(`Command failed (${exitCode}): ${command.join(" ")}`);
  }
}

/**
 * Build and pack the brain the way Core Release publishes it: while every
 * core-lane publish manifest is prepared, as the publish wrapper leaves them
 * for the whole of `changeset publish`. A build that only resolves against
 * source manifests fails here rather than at release.
 */
async function packBrain(destination: string): Promise<string> {
  const { packages } = await getPackages(repositoryRoot);
  const before = new Set(await readdir(destination));
  await runWithPreparedPublishManifests(
    preparedManifestPackageDirs(packages, "core"),
    async () => {
      await run(["bun", "run", "build"], packageDirectory);
      await run(
        ["bun", "pm", "pack", "--destination", destination, "--quiet"],
        packageDirectory,
      );
    },
  );
  const tarball = (await readdir(destination)).find(
    (entry) => !before.has(entry) && entry.endsWith(".tgz"),
  );
  if (tarball === undefined) {
    throw new Error("Packed @rizom/brain tarball was not created");
  }
  return join(destination, tarball);
}

async function main(): Promise<void> {
  const temporaryRoot = await mkdtemp(
    join(tmpdir(), "public-authoring-compatibility-"),
  );
  process.on("SIGINT", onSigint);
  process.on("SIGTERM", onSigterm);

  try {
    const brainTarball = await packBrain(temporaryRoot);
    await run(["bun", "test", ...compatibilityTests], repositoryRoot, {
      ...process.env,
      TMPDIR: temporaryRoot,
      TMP: temporaryRoot,
      TEMP: temporaryRoot,
      [PACKED_COMPATIBILITY_EVIDENCE_ENV]: "1",
      [PACKED_BRAIN_TARBALL_ENV]: brainTarball,
    });
  } finally {
    activeChild?.kill("SIGTERM");
    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

await main();

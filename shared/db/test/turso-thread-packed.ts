// Opt-in packaging proof. Does not change or boot the production runtime.
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "@brains/utils/zod";

const root = await mkdtemp(join(tmpdir(), "turso-thread-packed-"));
const candidate = join(root, "candidate");
const consumer = join(root, "consumer");
const tarballs = join(root, "tarballs");
const unrelated = join(root, "unrelated working directory");
const trapPath = join(unrelated, "unexpected-dependency-load");
const env: NodeJS.ProcessEnv = {
  ...process.env,
  TMPDIR: root,
  TMP: root,
  TEMP: root,
};
delete env["NODE_PATH"];

async function run(
  cwd: string,
  command: string[],
  extraEnv: Record<string, string> = {},
): Promise<string> {
  const child = Bun.spawn(command, {
    cwd,
    env: { ...env, ...extraEnv },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (code !== 0)
    throw new Error(
      `Thread packaging proof command failed (${command[0]}, ${code}): ${stderr}\n${stdout}`,
    );
  return stdout;
}
const reportSchema = z.object({
  scope: z.literal("isolated-turso-thread-driver"),
  nativeThreadId: z.number().int().positive(),
  sameOwnerProcess: z.literal(true),
  mainControlWhileWorkerBlocked: z.literal(true),
  callerBuffersPreserved: z.literal(true),
  transactionIsolation: z.literal(true),
  durableMainFileRestore: z.literal(true),
  workerStageLifecycle: z.literal(true),
  transactionalResidentBlob: z.literal(true),
  libsqlSessionCompatibility: z.literal(true),
  nestedResidentRollback: z.literal(true),
  failedFinalizationFenced: z.literal(true),
  runtimeReplaced: z.literal(false),
  largeAssetStaging: z.literal(false),
});
const failureSchema = z.object({
  scope: z.literal("thread-driver-startup-failure"),
  mode: z.enum(["javascript", "compiled"]),
  scenario: z.enum(["missing-worker", "missing-native"]),
  databaseCreated: z.literal(false),
});
try {
  await Promise.all([
    mkdir(candidate),
    mkdir(consumer),
    mkdir(tarballs),
    mkdir(unrelated),
  ]);
  const build = await Bun.build({
    entrypoints: ["exercise.ts", "worker.ts"].map((name) =>
      fileURLToPath(
        new URL(`./fixtures/turso-thread/${name}`, import.meta.url),
      ),
    ),
    outdir: candidate,
    naming: "[name].js",
    target: "bun",
    external: ["@tursodatabase/database"],
  });
  if (!build.success)
    throw new AggregateError(build.logs, "Thread proof bundle failed");
  await writeFile(
    join(candidate, "package.json"),
    JSON.stringify({
      name: "turso-thread-proof",
      version: "0.0.0",
      private: true,
      type: "module",
      files: ["exercise.js", "worker.js"],
      exports: { ".": "./exercise.js", "./worker": "./worker.js" },
      dependencies: { "@tursodatabase/database": "0.7.2" },
    }),
  );
  await run(candidate, ["bun", "pm", "pack", "--destination", tarballs]);
  const [tarball] = (await readdir(tarballs)).filter((name) =>
    name.endsWith(".tgz"),
  );
  assert.ok(tarball);
  await writeFile(
    join(consumer, "package.json"),
    JSON.stringify({
      name: "turso-thread-consumer-proof",
      private: true,
      type: "module",
      dependencies: { "turso-thread-proof": `file:${join(tarballs, tarball)}` },
    }),
  );
  await run(consumer, ["bun", "install", "--ignore-scripts"]);
  const workerPath = await realpath(
    join(consumer, "node_modules/turso-thread-proof/worker.js"),
  );
  assert.ok(workerPath.startsWith(`${consumer}/`));
  assert.equal(
    await Bun.file(
      join(consumer, "node_modules/@libsql/client/package.json"),
    ).exists(),
    false,
  );
  await writeFile(
    join(consumer, "consumer.ts"),
    `
import { exerciseThreadDriver } from "turso-thread-proof";
import assert from "node:assert/strict";
import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const mode = process.argv[2];
if (mode !== "javascript" && mode !== "compiled") throw new Error("Invalid proof mode");
const workerPath = process.env.PROOF_WORKER_PATH;
if (!workerPath) throw new Error("Missing installed worker sidecar path");
const scenario = process.argv[3] ?? "success";
if (!["success", "missing-worker", "missing-native"].includes(scenario)) throw new Error("Invalid proof scenario");
const directory = join(process.cwd(), mode + "-" + scenario);
await mkdir(directory);
const workerUrl = pathToFileURL(workerPath);
const exercise = () => exerciseThreadDriver(pathToFileURL(join(directory, "database with spaces.db")).href, workerUrl);
if (scenario === "success") console.log(JSON.stringify(await exercise()));
else {
  await assert.rejects(exercise, (error) => {
    assert.ok(error instanceof Error);
    if (scenario === "missing-native") assert.match(error.message, /Native proof startup failed:.*Cannot find native binding/s);
    else {
      assert.match(error.message, /Cannot find module|not found|ENOENT|resolve/i);
      assert.ok(error.message.includes(workerPath));
    }
    return true;
  });
  assert.deepEqual(await readdir(directory), []);
  console.log(JSON.stringify({ scope: "thread-driver-startup-failure", mode, scenario, databaseCreated: false }));
}
`,
  );
  const workerEnv = { PROOF_WORKER_PATH: workerPath };
  const javascript = reportSchema.parse(
    JSON.parse(
      await run(consumer, ["bun", "consumer.ts", "javascript"], workerEnv),
    ),
  );
  // The sidecar loads the installed SDK and native addon's package metadata.
  // Bun disables package.json autoloading in compiled executables by default.
  await run(consumer, [
    "bun",
    "build",
    "--compile",
    "--compile-autoload-package-json",
    "consumer.ts",
    "--outfile",
    "thread-consumer",
  ]);
  const compiled = reportSchema.parse(
    JSON.parse(
      await run(
        consumer,
        [join(consumer, "thread-consumer"), "compiled"],
        workerEnv,
      ),
    ),
  );
  // Discover only this installation's native files. Renaming directory entries
  // does not mutate Bun's hardlinked package-cache contents. Each probe starts a
  // fresh process, so an earlier successful load cannot mask a missing artifact.
  const nativePackages = await readdir(
    join(consumer, "node_modules/@tursodatabase"),
  );
  const nativeArtifacts: string[] = [];
  for (const name of nativePackages) {
    const directory = join(consumer, "node_modules/@tursodatabase", name);
    for (const file of await readdir(directory)) {
      if (!file.endsWith(".node")) continue;
      const artifact = await realpath(join(directory, file));
      assert.ok(artifact.startsWith(`${consumer}/`));
      nativeArtifacts.push(artifact);
    }
  }
  assert.ok(nativeArtifacts.length > 0, "Expected an installed native addon");

  // Decoys make an accidental cwd fallback observable even if the SDK catches
  // the decoy's exception. These are synthetic files under our owned temp root.
  const trapSource = `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(trapPath)}, "unexpected dependency resolution");\nthrow new Error("UNRELATED_CWD_DEPENDENCY_LOADED");\n`;
  await writeFile(
    join(unrelated, "package.json"),
    JSON.stringify({
      name: "unrelated-proof-project",
      private: true,
      type: "module",
      imports: { "#index": "./worker.js" },
    }),
  );
  await writeFile(join(unrelated, "worker.js"), trapSource);
  for (const name of [
    "turso-thread-proof",
    "@tursodatabase/database-wasm32-wasi",
    ...nativePackages.map((name) => `@tursodatabase/${name}`),
  ]) {
    const directory = join(unrelated, "node_modules", name);
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({
        name,
        type: "module",
        main: "index.js",
        exports: { ".": "./index.js", "./worker": "./worker.js" },
      }),
    );
    await writeFile(join(directory, "index.js"), trapSource);
    await writeFile(join(directory, "worker.js"), trapSource);
  }
  const launches = [
    {
      mode: "javascript",
      command: ["bun", join(consumer, "consumer.ts"), "javascript"],
    },
    {
      mode: "compiled",
      command: [join(consumer, "thread-consumer"), "compiled"],
    },
  ];
  for (const launch of launches) {
    reportSchema.parse(
      JSON.parse(await run(unrelated, launch.command, workerEnv)),
    );
    assert.equal(await Bun.file(trapPath).exists(), false);
  }
  const startupFailures: z.output<typeof failureSchema>[] = [];
  for (const fault of [
    { scenario: "missing-worker", paths: [workerPath] },
    { scenario: "missing-native", paths: nativeArtifacts },
  ]) {
    const moved: string[] = [];
    try {
      for (const path of fault.paths) {
        await rename(path, `${path}.unavailable`);
        moved.push(path);
      }
      for (const launch of launches) {
        const report = failureSchema.parse(
          JSON.parse(
            await run(
              unrelated,
              [...launch.command, fault.scenario],
              workerEnv,
            ),
          ),
        );
        assert.equal(report.mode, launch.mode);
        assert.equal(report.scenario, fault.scenario);
        assert.equal(await Bun.file(trapPath).exists(), false);
        startupFailures.push(report);
      }
    } finally {
      await Promise.all(
        moved.map((path) => rename(`${path}.unavailable`, path)),
      );
    }
  }
  console.log(
    JSON.stringify({
      scope: "packed-thread-driver-proof",
      unrelatedWorkingDirectory: true,
      cwdDecoysExecuted: false,
      startupFailures,
      javascript,
      compiled,
      installedWorkerSidecar: true,
      workspaceImportsRequired: false,
      libsqlRuntimeInstalled: false,
    }),
  );
} finally {
  await rm(root, { recursive: true, force: true });
}

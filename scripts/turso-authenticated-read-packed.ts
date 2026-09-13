// Opt-in installed authenticated control proof. Explicit JS actors + external Bun,
// including for a compiled owner; never boots the application or deployed data.
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
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "@brains/utils/zod";
import {
  authenticatedSidecarsSchema,
  authenticatedProfileSchema,
} from "./fixtures/turso-authenticated-sidecars";
import { controlActionSchema } from "./fixtures/turso-read-control-protocol";

const profile = authenticatedProfileSchema.parse(process.argv[2] ?? "full");
const full = profile === "full";
const ownerMode = z
  .enum(["both", "javascript", "compiled"])
  .parse(process.argv[3] ?? "both");
function progress(phase: string): void {
  console.error(`[authenticated-pack:${profile}] ${phase}`);
}
const root = await mkdtemp(join(tmpdir(), "turso-auth-read-packed-"));
const candidate = join(root, "candidate");
const consumer = join(root, "consumer");
const tarballs = join(root, "tarballs");
const unrelated = join(root, "unrelated working directory");
const trap = join(unrelated, "unexpected-sidecar-load");
const env: NodeJS.ProcessEnv = {
  ...process.env,
  TMPDIR: root,
  TMP: root,
  TEMP: root,
};
delete env["NODE_PATH"];
delete env["PROOF_AUTH_SIDECARS"];
interface Output {
  code: number;
  stdout: string;
  stderr: string;
}
async function execute(
  cwd: string,
  command: string[],
  extra: Record<string, string> = {},
): Promise<Output> {
  const child = Bun.spawn(command, {
    cwd,
    env: { ...env, ...extra },
    stdout: "pipe",
    stderr: "pipe",
  });
  const stderrOutput = (async (): Promise<string> => {
    const decoder = new TextDecoder();
    let output = "";
    for await (const chunk of child.stderr) {
      process.stderr.write(chunk);
      output += decoder.decode(chunk, { stream: true });
    }
    return output + decoder.decode();
  })();
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    stderrOutput,
  ]);
  return { code, stdout, stderr };
}
async function run(
  cwd: string,
  command: string[],
  extra: Record<string, string> = {},
): Promise<string> {
  const result = await execute(cwd, command, extra);
  if (result.code !== 0)
    throw new Error(
      `Authenticated package command failed (${command[0]}, ${result.code}): ${result.stderr}\n${result.stdout}`,
    );
  return result.stdout;
}
const reportSchema = z.object({
  scope: z.literal("installed-authenticated-large-read-proof"),
  profile: z.literal(profile),
  restoredProgressWrites: z.literal(full ? 15 : 1),
  sizeBytes: z.literal(104857600),
  sha256: z.literal(
    "412f60e4a630f1d60653186ad3d80f2a04e0e1ff779c21f46bf176e304c5a260",
  ),
  fullPayloadDownloads: z.literal(full ? 2 : 0),
  cancellationCases: z
    .array(
      z.object({
        mode: z.enum([
          "before-consumer",
          "request-cancel",
          "control-disconnect",
          "data-disconnect",
        ]),
        receivedBytes: z.number().int().nonnegative(),
        prefixSha256: z.string().length(64).optional(),
      }),
    )
    .length(full ? 10 : 0),
  finalAcknowledgementRequiredAfterFullReceipt: z.literal(full),
  cancellationRetractsReceivedBytes: z.literal(false),
  connectionBoundTickets: z.literal(full),
  unchangedRpcFraming: z.literal(true),
  chunkLimitBytes: z.literal(32768),
  sharedResidentCeiling: z.literal(104857600),
  writerProgressWhileConsumerPaused: z.literal(true),
  creditsReleased: z.literal(true),
  consumerProcessesJoined: z.literal(true),
  durableMainFileRestore: z.literal(true),
  readMaterialization: z.literal("adopted-sdk-backing"),
  restoreVerification: z.literal("adopted-read-fixed-digest"),
  sdkPeakAllocationBoundEstablished: z.literal(false),
  controlClientProcess: z.literal(
    full ? "harness-and-separate-process" : "separate-process",
  ),
  separateProcessControl: z
    .array(
      z.object({
        action: controlActionSchema,
        controlPid: z.number().int().positive(),
        consumerPid: z.number().int().positive(),
      }),
    )
    .length(full ? 4 : 1),
  separateControlLocalOpenFenced: z.literal(true),
  separateControlPayloadActor: z.literal(true),
  separateControlRpcWhileConsumerHeld: z.literal(true),
  applicationRuntimeBooted: z.literal(false),
  hardKilledControlRecovery: z.literal(false),
  hardKilledConsumerJoined: z.literal(true),
  controlReusableAfterConsumerKill: z.literal(true),
  authenticatedUpload: z.literal(false),
  activeScanFaults: z.literal(false),
  packaged: z.literal(true),
  controlAndConsumerRuntime: z.literal("external-bun"),
  runtimeReplaced: z.literal(false),
  imageProcessing: z.literal(false),
  rssBoundEstablished: z.literal(false),
});
let completed = false;
try {
  progress("bundling installed actors");
  await Promise.all(
    [candidate, consumer, tarballs, unrelated].map((path) => mkdir(path)),
  );
  const entries = [
    new URL("./turso-authenticated-large-read.ts", import.meta.url),
    new URL("./fixtures/turso-read-control-process.ts", import.meta.url),
    ...[
      "worker",
      "network-ingress-worker",
      "network-producer",
      "network-read-worker",
      "network-read-consumer",
    ].map(
      (name) =>
        new URL(
          [
            "worker",
            "network-ingress-worker",
            "network-read-worker",
            "transfer-receiver",
          ].includes(name)
            ? `../shared/db/src/turso-worker/${name}.ts`
            : `../shared/db/test/fixtures/turso-thread/${name}.ts`,
          import.meta.url,
        ),
    ),
  ];
  const files = entries.map((entry) =>
    fileURLToPath(entry).split("/").at(-1)?.replace(/\.ts$/, ".js"),
  );
  assert(files.every((file): file is string => file !== undefined));
  const build = await Bun.build({
    entrypoints: entries.map((entry) => fileURLToPath(entry)),
    outdir: candidate,
    naming: "[name].js",
    target: "bun",
    external: ["@tursodatabase/database"],
  });
  if (!build.success)
    throw new AggregateError(build.logs, "Authenticated actor bundle failed");
  await writeFile(
    join(candidate, "package.json"),
    JSON.stringify({
      name: "turso-authenticated-proof",
      version: "0.0.0",
      private: true,
      type: "module",
      files,
      exports: Object.fromEntries(
        files.map((file) => [`./${file}`, `./${file}`]),
      ),
      dependencies: { "@tursodatabase/database": "0.7.2" },
    }),
  );
  progress("packing actor tarball");
  await run(candidate, [
    process.execPath,
    "pm",
    "pack",
    "--destination",
    tarballs,
  ]);
  const [tarball] = (await readdir(tarballs)).filter((file) =>
    file.endsWith(".tgz"),
  );
  assert(tarball);
  await writeFile(
    join(consumer, "package.json"),
    JSON.stringify({
      name: "installed-auth-consumer",
      private: true,
      type: "module",
      dependencies: {
        "turso-authenticated-proof": `file:${join(tarballs, tarball)}`,
      },
    }),
  );
  progress("installing isolated consumer dependencies");
  await run(consumer, [process.execPath, "install", "--ignore-scripts"]);
  const installed = join(consumer, "node_modules/turso-authenticated-proof");
  async function artifact(name: string): Promise<string> {
    const path = await realpath(join(installed, name));
    assert(path.startsWith(`${consumer}/`));
    return path;
  }
  const owner = await artifact("turso-authenticated-large-read.js");
  const control = await artifact("turso-read-control-process.js");
  const nativeWorker = await artifact("worker.js");
  const readBridge = await artifact("network-read-worker.js");
  const readConsumer = await artifact("network-read-consumer.js");
  const uploadBridge = await artifact("network-ingress-worker.js");
  const producer = await artifact("network-producer.js");
  const bunExecutable = await realpath(process.execPath);
  const sidecars = authenticatedSidecarsSchema.parse({
    nativeWorker: pathToFileURL(nativeWorker).href,
    readBridge: pathToFileURL(readBridge).href,
    consumer: pathToFileURL(readConsumer).href,
    uploadBridge: pathToFileURL(uploadBridge).href,
    producer: pathToFileURL(producer).href,
    control: pathToFileURL(control).href,
    bunExecutable,
  });
  const runtimeEnv = { PROOF_AUTH_SIDECARS: JSON.stringify(sidecars) };
  assert.equal(
    await Bun.file(
      join(consumer, "node_modules/@libsql/client/package.json"),
    ).exists(),
    false,
  );
  if (ownerMode !== "javascript") {
    progress("compiling owner");
    await run(consumer, [
      bunExecutable,
      "build",
      "--compile",
      "--compile-autoload-package-json",
      owner,
      "--outfile",
      "authenticated-owner",
    ]);
  }
  const trapSource = `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(trap)}, "unexpected resolution"); throw new Error("AUTHENTICATED_CWD_FALLBACK");`;
  for (const file of files) await writeFile(join(unrelated, file), trapSource);
  for (const name of [
    "turso-authenticated-proof",
    ...(await readdir(join(consumer, "node_modules/@tursodatabase"))).map(
      (name) => `@tursodatabase/${name}`,
    ),
  ]) {
    const directory = join(unrelated, "node_modules", name);
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({
        name,
        type: "module",
        main: "index.js",
        exports: {
          ".": "./index.js",
          ...Object.fromEntries(
            files.map((file) => [`./${file}`, `./${file}`]),
          ),
        },
      }),
    );
    await writeFile(join(directory, "index.js"), trapSource);
    for (const file of files)
      await writeFile(join(directory, file), trapSource);
  }
  const launches = [
    {
      mode: "javascript",
      command: [bunExecutable, owner, "installed", profile],
    },
    {
      mode: "compiled",
      command: [join(consumer, "authenticated-owner"), "installed", profile],
    },
  ];
  const selectedLaunches = launches.filter(
    (launch) => ownerMode === "both" || launch.mode === ownerMode,
  );
  const reports: { mode: string; proof: z.output<typeof reportSchema> }[] = [];
  for (const launch of selectedLaunches) {
    progress(`${launch.mode}: starting ${profile} proof`);
    const proof = reportSchema.parse(
      JSON.parse(await run(unrelated, launch.command, runtimeEnv)),
    );
    assert.deepEqual(
      proof.separateProcessControl.map((entry) => entry.action),
      full
        ? ["complete", "cancel", "disconnect", "consumer-kill"]
        : ["consumer-kill"],
    );
    for (const entry of proof.separateProcessControl)
      assert.notEqual(entry.controlPid, entry.consumerPid);
    assert.deepEqual(
      proof.cancellationCases.map((entry) => entry.receivedBytes),
      full
        ? [
            0, 32768, 32768, 32768, 17825792, 17825792, 17825792, 104857600,
            104857600, 104857600,
          ]
        : [],
    );
    assert.equal(await Bun.file(trap).exists(), false);
    reports.push({ mode: launch.mode, proof });
    progress(`${launch.mode}: proof passed`);
  }
  const failures: {
    mode: string;
    scenario: string;
    rejected: true;
    fixtureCleanupConfirmed: true;
  }[] = [];
  if (full) {
    await rename(control, `${control}.unavailable`);
    try {
      for (const launch of selectedLaunches) {
        progress(`${launch.mode}: missing-control-sidecar probe`);
        const before = (await readdir(root)).sort();
        const result = await execute(unrelated, launch.command, runtimeEnv);
        assert.notEqual(result.code, 0);
        assert.equal(result.stdout.trim(), "");
        assert(
          result.stderr.includes(control),
          "Expected the explicit failed control artifact path",
        );
        assert.deepEqual(
          (await readdir(root)).sort(),
          before,
          "Unconfirmed native cleanup must not be advertised as removed fixture data",
        );
        assert.equal(await Bun.file(trap).exists(), false);
        failures.push({
          mode: launch.mode,
          scenario: "missing-control-sidecar",
          rejected: true,
          fixtureCleanupConfirmed: true,
        });
      }
    } finally {
      await rename(`${control}.unavailable`, control);
    }
  }
  progress("selected checks complete; removing confirmed-clean fixture");
  console.log(
    JSON.stringify({
      scope: "packed-authenticated-read-proof",
      profile,
      artifactFailureProbesRun: full,
      ownerModeSelection: ownerMode,
      unrelatedWorkingDirectory: true,
      cwdDecoysExecuted: false,
      installedActors: files,
      libsqlRuntimeInstalled: false,
      workspaceImportsRequired: false,
      externalBunRequired: true,
      reports,
      failures,
      applicationRuntimeBooted: false,
      hardKilledControlRecovery: false,
    }),
  );
  completed = true;
} finally {
  if (completed) await rm(root, { recursive: true, force: true });
  else
    console.error(
      `Retained authenticated package fixture after failure: ${root}`,
    );
}

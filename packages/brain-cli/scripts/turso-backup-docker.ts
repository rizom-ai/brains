#!/usr/bin/env bun
/** Opt-in, LOCAL Docker rehearsal. Never contacts a fleet host or boots a brain app. */
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { strict as assert } from "node:assert";
import { z } from "@brains/utils/zod";
import { getErrorMessage } from "@brains/utils/error";
import { resolveDeployScriptPath } from "@brains/deploy-support";
import {
  parsePredeployBackupOutput,
  renderPredeployBackupRemoteScript,
} from "@brains/deploy-support/deploy-scripts/create-predeploy-backup";

const runId = crypto.randomUUID();
const scopeLabel = `ai.rizom.backup-rehearsal=${runId}`;
const image = `brains-turso-backup-rehearsal:${runId}`;
const root = await mkdtemp(join(tmpdir(), "brains-backup-docker-"));
const reportPath = join(tmpdir(), `brains-backup-docker-${runId}.json`);
const context = join(root, "context");
const owner = `backup-owner-${runId}`;
const restored = `backup-restored-${runId}`;
const service = `backup-fixture-${runId}`;
const dockerEnv = {
  ...process.env,
  DOCKER_HOST: "unix:///var/run/docker.sock",
};
delete dockerEnv["DOCKER_CONTEXT"];
delete dockerEnv["DOCKER_TLS_VERIFY"];
delete dockerEnv["DOCKER_CERT_PATH"];
let imageReady = false;
const stages: string[] = [];
const proofSchema = z.object({
  scope: z.literal("docker-protocol-fixture"),
  sessionValid: z.literal(true),
  settingsDecrypt: z.literal(true),
  signingKeyId: z.string(),
  signingKeyPreserved: z.literal(true),
  signatureVerified: z.literal(true),
  passkeyCounter: z.literal(7),
  entityContent: z.literal("Docker recovery corpus"),
  vectorBytes: z.literal(6144),
  imagePreserved: z.literal(true),
  conversationContent: z.literal("Preserve this conversation"),
  jobStatus: z.enum(["pending", "completed"]),
  executions: z.string(),
});

async function run(
  args: string[],
  input?: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const child = Bun.spawn(["docker", ...args], {
    env: dockerEnv,
    stdin: input === undefined ? "ignore" : "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  if (input !== undefined && typeof child.stdin !== "number") {
    await child.stdin.write(input);
    await child.stdin.end();
  }
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { code, stdout, stderr };
}
async function docker(args: string[], input?: string): Promise<string> {
  const result = await run(args, input);
  if (result.code !== 0)
    throw new Error(
      `Docker ${args[0]} failed (${result.code}): ${result.stderr}`,
    );
  return result.stdout.trim();
}
async function bundle(entry: string): Promise<string> {
  const result = await Bun.build({
    entrypoints: [entry],
    target: "bun",
    external: ["@tursodatabase/database"],
  });
  const output = result.outputs[0];
  if (!result.success || !output) throw new Error("Rehearsal bundle failed");
  return output.text();
}
async function healthy(name: string): Promise<void> {
  const generation = await docker([
    "inspect",
    name,
    "--format",
    "{{.State.StartedAt}}",
  ]);
  const parts = /^(.*:\d{2})(?:\.(\d{1,9}))?Z$/.exec(generation);
  if (!parts?.[1]) throw new Error("Invalid Docker start timestamp");
  const generationNs =
    BigInt(Date.parse(`${parts[1]}Z`)) * 1_000_000n +
    BigInt((parts[2] ?? "").padEnd(9, "0"));
  const health = await docker([
    "inspect",
    name,
    "--format",
    "{{.State.Health.Status}}",
  ]);
  if (health === "healthy") return;
  const events = Bun.spawn(
    [
      "docker",
      "events",
      "--since",
      generation,
      "--filter",
      `container=${name}`,
      "--format",
      "{{.TimeNano}} {{.Action}}",
    ],
    { env: dockerEnv, stdout: "pipe", stderr: "pipe" },
  );
  const reader = events.stdout.getReader();
  const diagnostic = new Response(events.stderr).text();
  let pending = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done)
        throw new Error(
          `Docker events ended before readiness: ${await diagnostic}`,
        );
      pending += new TextDecoder().decode(chunk.value);
      let newline: number;
      while ((newline = pending.indexOf("\n")) !== -1) {
        const line = pending.slice(0, newline).trim();
        pending = pending.slice(newline + 1);
        const separator = line.indexOf(" ");
        const timestamp = line.slice(0, separator);
        if (!/^\d+$/.test(timestamp))
          throw new Error("Invalid Docker event timestamp");
        if (BigInt(timestamp) < generationNs) continue;
        const event = line.slice(separator + 1);
        if (event === "health_status: healthy") return;
        if (["health_status: unhealthy", "die", "destroy"].includes(event))
          throw new Error(`Fixture did not become healthy: ${event}`);
      }
    }
  } finally {
    reader.releaseLock();
    events.kill();
    await events.exited;
    await diagnostic;
  }
}
async function start(name: string): Promise<void> {
  await docker(["start", name]);
  try {
    await healthy(name);
  } catch (error) {
    const logs = await run(["logs", "--tail", "50", name]);
    const state = await docker([
      "inspect",
      name,
      "--format",
      "{{json .State}}",
    ]);
    throw new Error(
      `Fixture startup failed: ${state}\n${logs.stdout}${logs.stderr}`,
      { cause: error },
    );
  }
}
async function proof(
  name: string,
  execute = false,
): Promise<z.infer<typeof proofSchema>> {
  const body = await docker([
    "exec",
    name,
    "bun",
    "-e",
    `const r = await fetch("http://127.0.0.1:8080/${execute ? "execute-fixture-job" : "proof"}", {method: "${execute ? "POST" : "GET"}"}); if (!r.ok) throw new Error("Fixture request failed"); process.stdout.write(await r.text());`,
  ]);
  return proofSchema.parse(JSON.parse(body));
}
async function coordinator(program: string): ReturnType<typeof run> {
  // Change ONLY sandbox filesystem locations; execute the real Docker protocol.
  const script = renderPredeployBackupRemoteScript({
    captureProgramBase64: Buffer.from(program).toString("base64"),
  })
    .replaceAll("/opt/", `${root}/`)
    .replaceAll("/run/brains-", `${root}/run/brains-`);
  return run(
    [
      "run",
      "--rm",
      "-i",
      "--network",
      "none",
      "--volume",
      "/var/run/docker.sock:/var/run/docker.sock",
      "--volume",
      `${root}:${root}`,
      "--entrypoint",
      "bash",
      image,
      "-s",
      "--",
      runId,
      "rehearsal",
      service,
      "5",
    ],
    script,
  );
}

try {
  await docker(["info", "--format", "{{.ServerVersion}}"]);
  await mkdir(context);
  for (const directory of [
    "brain-state",
    "brain-runtime",
    "brain-data",
    "brain-config",
    "run",
    "restore",
  ])
    await mkdir(join(root, directory));
  await writeFile(join(root, "brain.yaml"), "name: isolated-backup-fixture\n");
  await mkdir(join(context, "dist/migrations"), { recursive: true });
  const fixture = resolve(
    import.meta.dir,
    "../test/fixtures/turso-backup-docker",
  );
  for (const name of ["owner", "init-git"])
    await writeFile(
      join(context, `dist/${name}.js`),
      await bundle(join(fixture, `${name}.ts`)),
    );
  for (const name of [
    "auth-service",
    "entity-service",
    "job-queue",
    "conversation-service",
    "runtime-state",
  ])
    await cp(
      resolve(import.meta.dir, `../../../shell/${name}/drizzle`),
      join(context, `dist/migrations/${name}`),
      { recursive: true },
    );
  await writeFile(
    join(context, "package.json"),
    JSON.stringify({
      private: true,
      type: "module",
      dependencies: { "@tursodatabase/database": "0.7.2" },
    }),
  );
  // This is explicitly synthetic version metadata for the protocol fixture, not
  // a relabeled canonical runtime artifact. Production/fleet gates stay open.
  await writeFile(
    join(context, "fixture-package.json"),
    JSON.stringify({
      name: "@fixture/backup-owner",
      version: "0.3.0-rehearsal",
    }),
  );
  await writeFile(
    join(context, "Dockerfile"),
    `FROM oven/bun:1.4.0-slim
RUN apt-get update && apt-get install -y --no-install-recommends git curl ca-certificates docker-cli tini && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json .
RUN bun install --production --ignore-scripts
COPY dist ./dist
RUN mkdir -p node_modules/@rizom/brain data/auth brain-data /data /config
COPY fixture-package.json node_modules/@rizom/brain/package.json
LABEL ai.rizom.backup-rehearsal="${runId}"
HEALTHCHECK --interval=1s --timeout=2s --start-period=5s --retries=3 CMD curl --fail --silent http://127.0.0.1:8080/health/live || exit 1
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["bun", "dist/owner.js"]
`,
  );
  console.log(
    "Building isolated Docker fixture (no fleet host or production data).",
  );
  await docker(["build", "--tag", image, context]);
  imageReady = true;
  stages.push("image-built");
  const key = crypto.randomUUID() + crypto.randomUUID();
  const mounts = [
    ["brain-state", "/data"],
    ["brain-runtime", "/app/data"],
    ["brain-data", "/app/brain-data"],
    ["brain-config", "/config"],
    ["brain.yaml", "/app/brain.yaml"],
  ];
  await docker([
    "create",
    "--name",
    owner,
    "--network",
    "none",
    "--label",
    `service=${service}`,
    "--label",
    "role=web",
    ...mounts.flatMap(([from, to]) => ["--volume", `${root}/${from}:${to}`]),
    "--env",
    `ACCOUNT_SETTINGS_ENCRYPTION_KEY=${key}`,
    image,
  ]);
  await docker([
    "run",
    "--rm",
    "--network",
    "none",
    "--volumes-from",
    owner,
    "--entrypoint",
    "bun",
    image,
    "dist/init-git.js",
  ]);
  await start(owner);
  const original = await proof(owner);
  assert.equal(original.jobStatus, "completed");
  assert.equal(original.executions, "0");
  stages.push("real-auth-stores-seeded");
  const program = await bundle(
    resolveDeployScriptPath("create-predeploy-backup.ts"),
  );
  const captured = await coordinator(program);
  if (captured.code !== 0)
    throw new Error(`Real Docker backup failed: ${captured.stderr}`);
  const snapshot = parsePredeployBackupOutput(captured.stdout);
  assert(snapshot.applicable);
  const resumed = await proof(owner);
  assert.equal(resumed.signingKeyId, original.signingKeyId);
  assert.equal(resumed.jobStatus, "pending");
  assert.equal(resumed.executions, "0");
  stages.push("backup-captured-verified-and-owner-restarted");
  await docker(
    [
      "run",
      "--rm",
      "-i",
      "--network",
      "none",
      "--volume",
      `${snapshot.backupPath}:/backup:ro`,
      "--volume",
      `${root}/restore:/restore:rw`,
      "--env",
      "BACKUP_DIR=/backup",
      "--env",
      "RESTORE_DIR=/restore/new-state",
      "--entrypoint",
      "bun",
      image,
      "run",
      "-",
      "--restore",
    ],
    program,
  );
  stages.push("standalone-restore-verified");
  const restoredEnv = z
    .array(z.string())
    .parse(
      JSON.parse(
        await docker([
          "run",
          "--rm",
          "--network",
          "none",
          "--volume",
          `${root}/restore/new-state:/restore:ro`,
          "--entrypoint",
          "bun",
          image,
          "-e",
          'process.stdout.write(await Bun.file("/restore/runtime-environment.json").text())',
        ]),
      ),
    );
  const accountKey = restoredEnv.find((entry) =>
    entry.startsWith("ACCOUNT_SETTINGS_ENCRYPTION_KEY="),
  );
  assert(accountKey);
  await docker([
    "create",
    "--name",
    restored,
    "--network",
    "none",
    "--volume",
    `${root}/restore/new-state/data:/data`,
    "--volume",
    `${root}/restore/new-state/data/auth:/app/data/auth`,
    "--volume",
    `${root}/restore/new-state/content:/app/brain-data`,
    "--volume",
    `${root}/restore/new-state/config:/config`,
    "--volume",
    `${root}/restore/new-state/brain.yaml:/app/brain.yaml`,
    "--env",
    accountKey,
    image,
  ]);
  await start(restored);
  const recovered = await proof(restored);
  assert.deepEqual(recovered, resumed);
  const executed = await proof(restored, true);
  assert.equal(executed.executions, "1");
  assert.equal(executed.jobStatus, "completed");
  await docker(["stop", "-t", "-1", restored]);
  await start(restored);
  assert.deepEqual(await proof(restored), executed);
  stages.push(
    "restored-auth-decryption-session-signature-and-controlled-job-restart",
  );
  // Clear the source fixture intent so the normal idle preflight can run again.
  const beforeFailure = await proof(owner, true);
  const failed = await coordinator(
    'throw new Error("Injected Docker capture failure");',
  );
  assert.notEqual(failed.code, 0);
  assert(!failed.stdout.includes("VERIFICATION=passed"));
  assert.deepEqual(await proof(owner), beforeFailure);
  stages.push("real-docker-capture-failure-restarted-original");
  const report = {
    outcome: "passed",
    scope: "local-docker-protocol-fixture",
    runId,
    stages,
    auth: {
      sessionPreserved: recovered.sessionValid,
      settingsDecrypted: recovered.settingsDecrypt,
      signingKeyPreserved: recovered.signingKeyPreserved,
      signatureVerified: recovered.signatureVerified,
      passkeyCounter: recovered.passkeyCounter,
    },
    imageAssetPreserved: recovered.imagePreserved,
    canonicalBrainBoot: false,
    browserPasskeyLogin: false,
    realPluginJobReplay: false,
    fleetTouched: false,
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, {
    mode: 0o600,
  });
  console.log(`Docker rehearsal passed: ${reportPath}`);
} catch (error) {
  await writeFile(
    reportPath,
    `${JSON.stringify({ outcome: "failed", scope: "local-docker-protocol-fixture", runId, stages, message: getErrorMessage(error) }, null, 2)}\n`,
    { mode: 0o600 },
  );
  console.error(`Docker rehearsal failed; diagnostic report: ${reportPath}`);
  throw error;
} finally {
  const owned = (await docker(["ps", "-aq", "--filter", `label=${scopeLabel}`]))
    .split(/\s+/)
    .filter(Boolean);
  if (owned.length) await docker(["rm", "-f", ...owned]);
  if (imageReady) {
    // Root-created private directories require container-root cleanup. The bind
    // source is ONLY this run's mkdtemp directory; never prune images/volumes.
    await docker([
      "run",
      "--rm",
      "--network",
      "none",
      "--volume",
      `${root}:/cleanup`,
      "--entrypoint",
      "bun",
      image,
      "-e",
      'import {readdir,rm} from "node:fs/promises"; for (const name of await readdir("/cleanup")) await rm(`/cleanup/${name}`,{recursive:true,force:true});',
    ]);
    await docker(["image", "rm", image]);
  }
  await rm(root, { recursive: true, force: true });
}

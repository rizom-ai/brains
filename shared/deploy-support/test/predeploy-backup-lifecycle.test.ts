import { afterEach, describe, expect, it } from "bun:test";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { renderPredeployBackupRemoteScript } from "../src/deploy-scripts/create-predeploy-backup";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});

async function runLifecycle(mode: string): Promise<{
  code: number;
  stdout: string;
  stderr: string;
  calls: string[][];
  state: { web: boolean; worker: boolean };
  backups: string[];
  maintenance: boolean;
}> {
  const root = await mkdtemp(join(tmpdir(), "offline-backup-lifecycle-"));
  roots.push(root);
  for (const path of [
    "bin",
    "run",
    "brain-state",
    "brain-runtime/auth",
    "brain-data/.git",
    "brain-config",
  ])
    await mkdir(join(root, path), { recursive: true });
  for (const path of [
    "brain-state/brain.db",
    "brain-state/brain-jobs.db",
    "brain-state/conversations.db",
    "brain-state/runtime-state.db",
    "brain-runtime/auth/auth.db",
    "brain.yaml",
  ])
    await writeFile(join(root, path), "fixture");
  await writeFile(
    join(root, "state.json"),
    JSON.stringify({ web: true, worker: true, restarted: false }),
  );
  await writeFile(join(root, "calls.jsonl"), "");
  const docker = join(root, "bin/docker");
  await writeFile(
    docker,
    `#!${process.execPath}
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
const root = process.env.FIXTURE_ROOT;
const args = process.argv.slice(2);
appendFileSync(root + "/calls.jsonl", JSON.stringify(args) + "\\n");
const state = JSON.parse(readFileSync(root + "/state.json", "utf8"));
const mode = process.env.FIXTURE_MODE;
const format = args[args.indexOf("--format") + 1];
const save = () => writeFileSync(root + "/state.json", JSON.stringify(state));
const out = (value) => console.log(value);
switch (args[0]) {
  case "ps":
    if (args.includes("label=role=web")) { if (state.web) out("web"); }
    else { if (state.web) out("web"); if (state.worker) out("worker"); }
    break;
  case "inspect": {
    const id = args[1];
    if (format.includes(".Config.Env")) out(JSON.stringify(["ACCOUNT_SETTINGS_ENCRYPTION_KEY=fixture-secret-never-log"]));
    else if (format.includes("range .Mounts")) out([root + "/brain-state /data", root + "/brain-runtime /app/data", root + "/brain-data /app/brain-data", root + "/brain-config /config", root + "/brain.yaml /app/brain.yaml"].join("\\n"));
    else if (format.includes(".Config.Labels")) out("worker");
    else if (format === "{{.State.Health.Status}}") out("healthy");
    else if (format === "{{.State.StartedAt}}") out("1970-01-01T00:00:00.000000001Z");
    else if (format === "{{.State.Status}} {{.State.Health.Status}}") out(state[id] ? "running starting" : "exited unhealthy");
    else if (format.includes(".State.ExitCode")) out(state[id] ? "running 0 false" : "exited 0 false");
    else if (format === "{{.Image}}") out("sha256:fixture");
    else out("{}");
    break;
  }
  case "image": out("fixture@sha256:digest"); break;
  case "exec":
    if (args.at(-1).includes("pkg") || args.at(-1).includes("package.json")) out("0.3.0-alpha.1");
    break;
  case "stop":
    if (mode === "stop-failure" && args.at(-1) === "worker") process.exit(12);
    state[args.at(-1)] = false; save(); break;
  case "start":
    if (mode === "restart-failure") process.exit(13);
    state[args[1]] = true; state.restarted = true; save(); break;
  case "events":
    out("0 die");
    out("0 health_status: healthy");
    out(mode === "unhealthy" ? "2 health_status: unhealthy" : "2 health_status: healthy");
    // Keep the coprocess open until the coordinator explicitly terminates it.
    for await (const chunk of Bun.stdin.stream()) { void chunk; }
    break;
  case "run": {
    if (state.web || state.worker) throw new Error("Capture ran before all writers stopped");
    await new Response(Bun.stdin.stream()).text();
    if (mode === "capture-failure") process.exit(17);
    if (mode === "interrupted") { process.kill(Number(process.env.TEST_SHELL_PID), "SIGTERM"); process.exit(143); }
    if (mode === "hard-killed") { process.kill(Number(process.env.TEST_SHELL_PID), "SIGKILL"); process.exit(137); }
    if (mode === "restart-failure" || mode === "success" || mode === "unhealthy") {
      const volume = args[args.indexOf("--volume") + 1].replace(/:\\/backup:rw$/, "");
      writeFileSync(volume + "/manifest.json", JSON.stringify({ outcome: "verified", engine: "turso" }, null, 2));
    }
    break;
  }
  case "rm": break;
  default: throw new Error("Unexpected Docker command: " + args[0]);
}
`,
  );
  await chmod(docker, 0o755);
  const script = renderPredeployBackupRemoteScript()
    .replaceAll("/opt/", `${root}/`)
    .replaceAll("/run/brains-", `${root}/run/brains-`)
    .replace(
      "set -euo pipefail",
      () => "set -euo pipefail\nexport TEST_SHELL_PID=$$",
    );
  const child = Bun.spawn(
    ["bash", "-s", "--", "fixture", "target", "brain", "5"],
    {
      env: {
        ...process.env,
        PATH: `${root}/bin:${process.env["PATH"]}`,
        FIXTURE_ROOT: root,
        FIXTURE_MODE: mode,
      },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  await child.stdin.write(script);
  await child.stdin.end();
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  const calls: string[][] = (await readFile(join(root, "calls.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const state: { web: boolean; worker: boolean } = JSON.parse(
    await readFile(join(root, "state.json"), "utf8"),
  );
  return {
    code,
    stdout,
    stderr,
    calls,
    state,
    backups: await readdir(join(root, "brain-state/backups")),
    maintenance: await Bun.file(
      join(root, "brain-state/offline-backup-in-progress"),
    ).exists(),
  };
}

describe("offline backup process coordination", () => {
  it("stops workers before owner, verifies offline, restarts and waits for health before publishing", async () => {
    const result = await runLifecycle("success");
    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    expect(result.state).toMatchObject({ web: true, worker: true });
    expect(
      result.calls
        .filter((args) => args[0] === "stop")
        .map((args) => args.at(-1)),
    ).toEqual(["worker", "web"]);
    const capture = result.calls.findIndex((args) => args[0] === "run");
    const restart = result.calls.findIndex((args) => args[0] === "start");
    expect(capture).toBeGreaterThan(-1);
    expect(restart).toBeGreaterThan(capture);
    expect(result.calls.some((args) => args[0] === "events")).toBe(true);
    expect(result.stdout).toContain("VERIFICATION=passed");
    expect(result.maintenance).toBe(false);
    expect(result.stdout + result.stderr).not.toContain(
      "fixture-secret-never-log",
    );
    expect(result.backups).toHaveLength(1);
    expect(result.backups[0]?.endsWith(".incomplete")).toBe(false);
  });

  for (const mode of ["capture-failure", "stop-failure", "interrupted"]) {
    it(`restarts the original processes after ${mode}, without publishing success`, async () => {
      const result = await runLifecycle(mode);
      expect(result.code).not.toBe(0);
      expect(result.state).toMatchObject({ web: true, worker: true });
      expect(result.stdout).not.toContain("VERIFICATION=passed");
      expect(result.maintenance).toBe(false);
      expect(result.backups).toHaveLength(1);
      expect(result.backups[0]?.endsWith(".incomplete")).toBe(true);
      if (mode !== "stop-failure")
        expect(result.calls.some((args) => args[0] === "rm")).toBe(true);
    });
  }

  it("leaves a durable recovery marker after an uncatchable termination", async () => {
    const result = await runLifecycle("hard-killed");
    expect(result.code).not.toBe(0);
    expect(result.state).toMatchObject({ web: false, worker: false });
    expect(result.maintenance).toBe(true);
    expect(result.stdout).not.toContain("VERIFICATION=passed");
    expect(result.backups[0]?.endsWith(".incomplete")).toBe(true);
  });

  it("does not accept an old healthy event when the restarted container becomes unhealthy", async () => {
    const result = await runLifecycle("unhealthy");
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("operator recovery required");
    expect(result.stdout).not.toContain("VERIFICATION=passed");
    expect(result.maintenance).toBe(true);
  });

  it("reports restart failure rather than advertising success", async () => {
    const result = await runLifecycle("restart-failure");
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("operator recovery required");
    expect(result.maintenance).toBe(true);
    expect(result.stdout).not.toContain("VERIFICATION=passed");
    expect(result.state).toMatchObject({ web: false, worker: false });
    expect(result.backups[0]?.endsWith(".incomplete")).toBe(true);
  });
});

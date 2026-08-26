import { describe, expect, it } from "bun:test";
import { createTempDirSync } from "@brains/test-utils";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  BRAIN_WATCHDOG_LABEL_FILTER,
  buildHealthWatchdogInstallScript,
  healthWatchdogScript,
  healthWatchdogServiceUnit,
  healthWatchdogTimerUnit,
} from "../src/deploy-scripts/install-health-watchdog";

interface FakeContainer {
  id: string;
  health: "healthy" | "unhealthy";
  watchdogLabel?: string;
  service?: string;
  name: string;
  logsFail?: boolean;
}

interface WatchdogHarness {
  binDir: string;
  callsPath: string;
  fixturePath: string;
  incidentDir: string;
  lockPath: string;
  stateDir: string;
}

function expectValidBash(script: string): void {
  const result = spawnSync("bash", ["-n"], {
    input: script,
    encoding: "utf8",
  });
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
}

function createWatchdogHarness(
  containers: readonly FakeContainer[],
): WatchdogHarness {
  const root = createTempDirSync("brain-watchdog-test-");
  const binDir = join(root, "bin");
  const incidentDir = join(root, "incidents");
  const stateDir = join(root, "state");
  const callsPath = join(root, "calls.log");
  const fixturePath = join(root, "containers.txt");
  mkdirSync(binDir);
  mkdirSync(incidentDir);
  mkdirSync(stateDir);
  writeFileSync(
    fixturePath,
    containers
      .map((container) =>
        [
          container.id,
          container.health,
          container.watchdogLabel ?? "",
          container.service ?? "",
          container.name,
          container.logsFail === true ? "true" : "false",
        ].join("|"),
      )
      .join("\n") + "\n",
  );
  writeFileSync(
    join(binDir, "docker"),
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >>"$FAKE_DOCKER_CALLS"
case "$1" in
  ps)
    health_filter=""
    label_filter=""
    shift
    while [ "$#" -gt 0 ]; do
      if [ "$1" = "--filter" ]; then
        filter="\${2:-}"
        case "$filter" in
          health=*) health_filter="\${filter#health=}" ;;
          label=*) label_filter="\${filter#label=}" ;;
        esac
        shift 2
      else
        shift
      fi
    done
    while IFS='|' read -r id health watchdog_label service name logs_fail; do
      [ -n "$id" ] || continue
      [ -z "$health_filter" ] || [ "$health" = "$health_filter" ] || continue
      case "$label_filter" in
        "${BRAIN_WATCHDOG_LABEL_FILTER}")
          [ "$watchdog_label" = "true" ] || continue
          ;;
        service)
          [ -n "$service" ] || continue
          ;;
        "") ;;
        *) continue ;;
      esac
      printf '%s\\n' "$id"
    done <"$FAKE_DOCKER_FIXTURES"
    ;;
  inspect)
    container_id="\${!#}"
    found=false
    while IFS='|' read -r id health watchdog_label service name logs_fail; do
      [ "$id" = "$container_id" ] || continue
      found=true
      if [[ "$*" == *'.Config.Labels "service"'* ]]; then
        printf '%s\\n' "$service"
      elif [[ "$*" == *'.Name'* ]]; then
        printf '%s\\n' "$name"
      else
        printf '{"id":"%s","State":{"Health":{"Status":"%s"}}}\\n' "$id" "$health"
      fi
      break
    done <"$FAKE_DOCKER_FIXTURES"
    [ "$found" = true ]
    ;;
  logs)
    container_id="\${!#}"
    while IFS='|' read -r id health watchdog_label service name logs_fail; do
      [ "$id" = "$container_id" ] || continue
      printf 'captured application logs container=%s\\n' "$container_id"
      [ "$logs_fail" != "true" ]
      exit
    done <"$FAKE_DOCKER_FIXTURES"
    exit 1
    ;;
  restart)
    printf '%s\\n' "$2"
    ;;
  *)
    exit 1
    ;;
esac
`,
  );
  writeFileSync(join(binDir, "logger"), "#!/usr/bin/env bash\nexit 0\n");
  // The watchdog opens with `flock -n 9 || exit 0`, and macOS ships no
  // flock(1): the missing binary fails that guard, so the script exits
  // silently before doing any work. No test here exercises lock contention,
  // so a fake that always acquires keeps the script's behavior identical on
  // Linux and macOS.
  writeFileSync(join(binDir, "flock"), "#!/usr/bin/env bash\nexit 0\n");
  chmodSync(join(binDir, "docker"), 0o755);
  chmodSync(join(binDir, "logger"), 0o755);
  chmodSync(join(binDir, "flock"), 0o755);

  return {
    binDir,
    callsPath,
    fixturePath,
    incidentDir,
    lockPath: join(root, "watchdog.lock"),
    stateDir,
  };
}

function runWatchdog(harness: WatchdogHarness, attempts = 1): void {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const result = spawnSync("bash", [], {
      input: healthWatchdogScript,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${harness.binDir}:${process.env["PATH"] ?? ""}`,
        FAKE_DOCKER_CALLS: harness.callsPath,
        FAKE_DOCKER_FIXTURES: harness.fixturePath,
        BRAIN_WATCHDOG_INCIDENT_DIR: harness.incidentDir,
        BRAIN_WATCHDOG_STATE_DIR: harness.stateDir,
        BRAIN_WATCHDOG_LOCK_PATH: harness.lockPath,
      },
    });
    expect(result.status).toBe(0);
  }
}

function readCalls(harness: WatchdogHarness): string[] {
  return readFileSync(harness.callsPath, "utf8").trim().split("\n");
}

describe("health watchdog deployment artifacts", () => {
  it("renders syntactically valid host scripts and systemd units", () => {
    const installScript = buildHealthWatchdogInstallScript();
    expectValidBash(healthWatchdogScript);
    expectValidBash(installScript);

    expect(healthWatchdogServiceUnit).toContain(
      "ExecStart=/usr/local/sbin/brains-health-watchdog",
    );
    expect(healthWatchdogTimerUnit).toContain("OnUnitActiveSec=30s");
    expect(healthWatchdogScript).toContain("BRAIN_WATCHDOG_INCIDENT_DIR");
    expect(healthWatchdogScript).toContain("BRAIN_WATCHDOG_STATE_DIR");
    expect(healthWatchdogScript).toContain("BRAIN_WATCHDOG_LOCK_PATH");
    expect(healthWatchdogScript).toContain("flock -n 9 || exit 0");
    expect(healthWatchdogScript).toContain("umask 077");
    expect(healthWatchdogScript).toContain(".HostConfig.RestartPolicy");
    expect(healthWatchdogScript).toContain(
      `--filter label=${BRAIN_WATCHDOG_LABEL_FILTER}`,
    );
    expect(healthWatchdogScript).not.toContain("--filter label=service ");
    expect(healthWatchdogScript).not.toContain(
      '\n    docker inspect "$container_id"\n',
    );
    expect(installScript).toContain(
      `docker ps --filter label=${BRAIN_WATCHDOG_LABEL_FILTER}`,
    );
    expect(installScript).toContain("no running Brain containers found");
  });

  it("keeps a zero-match post-install diagnostic non-fatal", () => {
    const root = createTempDirSync("brain-watchdog-install-test-");
    const binDir = join(root, "bin");
    mkdirSync(binDir);
    writeFileSync(join(binDir, "id"), "#!/usr/bin/env bash\necho 1000\n");
    writeFileSync(
      join(binDir, "sudo"),
      `#!/usr/bin/env bash
set -euo pipefail
case "$1" in
  base64) shift; command base64 "$@" ;;
  tee) cat >/dev/null ;;
  chmod|systemctl) exit 0 ;;
  docker) exit 0 ;;
  *) exit 1 ;;
esac
`,
    );
    chmodSync(join(binDir, "id"), 0o755);
    chmodSync(join(binDir, "sudo"), 0o755);

    const result = spawnSync("bash", [], {
      input: buildHealthWatchdogInstallScript(),
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env["PATH"] ?? ""}`,
      },
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toContain("no running Brain containers found");
    expect(result.stderr).toContain(BRAIN_WATCHDOG_LABEL_FILTER);
  });

  it("touches only unhealthy exact-labelled Brain containers", () => {
    const harness = createWatchdogHarness([
      {
        id: "brain-unhealthy",
        health: "unhealthy",
        watchdogLabel: "true",
        service: "brain",
        name: "/brain-current",
      },
      {
        id: "brain-without-service",
        health: "unhealthy",
        watchdogLabel: "true",
        name: "/brain-secondary",
      },
      {
        id: "generic-unhealthy",
        health: "unhealthy",
        service: "unrelated-kamal-service",
        name: "/unrelated-current",
      },
      {
        id: "brain-healthy",
        health: "healthy",
        watchdogLabel: "true",
        service: "brain",
        name: "/brain-healthy",
      },
      {
        id: "brain-label-false",
        health: "unhealthy",
        watchdogLabel: "false",
        service: "brain-lookalike",
        name: "/brain-lookalike",
      },
    ]);

    runWatchdog(harness, 4);

    const calls = readCalls(harness);
    const joinedCalls = calls.join("\n");
    expect(calls[0]).toContain("--filter health=unhealthy");
    expect(calls[0]).toContain(`--filter label=${BRAIN_WATCHDOG_LABEL_FILTER}`);
    const restartCalls = calls.filter((call) => call.startsWith("restart "));
    expect(restartCalls).toHaveLength(6);
    expect(new Set(restartCalls)).toEqual(
      new Set(["restart brain-unhealthy", "restart brain-without-service"]),
    );
    expect(joinedCalls).not.toContain("generic-unhealthy");
    expect(joinedCalls).not.toContain("brain-healthy");
    expect(joinedCalls).not.toContain("brain-label-false");
    expect(readdirSync(harness.stateDir)).toHaveLength(2);
    const incidentFiles = readdirSync(harness.incidentDir);
    expect(incidentFiles.length).toBeGreaterThanOrEqual(2);
    expect(
      incidentFiles.every(
        (name) =>
          name.includes("brain-unhealthy") ||
          name.includes("brain-without-service"),
      ),
    ).toBeTrue();
  });

  it("captures diagnostics before restart and enforces its restart budget", () => {
    const harness = createWatchdogHarness([
      {
        id: "container-1",
        health: "unhealthy",
        watchdogLabel: "true",
        service: "brain",
        name: "/brain-current",
      },
    ]);

    runWatchdog(harness, 4);

    const calls = readCalls(harness);
    const logIndex = calls.findIndex((call) => call.startsWith("logs "));
    const restartIndex = calls.findIndex((call) => call.startsWith("restart "));
    expect(restartIndex).toBeGreaterThan(logIndex);
    expect(calls.filter((call) => call.startsWith("restart "))).toHaveLength(3);

    const incidents = readdirSync(harness.incidentDir).map((name) =>
      readFileSync(join(harness.incidentDir, name), "utf8"),
    );
    expect(
      incidents.some((incident) =>
        incident.includes("captured application logs"),
      ),
    ).toBe(true);
    expect(
      incidents.some((incident) =>
        incident.includes("restart-budget-exhausted"),
      ),
    ).toBe(true);
  });

  it("allows recovery again after the restart window expires", () => {
    const harness = createWatchdogHarness([
      {
        id: "windowed-container",
        health: "unhealthy",
        watchdogLabel: "true",
        service: "brain",
        name: "/brain-windowed",
      },
    ]);

    runWatchdog(harness, 3);
    const stateFile = readdirSync(harness.stateDir)[0];
    expect(stateFile).toBeDefined();
    if (!stateFile) throw new Error("Expected restart state file");
    writeFileSync(join(harness.stateDir, stateFile), "0\n0\n0\n");

    runWatchdog(harness);

    expect(
      readCalls(harness).filter((call) => call.startsWith("restart ")),
    ).toHaveLength(4);
  });

  it("does not restart when diagnostic capture fails", () => {
    const harness = createWatchdogHarness([
      {
        id: "diagnostic-failure",
        health: "unhealthy",
        watchdogLabel: "true",
        service: "brain",
        name: "/brain-diagnostic-failure",
        logsFail: true,
      },
    ]);

    const result = spawnSync("bash", [], {
      input: healthWatchdogScript,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${harness.binDir}:${process.env["PATH"] ?? ""}`,
        FAKE_DOCKER_CALLS: harness.callsPath,
        FAKE_DOCKER_FIXTURES: harness.fixturePath,
        BRAIN_WATCHDOG_INCIDENT_DIR: harness.incidentDir,
        BRAIN_WATCHDOG_STATE_DIR: harness.stateDir,
        BRAIN_WATCHDOG_LOCK_PATH: harness.lockPath,
      },
    });

    expect(result.status).not.toBe(0);
    expect(
      readCalls(harness).some((call) => call.startsWith("logs ")),
    ).toBeTrue();
    expect(
      readCalls(harness).some((call) => call.startsWith("restart ")),
    ).toBeFalse();
  });

  it("keeps colliding sanitized identities on independent budgets", () => {
    const harness = createWatchdogHarness([
      {
        id: "aaaaaaaaaaaa",
        health: "unhealthy",
        watchdogLabel: "true",
        service: "brain/a",
        name: "/current-a",
      },
      {
        id: "bbbbbbbbbbbb",
        health: "unhealthy",
        watchdogLabel: "true",
        service: "brain_a-current",
        name: "/a",
      },
    ]);

    runWatchdog(harness, 4);

    const calls = readCalls(harness);
    expect(calls.filter((call) => call.startsWith("restart "))).toHaveLength(6);
    const stateFiles = readdirSync(harness.stateDir);
    expect(stateFiles).toHaveLength(2);
    expect(stateFiles.some((name) => name.includes("aaaaaaaaaaaa"))).toBeTrue();
    expect(stateFiles.some((name) => name.includes("bbbbbbbbbbbb"))).toBeTrue();
  });
});

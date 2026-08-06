import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildHealthWatchdogInstallScript,
  healthWatchdogScript,
  healthWatchdogServiceUnit,
  healthWatchdogTimerUnit,
} from "../src/deploy-scripts/install-health-watchdog";

function expectValidBash(script: string): void {
  const result = spawnSync("bash", ["-n"], {
    input: script,
    encoding: "utf8",
  });
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
}

describe("health watchdog deployment artifacts", () => {
  it("renders syntactically valid host scripts and systemd units", () => {
    expectValidBash(healthWatchdogScript);
    expectValidBash(buildHealthWatchdogInstallScript());

    expect(healthWatchdogServiceUnit).toContain(
      "ExecStart=/usr/local/sbin/brains-health-watchdog",
    );
    expect(healthWatchdogTimerUnit).toContain("OnUnitActiveSec=30s");
    expect(healthWatchdogScript).toContain("BRAIN_WATCHDOG_INCIDENT_DIR");
    expect(healthWatchdogScript).toContain("BRAIN_WATCHDOG_STATE_DIR");
    expect(healthWatchdogScript).toContain("BRAIN_WATCHDOG_LOCK_PATH");
    expect(healthWatchdogScript).toContain("umask 077");
    expect(healthWatchdogScript).toContain(".HostConfig.RestartPolicy");
    expect(healthWatchdogScript).not.toContain(
      '\n    docker inspect "$container_id"\n',
    );
  });

  it("captures diagnostics before restart and enforces its restart budget", () => {
    const root = mkdtempSync(join(tmpdir(), "brain-watchdog-test-"));
    const binDir = join(root, "bin");
    const incidentDir = join(root, "incidents");
    const stateDir = join(root, "state");
    const callsPath = join(root, "calls.log");
    mkdirSync(binDir);
    mkdirSync(incidentDir);
    mkdirSync(stateDir);
    writeFileSync(
      join(binDir, "docker"),
      `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >>"$FAKE_DOCKER_CALLS"
case "$1" in
  ps) printf 'container-1\\n' ;;
  inspect)
    if [[ "$*" == *'.Config.Labels'* ]]; then
      printf 'brain\\n'
    elif [[ "$*" == *'.Name'* ]]; then
      printf '/brain-current\\n'
    else
      printf '{"State":{"Health":{"Status":"unhealthy"}}}\\n'
    fi
    ;;
  logs) printf 'captured application logs\\n' ;;
  restart) printf 'container-1\\n' ;;
esac
`,
    );
    writeFileSync(join(binDir, "logger"), "#!/usr/bin/env bash\nexit 0\n");
    chmodSync(join(binDir, "docker"), 0o755);
    chmodSync(join(binDir, "logger"), 0o755);

    for (let attempt = 0; attempt < 4; attempt++) {
      const result = spawnSync("bash", [], {
        input: healthWatchdogScript,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env["PATH"] ?? ""}`,
          FAKE_DOCKER_CALLS: callsPath,
          BRAIN_WATCHDOG_INCIDENT_DIR: incidentDir,
          BRAIN_WATCHDOG_STATE_DIR: stateDir,
          BRAIN_WATCHDOG_LOCK_PATH: join(root, "watchdog.lock"),
        },
      });
      expect(result.status).toBe(0);
    }

    const calls = readFileSync(callsPath, "utf8").trim().split("\n");
    const logIndex = calls.findIndex((call) => call.startsWith("logs "));
    const restartIndex = calls.findIndex((call) => call.startsWith("restart "));
    expect(restartIndex).toBeGreaterThan(logIndex);
    expect(calls.filter((call) => call.startsWith("restart "))).toHaveLength(3);

    const incidents = readdirSync(incidentDir).map((name) =>
      readFileSync(join(incidentDir, name), "utf8"),
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
});

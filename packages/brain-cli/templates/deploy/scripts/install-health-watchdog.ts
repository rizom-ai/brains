import { requireEnv } from "./helpers";

const WATCHDOG_PATH = "/usr/local/sbin/brains-health-watchdog";
const SERVICE_PATH = "/etc/systemd/system/brains-health-watchdog.service";
const TIMER_PATH = "/etc/systemd/system/brains-health-watchdog.timer";

export const BRAIN_WATCHDOG_LABEL = "ai.rizom.brain.watchdog";
export const BRAIN_WATCHDOG_LABEL_VALUE = "true";
export const BRAIN_WATCHDOG_LABEL_FILTER: string = `${BRAIN_WATCHDOG_LABEL}=${BRAIN_WATCHDOG_LABEL_VALUE}`;

export const healthWatchdogScript: string = `#!/usr/bin/env bash
set -euo pipefail
umask 077

lock_path="\${BRAIN_WATCHDOG_LOCK_PATH:-/run/brains-health-watchdog.lock}"
exec 9>"$lock_path"
flock -n 9 || exit 0

incident_dir="\${BRAIN_WATCHDOG_INCIDENT_DIR:-/var/log/brains-health-watchdog}"
state_dir="\${BRAIN_WATCHDOG_STATE_DIR:-/var/lib/brains-health-watchdog}"
MAX_RESTARTS=3
WINDOW_SECONDS=3600
mkdir -p "$incident_dir" "$state_dir"

write_safe_inspect() {
  docker inspect --format '{"id":{{json .Id}},"name":{{json .Name}},"image":{{json .Config.Image}},"state":{{json .State}},"restartPolicy":{{json .HostConfig.RestartPolicy}}}' "$1"
}

while read -r container_id; do
  [ -n "$container_id" ] || continue
  service_name=$(docker inspect --format '{{ index .Config.Labels "service" }}' "$container_id" 2>/dev/null || true)
  container_name=$(docker inspect --format '{{ .Name }}' "$container_id" 2>/dev/null | tr -d '/' || true)
  state_key=$(printf '%s-%s-%s' "$service_name" "$container_name" "$container_id" | tr -c 'A-Za-z0-9_.-' '_')
  state_path="$state_dir/$state_key.restarts"
  recent_path="$state_path.tmp"
  now_epoch=$(date -u +%s)
  cutoff_epoch=$((now_epoch - WINDOW_SECONDS))
  touch "$state_path"
  awk -v cutoff="$cutoff_epoch" '$1 >= cutoff' "$state_path" >"$recent_path"
  restart_count=$(wc -l <"$recent_path")

  timestamp=$(date -u +%Y%m%dT%H%M%SZ)
  incident_path="$incident_dir/$timestamp-$state_key.log"
  temporary_path="$incident_path.tmp"

  if [ "$restart_count" -ge "$MAX_RESTARTS" ]; then
    {
      printf '{"timestamp":"%s","event":"restart-suppressed","reason":"restart-budget-exhausted","service":"%s","container":"%s","restartsInWindow":%s}\\n' "$timestamp" "$service_name" "$container_name" "$restart_count"
      write_safe_inspect "$container_id"
      docker logs --timestamps --tail 1000 "$container_id"
    } >"$temporary_path" 2>&1
    mv "$temporary_path" "$incident_path"
    mv "$recent_path" "$state_path"
    logger -t brains-health-watchdog "restart budget exhausted container=$container_name service=$service_name incident=$incident_path"
    continue
  fi

  {
    printf '{"timestamp":"%s","event":"container-restart","reason":"docker-health-unhealthy","service":"%s","container":"%s"}\\n' "$timestamp" "$service_name" "$container_name"
    write_safe_inspect "$container_id"
    docker logs --timestamps --tail 1000 "$container_id"
  } >"$temporary_path" 2>&1
  mv "$temporary_path" "$incident_path"
  printf '%s\\n' "$now_epoch" >>"$recent_path"
  mv "$recent_path" "$state_path"

  logger -t brains-health-watchdog "restarting unhealthy container=$container_name service=$service_name incident=$incident_path"
  docker restart "$container_id"
done < <(docker ps --filter health=unhealthy --filter label=${BRAIN_WATCHDOG_LABEL_FILTER} --format '{{.ID}}')
`;

export const healthWatchdogServiceUnit: string = `[Unit]
Description=Restart persistently unhealthy Brain containers
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
ExecStart=${WATCHDOG_PATH}
`;

export const healthWatchdogTimerUnit: string = `[Unit]
Description=Monitor Brain container liveness

[Timer]
OnBootSec=2min
OnUnitActiveSec=30s
RandomizedDelaySec=5s
Persistent=true
Unit=brains-health-watchdog.service

[Install]
WantedBy=timers.target
`;

function installCommand(path: string, content: string, mode: string): string {
  const encoded = Buffer.from(content, "utf8").toString("base64");
  return `printf '%s' '${encoded}' | $SUDO base64 --decode | $SUDO tee '${path}' >/dev/null\n$SUDO chmod ${mode} '${path}'`;
}

export function buildHealthWatchdogInstallScript(): string {
  return `#!/usr/bin/env bash
set -euo pipefail
SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  SUDO=sudo
fi

${installCommand(WATCHDOG_PATH, healthWatchdogScript, "0755")}
${installCommand(SERVICE_PATH, healthWatchdogServiceUnit, "0644")}
${installCommand(TIMER_PATH, healthWatchdogTimerUnit, "0644")}

$SUDO systemctl daemon-reload
$SUDO systemctl enable --now brains-health-watchdog.timer

labelled_containers=""
if ! labelled_containers=$($SUDO docker ps --filter label=${BRAIN_WATCHDOG_LABEL_FILTER} --format '{{.ID}}' 2>/dev/null); then
  echo "Warning: unable to verify running Brain containers with label ${BRAIN_WATCHDOG_LABEL_FILTER}." >&2
elif [ -z "$labelled_containers" ]; then
  echo "Warning: no running Brain containers found with label ${BRAIN_WATCHDOG_LABEL_FILTER}." >&2
fi
`;
}

export async function installHealthWatchdog(): Promise<void> {
  const serverIp = requireEnv("SERVER_IP");
  const sshUser = requireEnv("SSH_USER").trim();
  if (!sshUser) throw new Error("Missing SSH_USER");
  const child = Bun.spawn(["ssh", `${sshUser}@${serverIp}`, "bash -s"], {
    stdin: new Blob([buildHealthWatchdogInstallScript()]),
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await child.exited;
  if (exitCode !== 0) {
    throw new Error(
      `Health watchdog installation failed with exit ${exitCode}`,
    );
  }
}

if (import.meta.main) {
  await installHealthWatchdog();
}

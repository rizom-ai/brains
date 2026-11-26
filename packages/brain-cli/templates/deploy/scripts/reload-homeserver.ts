import { requireEnv } from "./helpers";

/** Where the brain writes the homeserver's configuration on the server. */
const HOMESERVER_DIR = "/opt/brain-matrix";

/**
 * Restarts the homeserver when the brain has written it a configuration
 * it has not started on yet, such as after a domain change: Tuwunel reads
 * its configuration only at start, and the brain cannot restart an
 * accessory. The first deploy only records the configuration, because the
 * homeserver's restart policy already started it on that file.
 */
export function buildHomeserverReloadScript(
  serviceName: string,
  dir: string = HOMESERVER_DIR,
  options: { sudo?: boolean } = {},
): string {
  const sudo =
    options.sudo === false
      ? 'SUDO=""'
      : `SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  SUDO=sudo
fi`;
  return `#!/usr/bin/env bash
set -euo pipefail
${sudo}

config="${dir}/tuwunel.toml"
started="${dir}/.started-config.sha256"
if [ ! -f "$config" ]; then
  echo "The brain has not written the homeserver configuration yet."
  exit 0
fi
current="$(sha256sum "$config" | cut -d' ' -f1)"
if [ ! -f "$started" ]; then
  echo "$current" | $SUDO tee "$started" >/dev/null
  echo "The homeserver started on its first configuration."
  exit 0
fi
if [ "$(cat "$started")" = "$current" ]; then
  echo "The homeserver configuration is unchanged."
  exit 0
fi
$SUDO docker restart ${serviceName}-matrix
echo "$current" | $SUDO tee "$started" >/dev/null
echo "Restarted the homeserver on its new configuration."
`;
}

export async function reloadHomeserver(): Promise<void> {
  if (process.env["MATRIX_ENABLED"] !== "true") {
    console.log("No homeserver in this deploy; nothing to reload.");
    return;
  }
  const serverIp = requireEnv("SERVER_IP");
  const sshUser = requireEnv("SSH_USER").trim();
  const serviceName = requireEnv("SERVICE_NAME").trim();
  if (!sshUser) throw new Error("Missing SSH_USER");
  const child = Bun.spawn(["ssh", `${sshUser}@${serverIp}`, "bash -s"], {
    stdin: new Blob([buildHomeserverReloadScript(serviceName)]),
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await child.exited;
  if (exitCode !== 0) {
    throw new Error(`Reloading the homeserver failed with exit ${exitCode}`);
  }
}

if (import.meta.main) {
  await reloadHomeserver();
}

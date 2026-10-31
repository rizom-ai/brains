import { requireEnv } from "./helpers";

/** The model runtime the `models` accessory runs; kamal-deploy.yml pins the same image. */
export const MODEL_RUNTIME_IMAGE = "ollama/ollama:0.40.11";
const MODELS_VOLUME = "/opt/brain-models:/root/.ollama";
const MODEL_TAG = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;

/**
 * The local models the deploy names (`LOCAL_MODELS`, the `local:` models of
 * brain.yaml without their prefix), once each.
 */
export function parseLocalModels(value: string | undefined): string[] {
  const models = (value ?? "").split(/[\s,]+/).filter(Boolean);
  const invalid = models.find((model) => !MODEL_TAG.test(model));
  if (invalid !== undefined) {
    throw new Error(`Invalid local model "${invalid}"`);
  }
  return [...new Set(models)];
}

/**
 * Pulls each model into the models volume with a one-off runtime container,
 * so the models are on disk before the brain starts, whether or not the
 * accessory runs yet.
 */
export function buildLocalModelPullScript(models: readonly string[]): string {
  const pulls = models.map((model) => `ollama pull ${model}`).join(" && ");
  return `#!/usr/bin/env bash
set -euo pipefail
SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  SUDO=sudo
fi

$SUDO mkdir -p /opt/brain-models
$SUDO docker run --rm --entrypoint /bin/sh -v ${MODELS_VOLUME} ${MODEL_RUNTIME_IMAGE} -c '
ollama serve >/dev/null 2>&1 &
for attempt in $(seq 1 30); do
  ollama list >/dev/null 2>&1 && break
  sleep 1
done
${pulls}
'
`;
}

export async function pullLocalModels(): Promise<void> {
  const models = parseLocalModels(process.env["LOCAL_MODELS"]);
  if (models.length === 0) {
    console.log("No local models in brain.yaml; nothing to pull.");
    return;
  }
  const serverIp = requireEnv("SERVER_IP");
  const sshUser = requireEnv("SSH_USER").trim();
  if (!sshUser) throw new Error("Missing SSH_USER");
  const child = Bun.spawn(["ssh", `${sshUser}@${serverIp}`, "bash -s"], {
    stdin: new Blob([buildLocalModelPullScript(models)]),
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await child.exited;
  if (exitCode !== 0) {
    throw new Error(`Pulling local models failed with exit ${exitCode}`);
  }
}

if (import.meta.main) {
  await pullLocalModels();
}

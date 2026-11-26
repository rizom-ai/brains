import type { EnvVarDecl } from "@brains/utils/env-schema";

/**
 * Where the brain finds its homeserver and the directory they share. None
 * of it is secret: the brain writes the homeserver's secrets itself, into
 * the configuration file in that directory.
 */
export const matrixServerEnvSchema: EnvVarDecl[] = [
  { name: "MATRIX_HOMESERVER_URL" },
  { name: "MATRIX_SERVER_NAME" },
  { name: "MATRIX_PUBLIC_URL" },
  { name: "MATRIX_DATA_DIR" },
];

/**
 * The plugin's config from the environment, or nothing when a value is
 * missing: the bundle then leaves the plugin unconfigured rather than
 * failing the brain.
 */
export function matrixServerConfigFromEnv(
  env: Record<string, string | undefined>,
): Record<string, unknown> {
  const homeserverUrl = env["MATRIX_HOMESERVER_URL"];
  const serverName = env["MATRIX_SERVER_NAME"];
  const dataDir = env["MATRIX_DATA_DIR"];
  if (!homeserverUrl || !serverName || !dataDir) return {};
  const publicBaseUrl = env["MATRIX_PUBLIC_URL"];
  return {
    homeserverUrl,
    serverName,
    dataDir,
    ...(publicBaseUrl ? { publicBaseUrl } : {}),
  };
}

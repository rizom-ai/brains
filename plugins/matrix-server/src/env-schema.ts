import type { EnvVarDecl } from "@brains/utils/env-schema";

/**
 * The homeserver's half of the Matrix environment. The bot's user id and
 * password are shared with the chat interface (MATRIX_USER_ID,
 * MATRIX_PASSWORD), which logs in as the same bot.
 */
export const matrixServerEnvSchema: EnvVarDecl[] = [
  { name: "MATRIX_HOMESERVER_URL" },
  { name: "MATRIX_SERVER_NAME" },
  { name: "MATRIX_PUBLIC_URL" },
  { name: "MATRIX_REGISTRATION_TOKEN", sensitive: true },
  { name: "MATRIX_OIDC_CLIENT_SECRET", sensitive: true },
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
  const botUserId = env["MATRIX_USER_ID"];
  const botPassword = env["MATRIX_PASSWORD"];
  const registrationToken = env["MATRIX_REGISTRATION_TOKEN"];
  const oidcClientSecret = env["MATRIX_OIDC_CLIENT_SECRET"];
  if (
    !homeserverUrl ||
    !serverName ||
    !botUserId ||
    !botPassword ||
    !registrationToken ||
    !oidcClientSecret
  ) {
    return {};
  }
  const publicBaseUrl = env["MATRIX_PUBLIC_URL"];
  return {
    homeserverUrl,
    serverName,
    ...(publicBaseUrl ? { publicBaseUrl } : {}),
    botUserId,
    botPassword,
    registrationToken,
    oidcClientSecret,
  };
}

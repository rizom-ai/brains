import { matrixConfig } from "@brains/matrix";
import type { InterfaceConfig } from "../types";

/**
 * Build Matrix interface configuration from environment variables
 *
 * Required environment variables:
 * - MATRIX_HOMESERVER
 * - MATRIX_ACCESS_TOKEN
 * - MATRIX_USER_ID
 * - MATRIX_ANCHOR_USER_ID
 *
 * Optional environment variables:
 * - MATRIX_TRUSTED_USERS (comma-separated list)
 * - MATRIX_AUTO_JOIN (true/false)
 * - MATRIX_COMMAND_PREFIX
 * - MATRIX_ANCHOR_PREFIX
 */
export function getMatrixInterfaceFromEnv(): InterfaceConfig | null {
  const homeserver = process.env["MATRIX_HOMESERVER"];
  const accessToken = process.env["MATRIX_ACCESS_TOKEN"];
  const userId = process.env["MATRIX_USER_ID"];
  const anchorUserId = process.env["MATRIX_ANCHOR_USER_ID"];

  // Return null if required vars are missing
  if (!homeserver || !accessToken || !userId || !anchorUserId) {
    return null;
  }

  const builder = matrixConfig()
    .homeserver(homeserver)
    .accessToken(accessToken)
    .userId(userId)
    .anchorUserId(anchorUserId);

  // Optional: trusted users
  const trustedUsers = process.env["MATRIX_TRUSTED_USERS"];
  if (trustedUsers) {
    builder.trustedUsers(
      trustedUsers
        .split(",")
        .map((u) => u.trim())
        .filter(Boolean),
    );
  }

  // Optional: auto join
  const autoJoin = process.env["MATRIX_AUTO_JOIN"];
  if (autoJoin !== undefined) {
    builder.autoJoin(autoJoin.toLowerCase() === "true");
  }

  // Optional: command prefix
  const commandPrefix = process.env["MATRIX_COMMAND_PREFIX"];
  if (commandPrefix) {
    builder.commandPrefix(commandPrefix);
  }

  // Optional: anchor prefix
  const anchorPrefix = process.env["MATRIX_ANCHOR_PREFIX"];
  if (anchorPrefix) {
    builder.anchorPrefix(anchorPrefix);
  }

  return {
    type: "matrix",
    enabled: true,
    config: builder.build(),
  };
}

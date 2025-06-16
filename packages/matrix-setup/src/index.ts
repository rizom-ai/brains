import type { Logger } from "@brains/utils";

export interface MatrixRegistrationOptions {
  homeserver: string;
  adminToken: string;
  username: string;
  password: string;
  displayName?: string;
  admin?: boolean;
  serverName?: string; // Optional: override the server name (for setups where API URL differs from server name)
}

export interface MatrixRegistrationResult {
  user_id: string;
  access_token: string;
  device_id: string;
  homeserver: string;
}

/**
 * Register a new Matrix account using the Admin API
 * Requires a valid admin access token
 */
export async function registerMatrixAccount(
  options: MatrixRegistrationOptions,
  logger: Logger,
): Promise<MatrixRegistrationResult> {
  const {
    homeserver,
    adminToken,
    username,
    password,
    displayName = "Bot Account",
    admin = false,
  } = options;

  logger.debug("Creating Matrix account via Admin API", {
    username,
    homeserver,
  });

  // First, let's check if the admin token is valid by getting server version
  const versionResponse = await fetch(
    `${homeserver}/_synapse/admin/v1/server_version`,
    {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    },
  );

  if (!versionResponse.ok) {
    if (versionResponse.status === 401) {
      throw new Error(
        "Invalid admin token or token doesn't have admin privileges",
      );
    }
    throw new Error(`Failed to verify admin access: ${versionResponse.status}`);
  }

  const versionData = await versionResponse.json() as { server_version: string; python_version: string };
  logger.debug("Server version", versionData);

  // Check who owns this admin token
  const whoamiResponse = await fetch(
    `${homeserver}/_matrix/client/v3/account/whoami`,
    {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    },
  );

  if (!whoamiResponse.ok) {
    throw new Error("Failed to identify admin user");
  }

  const whoamiData = await whoamiResponse.json() as { user_id: string; device_id?: string };
  const adminUserId = whoamiData.user_id;
  const serverName = adminUserId.split(":")[1];

  logger.info("Admin token belongs to", {
    user_id: adminUserId,
    server: serverName,
  });

  // Create user ID using the same server as the admin
  const userId = `@${username}:${serverName}`;
  logger.info("Creating user", { userId });

  // Use the admin API to create the user
  const registerResponse = await fetch(
    `${homeserver}/_synapse/admin/v2/users/${userId}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        password,
        displayname: displayName,
        admin,
        deactivated: false,
      }),
    },
  );

  if (!registerResponse.ok) {
    const errorText = await registerResponse.text();
    let errorMessage = `Failed to create user: ${errorText}`;

    try {
      const errorJson = JSON.parse(errorText);
      if (
        errorJson.errcode === "M_UNKNOWN" &&
        errorJson.error?.includes("local users")
      ) {
        // This might mean the admin token's user is not on the same server
        errorMessage =
          `Cannot create user ${userId}.\n\n` +
          "The error 'This endpoint can only be used with local users' usually means:\n" +
          "1. Your admin token is from a different server than the one you're trying to create users on\n" +
          "2. OR the admin user associated with this token is not a local user on this server\n\n" +
          "Please verify:\n" +
          `- Your admin token is from a user on ${serverName}\n` +
          `- The user has admin privileges on ${serverName}`;
      } else if (errorJson.errcode === "M_USER_IN_USE") {
        errorMessage = `Username '${username}' is already taken on ${serverName}`;
      }
    } catch {
      // If JSON parsing fails, use the raw error text
    }

    throw new Error(errorMessage);
  }

  await registerResponse.json();
  // The user was created with the userId we constructed earlier

  // Create an access token for the new user
  const loginResponse = await fetch(`${homeserver}/_matrix/client/v3/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "m.login.password",
      identifier: {
        type: "m.id.user",
        user: userId,
      },
      password,
      initial_device_display_name: "Brain Bot",
    }),
  });

  if (!loginResponse.ok) {
    const error = await loginResponse.text();
    throw new Error(`Failed to login as new user: ${error}`);
  }

  const loginData = await loginResponse.json() as { user_id: string; access_token: string; device_id: string };

  logger.info("Successfully created Matrix account", { user_id: userId });

  return {
    user_id: userId,
    access_token: loginData.access_token,
    device_id: loginData.device_id,
    homeserver,
  };
}

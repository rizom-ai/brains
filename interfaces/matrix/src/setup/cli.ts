#!/usr/bin/env bun
import { Logger, LogLevel } from "@brains/utils";
import { registerMatrixAccount } from "./register";

const logger = Logger.createFresh({
  level: LogLevel.INFO,
  context: "matrix-register",
});

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Check for admin token in environment
  const adminToken = process.env["MATRIX_ADMIN_TOKEN"];
  if (!adminToken) {
    logger.error("MATRIX_ADMIN_TOKEN environment variable is required");
    logger.info(
      "Usage: MATRIX_ADMIN_TOKEN=<token> brain-matrix-setup <homeserver> <username> <password>",
    );
    logger.info(
      "Example: MATRIX_ADMIN_TOKEN=syt_YWRtaW4_... brain-matrix-setup https://matrix.example.org brain-bot bot-password",
    );
    process.exit(1);
  }

  if (args.length < 3) {
    logger.error("Missing required arguments");
    logger.info("Usage: brain-matrix-setup <homeserver> <username> <password>");
    logger.info(
      "Example: brain-matrix-setup https://matrix.example.org brain-bot bot-password",
    );
    process.exit(1);
  }

  const [homeserver, username, password] = args as [string, string, string];

  try {
    const result = await registerMatrixAccount(
      {
        homeserver,
        adminToken,
        username,
        password,
        displayName: "Brain Bot",
      },
      logger,
    );

    // Output the results in a format that's easy to copy to .env
    logger.info("✅ Bot account created successfully!");
    logger.info("");
    logger.info("Add these to your .env file:");
    logger.info("─".repeat(50));
    logger.info(`MATRIX_HOMESERVER=${result.homeserver}`);
    logger.info(`MATRIX_USER_ID=${result.user_id}`);
    logger.info(`MATRIX_ACCESS_TOKEN=${result.access_token}`);
    logger.info("─".repeat(50));
    logger.info(`Device ID: ${result.device_id}`);
  } catch (error) {
    logger.error("Registration failed", error);
    process.exit(1);
  }
}

// Run main function
void main();
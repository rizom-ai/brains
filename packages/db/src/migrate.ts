#!/usr/bin/env bun
import { createClient } from "@libsql/client";
import { migrate } from "drizzle-orm/libsql/migrator";
import { drizzle } from "drizzle-orm/libsql";

/**
 * This script runs database migrations using drizzle-kit
 *
 * Usage:
 *   bun db:migrate [--url=file:./custom-path.db] [--auth-token=xxx]
 */

async function main(): Promise<void> {
  // Parse command line arguments
  const args = process.argv.slice(2);
  let url = process.env["DATABASE_URL"] ?? "file:./brain.db";
  let authToken = process.env["DATABASE_AUTH_TOKEN"];

  // Look for --url argument
  const urlArg = args.find((arg) => arg.startsWith("--url="));
  if (urlArg) {
    const splitUrl = urlArg.split("=")[1];
    if (splitUrl) {
      url = splitUrl;
    }
  }

  // Look for --auth-token argument
  const authTokenArg = args.find((arg) => arg.startsWith("--auth-token="));
  if (authTokenArg) {
    const splitToken = authTokenArg.split("=")[1];
    if (splitToken) {
      authToken = splitToken;
    }
  }

  console.log(
    `Running migrations on database: ${url.includes("file:") ? url : "remote database"}`,
  );

  // Create libSQL client
  const client = authToken
    ? createClient({ url, authToken })
    : createClient({ url });
  const db = drizzle(client);

  // Run migrations from the drizzle directory
  console.log("Starting migrations...");
  // Allow overriding migration folder via environment variable
  const migrationsFolder = process.env["DRIZZLE_MIGRATION_FOLDER"] 
    ? process.env["DRIZZLE_MIGRATION_FOLDER"]
    : new URL("../drizzle", import.meta.url).pathname;
  console.log(`Using migrations folder: ${migrationsFolder}`);
  await migrate(db, { migrationsFolder });
  console.log("Migrations completed successfully!");

  // Close the connection
  client.close();
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});

#!/usr/bin/env bun
import process from "node:process";
import { parseArgs } from "node:util";
import { importBackup } from "./import-backup";

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      backup: { type: "string" },
      destination: { type: "string" },
      "source-stopped": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  if (values.help) {
    console.log(
      "brain-db-migrate --backup <verified-0.2-snapshot> --destination <new-directory> --source-stopped",
    );
    console.log(
      "Imports databases only. Restore content and configuration separately before starting 0.3.",
    );
    return;
  }
  if (!values.backup || !values.destination || !values["source-stopped"]) {
    throw new Error(
      "Required: --backup, --destination, and --source-stopped. Never pass live database files.",
    );
  }
  const controller = new AbortController();
  const abort = (): void => controller.abort(new Error("Import interrupted"));
  process.once("SIGINT", abort);
  process.once("SIGTERM", abort);
  const destination = await importBackup({
    backupDirectory: values.backup,
    destination: values.destination,
    sourceStopped: true,
    signal: controller.signal,
  });
  console.log(`Databases verified: ${destination}`);
  console.log(
    "Not deployed. Restore content/configuration and preserve the auth encryption key before starting 0.3.",
  );
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    let current: unknown = error;
    while (current instanceof Error) {
      console.error(current.message);
      current = current.cause;
    }
    process.exitCode = 1;
  }
}

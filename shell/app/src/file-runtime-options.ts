import { randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ShellRuntimeOptions } from "@brains/core";
import { createFileActorOptions } from "./file-actor-artifacts";

/** App policy provisions actors and a private owner endpoint, never another DB. */
export function resolveFileRuntimeOptions(
  options: ShellRuntimeOptions = {},
): ShellRuntimeOptions {
  if (options.processRole === "worker" && !options.localDatabaseEndpoint)
    throw new Error(
      "Worker file runtime requires its parent's database endpoint",
    );
  const id = `${process.pid}-${randomUUID()}`;
  return {
    ...(options.processRole && { processRole: options.processRole }),
    fileActors:
      options.fileActors ??
      createFileActorOptions(
        process.env["BRAINS_BUN_EXECUTABLE"] ?? process.execPath,
      ),
    localDatabaseEndpoint: options.localDatabaseEndpoint ?? {
      address:
        process.platform === "win32"
          ? `\\\\.\\pipe\\brains-files-${id}`
          : join(tmpdir(), `brains-files-${id}.sock`),
      secret: randomBytes(32).toString("base64url"),
      sessionId: randomUUID(),
    },
  };
}

import {
  isMainThread,
  parentPort,
  threadId,
  type MessagePort,
} from "node:worker_threads";
import { inspect } from "node:util";
import {
  parseBoot,
  type SqlWorkerBoot,
  type SqlWorkerPlacement,
} from "./boot-protocol";
import { ExecutionOwner } from "./ownership";
import { openNativeBackend } from "./native-backend";

export interface SqlWorkerInitialization {
  boot: SqlWorkerBoot;
  placement: SqlWorkerPlacement;
  owner: ExecutionOwner;
  port: MessagePort;
}

/** Initialize on an already spawned execution thread. The caller installs its
 * dispatcher and owns ready/close acknowledgements; this does not publish ready
 * or add automatic recovery/native-open fallback after failed startup.
 */
export async function initializeSqlWorker(
  input: unknown,
): Promise<SqlWorkerInitialization> {
  if (isMainThread || !parentPort)
    throw new Error("Native SQL entry must run in a worker thread");
  if (process.env["BRAINS_FORBID_LOCAL_DATABASE_OPEN"] === "1")
    throw new Error("Local SQLite opens are forbidden in this process");
  const boot = parseBoot(input);
  const placement = { generation: boot.generation, threadId, pid: process.pid };
  try {
    const owner = new ExecutionOwner(await openNativeBackend(boot.url));
    await owner.execute("PRAGMA journal_mode = WAL");
    return { boot, placement, owner, port: parentPort };
  } catch (error) {
    // Preserve nested loader diagnostics across Bun's worker error event.
    throw new Error(
      `Native worker startup failed: ${inspect(error, { depth: 5 })}`,
      { cause: error },
    );
  }
}

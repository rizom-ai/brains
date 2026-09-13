import { Worker } from "node:worker_threads";
import { parseBoot, type SqlWorkerBoot } from "./boot-protocol";

export interface UnstartedWorkerReservation {
  cancelUnstarted(): void;
}
export interface SpawnSqlWorkerOptions<R extends UnstartedWorkerReservation> {
  workerUrl: URL;
  boot: SqlWorkerBoot;
  admit(): R;
}
export interface SpawnedSqlWorker<R extends UnstartedWorkerReservation> {
  worker: Worker;
  reservation: R;
}

/** Explicit artifact only; no cwd/PATH inference or local native-open fallback.
 * After return, the caller binds the reservation to actual exit and installs the
 * worker lifetime/protocol handlers. Only synchronous construction failure can
 * cancel an unstarted reservation; asynchronous loader failure is an owned worker.
 */
export function spawnSqlWorker<R extends UnstartedWorkerReservation>(
  options: SpawnSqlWorkerOptions<R>,
): SpawnedSqlWorker<R> {
  if (process.env["BRAINS_FORBID_LOCAL_DATABASE_OPEN"] === "1")
    throw new Error("Local SQLite opens are forbidden in this process");
  const boot = parseBoot(options.boot);
  const reservation = options.admit();
  try {
    return {
      worker: new Worker(options.workerUrl, { workerData: boot }),
      reservation,
    };
  } catch (error) {
    try {
      reservation.cancelUnstarted();
    } catch (cleanup) {
      throw new AggregateError(
        [error, cleanup],
        "Worker construction and unstarted reservation cleanup failed",
        { cause: cleanup },
      );
    }
    throw error;
  }
}

import { tmpdir } from "os";
import { join } from "path";
import { GitBrokerServer } from "./server";

/**
 * A broker hosted inside the current process.
 *
 * A brain that is not supervised — an interactive session, a startup check, a
 * test — still needs a checkout owner. It does not get a weaker execution
 * path; it hosts the same broker itself and reaches it over the same socket.
 * The only difference from the supervised case is which process owns the
 * broker, which is a lifecycle detail rather than an execution one.
 *
 * One broker per process, not one per checkout: the executor's registry is
 * already keyed by repository, so several checkouts share an owner exactly as
 * they would under a supervisor. Hosting per checkout would leak a socket and
 * an executor for every repository the process ever touched.
 */

const GIT_BROKER_RUNTIME_DIR_ENV = "BRAIN_GIT_BROKER_RUNTIME_DIR";

let hosted: Promise<GitBrokerServer> | null = null;

/** Runtime directory for this process's broker; never inside a checkout. */
export function processRuntimeDir(
  env: Record<string, string | undefined> = process.env,
): string {
  return (
    env[GIT_BROKER_RUNTIME_DIR_ENV] ??
    join(tmpdir(), `brain-git-broker-${process.pid}`)
  );
}

/** Start, or reuse, this process's broker. */
export function hostGitBroker(): Promise<GitBrokerServer> {
  hosted ??= GitBrokerServer.start({ runtimeDir: processRuntimeDir() }).catch(
    (error: unknown) => {
      // Never cache a failed start: one unlucky moment would otherwise wedge
      // every later command against a broker that has since become startable.
      hosted = null;
      throw error;
    },
  );
  return hosted;
}

/** Stop the broker this process hosts, if any. */
export async function stopHostedBroker(): Promise<void> {
  const running = hosted;
  hosted = null;
  if (!running) return;
  await running.then(
    (broker) => broker.stop(),
    () => undefined,
  );
}

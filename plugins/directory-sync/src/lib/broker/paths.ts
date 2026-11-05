import { tmpdir } from "os";
import { join, resolve } from "path";
import { sha256Hex } from "@brains/utils/hash";

// Broker paths are needed by the supervisor and every role, so this module
// stays free of the RPC stack; see the bundle-module-jit test in brain-cli.

/**
 * The one place this path is spelled. The supervisor hands it to every role
 * and the broker binds it, so a second derivation would be a way for owner
 * and clients to disagree about which socket is the singleton boundary.
 */
/** Linux allows 108 bytes including the terminating NUL. */
const MAX_UNIX_SOCKET_PATH = 107;

/**
 * The instance-owned runtime directory: journal, and the socket when it fits.
 * Derived here for the supervisor and the broker child alike; it is never
 * inside a checkout, which the supervisor verifies against the sync path.
 */
export function gitBrokerRuntimeDir(cwd: string): string {
  return join(cwd, ".brain-runtime");
}

export function gitBrokerSocketPath(runtimeDir: string): string {
  const instanceSocket = join(runtimeDir, "git-broker.sock");
  if (Buffer.byteLength(instanceSocket) <= MAX_UNIX_SOCKET_PATH) {
    return instanceSocket;
  }
  // A unix socket address is bounded and the kernel truncates rather than
  // refusing, so a deep instance directory cannot hold its own socket. The
  // address then lives in the OS temp dir, named by the instance: still one
  // socket per instance, never inside a checkout, and bound to 0600 like the
  // in-instance one.
  const instance = sha256Hex(resolve(runtimeDir)).slice(0, 24);
  return join(tmpdir(), `brain-git-broker-${instance}.sock`);
}

/** The checkout this Brain's directory-sync configuration points at. */
export function resolveCheckoutPath(options: {
  cwd: string;
  dataDir: string;
  syncPath?: string | undefined;
}): string {
  return resolve(options.cwd, options.syncPath ?? options.dataDir);
}

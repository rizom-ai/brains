import type { BrokerConnection } from "./client";

/**
 * Opens a broker connection, loading the RPC client on first use.
 *
 * The client reaches Effect's RPC, Schema and HTTP modules, whose load-time
 * table loops would otherwise run in the eager top level of the brain.js bundle
 * and get that whole body JIT-compiled in every Brain process. A dynamic import
 * keeps them in a lazily initialized module instead.
 */
export async function connectBroker(
  socketPath: string,
): Promise<BrokerConnection> {
  const { BrokerConnection: Connection } = await import("./client");
  return Connection.connect(socketPath);
}

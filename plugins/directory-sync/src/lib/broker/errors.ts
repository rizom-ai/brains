// RPC-free so callers can name broker failures without loading the client.

/** Giving up observation never cancels broker-owned Git work. */
export class BrokerUnavailableError extends Error {
  constructor(socketPath: string, cause: string) {
    super(`Git broker at ${socketPath} is unavailable: ${cause}`);
    this.name = "BrokerUnavailableError";
  }
}
export class BrokerOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrokerOperationError";
  }
}

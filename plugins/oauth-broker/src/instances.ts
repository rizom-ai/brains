import { createHash, timingSafeEqual } from "node:crypto";

export interface BrokerInstanceConfig {
  id: string;
  secret: string;
  /** Per provider, the one address the browser may be sent back to. */
  returnUris: Record<string, string>;
}

export interface BrokerInstance {
  id: string;
  returnUris: Readonly<Record<string, string>>;
}

interface Registered extends BrokerInstance {
  secretHash: Buffer;
}

function hash(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

function basicCredentials(
  header: string | null,
): { id: string; secret: string } | null {
  if (!header?.startsWith("Basic ")) return null;
  const decoded = Buffer.from(header.slice("Basic ".length), "base64").toString(
    "utf8",
  );
  const separator = decoded.indexOf(":");
  if (separator <= 0 || separator === decoded.length - 1) return null;
  return {
    id: decoded.slice(0, separator),
    secret: decoded.slice(separator + 1),
  };
}

/**
 * Instance brains the broker serves, each with a revocable secret. Removing
 * an instance from configuration revokes it.
 */
export class BrokerInstances {
  private readonly instances: ReadonlyMap<string, Registered>;

  constructor(configs: readonly BrokerInstanceConfig[]) {
    this.instances = new Map(
      configs.map((config) => [
        config.id,
        {
          id: config.id,
          returnUris: { ...config.returnUris },
          secretHash: hash(config.secret),
        },
      ]),
    );
  }

  /** The instance a request's HTTP Basic credentials prove, or null. */
  authenticate(request: Request): BrokerInstance | null {
    const credentials = basicCredentials(request.headers.get("authorization"));
    const instance = credentials
      ? this.instances.get(credentials.id)
      : undefined;
    if (!credentials || !instance) return null;
    return timingSafeEqual(hash(credentials.secret), instance.secretHash)
      ? { id: instance.id, returnUris: instance.returnUris }
      : null;
  }
}

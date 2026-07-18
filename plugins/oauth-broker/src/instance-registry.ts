import { createHash, timingSafeEqual } from "node:crypto";

export interface OAuthBrokerInstanceConfig {
  id: string;
  clientSecret: string;
  returnUris: Record<string, string>;
}

export interface OAuthBrokerInstance {
  id: string;
  returnUris: Readonly<Record<string, string>>;
}

export interface OAuthBrokerInstanceRegistry {
  authenticate(request: Request): Promise<OAuthBrokerInstance | undefined>;
}

interface RegisteredInstance extends OAuthBrokerInstance {
  secretHash: Buffer;
}

function hashSecret(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

function parseBasicCredentials(
  authorization: string | null,
): { clientId: string; clientSecret: string } | undefined {
  if (!authorization?.startsWith("Basic ")) return undefined;
  try {
    const decoded = Buffer.from(
      authorization.slice("Basic ".length),
      "base64",
    ).toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator <= 0) return undefined;
    const clientId = decoded.slice(0, separator);
    const clientSecret = decoded.slice(separator + 1);
    if (!clientSecret) return undefined;
    return { clientId, clientSecret };
  } catch {
    return undefined;
  }
}

/** Static, revocable instance registry for the first managed broker deployment. */
export class StaticOAuthBrokerInstanceRegistry implements OAuthBrokerInstanceRegistry {
  private readonly instances = new Map<string, RegisteredInstance>();

  constructor(configs: readonly OAuthBrokerInstanceConfig[]) {
    for (const config of configs) {
      if (this.instances.has(config.id)) {
        throw new Error(`Duplicate OAuth broker instance id: ${config.id}`);
      }
      this.instances.set(config.id, {
        id: config.id,
        returnUris: { ...config.returnUris },
        secretHash: hashSecret(config.clientSecret),
      });
    }
  }

  async authenticate(
    request: Request,
  ): Promise<OAuthBrokerInstance | undefined> {
    const credentials = parseBasicCredentials(
      request.headers.get("authorization"),
    );
    if (!credentials) return undefined;

    const instance = this.instances.get(credentials.clientId);
    if (!instance) return undefined;
    const candidate = hashSecret(credentials.clientSecret);
    if (!timingSafeEqual(candidate, instance.secretHash)) return undefined;
    return { id: instance.id, returnUris: instance.returnUris };
  }
}

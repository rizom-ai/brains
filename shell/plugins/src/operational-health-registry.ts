import { z } from "@brains/utils/zod";
import {
  RuntimeHealthCheckSchema,
  type RuntimeHealthCheck,
} from "./contracts/runtime-health";

export type OperationalHealthProvider = () =>
  Promise<Omit<RuntimeHealthCheck, "name">> | Omit<RuntimeHealthCheck, "name">;

export interface IOperationalHealthRegistry {
  register(
    pluginId: string,
    name: string,
    provider: OperationalHealthProvider,
  ): () => void;
  unregisterPlugin(pluginId: string): void;
  getChecks(): Promise<RuntimeHealthCheck[]>;
}

interface Registration {
  pluginId: string;
  name: string;
  provider: OperationalHealthProvider;
}

const pluginIdSchema = z.string().trim().min(1).max(200);
const checkNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9][a-z0-9.-]*$/);

/** App-scoped, plugin-owned contributors to request-driven operational health. */
export class OperationalHealthRegistry implements IOperationalHealthRegistry {
  private readonly registrations = new Map<string, Registration>();

  register(
    pluginId: string,
    name: string,
    provider: OperationalHealthProvider,
  ): () => void {
    const owner = pluginIdSchema.parse(pluginId);
    const checkName = checkNameSchema.parse(name);
    const key = `${owner}:${checkName}`;
    if (this.registrations.has(key)) {
      throw new Error(`Operational health check already registered: ${key}`);
    }
    this.registrations.set(key, { pluginId: owner, name: key, provider });
    return () => this.registrations.delete(key);
  }

  unregisterPlugin(pluginId: string): void {
    const owner = pluginId.trim();
    for (const [key, registration] of this.registrations) {
      if (registration.pluginId === owner) this.registrations.delete(key);
    }
  }

  async getChecks(): Promise<RuntimeHealthCheck[]> {
    const registrations = [...this.registrations.values()].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
    return Promise.all(
      registrations.map(async (registration): Promise<RuntimeHealthCheck> => {
        try {
          return RuntimeHealthCheckSchema.parse({
            name: registration.name,
            ...(await registration.provider()),
          });
        } catch {
          return {
            name: registration.name,
            status: "degraded",
            message: "Operational health check failed",
          };
        }
      }),
    );
  }
}

import type { BaseEntity, ServicePluginContext } from "@brains/plugins";
import type { AtprotoConfig } from "./config";
import type { AtprotoPdsClientLike } from "./plugin";

export interface AtprotoProjectionBuildInput {
  entity: BaseEntity;
  context: ServicePluginContext;
  config: AtprotoConfig;
  client?: AtprotoPdsClientLike;
  topics?: string[];
}

export interface AtprotoProjection {
  entityType: string;
  collection: string;
  validate?: boolean;
  buildRecord(
    input: AtprotoProjectionBuildInput,
  ): Promise<Record<string, unknown>>;
}

export class AtprotoProjectionRegistry {
  private static instance: AtprotoProjectionRegistry | undefined;
  private readonly projections = new Map<string, AtprotoProjection>();

  static getInstance(): AtprotoProjectionRegistry {
    this.instance ??= new AtprotoProjectionRegistry();
    return this.instance;
  }

  static createFresh(): AtprotoProjectionRegistry {
    return new AtprotoProjectionRegistry();
  }

  static resetInstance(): void {
    this.instance = undefined;
  }

  register(projection: AtprotoProjection): () => void {
    this.projections.set(projection.entityType, projection);
    return () => {
      if (this.projections.get(projection.entityType) === projection) {
        this.projections.delete(projection.entityType);
      }
    };
  }

  get(entityType: string): AtprotoProjection | undefined {
    return this.projections.get(entityType);
  }

  has(entityType: string): boolean {
    return this.projections.has(entityType);
  }

  list(): AtprotoProjection[] {
    return Array.from(this.projections.values());
  }
}

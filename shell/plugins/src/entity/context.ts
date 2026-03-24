import type { CorePluginContext } from "../core/context";
import type {
  IEntitiesNamespace,
  IServiceAINamespace,
  IServiceTemplatesNamespace,
} from "../service/context";
import type { IJobsWriteNamespace } from "../core/context";
import type { IEntityService } from "@brains/entity-service";

/**
 * Context for entity plugins — subset of ServicePluginContext.
 *
 * Includes everything needed for entity management:
 * entity registration, job handlers, AI generation, templates, messaging.
 *
 * Excludes: views, plugins namespace, MCP tool/resource registration.
 */
export interface EntityPluginContext extends CorePluginContext {
  /** Full entity service with write operations */
  readonly entityService: IEntityService;

  /** Entity management namespace */
  readonly entities: IEntitiesNamespace;

  /** Extended AI operations (includes generate, generateObject, generateImage) */
  readonly ai: IServiceAINamespace;

  /** Extended template operations (includes resolve, getCapabilities) */
  readonly templates: IServiceTemplatesNamespace;

  /** Job queue with write operations (enqueue, registerHandler) */
  readonly jobs: IJobsWriteNamespace;

  /** Data directory for storing entity files */
  readonly dataDir: string;

  /** Eval namespace */
  readonly eval: {
    registerHandler: (
      handlerId: string,
      handler: (input: unknown) => Promise<unknown>,
    ) => void;
  };
}

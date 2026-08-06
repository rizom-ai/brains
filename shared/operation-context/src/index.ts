import {
  OperationProvenanceSchema,
  type OperationProvenance,
} from "@brains/contracts";
import { AsyncLocalStorage } from "node:async_hooks";

export interface OperationScope {
  readonly provenance: OperationProvenance;
  readonly operationId: string;
}

/** App-scoped asynchronous context for causal provenance inheritance. */
export class OperationContext {
  private readonly storage = new AsyncLocalStorage<OperationScope>();

  public static createFresh(): OperationContext {
    return new OperationContext();
  }

  private constructor() {}

  public current(): OperationScope | undefined {
    return this.storage.getStore();
  }

  public run<T>(
    provenance: OperationProvenance,
    operationId: string,
    operation: () => T,
  ): T {
    if (operationId.length === 0) {
      throw new Error("Operation ID must not be empty");
    }
    const parsed = OperationProvenanceSchema.parse(provenance);
    const frozenProvenance = freezeProvenance(parsed);
    return this.storage.run(
      Object.freeze({ provenance: frozenProvenance, operationId }),
      operation,
    );
  }
}

function freezeProvenance(
  provenance: OperationProvenance,
): OperationProvenance {
  Object.freeze(provenance.projectionLineage);
  if (provenance.sourceEntity) Object.freeze(provenance.sourceEntity);
  return Object.freeze(provenance);
}

import { AsyncLocalStorage } from "node:async_hooks";
import type { BinaryPublication } from "../binary-publication";
import type { StageClaim } from "./binary-protocol";
import { blobFactsSchema, type BlobFacts } from "./blob-protocol";
import type {
  WorkerBindingContext,
  WorkerDatabaseBindings,
} from "./binary-transaction";

interface PublicationScope {
  claim: StageClaim;
  attached: boolean;
  active: boolean;
}

/** Owner-local claim/transaction association. The issuer retains responsibility
 * for acknowledged claim retirement on every outcome, including rejected input.
 */
export class WorkerPublicationBindings implements WorkerDatabaseBindings {
  private readonly scopes = new AsyncLocalStorage<PublicationScope>();
  private readonly contexts = new WeakMap<object, WorkerBindingContext>();

  public claims(): StageClaim[] {
    const scope = this.scopes.getStore();
    if (!scope?.active || scope.attached) return [];
    scope.attached = true; // Consume before the native begin can await.
    return [scope.claim];
  }

  public async run<T>(
    context: WorkerBindingContext,
    operation: () => Promise<T>,
  ): Promise<T> {
    if (this.contexts.has(context.db))
      throw new Error("Native transaction binding is already active");
    this.contexts.set(context.db, context);
    try {
      return await operation();
    } finally {
      this.contexts.delete(context.db);
    }
  }

  public async withClaim<T>(
    claim: StageClaim,
    input: BlobFacts,
    operation: (publication: BinaryPublication) => Promise<T>,
  ): Promise<T> {
    const facts = Object.freeze(
      blobFactsSchema.parse({
        sizeBytes: input.sizeBytes,
        sha256: input.sha256,
      }),
    );
    const scope: PublicationScope = { claim, attached: false, active: false };
    let issued = true;
    let entered = false;
    const contextFor = (transaction: object): WorkerBindingContext => {
      if (
        !issued ||
        !scope.active ||
        this.scopes.getStore() !== scope ||
        !scope.attached
      )
        throw new Error("Publication has no matching native claim scope");
      const context = this.contexts.get(transaction);
      if (!context)
        throw new Error("Publication has no live native transaction");
      return context;
    };
    const publication: BinaryPublication = {
      facts,
      run: async <U>(body: () => Promise<U>): Promise<U> => {
        if (!issued || entered)
          throw new Error("Binary publication is closed or already entered");
        entered = true;
        scope.active = true;
        try {
          return await this.scopes.run(scope, body);
        } finally {
          scope.active = false;
        }
      },
      executeBound: async (transaction, query, placeholder): Promise<void> => {
        await contextFor(transaction).executeBound(
          query,
          new Map([[placeholder, claim]]),
        );
      },
      verifyBlob: (transaction, plan) =>
        contextFor(transaction).verifyBlob(plan),
    };
    try {
      return await operation(publication);
    } finally {
      issued = false;
    }
  }
}

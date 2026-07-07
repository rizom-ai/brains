import type { AtprotoLexicon } from "./lexicon";
import type {
  AtprotoProjectedPostRecord,
  AtprotoProjection,
} from "./projection";

export class AtprotoProjectionRegistry {
  private static instance: AtprotoProjectionRegistry | undefined;
  // Stack per entity type: the newest registration wins, so re-registering
  // plugin instances (with fresh buildRecord/onPublished closures) take
  // effect instead of being silently discarded.
  private readonly projections = new Map<string, AtprotoProjection[]>();

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

  register<TRecord extends Record<string, unknown>>(
    projection: AtprotoProjection<TRecord>,
  ): () => void {
    this.validateProjection(projection);
    const current = this.get(projection.entityType);
    if (current && !this.isEquivalentProjection(current, projection)) {
      throw new Error(
        `AT Protocol projection already registered for entity type ${projection.entityType}`,
      );
    }

    const stack = this.projections.get(projection.entityType) ?? [];
    stack.push(projection);
    this.projections.set(projection.entityType, stack);
    return this.createUnregister(projection.entityType, projection);
  }

  get(
    entityType: "post",
  ): AtprotoProjection<AtprotoProjectedPostRecord> | undefined;
  get(entityType: string): AtprotoProjection | undefined;
  get(entityType: string): AtprotoProjection | undefined {
    const stack = this.projections.get(entityType);
    return stack?.[stack.length - 1];
  }

  has(entityType: string): boolean {
    return this.get(entityType) !== undefined;
  }

  list(): AtprotoProjection[] {
    const result: AtprotoProjection[] = [];
    for (const entityType of this.projections.keys()) {
      const projection = this.get(entityType);
      if (projection) {
        result.push(projection);
      }
    }
    return result;
  }

  listLexicons(): AtprotoLexicon[] {
    return this.list().map((projection) => projection.lexicon);
  }

  private createUnregister(
    entityType: string,
    projection: AtprotoProjection,
  ): () => void {
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      const stack = this.projections.get(entityType);
      if (!stack) return;
      const index = stack.lastIndexOf(projection);
      if (index !== -1) {
        stack.splice(index, 1);
      }
      if (stack.length === 0) {
        this.projections.delete(entityType);
      }
    };
  }

  private isEquivalentProjection(
    existing: AtprotoProjection,
    projection: AtprotoProjection,
  ): boolean {
    return (
      existing.entityType === projection.entityType &&
      existing.collection === projection.collection &&
      existing.lexicon.id === projection.lexicon.id &&
      existing.validate === projection.validate
    );
  }

  private validateProjection(projection: AtprotoProjection): void {
    if (projection.collection !== projection.lexicon.id) {
      throw new Error(
        `AT Protocol projection collection must match lexicon id: ${projection.collection} !== ${projection.lexicon.id}`,
      );
    }
    if (!projection.lexicon.defs.main.key) {
      throw new Error(
        `AT Protocol projection lexicon must define a record key: ${projection.collection}`,
      );
    }
  }
}

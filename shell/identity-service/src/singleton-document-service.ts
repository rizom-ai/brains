import type { IEntityService } from "@brains/entity-service";
import {
  internalFullScope,
  SingletonEntityService,
} from "@brains/entity-service";
import type { Logger } from "@brains/utils/logger";

/** Parses a singleton document's body from content and serializes it back. */
export interface SingletonDocumentCodec<TBody> {
  parse(content: string): TBody;
  create(body: TBody): string;
}

/**
 * Shared core of the identity singletons (anchor profile, brain character).
 *
 * Both services are a SingletonEntityService whose parse/create pair delegates
 * to an entity adapter, loaded at bootstrap under an internal-full scope. Only
 * the entity type, default body, and codec differ, so those arrive as
 * constructor data; the domain-named classes keep the consumed surface
 * (defaults, factories, named getters).
 */
export abstract class SingletonDocumentService<
  TBody,
> extends SingletonEntityService<TBody> {
  private readonly codec: SingletonDocumentCodec<TBody>;

  protected constructor(
    entityService: IEntityService,
    logger: Logger,
    entityType: string,
    defaultBody: TBody,
    scopeReason: string,
    codec: SingletonDocumentCodec<TBody>,
  ) {
    super(
      entityService,
      logger,
      entityType,
      defaultBody,
      internalFullScope(scopeReason),
    );
    this.codec = codec;
  }

  protected parseBody(content: string): TBody {
    return this.codec.parse(content);
  }

  protected createContent(body: TBody): string {
    return this.codec.create(body);
  }
}

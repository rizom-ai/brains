import type { FeedItem } from "./feed";

/** The entity shape a feed declaration reads, narrowed to what it needs. */
export interface FeedSourceEntity {
  readonly id: string;
  readonly content: string;
  readonly created: string;
  readonly metadata: Record<string, unknown>;
}

/**
 * What an entity type contributes to a syndication feed.
 *
 * `toItem` returns null for an entity that should not appear at all —
 * malformed, or missing the fields a reader needs. Whether *unpublished*
 * entities appear is not this decision: the site build decides that, since
 * it knows whether it is building a preview.
 *
 * `toItem` uses method syntax deliberately: methods are compared
 * bivariantly, so a declaration reading its own concrete entity type stays
 * assignable here without a cast.
 */
export interface FeedDeclaration {
  readonly entityType: string;
  /** Path the feed is written to, relative to the build output. */
  readonly path: string;
  /** Route prefix an item's slug hangs off, e.g. "posts". */
  readonly routePrefix: string;
  toItem(entity: FeedSourceEntity): FeedItem | null;
}

/**
 * Feeds declared by entity packages, read by the site build.
 *
 * A registry rather than a direct call because the two sides must not import
 * each other: an entity package knows how its own entity becomes a feed
 * item, and the site build knows where files go.
 */
export class FeedRegistry {
  private static instance: FeedRegistry | undefined;
  private readonly feeds = new Map<string, FeedDeclaration>();

  static getInstance(): FeedRegistry {
    this.instance ??= new FeedRegistry();
    return this.instance;
  }

  static createFresh(): FeedRegistry {
    return new FeedRegistry();
  }

  static resetInstance(): void {
    this.instance = undefined;
  }

  /** Returns a release handle, so the runtime owns teardown. */
  register(declaration: FeedDeclaration): () => void {
    this.feeds.set(declaration.entityType, declaration);
    return (): void => {
      if (this.feeds.get(declaration.entityType) === declaration) {
        this.feeds.delete(declaration.entityType);
      }
    };
  }

  get(entityType: string): FeedDeclaration | undefined {
    return this.feeds.get(entityType);
  }

  list(): readonly FeedDeclaration[] {
    return [...this.feeds.values()];
  }
}

export interface SiteContentEntity {
  id: string;
  entityType: string;
  content: string;
  metadata: Record<string, unknown>;
}

export interface SiteContentListOptions {
  limit?: number;
  offset?: number;
  publishedOnly?: boolean;
  filter?: {
    metadata?: Record<string, unknown>;
  };
}

export interface SiteContentEntityService {
  getEntity(entityType: string, id: string): Promise<SiteContentEntity | null>;
  listEntities(
    entityType: string,
    options?: SiteContentListOptions,
  ): Promise<SiteContentEntity[]>;
  getEntityTypes(): string[];
}

export interface SiteMessageSendOptions {
  broadcast?: boolean;
}

export type SiteMessageResponse<T = unknown> =
  | ({ success: boolean; error?: string | undefined } & {
      data?: T | undefined;
    })
  | { noop: true };

export type SiteMessageSender = <T = unknown, R = unknown>(
  type: string,
  payload: T,
  options?: SiteMessageSendOptions,
) => Promise<SiteMessageResponse<R>>;

export interface SiteContentResolutionOptions {
  /** Look up previously saved content from entity storage. */
  savedContent?: {
    entityType: string;
    entityId: string;
  };
  /** Parameters for DataSource fetch operation. */
  dataParams?: unknown;
  /** Format for DataSource transform operation. */
  transformFormat?: string;
  /** Static fallback content. */
  fallback?: unknown;
  /** Filter to published/complete content for production builds. */
  publishedOnly?: boolean;
}

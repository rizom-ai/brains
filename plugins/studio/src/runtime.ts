import type {
  AppInfo,
  ConsoleSurface,
  IAuthRegistry,
  IInboxNamespace,
  IPluginsNamespace,
  LoggerContract,
  OperatorEntityWrites,
  RuntimeReadiness,
  ServiceChannelReader,
  ServiceEntityShapes,
  ServiceJudge,
  ServicePublisher,
  SurfacePermissionLevel,
} from "@brains/sdk/services";
import type { BaseEntity, ListOptions } from "@brains/sdk/entities";
import type { AnchorProfile } from "@brains/sdk/services";

/**
 * The reads a console makes of the brain's records.
 *
 * Reads only, and across every type: the console shows whatever the brain
 * holds. Writes go through `operatorEntities`, which takes the caller.
 */
export interface StudioEntityReads {
  getEntity(request: {
    entityType: string;
    id: string;
    visibilityScope?: BaseEntity["visibility"] | undefined;
  }): Promise<BaseEntity | null>;
  listEntities(request: {
    entityType: string;
    options?: ListOptions | undefined;
  }): Promise<BaseEntity[]>;
  getEntityTypes(): string[];
  getEntityCounts(
    visibilityScope?: BaseEntity["visibility"],
  ): Promise<Array<{ entityType: string; count: number }>>;
  count(request: {
    entityType: string;
    options?: Pick<ListOptions, "filter"> | undefined;
  }): Promise<number>;
}

/**
 * What Studio holds from registration.
 *
 * Built once in `setup` and handed to every route handler and workspace,
 * rather than each of them reaching for a plugin context. Everything here
 * is a read the declared setup context offers, or a write that takes the
 * caller.
 */
export interface StudioRuntime {
  readonly entities: StudioEntityReads;
  readonly shapes: ServiceEntityShapes;
  readonly operator: OperatorEntityWrites;
  readonly messaging: ServicePublisher;
  readonly judge: ServiceJudge;
  readonly identity: {
    getProfile(): AnchorProfile;
    getAppInfo(): Promise<AppInfo>;
  };
  readonly auth: IAuthRegistry;
  readonly channels: ServiceChannelReader;
  readonly inbox: IInboxNamespace;
  readonly plugins: Pick<IPluginsNamespace, "has">;
  readonly surfaces: (options: {
    permissionLevel?: SurfacePermissionLevel | undefined;
    hasActiveSession?: boolean | undefined;
    selfHref?: string | undefined;
  }) => readonly ConsoleSurface[];
  readonly themeCSS: string;
  readonly readiness: () => Promise<RuntimeReadiness>;
  readonly logger: LoggerContract;
}

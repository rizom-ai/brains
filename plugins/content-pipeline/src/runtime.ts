import type {
  BaseEntity,
  EntitySchema,
  ListOptions,
} from "@brains/sdk/entities";
import type {
  IAttachmentsNamespace,
  IPermissionsNamespace,
  IRuntimeStateStore,
  LoggerContract,
  RuntimeStateScopeOptions,
  ServiceJobs,
  ServicePublisher,
  ServicePublishingAccess,
} from "@brains/sdk/services";

/**
 * The reads the pipeline makes of the brain's records.
 *
 * Every publishable type belongs to some other package, so these are reads
 * across the corpus. Writes are not here: recording a publish outcome goes
 * through `publishing`, which is scoped to what each package delegated.
 */
export interface PipelineEntityReads {
  getEntity(request: {
    entityType: string;
    id: string;
    visibilityScope?: string | undefined;
  }): Promise<BaseEntity | null>;
  getEntity<T extends BaseEntity>(
    request: {
      entityType: string;
      id: string;
      visibilityScope?: string | undefined;
    },
    schema: EntitySchema<T>,
  ): Promise<T | null>;
  listEntities(request: {
    entityType: string;
    options?: ListOptions | undefined;
  }): Promise<BaseEntity[]>;
  listEntities<T extends BaseEntity>(
    request: { entityType: string; options?: ListOptions | undefined },
    schema: EntitySchema<T>,
  ): Promise<T[]>;
}

/**
 * What the pipeline holds from registration.
 *
 * Built once in `setup` and passed to the queue, the executor, the
 * scheduler and the operator surfaces, rather than each of them reaching
 * for a plugin context. Everything here is a capability the declaration was
 * granted; nothing widens it.
 */
export interface PipelineRuntime {
  readonly entities: PipelineEntityReads;
  readonly publishing: ServicePublishingAccess;
  readonly permissions: Pick<
    IPermissionsNamespace,
    "assertEntityActionAllowed"
  >;
  readonly attachments: IAttachmentsNamespace;
  readonly messaging: ServicePublisher;
  readonly jobs: ServiceJobs;
  readonly runtimeState: <TValue>(
    options: RuntimeStateScopeOptions<TValue>,
  ) => IRuntimeStateStore<TValue>;
  readonly logger: LoggerContract;
}

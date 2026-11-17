import type { CallerAccess } from "@brains/content-service";
import { SdkError, type ActorRef } from "@brains/contracts";
import {
  assetRefSchema,
  internalFullScope,
  type BaseEntity,
  type ContentVisibility,
  type IEntityService,
  type StagedAsset,
} from "@brains/entity-service";
import {
  PermissionService,
  type EntityActionRequiredLevel,
} from "@brains/templates";
import { definedFields } from "@brains/utils/strip-undefined";
import type { PackageCall } from "../service/job-authority";
import type {
  AnyEntityDefinition,
  EntityOf,
  OwnedEntityWriter,
} from "./entity-definition-contract";
import type { EntityRuntimeAssets } from "./entity-runtime";
import { parseDefinitionEntity } from "./entity-schema";

/** Who an owned write acts as, and how the store attributes it. */
export interface OwnedWriteCall extends PackageCall {
  readonly eventContext: {
    readonly actor: ActorRef;
    readonly interfaceType?: string;
  };
}

/**
 * What an owned writer is bound to: the store, the types it may write, the
 * call it writes as, and where that call reads a type.
 */
export interface OwnedEntityWriterBinding<TCall extends OwnedWriteCall> {
  readonly entityService: Pick<
    IEntityService,
    | "getEntity"
    | "getEntityRaw"
    | "createEntity"
    | "updateEntity"
    | "deleteEntity"
  >;
  /** The declaration that grants a write, or a `permission_denied` refusal. */
  owned(definition: AnyEntityDefinition): AnyEntityDefinition;
  currentCall(): TCall;
  /** Refuses the action the type's policy does not admit for the call. */
  assertWriteAllowed(
    entityType: string,
    action: "create" | "update" | "delete",
    call: TCall,
  ): Promise<void>;
  /** Where the call reads the type. */
  readScope(
    call: TCall,
    entityType: string,
    access: CallerAccess,
  ): ContentVisibility;
  /** Refuses a create at a visibility the call may not write; unset, none. */
  assertCreateVisibility?(
    entityType: string,
    visibility: ContentVisibility,
    call: TCall,
  ): Promise<void>;
}

/**
 * Held to the type's action policy at the caller's permission level. The
 * policy governs callers: the package acting as itself writes its own
 * types as a class plugin does, and a `never` rule closes a type to system
 * tools, not to the package that owns it.
 */
export async function assertOwnedWriteAllowed(
  requiredLevel: EntityActionRequiredLevel | undefined,
  entityType: string,
  action: "create" | "update" | "delete",
  call: PackageCall,
): Promise<void> {
  if (call.asPackage === true) return;
  const access = await call.access();
  if (
    requiredLevel === undefined ||
    requiredLevel === "never" ||
    PermissionService.hasPermission(access.permissionLevel, requiredLevel)
  ) {
    return;
  }
  const refusal = `Writing ${entityType} (${action}) requires ${requiredLevel} permission; the caller has ${access.permissionLevel}`;
  throw new SdkError("permission_denied", {
    message: refusal,
    publicMessage: refusal,
  });
}

function parseOwnedMetadata(
  definition: AnyEntityDefinition,
  metadata: unknown,
): Record<string, unknown> {
  const parsed = definition.metadata.safeParse(metadata);
  if (!parsed.success) {
    throw new SdkError("invalid_input", {
      message: `Invalid ${definition.type} metadata: ${parsed.error.message}`,
      cause: parsed.error,
    });
  }
  return parsed.data;
}

function conflict(entityType: string, id: string): SdkError {
  return new SdkError("conflict", {
    message: `The ${entityType} "${id}" changed after it was read`,
    publicMessage: "The record changed after it was read; read it again",
  });
}

/**
 * Writes to the bound types as the current call: a create refuses an id
 * taken at any visibility, and an update or delete refuses a record that
 * changed after it was read, or that the call cannot see.
 */
export function createOwnedEntityWriter<TCall extends OwnedWriteCall>(
  binding: OwnedEntityWriterBinding<TCall>,
): OwnedEntityWriter<AnyEntityDefinition> {
  const { entityService } = binding;

  /** The stored record as the call sees it, unchanged since it was read. */
  async function currentRecord(
    definition: AnyEntityDefinition,
    record: EntityOf<AnyEntityDefinition>,
    call: TCall,
  ): Promise<BaseEntity> {
    const access = await call.access();
    if (record.entityType !== definition.type) {
      throw new SdkError("permission_denied", {
        message: `A ${definition.type} write cannot change a ${record.entityType}`,
      });
    }
    // As stored, so content written back unchanged is the stored body: an
    // asset-backed record keeps its reference, never a materialized copy.
    const stored = await entityService.getEntityRaw({
      entityType: definition.type,
      id: record.id,
      visibilityScope: binding.readScope(call, definition.type, access),
      binaryContent: "reference",
    });
    if (!stored) {
      throw new SdkError("not_found", {
        message: `No ${definition.type} "${record.id}" is visible to the caller`,
      });
    }
    if (stored.contentHash !== record.contentHash) {
      throw conflict(definition.type, record.id);
    }
    return stored;
  }

  const writer: OwnedEntityWriter<AnyEntityDefinition> = {
    create: async (definition, input) => {
      const declared = binding.owned(definition);
      const call = binding.currentCall();
      await binding.assertWriteAllowed(declared.type, "create", call);
      await binding.assertCreateVisibility?.(
        declared.type,
        input.visibility ?? "public",
        call,
      );
      const metadata = parseOwnedMetadata(declared, input.metadata);
      // Create-if-absent: an id taken at any visibility is not written
      // over, even one the caller cannot see.
      if (input.id !== undefined) {
        const taken = await entityService.getEntity({
          entityType: declared.type,
          id: input.id,
          visibilityScope: internalFullScope(
            "an owned create checks whether its id is taken; no content returned",
          ),
          binaryContent: "reference",
        });
        if (taken) {
          throw new SdkError("conflict", {
            message: `A ${declared.type} "${input.id}" already exists`,
          });
        }
      }
      const written = await entityService.createEntity({
        entity: {
          ...definedFields({ id: input.id, visibility: input.visibility }),
          entityType: declared.type,
          content: input.content,
          metadata,
        },
        options: {
          ...(input.id !== undefined && {
            conditionalWrite: { expectedRevision: null },
          }),
          eventContext: call.eventContext,
        },
      });
      return { id: written.entityId };
    },
    update: async (definition, record, change) => {
      const declared = binding.owned(definition);
      const call = binding.currentCall();
      await binding.assertWriteAllowed(declared.type, "update", call);
      const stored = await currentRecord(declared, record, call);
      const written = await entityService.updateEntity({
        entity: {
          ...stored,
          content: change.content ?? stored.content,
          metadata: parseOwnedMetadata(
            declared,
            change.metadata ?? record.metadata,
          ),
        },
        options: {
          expectedContentHash: record.contentHash,
          eventContext: call.eventContext,
        },
      });
      if (written.skipReason === "content-conflict") {
        throw conflict(declared.type, record.id);
      }
    },
    delete: async (definition, record) => {
      const declared = binding.owned(definition);
      const call = binding.currentCall();
      await binding.assertWriteAllowed(declared.type, "delete", call);
      await currentRecord(declared, record, call);
      const deleted = await entityService.deleteEntity({
        entityType: declared.type,
        id: record.id,
        options: {
          expectedContentHash: record.contentHash,
          eventContext: call.eventContext,
        },
      });
      if (!deleted) throw conflict(declared.type, record.id);
    },
  };
  return writer;
}

/** What an owned asset writer reads and writes through. */
export interface OwnedAssetWriterBinding<
  TCall extends OwnedWriteCall,
> extends Omit<OwnedEntityWriterBinding<TCall>, "entityService"> {
  readonly entityService: OwnedEntityWriterBinding<TCall>["entityService"] &
    Pick<
      IEntityService,
      "stageAsset" | "discardStagedAsset" | "openAsset" | "readAsset"
    >;
}

/**
 * Asset-backed records of the bound types: bytes staged once and saved as a
 * record whose content is their reference, published in that record's own
 * mutation, and bytes read only through a record the call can see.
 */
export function createOwnedAssetWriter<TCall extends OwnedWriteCall>(
  binding: OwnedAssetWriterBinding<TCall>,
): EntityRuntimeAssets {
  const { entityService } = binding;

  /** The record as stored at the call's scope: its reference, no bytes. */
  async function storedAtScope(
    definition: AnyEntityDefinition,
    id: string,
  ): Promise<BaseEntity | null> {
    const call = binding.currentCall();
    const access = await call.access();
    return entityService.getEntityRaw({
      entityType: definition.type,
      id,
      visibilityScope: binding.readScope(call, definition.type, access),
      binaryContent: "reference",
    });
  }

  async function save(
    definition: AnyEntityDefinition,
    id: string,
    record: {
      readonly metadata: unknown;
      readonly visibility?: ContentVisibility | undefined;
    },
    asset: StagedAsset,
  ): Promise<{ readonly entityId: string }> {
    const declared = binding.owned(definition);
    const call = binding.currentCall();
    const metadata = parseOwnedMetadata(declared, record.metadata);
    const stored = await entityService.getEntityRaw({
      entityType: declared.type,
      id,
      visibilityScope: internalFullScope(
        "an asset save writes over the record its id names; no bytes returned",
      ),
      binaryContent: "reference",
    });
    if (stored) {
      await binding.assertWriteAllowed(declared.type, "update", call);
      const written = await entityService.updateEntity({
        entity: {
          ...stored,
          content: asset.ref,
          metadata,
          ...(record.visibility !== undefined && {
            visibility: record.visibility,
          }),
        },
        stagedAsset: asset,
        options: {
          expectedContentHash: stored.contentHash,
          eventContext: call.eventContext,
        },
      });
      if (written.skipReason === "content-conflict") {
        throw conflict(declared.type, id);
      }
      return { entityId: written.entityId };
    }
    await binding.assertWriteAllowed(declared.type, "create", call);
    await binding.assertCreateVisibility?.(
      declared.type,
      record.visibility ?? "public",
      call,
    );
    const written = await entityService.createEntity({
      entity: {
        id,
        entityType: declared.type,
        content: asset.ref,
        metadata,
        ...(record.visibility !== undefined && {
          visibility: record.visibility,
        }),
      },
      stagedAsset: asset,
      options: {
        conditionalWrite: { expectedRevision: null },
        eventContext: call.eventContext,
      },
    });
    return { entityId: written.entityId };
  }

  return Object.freeze({
    stage: (source, options): Promise<StagedAsset> =>
      entityService.stageAsset(source, options),
    discard: (asset): Promise<void> => entityService.discardStagedAsset(asset),
    save: async (
      definition,
      id,
      record,
      asset,
    ): Promise<{ readonly entityId: string }> => {
      try {
        return await save(definition, id, record, asset);
      } catch (error) {
        // A refusal before the mutation leaves the upload staged: discard it.
        await entityService.discardStagedAsset(asset);
        throw error;
      }
    },
    getStored: async <TDefinition extends AnyEntityDefinition>(
      definition: TDefinition,
      id: string,
    ): Promise<EntityOf<TDefinition> | null> => {
      const stored = await storedAtScope(definition, id);
      return stored ? parseDefinitionEntity(definition, stored) : null;
    },
    open: async (
      definition,
      id,
    ): Promise<AsyncIterable<Uint8Array> | Iterable<Uint8Array> | null> => {
      const stored = await storedAtScope(definition, id);
      if (!stored) return null;
      const ref = assetRefSchema.safeParse(stored.content);
      if (ref.success) return entityService.openAsset(ref.data);
      const inline = inlineBytes(stored.content);
      return inline ? [inline] : null;
    },
    read: async (definition, id): Promise<Uint8Array | null> => {
      const stored = await storedAtScope(definition, id);
      if (!stored) return null;
      const ref = assetRefSchema.safeParse(stored.content);
      if (ref.success) return entityService.readAsset(ref.data);
      return inlineBytes(stored.content);
    },
  } satisfies EntityRuntimeAssets);
}

/** The bytes of inline content kept before assets, a base64 data URL; else none. */
function inlineBytes(content: string): Uint8Array | null {
  // A data URL read from a markdown file keeps that file's newline.
  const match = /^data:[^;,]+;base64,([\s\S]*)$/.exec(content.trim());
  const payload = match?.[1]?.replace(/\s+/g, "");
  return payload ? Uint8Array.from(Buffer.from(payload, "base64")) : null;
}

/**
 * Asset-backed records read at one fixed scope, with no writes: what a
 * callback that only reads bytes is given, such as an AT Protocol record
 * built from public entries. A record not visible at the scope reads as
 * absent, whatever another record sharing its bytes allows.
 */
export function createScopedAssetReads(
  entityService: Pick<
    IEntityService,
    "getEntityRaw" | "openAsset" | "readAsset"
  >,
  visibilityScope: ContentVisibility,
  where: string,
): EntityRuntimeAssets {
  const refuse = (name: string) => async (): Promise<never> => {
    throw new Error(`assets.${name} is not available in ${where}`);
  };
  // A record of another type is not this type's record: it reads as absent.
  const stored = async (
    definition: AnyEntityDefinition,
    id: string,
  ): Promise<BaseEntity | null> => {
    const record = await entityService.getEntityRaw({
      entityType: definition.type,
      id,
      visibilityScope,
      binaryContent: "reference",
    });
    return record?.entityType === definition.type ? record : null;
  };
  return Object.freeze({
    stage: refuse("stage"),
    discard: refuse("discard"),
    save: refuse("save"),
    getStored: async <TDefinition extends AnyEntityDefinition>(
      definition: TDefinition,
      id: string,
    ): Promise<EntityOf<TDefinition> | null> => {
      const record = await stored(definition, id);
      return record ? parseDefinitionEntity(definition, record) : null;
    },
    open: async (
      definition: AnyEntityDefinition,
      id: string,
    ): Promise<AsyncIterable<Uint8Array> | Iterable<Uint8Array> | null> => {
      const record = await stored(definition, id);
      if (!record) return null;
      const ref = assetRefSchema.safeParse(record.content);
      if (ref.success) return entityService.openAsset(ref.data);
      const inline = inlineBytes(record.content);
      return inline ? [inline] : null;
    },
    read: async (
      definition: AnyEntityDefinition,
      id: string,
    ): Promise<Uint8Array | null> => {
      const record = await stored(definition, id);
      if (!record) return null;
      const ref = assetRefSchema.safeParse(record.content);
      if (ref.success) return entityService.readAsset(ref.data);
      return inlineBytes(record.content);
    },
  } satisfies EntityRuntimeAssets);
}

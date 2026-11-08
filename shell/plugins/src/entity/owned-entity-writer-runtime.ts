import type { CallerAccess } from "@brains/content-service";
import { SdkError, type ActorRef } from "@brains/contracts";
import {
  internalFullScope,
  type BaseEntity,
  type ContentVisibility,
  type IEntityService,
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
    // As stored, so content written back unchanged is the stored body.
    const stored = await entityService.getEntityRaw({
      entityType: definition.type,
      id: record.id,
      visibilityScope: binding.readScope(call, definition.type, access),
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

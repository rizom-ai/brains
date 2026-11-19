import {
  CONFLICT_ENTITY_TYPE,
  CONFLICT_IMAGE_ENTITY_TYPE,
  type RecordConflictRequest,
  type RecordConflictResponse,
} from "@brains/contracts";
import {
  canWriteVisibility,
  getPublishBoundaryState,
  type BaseEntity,
} from "@brains/sdk/internal/entity-runtime";
import {
  internalFullScope,
  permissionToVisibilityScope,
  type InboxActor,
  type ServiceEntityReads,
  type ServiceEntityWrites,
  type ServicePermissions,
} from "@brains/sdk/internal/service-runtime";
import { computeContentHash } from "@brains/utils/hash";
import { createTwoFilesPatch } from "diff";
import { conflictId, conflictStamp } from "./conflict-id";
import { conflictVisibility } from "./conflict-visibility";
import { decodeLosingText, encodeLosingText } from "./losing-text";
import {
  conflictFieldsSchema,
  conflictImageFieldsSchema,
  type ConflictFields,
} from "../schemas";

export interface ConflictStoreDeps {
  reads: Pick<
    ServiceEntityReads,
    "getEntity" | "listEntities" | "deserializeEntity" | "getEntityTypeConfig"
  >;
  writes: Pick<
    ServiceEntityWrites,
    | "createEntity"
    | "updateEntity"
    | "deleteEntity"
    | "stageAsset"
    | "discardStagedAsset"
  >;
  permissions: ServicePermissions;
  now: () => Date;
}

/** A conflict as the Inbox lists it: what it is about, never its text. */
export interface ConflictItem extends ConflictFields {
  /** A losing text, or a losing image held as its bytes. */
  kind: "text" | "image";
  /** Short and stable, for an Inbox item id; the conflict's own id can be long. */
  itemId: string;
  conflictId: string;
  /** When the conflict was recorded. */
  created: string;
}

/** What can be done with a conflict: take the losing version, or leave it. */
export type ConflictAction = "apply" | "keep-current";

/** The most conflicts one listing reads; the Inbox shows the oldest first. */
const LIST_LIMIT = 500;
/** How many conflicts over one entity one second may hold. */
const MAX_SAME_SECOND = 50;
const SYSTEM_SCOPE = internalFullScope(
  "conflicts are kept and resolved by the brain, whatever their visibility",
);

/**
 * The edits that lost, kept as `conflict` entities until someone decides:
 * recorded once per losing text, applied over the target's current version
 * under the target's own rules, or dismissed.
 */
export class ConflictStore {
  private readonly deps: ConflictStoreDeps;

  constructor(deps: ConflictStoreDeps) {
    this.deps = deps;
  }

  /** Keep a losing edit. The same text for the same target is one conflict. */
  async record(
    request: RecordConflictRequest,
  ): Promise<RecordConflictResponse> {
    const { image } = request;
    // What makes the same edit one conflict: the text, or the image's bytes.
    const edit = image
      ? new Bun.CryptoHasher("sha256").update(image.bytes).digest("hex")
      : computeContentHash(request.text);
    const [held] = await this.deps.reads.listEntities({
      entityType: image ? CONFLICT_IMAGE_ENTITY_TYPE : CONFLICT_ENTITY_TYPE,
      options: {
        filter: {
          metadata: {
            targetType: request.entityType,
            targetId: request.entityId,
            edit,
          },
          visibilityScope: SYSTEM_SCOPE,
        },
        limit: 1,
      },
    });
    if (held) return { conflictId: held.id, created: false };

    const at = this.deps.now();
    const fields: ConflictFields = {
      targetType: request.entityType,
      targetId: request.entityId,
      origin: request.origin,
      ...(request.actor ? { actor: request.actor } : {}),
      ...(request.base ? { base: request.base } : {}),
      current: request.current,
      edit,
    };
    const id = await this.create(request, fields, at, 1);
    return { conflictId: id, created: true };
  }

  /** Create under the first free stamp of this second: `…Z`, `…Z-2`, `…Z-3`. */
  private async create(
    request: RecordConflictRequest,
    fields: ConflictFields,
    at: Date,
    attempt: number,
  ): Promise<string> {
    const stamp = conflictStamp(at);
    const id = conflictId(
      request.entityType,
      request.entityId,
      attempt === 1 ? stamp : `${stamp}-${attempt}`,
    );
    const visibility = conflictVisibility(
      request.targetVisibility,
      request.declaredVisibility,
    );
    // Only if absent: a taken stamp is another conflict, never replaced.
    const options = { conditionalWrite: { expectedRevision: null } };
    try {
      if (request.image) {
        await this.createImage(request.image, {
          id,
          metadata: fields,
          created: at.toISOString(),
          visibility,
        });
        return id;
      }
      await this.deps.writes.createEntity({
        entity: {
          id,
          entityType: CONFLICT_ENTITY_TYPE,
          content: encodeLosingText(request.text),
          metadata: fields,
          created: at.toISOString(),
          visibility,
        },
        options,
      });
      return id;
    } catch (error) {
      // The store and this package can carry separate copies of the error
      // class: match its stable name, not its constructor.
      if (
        error instanceof Error &&
        error.name === "EntityWriteConflictError" &&
        attempt < MAX_SAME_SECOND
      ) {
        return this.create(request, fields, at, attempt + 1);
      }
      throw error;
    }
  }

  /**
   * Keep a losing image as its bytes. They are staged for this one create,
   * which publishes them with the conflict or discards them.
   */
  private async createImage(
    image: NonNullable<RecordConflictRequest["image"]>,
    conflict: Pick<BaseEntity, "id" | "created" | "visibility"> & {
      metadata: ConflictFields;
    },
  ): Promise<void> {
    const { writes } = this.deps;
    const stagedAsset = await writes.stageAsset(image.bytes, {
      expectedSize: image.bytes.byteLength,
    });
    await writes.createEntity({
      entity: {
        ...conflict,
        entityType: CONFLICT_IMAGE_ENTITY_TYPE,
        content: stagedAsset.ref,
        metadata: {
          ...conflict.metadata,
          image: { ...image.metadata, sizeBytes: stagedAsset.sizeBytes },
        },
      },
      stagedAsset,
      options: { conditionalWrite: { expectedRevision: null } },
    });
  }

  /** Every conflict, text and image, oldest first. */
  async list(): Promise<ConflictItem[]> {
    const [texts, images] = await Promise.all(
      [CONFLICT_ENTITY_TYPE, CONFLICT_IMAGE_ENTITY_TYPE].map((entityType) =>
        this.deps.reads.listEntities({
          entityType,
          options: {
            filter: { visibilityScope: SYSTEM_SCOPE },
            sortFields: [{ field: "created", direction: "asc" }],
            limit: LIST_LIMIT,
          },
        }),
      ),
    );
    const item = (
      kind: ConflictItem["kind"],
      conflict: BaseEntity,
    ): ConflictItem => ({
      ...conflictFieldsSchema.parse(conflict.metadata),
      kind,
      itemId: itemIdOf(conflict.id),
      conflictId: conflict.id,
      created: conflict.created,
    });
    return [
      ...(texts ?? []).map((conflict) => item("text", conflict)),
      ...(images ?? []).map((conflict) => item("image", conflict)),
    ]
      .sort((left, right) => left.created.localeCompare(right.created))
      .slice(0, LIST_LIMIT);
  }

  /** A line diff from the target's current version to the losing text. */
  async detail(itemId: string, actor: InboxActor): Promise<string> {
    const conflict = await this.require(itemId);
    const target = await this.target(conflict.fields, actor);
    if (conflict.fields.kind === "image") {
      const { image } = conflictImageFieldsSchema.parse(
        conflict.entity.metadata,
      );
      return [
        target
          ? `Current image: ${describeImage(target.metadata)}`
          : "The image no longer exists.",
        `This version: ${describeImage(image)}`,
      ].join("\n");
    }
    const losing = decodeLosingText(conflict.entity.content);
    if (!target) {
      return `The entry no longer exists. The edit that lost:\n\n${losing}`;
    }
    return createTwoFilesPatch(
      "current",
      "this version",
      target.content,
      losing,
      undefined,
      undefined,
      { context: 2 },
    );
  }

  /**
   * Write the losing text over the target's current version, as the actor
   * and under the target's own rules, then remove the conflict. A target
   * that changes meanwhile keeps both: the write and the conflict's removal
   * only go through over the version read here.
   */
  async apply(itemId: string, actor: InboxActor): Promise<void> {
    const { reads, writes, permissions } = this.deps;
    const conflict = await this.require(itemId);
    const target = await this.target(conflict.fields, actor);
    if (!target) throw new Error("The entry no longer exists");
    if (conflict.fields.kind === "image") {
      return this.applyImage(conflict.entity, target, actor);
    }

    const text = decodeLosingText(conflict.entity.content);
    const parsed = reads.deserializeEntity(text, target.entityType);
    const { visibility: _policy, ...metadata } =
      parsed.metadata ?? target.metadata;
    const entity: BaseEntity = {
      ...target,
      ...parsed,
      id: target.id,
      entityType: target.entityType,
      content: text,
      metadata,
      // A text that names no visibility carries no opinion about it.
      visibility: parsed.visibility ?? target.visibility,
    };

    const publishes =
      getPublishBoundaryState(
        target.entityType,
        target.metadata["status"],
        entity.metadata["status"],
        reads,
      ) !== "non-publish";
    permissions.assertEntityActionAllowed(
      target.entityType,
      publishes ? "publish" : "update",
      { userPermissionLevel: actor.permissionLevel },
    );
    if (!canWriteVisibility(actor.permissionLevel, entity.visibility)) {
      throw new Error(
        `Cannot set visibility to "${entity.visibility}" at ${actor.permissionLevel} permission`,
      );
    }

    const result = await writes.updateEntity({
      entity,
      options: {
        expectedContentHash: target.contentHash,
        eventContext: { interfaceType: "inbox" },
      },
    });
    if (result.skipReason === "content-conflict") {
      throw new Error(
        "The entry changed while this version was being applied; review the new current version",
      );
    }
    await writes.deleteEntity({
      entityType: CONFLICT_ENTITY_TYPE,
      id: conflict.entity.id,
    });
  }

  /**
   * Make the losing image the target's image: the target takes the
   * reference to bytes the conflict already holds, and what those bytes are.
   */
  private async applyImage(
    conflict: BaseEntity,
    target: BaseEntity,
    actor: InboxActor,
  ): Promise<void> {
    const { writes, permissions } = this.deps;
    const { image } = conflictImageFieldsSchema.parse(conflict.metadata);
    permissions.assertEntityActionAllowed(target.entityType, "update", {
      userPermissionLevel: actor.permissionLevel,
    });
    const result = await writes.updateEntity({
      entity: {
        ...target,
        content: conflict.content,
        metadata: { ...target.metadata, ...image },
      },
      options: {
        expectedContentHash: target.contentHash,
        eventContext: { interfaceType: "inbox" },
      },
    });
    if (result.skipReason === "content-conflict") {
      throw new Error(
        "The entry changed while this version was being applied; review the new current version",
      );
    }
    await writes.deleteEntity({
      entityType: conflict.entityType,
      id: conflict.id,
    });
  }

  /** Keep the current version: the conflict goes, the target is untouched. */
  async dismiss(itemId: string): Promise<void> {
    const conflict = await this.require(itemId);
    await this.deps.writes.deleteEntity({
      entityType: conflict.entity.entityType,
      id: conflict.entity.id,
    });
  }

  /**
   * Apply or dismiss a conflict by its id, as the person whose edit it holds
   * or as an admin: the way an editor settles a save of their own that lost,
   * without the Inbox. An apply is still held to the target's own rules.
   */
  async resolve(
    conflictId: string,
    action: ConflictAction,
    actor: InboxActor & { userId: string },
  ): Promise<void> {
    const itemId = itemIdOf(conflictId);
    const { fields } = await this.require(itemId);
    if (actor.permissionLevel !== "admin" && fields.actor !== actor.userId) {
      throw new Error(
        "Only the person whose edit this is, or an admin, can resolve it",
      );
    }
    return action === "apply"
      ? this.apply(itemId, actor)
      : this.dismiss(itemId);
  }

  private async require(
    itemId: string,
  ): Promise<{ entity: BaseEntity; fields: ConflictItem }> {
    const item = (await this.list()).find(
      (candidate) => candidate.itemId === itemId,
    );
    const entity = item
      ? await this.deps.reads.getEntity({
          entityType:
            item.kind === "image"
              ? CONFLICT_IMAGE_ENTITY_TYPE
              : CONFLICT_ENTITY_TYPE,
          id: item.conflictId,
          visibilityScope: SYSTEM_SCOPE,
        })
      : null;
    if (!item || !entity) throw new Error("The conflict no longer exists");
    return { entity, fields: item };
  }

  /** The conflict's target as the actor may read it, as stored. */
  private target(
    fields: ConflictFields,
    actor: InboxActor,
  ): Promise<BaseEntity | null> {
    return this.deps.reads.getEntity({
      entityType: fields.targetType,
      id: fields.targetId,
      visibilityScope: permissionToVisibilityScope(actor.permissionLevel),
      source: true,
    });
  }
}

/** An image in words: its format, its dimensions when known, its size. */
function describeImage(metadata: Record<string, unknown>): string {
  const { format, width, height, sizeBytes } = metadata;
  return [
    typeof format === "string" ? format : "unknown format",
    ...(typeof width === "number" && typeof height === "number"
      ? [`${width} × ${height}`]
      : []),
    ...(typeof sizeBytes === "number" ? [`${sizeBytes} bytes`] : []),
  ].join(", ");
}

function itemIdOf(id: string): string {
  return computeContentHash(id);
}

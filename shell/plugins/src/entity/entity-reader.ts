import {
  assetRefSchema,
  type BaseEntity,
  type ContentVisibility,
  type EntityServiceClient,
  type SortField,
} from "@brains/entity-service";
import { SdkError } from "@brains/contracts";
import { definedFields } from "@brains/utils/strip-undefined";
import type {
  AnyEntityDefinition,
  EntityBytes,
  EntityReader,
  DataSourceListOptions,
  DataSourceSortField,
  EntityOf,
} from "./entity-definition-contract";
import { parseDefinitionEntity } from "./entity-schema";

export function sortFields(sort: readonly DataSourceSortField[]): SortField[] {
  return sort.map(({ field, direction, nullsFirst, nullsLast }) => ({
    field,
    direction,
    ...definedFields({ nullsFirst, nullsLast }),
  }));
}

/**
 * Definition-typed reads over an entity service. Without a scope they read
 * what the service reads by default — public records, through whatever
 * scoping the service itself applies; with one, they read up to it.
 *
 * A record is read as stored: its body decoded by the type's codec, image
 * references left as references. `get` and `list` hand back the same record,
 * and one written back unchanged is stored byte for byte.
 */
export function createEntityReader(
  entityService: Pick<
    EntityServiceClient,
    "getEntityRaw" | "listEntities" | "countEntities" | "readAsset"
  >,
  visibilityScope?: ContentVisibility,
): EntityReader {
  const scope = definedFields({ visibilityScope });
  return Object.freeze({
    async get<TDefinition extends AnyEntityDefinition>(
      definition: TDefinition,
      id: string,
    ): Promise<EntityOf<TDefinition> | null> {
      const entity = await entityService.getEntityRaw({
        entityType: definition.type,
        id,
        ...scope,
      });
      return entity ? parseDefinitionEntity(definition, entity) : null;
    },
    async list<TDefinition extends AnyEntityDefinition>(
      definition: TDefinition,
      options?: DataSourceListOptions,
    ): Promise<readonly EntityOf<TDefinition>[]> {
      const entities = await entityService.listEntities({
        entityType: definition.type,
        options: definedFields({
          limit: options?.limit,
          offset: options?.offset,
          sortFields: options?.sort && sortFields(options.sort),
          filter: visibilityScope && { visibilityScope },
        }),
      });
      return entities.map((entity) =>
        parseDefinitionEntity(definition, entity),
      );
    },
    count: (definition: AnyEntityDefinition): Promise<number> =>
      entityService.countEntities({
        entityType: definition.type,
        ...(visibilityScope && { options: { filter: { visibilityScope } } }),
      }),
    async readBytes(
      definition: AnyEntityDefinition,
      id: string,
    ): Promise<EntityBytes | null> {
      if (definition.config?.binaryStorage === undefined) {
        throw new SdkError("invalid_input", {
          message: `"${definition.type}" stores no bytes: only a type that declares binaryStorage has them`,
        });
      }
      // The record as stored, at this reader's scope: its reference is read
      // for this record alone, never served by reference.
      const record = await entityService.getEntityRaw({
        entityType: definition.type,
        id,
        ...scope,
      });
      if (record?.entityType !== definition.type) return null;
      return recordBytes(entityService, record);
    },
  });
}

/** A binary record's bytes: its asset's, or an inline data URL's; none when empty. */
async function recordBytes(
  entityService: Pick<EntityServiceClient, "readAsset">,
  record: BaseEntity,
): Promise<EntityBytes | null> {
  const ref = assetRefSchema.safeParse(record.content);
  if (ref.success) {
    const bytes = await entityService.readAsset(ref.data);
    return {
      bytes,
      mediaType: storedMediaType(record.metadata) ?? "application/octet-stream",
      sizeBytes: bytes.byteLength,
    };
  }
  // A data URL stored before assets; a markdown file's newline is kept.
  const inline = /^data:([^;,]+);base64,([\s\S]*)$/.exec(record.content.trim());
  const payload = inline?.[2]?.replace(/\s/g, "");
  if (!inline?.[1] || !payload) return null;
  const bytes = Uint8Array.from(Buffer.from(payload, "base64"));
  return { bytes, mediaType: inline[1], sizeBytes: bytes.byteLength };
}

/** The media type recorded beside the bytes, else the one the format implies. */
function storedMediaType(
  metadata: Record<string, unknown>,
): string | undefined {
  const recorded = metadata["mediaType"];
  if (typeof recorded === "string") return recorded;
  const format = metadata["format"];
  if (typeof format !== "string") return undefined;
  return `image/${format === "jpg" ? "jpeg" : format}`;
}

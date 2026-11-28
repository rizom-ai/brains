import {
  decodeEntityIdPath,
  type BaseEntity,
} from "@brains/sdk/internal/entity-runtime";
import {
  SemanticIndexingDisabledError,
  isVisibleWithinScope,
  type AssetRef,
} from "@brains/sdk/internal/service-runtime";
import type { DavReader } from "../src/dav-tree";

type Scope = "public" | "shared" | "restricted";

export function entity(
  entityType: string,
  id: string,
  overrides: Partial<BaseEntity> = {},
): BaseEntity {
  const content =
    overrides.content ?? `---\ntitle: ${id}\n---\n\nBody of ${id}`;
  return {
    id,
    entityType,
    content,
    metadata: {},
    visibility: "public",
    contentHash: `hash-${entityType}-${id}`,
    created: "2026-11-01T10:00:00.000Z",
    updated: "2026-11-02T12:30:00.000Z",
    ...overrides,
  };
}

/**
 * The entity reads the drive makes, over a fixed list. Listings page two at a
 * time, so a folder with more children proves the drive reads every page.
 */
export function fakeReader(options: {
  entities: BaseEntity[];
  containedIn?: Record<string, string>;
  types?: string[];
  assets?: Record<string, Uint8Array>;
  /** Types whose store writes YAML files (docs/external-plugin-authoring.md, The stored format). */
  yamlTypes?: string[];
  /** What the store answers as nearest to any entity, closest first; and what it was asked. */
  nearest?: {
    answer: Array<{ entityType: string; entityId: string; distance: number }>;
    asked: Array<Parameters<DavReader["nearestToEntity"]>[0]>;
    /** A brain that keeps no semantic index refuses to tell. */
    unindexed?: boolean;
  };
}): DavReader {
  const visible = (scope: Scope | undefined): BaseEntity[] =>
    options.entities.filter((candidate) =>
      isVisibleWithinScope(candidate.visibility, scope ?? "public"),
    );
  const types = options.types ?? [
    ...new Set(options.entities.map((candidate) => candidate.entityType)),
  ];
  const asset = (ref: AssetRef): Uint8Array | undefined =>
    options.assets?.[ref];

  return {
    nearestToEntity: async (
      request,
    ): ReturnType<DavReader["nearestToEntity"]> => {
      if (options.nearest?.unindexed) throw new SemanticIndexingDisabledError();
      options.nearest?.asked.push(request);
      return (options.nearest?.answer ?? [])
        .filter((near) => request.types.includes(near.entityType))
        .slice(0, request.limit);
    },
    getEntityTypes: () => types,
    getEntityTypeConfig: (
      type,
    ): { containedIn?: string; storage?: "markdown" | "yaml" } => {
      const container = options.containedIn?.[type];
      return {
        ...(container && { containedIn: container }),
        ...(options.yamlTypes?.includes(type) && { storage: "yaml" as const }),
      };
    },
    fileExtension: (type): ".md" | ".yaml" =>
      options.yamlTypes?.includes(type) ? ".yaml" : ".md",
    getEntityCounts: async (scope) =>
      types
        .map((entityType) => ({
          entityType,
          count: visible(scope).filter(
            (candidate) => candidate.entityType === entityType,
          ).length,
        }))
        .filter((row) => row.count > 0),
    queryEntityHierarchy: async (
      request,
    ): ReturnType<DavReader["queryEntityHierarchy"]> => {
      const prefix = [...(request.prefix ?? [])];
      const below = visible(request.visibilityScope)
        .filter((candidate) => candidate.entityType === request.entityType)
        .map((candidate) => ({
          entity: candidate,
          path: decodeEntityIdPath(candidate.id),
        }))
        .filter(
          ({ path }) =>
            path.length > prefix.length &&
            prefix.every((segment, index) => path[index] === segment),
        );
      const direct = below.filter(
        ({ path }) => path.length === prefix.length + 1,
      );
      const folderNames = [
        ...new Set(
          below
            .filter(({ path }) => path.length > prefix.length + 1)
            .map(({ path }) => path[prefix.length] ?? ""),
        ),
      ];
      const offset = request.offset ?? 0;
      return {
        prefix:
          prefix.length > 0 ? [prefix[0] ?? "", ...prefix.slice(1)] : null,
        folders: folderNames.map((name) => ({
          path: [prefix[0] ?? name, ...[...prefix, name].slice(1)],
          name,
          descendantCount: below.filter(
            ({ path }) => path[prefix.length] === name,
          ).length,
        })),
        entities: direct.slice(offset, offset + 2),
        offset,
        totalEntities: direct.length,
      };
    },
    getEntityRaw: async (request) =>
      visible(request.visibilityScope).find(
        (candidate) =>
          candidate.entityType === request.entityType &&
          candidate.id === request.id,
      ) ?? null,
    statAsset: async (ref): ReturnType<DavReader["statAsset"]> => {
      const bytes = asset(ref);
      return bytes ? { ref, sizeBytes: bytes.byteLength } : null;
    },
    openAsset: async (ref): ReturnType<DavReader["openAsset"]> => {
      const bytes = asset(ref);
      if (!bytes) throw new Error(`No asset ${ref}`);
      return (async function* (): AsyncGenerator<Uint8Array> {
        yield bytes.slice(0, 2);
        yield bytes.slice(2);
      })();
    },
  };
}

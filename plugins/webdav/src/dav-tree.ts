import {
  buildEntityPath,
  containmentOf,
  getEntityFileExtension,
  parseEntityPath,
  resolveEntityPlacement,
  type Containment,
} from "@brains/entity-placement";
import type { BaseEntity } from "@brains/sdk/internal/entity-runtime";
import {
  assetRefSchema,
  type ContentVisibility,
  type ServiceEntityReads,
} from "@brains/sdk/internal/service-runtime";

/** The entity reads the drive is made of. */
export type DavReader = Pick<
  ServiceEntityReads,
  | "getEntityTypes"
  | "getEntityTypeConfig"
  | "getEntityCounts"
  | "queryEntityHierarchy"
  | "getEntityRaw"
  | "statAsset"
  | "openAsset"
>;

export interface DavFolder {
  kind: "folder";
  /** Path below the drive's root, one decoded name per segment. */
  segments: string[];
}

export interface DavFile {
  kind: "file";
  segments: string[];
  size: number;
  contentType: string;
  etag: string;
  modified: Date;
  /** The file's bytes, read only when a client asks for them. */
  open(): Promise<BodyInit>;
}

export type DavNode = DavFolder | DavFile;

const NOTE_TYPE = "note";
const HIERARCHY_PAGE = 100;
const BINARY_TYPES = new Set(["image", "document"]);
const CONTENT_TYPES: Record<string, string> = {
  ".md": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
};

/**
 * A brain's entities as the folders and files `brain-data/` holds, for one
 * caller's visibility scope. Which entity a path names is whatever
 * `@brains/entity-placement` says, so the drive, the sync directory and the
 * content repository never disagree. Nothing outside the scope is listed or
 * resolved: it is indistinguishable from a path that does not exist.
 */
export class DavTree {
  private readonly reader: DavReader;
  private readonly scope: ContentVisibility;
  private readonly containment: Containment;

  constructor(reader: DavReader, scope: ContentVisibility) {
    this.reader = reader;
    this.scope = scope;
    this.containment = containmentOf(reader);
  }

  /** The folder or file at a path, if the caller may see one there. */
  async resolve(segments: string[]): Promise<DavNode | undefined> {
    if (segments.length === 0) return { kind: "folder", segments };
    if (!segments.every(isSafeSegment)) return undefined;

    const located = await this.entityAt(segments);
    if (located) return located.file;

    // A folder exists while something visible is inside it.
    const children = await this.children(segments);
    return children.length > 0 ? { kind: "folder", segments } : undefined;
  }

  /** A folder's folders, then its files, each by name. */
  async children(segments: string[]): Promise<DavNode[]> {
    const { folders, files } =
      segments.length === 0
        ? await this.rootChildren()
        : await this.typeFolderChildren(segments);
    return [
      ...[...new Set(folders)].sort(byName).map((name): DavFolder => ({
        kind: "folder",
        segments: [...segments, name],
      })),
      ...files.sort((left, right) =>
        byName(left.segments.join("/"), right.segments.join("/")),
      ),
    ];
  }

  private async rootChildren(): Promise<{
    folders: string[];
    files: DavFile[];
  }> {
    const counts = new Map(
      (await this.reader.getEntityCounts(this.scope)).map((row) => [
        row.entityType,
        row.count,
      ]),
    );
    const folders = this.reader
      .getEntityTypes()
      .filter(
        (type) =>
          this.isFolderType(type) &&
          [type, this.containedIn(type)].some(
            (member) => member !== undefined && (counts.get(member) ?? 0) > 0,
          ),
      );
    const notes = this.reader.getEntityTypes().includes(NOTE_TYPE)
      ? (await this.hierarchy(NOTE_TYPE, [])).entities
      : [];
    return { folders, files: await this.filesIn([], notes) };
  }

  private async typeFolderChildren(segments: string[]): Promise<{
    folders: string[];
    files: DavFile[];
  }> {
    const [type, ...prefix] = segments;
    if (type === undefined || !this.isFolderType(type)) {
      return { folders: [], files: [] };
    }
    // A container's folder holds its own entities and its contained type's.
    const levels = await Promise.all(
      [type, this.containedIn(type)]
        .filter((member) => member !== undefined)
        .map((member) => this.hierarchy(member, prefix)),
    );
    return {
      folders: levels.flatMap((level) => level.folders),
      files: await this.filesIn(
        segments,
        levels.flatMap((level) => level.entities),
      ),
    };
  }

  /** Every direct child at a prefix, read page by page. */
  private async hierarchy(
    entityType: string,
    prefix: string[],
    offset = 0,
  ): Promise<{ folders: string[]; entities: BaseEntity[] }> {
    const [first, ...rest] = prefix;
    const page = await this.reader.queryEntityHierarchy({
      entityType,
      prefix: first === undefined ? null : [first, ...rest],
      visibilityScope: this.scope,
      limit: HIERARCHY_PAGE,
      offset,
      source: true,
    });
    const entities = page.entities.map((entry) => entry.entity);
    const read = offset + entities.length;
    const later =
      entities.length > 0 && read < page.totalEntities
        ? (await this.hierarchy(entityType, prefix, read)).entities
        : [];
    return {
      folders: page.folders.map((folder) => folder.name),
      entities: [...entities, ...later],
    };
  }

  /** The files these entities are, keeping only those that live in `folder`. */
  private async filesIn(
    folder: string[],
    entities: BaseEntity[],
  ): Promise<DavFile[]> {
    const files = await Promise.all(
      entities.map((entity) => this.fileOf(entity)),
    );
    return files
      .filter((file) => file !== undefined)
      .filter(
        (file) =>
          file.segments.length === folder.length + 1 &&
          folder.every((segment, index) => file.segments[index] === segment),
      );
  }

  /** The entity whose file is at a path, if the caller may see it. */
  async entityAt(
    segments: string[],
  ): Promise<{ entity: BaseEntity; file: DavFile } | undefined> {
    if (segments.length === 0 || !segments.every(isSafeSegment)) {
      return undefined;
    }
    const { entityType, id } = parseEntityPath(
      segments.join("/"),
      this.containment,
    );
    if (!this.reader.getEntityTypes().includes(entityType)) return undefined;

    const entity = await this.reader.getEntityRaw({
      entityType,
      id,
      visibilityScope: this.scope,
      source: true,
    });
    const file = entity ? await this.fileOf(entity) : undefined;
    // Only the canonical path names the entity: `post/first`, `post/first.txt`
    // and `note/readme.md` parse to an entity too, and are not its file.
    return entity && file?.segments.join("/") === segments.join("/")
      ? { entity, file }
      : undefined;
  }

  /**
   * The entity a new file at a path would be: a registered type and
   * an id whose placement is exactly that path. Anything else cannot be
   * exported to `brain-data/`, so it cannot be created here either.
   */
  placementAt(
    segments: string[],
    extension: string,
  ): { entityType: string; id: string } | undefined {
    if (segments.length === 0 || !segments.every(isSafeSegment)) {
      return undefined;
    }
    const path = segments.join("/");
    const { entityType, id } = parseEntityPath(path, this.containment);
    if (!this.reader.getEntityTypes().includes(entityType)) return undefined;
    const placement = resolveEntityPlacement(
      entityType,
      id,
      extension,
      this.containment,
    );
    return placement.writable && placement.relativePath === path
      ? { entityType, id }
      : undefined;
  }

  /** The file an entity is, or nothing when it has no place or no bytes yet. */
  private async fileOf(entity: BaseEntity): Promise<DavFile | undefined> {
    const extension = getEntityFileExtension(entity);
    const placement = resolveEntityPlacement(
      entity.entityType,
      entity.id,
      extension,
      this.containment,
    );
    // directory-sync refuses to export an entity it cannot place; neither
    // does the drive show one.
    if (!placement.writable) return undefined;

    const base = {
      kind: "file" as const,
      segments: buildEntityPath(
        entity.id,
        entity.entityType,
        extension,
        this.containment,
      ).split("/"),
      contentType: CONTENT_TYPES[extension] ?? "application/octet-stream",
      etag: `"${entity.contentHash}"`,
      modified: new Date(entity.updated),
    };
    if (!BINARY_TYPES.has(entity.entityType) || extension === ".md") {
      const text = entity.content;
      return {
        ...base,
        size: Buffer.byteLength(text),
        open: async () => text,
      };
    }

    // A pending or failed binary has no bytes to show yet.
    if (entity.content === "") return undefined;
    const ref = assetRefSchema.safeParse(entity.content);
    if (ref.success) {
      const stat = await this.reader.statAsset(ref.data);
      if (!stat) return undefined;
      return {
        ...base,
        size: stat.sizeBytes,
        open: async () => streamOf(await this.reader.openAsset(ref.data)),
      };
    }
    const payload = /^data:[a-z0-9.+/-]+;base64,([\s\S]+)$/i.exec(
      entity.content.trim(),
    )?.[1];
    if (!payload) return undefined;
    const bytes = Buffer.from(payload.replace(/\s/g, ""), "base64");
    return { ...base, size: bytes.byteLength, open: async () => bytes };
  }

  /** Notes live at the root and a contained type in its container's folder. */
  isFolderType(type: string): boolean {
    return (
      type !== NOTE_TYPE &&
      !this.containment.has(type) &&
      this.reader.getEntityTypes().includes(type)
    );
  }

  private containedIn(container: string): string | undefined {
    return [...this.containment].find(([, owner]) => owner === container)?.[0];
  }
}

function byName(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isSafeSegment(segment: string): boolean {
  return (
    segment.length > 0 &&
    segment !== "." &&
    segment !== ".." &&
    !/[/\\\0]/.test(segment)
  );
}

function streamOf(
  chunks: AsyncIterable<Uint8Array>,
): ReadableStream<Uint8Array> {
  const iterator = chunks[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller): Promise<void> {
      const next = await iterator.next();
      if (next.done) controller.close();
      else controller.enqueue(next.value);
    },
    async cancel(): Promise<void> {
      await iterator.return?.();
    },
  });
}

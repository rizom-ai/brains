import { decodeEntityIdPath } from "@brains/plugins";
import type {
  BaseEntity,
  ContentVisibility,
  EntityIdPath,
} from "@brains/plugins";
import type { StudioContext } from "./studio-context";

interface Folder {
  path: EntityIdPath;
  name: string;
  descendantCount: number;
  title?: string;
}

/**
 * Folders an entry's adapter can name, titled by any entry beneath them: a
 * book section's headings name the parts it stands in. Titles count only
 * when they cover exactly the folders the entry's id stands in.
 */
export async function titleFolders<TFolder extends Folder>(
  context: StudioContext,
  input: {
    entityType: string;
    prefix: EntityIdPath | null;
    folders: TFolder[];
    visibilityScope: ContentVisibility;
    signal?: AbortSignal | undefined;
  },
): Promise<{ folders: TFolder[]; trail: Array<string | null> }> {
  const titlesOf = context.shapes.folderTitles(input.entityType);
  const prefix = input.prefix ?? [];
  if (!titlesOf) {
    return { folders: input.folders, trail: prefix.map(() => null) };
  }
  // One entry beneath a path names every folder on the way down to it.
  const titlesBeneath = async (
    path: EntityIdPath | null,
  ): Promise<Array<string | undefined>> => {
    const page = await context.entityService.queryEntityHierarchy({
      entityType: input.entityType,
      prefix: path,
      includeDescendants: true,
      limit: 1,
      offset: 0,
      visibilityScope: input.visibilityScope,
      ...(input.signal && { signal: input.signal }),
    });
    const entry: BaseEntity | undefined = page.entities[0]?.entity;
    if (!entry) return [];
    const titles = titlesOf(entry);
    return titles.length === decodeEntityIdPath(entry.id).length - 1
      ? titles
      : [];
  };
  const [trailTitles, folders] = await Promise.all([
    input.prefix ? titlesBeneath(input.prefix) : Promise.resolve([]),
    Promise.all(
      input.folders.map(async (folder) => {
        const title =
          folder.title ??
          (await titlesBeneath(folder.path)).at(folder.path.length - 1);
        return title === undefined ? folder : { ...folder, title };
      }),
    ),
  ]);
  return {
    folders,
    trail: prefix.map((_, index) => trailTitles[index] ?? null),
  };
}

import type { BaseEntity } from "@brains/sdk/internal/entity-runtime";
import { entityTypeLabels, type StudioEntityDisplayMap } from "./config";
import { getTypeCapabilities, toStudioWorkspaceActor } from "./editor-access";
import type { StudioRequestAccess } from "./editor-contracts";
import { entityDisplayTitle } from "./editor-entities";
import { composeStudioHome } from "./home";
import type { StudioHome } from "./home-contract";
import { STUDIO_HISTORY_WORKSPACE_ID } from "./overview-constants";
import { brainFacts, type StudioOverviewRegistry } from "./overview-workspace";
import type { StudioContext } from "./studio-context";
import { studioEntityPath, studioWorkspacePath } from "./studio-paths";
import type { StudioWorkspaceRegistry } from "./workspace-registry";

/** How many drafts and published entries Home shows. */
const ENTRY_LIMIT = 4;

export interface StudioHomeSources {
  context: StudioContext;
  overview: StudioOverviewRegistry;
  workspaces: StudioWorkspaceRegistry;
  entityDisplay: StudioEntityDisplayMap | undefined;
  routePath: string;
  now?: () => number;
}

/** The content types this person may read, where drafts and posts live. */
async function readableContentTypes(
  context: StudioContext,
  access: StudioRequestAccess,
): Promise<string[]> {
  const types = context.entityService
    .getEntityTypes()
    .filter(
      (type) =>
        context.entityService.getEntityTypeConfig(type).classification !==
          "system" && !context.shapes.isSingleton(type),
    );
  const readable = await Promise.all(
    types.map(async (type) =>
      (await getTypeCapabilities(context, type, access)) ? type : null,
    ),
  );
  return readable.filter((type): type is string => type !== null);
}

/** A status's entries across types, by one date field, newest first. */
async function recentEntries(
  sources: StudioHomeSources,
  access: StudioRequestAccess,
  types: readonly string[],
  status: "draft" | "published",
  field: "updated" | "publishedAt",
): Promise<{ entity: BaseEntity; at: string }[]> {
  const { context } = sources;
  const pages = await Promise.all(
    types.map((entityType) =>
      context.entityService
        .listEntities({
          entityType,
          options: {
            limit: ENTRY_LIMIT,
            sortFields: [{ field, direction: "desc" }],
            filter: {
              visibilityScope: access.visibilityScope,
              metadata: { status },
            },
          },
        })
        .catch((): BaseEntity[] => []),
    ),
  );
  return pages
    .flat()
    .flatMap((entity) => {
      const at =
        field === "updated" ? entity.updated : entity.metadata["publishedAt"];
      return typeof at === "string" && !Number.isNaN(Date.parse(at))
        ? [{ entity, at: new Date(at).toISOString() }]
        : [];
    })
    .sort((left, right) => right.at.localeCompare(left.at))
    .slice(0, ENTRY_LIMIT);
}

function entryOf(
  sources: StudioHomeSources,
  entity: BaseEntity,
): {
  id: string;
  entityType: string;
  typeLabel: string;
  title: string;
  href: string;
} {
  return {
    id: entity.id,
    entityType: entity.entityType,
    typeLabel: entityTypeLabels(
      entity.entityType,
      sources.entityDisplay?.[entity.entityType],
    ).label,
    title: entityDisplayTitle(sources.context, entity) ?? entity.id,
    href: studioEntityPath(sources.routePath, entity.entityType, entity.id),
  };
}

/** Home for one person, from what each source says now. */
export async function loadStudioHome(
  sources: StudioHomeSources,
  access: StudioRequestAccess,
  signal?: AbortSignal,
): Promise<StudioHome> {
  const actor = toStudioWorkspaceActor(access);
  const { context, overview, workspaces, routePath } = sources;
  const types = await readableContentTypes(context, access);
  const [workspaceAttention, contributions, facts, drafts, published] =
    await Promise.all([
      workspaces.listAttention(actor),
      overview.load(actor, signal),
      brainFacts(context, actor),
      recentEntries(sources, access, types, "draft", "updated"),
      recentEntries(sources, access, types, "published", "publishedAt"),
    ]);
  const pluginsWithAttention = workspaces.pluginsWithAttention();
  const pages = new Map(
    await Promise.all(
      contributions.map(
        async (loaded) =>
          [
            loaded.contribution.pluginId,
            await workspaces.pageOf(loaded.contribution.pluginId, actor),
          ] as const,
      ),
    ),
  );
  return composeStudioHome({
    now: new Date(sources.now?.() ?? Date.now()),
    workspaceAttention,
    pluginsWithAttention,
    contributions,
    failedJobs: overview
      .listActivity()
      .filter((activity) => activity.tone === "error"),
    drafts: drafts.map(({ entity, at }) => ({
      ...entryOf(sources, entity),
      updated: at,
    })),
    published: published.map(({ entity, at }) => ({
      ...entryOf(sources, entity),
      publishedAt: at,
    })),
    facts,
    paths: {
      workspace: (id, query) =>
        `${studioWorkspacePath(routePath, id)}${
          query && Object.keys(query).length > 0
            ? `?${new URLSearchParams(query)}`
            : ""
        }`,
      pluginPage: (pluginId) => {
        const page = pages.get(pluginId);
        return page ? studioWorkspacePath(routePath, page) : undefined;
      },
      history: studioWorkspacePath(routePath, STUDIO_HISTORY_WORKSPACE_ID),
    },
  });
}

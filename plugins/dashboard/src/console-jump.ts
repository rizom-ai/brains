import type { ConsoleJumpDestination } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import { displayTitleFrom, formatLabel } from "@brains/utils/string-utils";

/**
 * What `/api/console/jump` puts on the wire, as something a caller can
 * check rather than assume.
 */
export const consoleJumpResponseSchema: z.ZodObject<{
  groups: z.ZodArray<
    z.ZodObject<{
      id: z.ZodString;
      label: z.ZodString;
      items: z.ZodArray<
        z.ZodObject<{
          id: z.ZodString;
          title: z.ZodString;
          sub: z.ZodOptional<z.ZodString>;
          href: z.ZodString;
          tag: z.ZodOptional<z.ZodString>;
        }>
      >;
    }>
  >;
}> = z.object({
  groups: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      items: z.array(
        z.object({
          id: z.string(),
          title: z.string(),
          sub: z.string().optional(),
          href: z.string(),
          tag: z.string().optional(),
        }),
      ),
    }),
  ),
});

export type ConsoleJumpResponse = z.output<typeof consoleJumpResponseSchema>;
export type ConsoleJumpGroup = ConsoleJumpResponse["groups"][number];
export type ConsoleJumpItem = ConsoleJumpGroup["items"][number];

export interface ConsoleJumpEntityHit {
  entityType: string;
  id: string;
  title: string;
}

/**
 * A search result as the palette names it: the title its type's adapter
 * reads, else the one in its metadata, else its id.
 */
export function jumpEntityHit(
  entity: {
    entityType: string;
    id: string;
    metadata: Record<string, unknown>;
  },
  title?: string,
): ConsoleJumpEntityHit {
  return {
    entityType: entity.entityType,
    id: entity.id,
    title: title ?? displayTitleFrom(entity.metadata) ?? entity.id,
  };
}

/**
 * Grouped doors for the cross-surface ⌘K palette. Entities open at canonical
 * Studio detail paths, so the group exists only when a Studio is registered; tabs
 * land on this dashboard's in-document group anchors.
 */
export function buildConsoleJumpGroups(options: {
  query: string;
  dashboardPath: string;
  studioPath: string | undefined;
  entities: ConsoleJumpEntityHit[];
  /** The pages Studio offers this caller, as it answered the palette. */
  destinations: ConsoleJumpDestination[];
}): ConsoleJumpGroup[] {
  const query = options.query.trim().toLowerCase();
  const result: ConsoleJumpGroup[] = [];

  if (options.studioPath !== undefined) {
    const studioPath =
      options.studioPath === "/" ? "" : options.studioPath.replace(/\/+$/, "");
    const matches = (destination: ConsoleJumpDestination): boolean =>
      query === ""
        ? destination.primary === true
        : [
            destination.title,
            destination.sub ?? "",
            ...(destination.keywords ?? []),
          ].some((text) => text.toLowerCase().includes(query));
    const people =
      query !== "" && "people access identity".includes(query)
        ? [
            {
              id: "surface/people",
              title: "People",
              sub: "Access and identity",
              href: `${studioPath}/workspaces/${encodeURIComponent("admin:administration")}?tab=people`,
              tag: "studio",
            },
          ]
        : [];
    const items = [
      ...options.destinations.filter(matches).map((destination) => ({
        id: destination.id,
        title: destination.title,
        ...(destination.sub ? { sub: destination.sub } : {}),
        href: destination.href,
        tag: "studio",
      })),
      ...people,
    ];
    if (items.length > 0) result.push({ id: "studio", label: "Studio", items });
  }

  if (options.studioPath !== undefined && options.entities.length > 0) {
    const studioPath = options.studioPath;
    result.push({
      id: "entities",
      label: "Entities",
      items: options.entities.map((hit) => ({
        id: `${hit.entityType}/${hit.id}`,
        title: hit.title,
        sub: formatLabel(hit.entityType),
        href: `${studioPath === "/" ? "" : studioPath.replace(/\/+$/, "")}/entities/${encodeURIComponent(hit.entityType)}/${encodeURIComponent(hit.id)}`,
        tag: "studio",
      })),
    });
  }

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "knowledge", label: "Knowledge" },
    { id: "network", label: "Network" },
    { id: "system", label: "System" },
  ]
    .filter(
      ({ id, label }) =>
        query === "" ||
        label.toLowerCase().includes(query) ||
        id.includes(query),
    )
    .map(({ id, label }) => ({
      id: `tab/${id}`,
      title: label,
      sub: "tab",
      href: `${options.dashboardPath}#${id}`,
      tag: "dashboard",
    }));
  if (tabs.length > 0) {
    result.push({ id: "tabs", label: "Dashboard", items: tabs });
  }

  return result;
}

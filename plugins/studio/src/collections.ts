import {
  collectionMembersContract,
  collectionTypesContract,
} from "@brains/contracts";
import {
  GROUPING_MAX_PAGE_LIMIT,
  GROUPING_PAGE_LIMIT,
  type BaseEntity,
} from "@brains/sdk/internal/entity-runtime";
import { entityTypeLabels, type StudioEntityDisplayMap } from "./config";
import { getTypeCapabilities } from "./editor-access";
import type {
  EditorRouteOptions,
  StudioRequestAccess,
} from "./editor-contracts";
import { entityDisplayTitle } from "./editor-entities";
import { admittedGroupDescriptor, groupMemberRow } from "./editor-groupings";
import type { StudioContext } from "./studio-context";

/*
 * A collection is a type whose entries collect others. Membership people
 * choose is a group on the member: a series is the Series group, and its
 * value is the series' title. Membership the brain works out is answered by
 * the plugin that owns the type, such as topics. Either way Studio reads the
 * members at the viewer's visibility and only of types they can read.
 */

/** What reading a collection's members needs from the request. */
export interface CollectionScope {
  context: StudioContext;
  access: StudioRequestAccess;
  entityDisplay: StudioEntityDisplayMap | undefined;
  getDefinitions: EditorRouteOptions["getGroupingDefinitions"];
}

/** How many entries a collection holds, and that count in words. */
export interface MemberCount {
  count: number;
  /** "12 posts"; "entries" when the members are of more than one type. */
  label: string;
}

/** The most members an opened collection lists. */
const MEMBER_PAGE_LIMIT = GROUPING_PAGE_LIMIT;

interface MemberRef {
  entityType: string;
  id: string;
}

function isMemberGroup(context: StudioContext, entityType: string): boolean {
  return (
    context.entityService.getEntityTypeConfig(entityType).memberGroup !==
    undefined
  );
}

/** The types whose entries collect others, from their registrations and plugins. */
export async function collectionTypes(
  context: StudioContext,
): Promise<Set<string>> {
  const registered = context.entityService.getEntityTypes();
  const answered = await context.messaging.gather(collectionTypesContract, {});
  const owned = new Set(
    answered.status === "answered"
      ? answered.answers.flatMap((answer) => answer.types)
      : [],
  );
  return new Set(
    registered.filter(
      (type) => isMemberGroup(context, type) || owned.has(type),
    ),
  );
}

function memberLabel(
  scope: CollectionScope,
  count: number,
  types: readonly string[],
): string {
  const [only, ...others] = [...new Set(types)];
  const labels =
    only !== undefined && others.length === 0
      ? entityTypeLabels(only, scope.entityDisplay?.[only])
      : { label: "Entry", pluralLabel: "Entries" };
  const singular = labels.label.toLowerCase();
  const plural = labels.pluralLabel.toLowerCase();
  if (count === 0) return `No ${plural}`;
  return `${count} ${count === 1 ? singular : plural}`;
}

function memberCount(
  scope: CollectionScope,
  count: number,
  types: readonly string[],
): MemberCount {
  return { count, label: memberLabel(scope, count, types) };
}

/** A series' group value: its title, as its members name it. */
function groupValue(context: StudioContext, entity: BaseEntity): string {
  const title = entity.metadata["title"];
  return typeof title === "string" && title.trim()
    ? title
    : (entityDisplayTitle(context, entity) ?? entity.id);
}

/** The members a plugin answers for some collections, of readable types only. */
async function answeredMembers(
  scope: CollectionScope,
  entityType: string,
  ids: string[],
): Promise<Map<string, MemberRef[]>> {
  const answered = await scope.context.messaging.gather(
    collectionMembersContract,
    { entityType, ids, visibilityScope: scope.access.visibilityScope },
  );
  const collections =
    answered.status === "answered"
      ? answered.answers.flatMap((answer) => answer.collections)
      : [];
  const types = [
    ...new Set(
      collections.flatMap((collection) =>
        collection.members.map((member) => member.entityType),
      ),
    ),
  ];
  const readable = new Set<string>();
  for (const type of types)
    if (
      scope.context.entityService.getEntityTypes().includes(type) &&
      (await getTypeCapabilities(scope.context, type, scope.access))
    )
      readable.add(type);
  return new Map(
    collections.map((collection) => [
      collection.id,
      collection.members.filter((member) => readable.has(member.entityType)),
    ]),
  );
}

/**
 * Each listed collection's member count, or none when the type collects
 * nothing or its group cannot be read yet.
 */
export async function collectionMemberCounts(
  scope: CollectionScope,
  entityType: string,
  entities: BaseEntity[],
): Promise<Map<string, MemberCount> | null> {
  if (entities.length === 0) return null;
  const { context, access } = scope;
  if (isMemberGroup(context, entityType)) {
    const descriptor = await admittedGroupDescriptor(
      context,
      access,
      entityType,
      scope.getDefinitions,
    );
    if (!descriptor || !(await context.entityService.ensureGroupingsReady()))
      return null;
    const values = [
      ...new Set(entities.map((entity) => groupValue(context, entity))),
    ].slice(0, GROUPING_MAX_PAGE_LIMIT);
    const usage = await context.entityService.queryGroupingUsage({
      grouping: descriptor.key,
      entityTypes: descriptor.types,
      visibilityScope: access.visibilityScope,
      values,
    });
    const counts = new Map(usage.values.map((entry) => [entry.value, entry]));
    return new Map(
      entities.map((entity) => [
        entity.id,
        memberCount(
          scope,
          counts.get(groupValue(context, entity))?.count ?? 0,
          descriptor.types,
        ),
      ]),
    );
  }
  if (!(await collectionTypes(context)).has(entityType)) return null;
  const members = await answeredMembers(
    scope,
    entityType,
    entities.map((entity) => entity.id),
  );
  return new Map(
    entities.map((entity) => {
      const refs = members.get(entity.id) ?? [];
      return [
        entity.id,
        memberCount(
          scope,
          refs.length,
          refs.map((ref) => ref.entityType),
        ),
      ];
    }),
  );
}

/** An opened collection's members, most recently updated first. */
export interface CollectionMembersPage extends MemberCount {
  total: number;
  entities: ReturnType<typeof groupMemberRow>[];
}

/**
 * The members of one collection the viewer can read, or none when it is
 * not a collection, cannot be read, or its group is not ready.
 */
export async function collectionMembersPage(
  scope: CollectionScope,
  entityType: string,
  id: string,
): Promise<CollectionMembersPage | null> {
  const { context, access } = scope;
  const collects =
    isMemberGroup(context, entityType) ||
    (await collectionTypes(context)).has(entityType);
  if (!collects) return null;
  const entity = await context.entityService.getEntityRaw({
    entityType,
    id,
    visibilityScope: access.visibilityScope,
    source: true,
  });
  if (!entity) return null;
  if (isMemberGroup(context, entityType)) {
    const descriptor = await admittedGroupDescriptor(
      context,
      access,
      entityType,
      scope.getDefinitions,
    );
    if (!descriptor || !(await context.entityService.ensureGroupingsReady()))
      return null;
    const page = await context.entityService.queryGroupingMembers({
      grouping: descriptor.key,
      entityTypes: descriptor.types,
      visibilityScope: access.visibilityScope,
      value: groupValue(context, entity),
      q: "",
      sort: "updated-desc",
      offset: 0,
      limit: MEMBER_PAGE_LIMIT,
      source: true,
    });
    return {
      ...memberCount(scope, page.total, descriptor.types),
      total: page.total,
      entities: page.entities.map((member) => groupMemberRow(context, member)),
    };
  }
  const refs = (await answeredMembers(scope, entityType, [id])).get(id) ?? [];
  const checked = refs.slice(0, MEMBER_PAGE_LIMIT);
  const read = await Promise.all(
    checked.map((ref) =>
      context.entityService.getEntityRaw({
        ...ref,
        visibilityScope: access.visibilityScope,
        source: true,
      }),
    ),
  );
  const members = read
    .filter((member): member is BaseEntity => member !== null)
    .sort((left, right) => right.updated.localeCompare(left.updated));
  const total = refs.length - (checked.length - members.length);
  return {
    ...memberCount(
      scope,
      total,
      members.map((member) => member.entityType),
    ),
    total,
    entities: members.map((member) => groupMemberRow(context, member)),
  };
}

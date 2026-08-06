import type { ProjectionRule } from "./projection-rule";

export interface ProjectionEntitySource {
  kind: "entity";
  types: string[];
  excludeTypes?: string[] | undefined;
}

export interface RegisteredProjection {
  id: string;
  pluginId: string;
  targetType: string;
  sources: ProjectionEntitySource[];
}

export interface ProjectionEntityType {
  type: string;
  projectionSource: boolean;
}

export interface ProjectionGraphEdge {
  from: string;
  to: string;
  causes: string[];
}

export interface ProjectionUnknownSourceTypes {
  projectionId: string;
  types: string[];
}

export interface ProjectionGraph {
  readonly projections: readonly RegisteredProjection[];
  readonly edges: readonly ProjectionGraphEdge[];
  /** Declared entity source types no installed plugin registers. Not an
   *  error: a bundle may legitimately omit a source plugin, but a typo'd
   *  type would otherwise silently produce no edges. */
  readonly unknownSourceTypes: readonly ProjectionUnknownSourceTypes[];
}

export interface IProjectionRegistry {
  registerRule(pluginId: string, rule: ProjectionRule): () => void;
  unregisterPlugin(pluginId: string): void;
  list(): RegisteredProjection[];
  listRules(): ProjectionRule[];
  validate(entityTypes: readonly ProjectionEntityType[]): ProjectionGraph;
}

/** App-scoped registry for immutable scheduler-owned projection rules. */
export class ProjectionRegistry implements IProjectionRegistry {
  private readonly projections = new Map<string, RegisteredProjection>();
  private readonly rules = new Map<string, ProjectionRule>();

  public static createFresh(): ProjectionRegistry {
    return new ProjectionRegistry();
  }

  private constructor() {}

  public registerRule(pluginId: string, rule: ProjectionRule): () => void {
    if (!Object.isFrozen(rule)) {
      throw new Error(
        `Projection rule "${rule.id}" must be created with defineProjectionRule`,
      );
    }
    const existing = this.projections.get(rule.id);
    if (existing) {
      throw new Error(
        `Projection "${rule.id}" is already registered by "${existing.pluginId}"`,
      );
    }

    const projection: RegisteredProjection = {
      id: rule.id,
      pluginId,
      targetType: rule.targetType,
      sources: rule.sources.map((source) => ({
        kind: source.kind,
        types: [...source.types],
        ...(source.excludeTypes
          ? { excludeTypes: [...source.excludeTypes] }
          : {}),
      })),
    };
    this.projections.set(rule.id, projection);
    this.rules.set(rule.id, rule);

    let active = true;
    return (): void => {
      if (!active) return;
      active = false;
      if (this.rules.get(rule.id) === rule) this.rules.delete(rule.id);
      if (this.projections.get(rule.id) === projection) {
        this.projections.delete(rule.id);
      }
    };
  }

  public unregisterPlugin(pluginId: string): void {
    for (const [id, projection] of this.projections) {
      if (projection.pluginId === pluginId) {
        this.projections.delete(id);
        this.rules.delete(id);
      }
    }
  }

  public list(): RegisteredProjection[] {
    return Array.from(this.projections.values())
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(cloneProjection);
  }

  public listRules(): ProjectionRule[] {
    return [...this.rules.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    );
  }

  public validate(
    entityTypes: readonly ProjectionEntityType[],
  ): ProjectionGraph {
    const projections = this.list();
    const registeredTypes = new Set(entityTypes.map(({ type }) => type));
    for (const projection of projections) {
      if (!registeredTypes.has(projection.targetType)) {
        throw new Error(
          `Projection "${projection.id}" targets unregistered entity type "${projection.targetType}"`,
        );
      }
    }

    const wildcardTypes = entityTypes
      .filter(({ projectionSource }) => projectionSource)
      .map(({ type }) => type)
      .sort();
    const edges = buildEdges(projections, wildcardTypes);
    const cycle = findStronglyConnectedCycles(projections, edges)[0];
    if (cycle) {
      const cyclePath = findCyclePath(cycle, edges);
      throw new Error(
        `Projection cycle is not supported: ${[...cyclePath, cyclePath[0]].join(" -> ")}`,
      );
    }

    return freezeProjectionGraph({
      projections,
      edges,
      unknownSourceTypes: findUnknownSourceTypes(projections, registeredTypes),
    });
  }
}

function findUnknownSourceTypes(
  projections: RegisteredProjection[],
  registeredTypes: ReadonlySet<string>,
): ProjectionUnknownSourceTypes[] {
  const unknown: ProjectionUnknownSourceTypes[] = [];
  for (const projection of projections) {
    const types = [
      ...new Set(
        projection.sources
          .flatMap((source) => [
            ...source.types,
            ...(source.excludeTypes ?? []),
          ])
          .filter((type) => type !== "*" && !registeredTypes.has(type)),
      ),
    ].sort();
    if (types.length > 0) {
      unknown.push({ projectionId: projection.id, types });
    }
  }
  return unknown;
}

function freezeProjectionGraph(graph: ProjectionGraph): ProjectionGraph {
  for (const projection of graph.projections) {
    for (const source of projection.sources) {
      Object.freeze(source.types);
      if (source.excludeTypes) Object.freeze(source.excludeTypes);
      Object.freeze(source);
    }
    Object.freeze(projection.sources);
    Object.freeze(projection);
  }
  for (const edge of graph.edges) {
    Object.freeze(edge.causes);
    Object.freeze(edge);
  }
  for (const entry of graph.unknownSourceTypes) {
    Object.freeze(entry.types);
    Object.freeze(entry);
  }
  Object.freeze(graph.unknownSourceTypes);
  Object.freeze(graph.projections);
  Object.freeze(graph.edges);
  return Object.freeze(graph);
}

function cloneProjection(
  projection: RegisteredProjection,
): RegisteredProjection {
  return {
    ...projection,
    sources: projection.sources.map((source) => ({
      ...source,
      types: [...source.types],
      ...(source.excludeTypes
        ? { excludeTypes: [...source.excludeTypes] }
        : {}),
    })),
  };
}

function buildEdges(
  projections: RegisteredProjection[],
  wildcardTypes: string[],
): ProjectionGraphEdge[] {
  const edgeCauses = new Map<string, Set<string>>();

  for (const producer of projections) {
    for (const consumer of projections) {
      const causes = getDependencyCauses(producer, consumer, wildcardTypes);
      if (causes.length === 0) continue;
      edgeCauses.set(`${producer.id}\u0000${consumer.id}`, new Set(causes));
    }
  }

  return Array.from(edgeCauses, ([key, causes]) => {
    const [from = "", to = ""] = key.split("\u0000");
    return { from, to, causes: [...causes].sort() };
  }).sort(
    (left, right) =>
      left.from.localeCompare(right.from) || left.to.localeCompare(right.to),
  );
}

function getDependencyCauses(
  producer: RegisteredProjection,
  consumer: RegisteredProjection,
  wildcardTypes: string[],
): string[] {
  const causes: string[] = [];
  for (const source of consumer.sources) {
    const excluded = new Set(source.excludeTypes ?? []);
    const types = source.types.includes("*")
      ? [...source.types.filter((type) => type !== "*"), ...wildcardTypes]
      : source.types;
    if (
      types.includes(producer.targetType) &&
      !excluded.has(producer.targetType)
    ) {
      causes.push(`entity:${producer.targetType}`);
    }
  }
  return [...new Set(causes)];
}

function findStronglyConnectedCycles(
  projections: RegisteredProjection[],
  edges: ProjectionGraphEdge[],
): string[][] {
  const ids = projections.map(({ id }) => id).sort();
  const adjacency = createAdjacency(ids, edges);
  const indexById = new Map<string, number>();
  const lowLinkById = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];
  let nextIndex = 0;

  const visit = (id: string): void => {
    indexById.set(id, nextIndex);
    lowLinkById.set(id, nextIndex);
    nextIndex++;
    stack.push(id);
    onStack.add(id);

    for (const next of adjacency.get(id) ?? []) {
      if (!indexById.has(next)) {
        visit(next);
        lowLinkById.set(
          id,
          Math.min(lowLinkById.get(id) ?? 0, lowLinkById.get(next) ?? 0),
        );
      } else if (onStack.has(next)) {
        lowLinkById.set(
          id,
          Math.min(lowLinkById.get(id) ?? 0, indexById.get(next) ?? 0),
        );
      }
    }

    if (lowLinkById.get(id) !== indexById.get(id)) return;
    const component: string[] = [];
    let member: string | undefined;
    do {
      member = stack.pop();
      if (!member) break;
      onStack.delete(member);
      component.push(member);
    } while (member !== id);

    const hasSelfEdge = adjacency.get(id)?.includes(id) ?? false;
    if (component.length > 1 || hasSelfEdge) components.push(component.sort());
  };

  for (const id of ids) {
    if (!indexById.has(id)) visit(id);
  }
  return components.sort((left, right) =>
    (left[0] ?? "").localeCompare(right[0] ?? ""),
  );
}

function findCyclePath(
  component: string[],
  edges: ProjectionGraphEdge[],
): string[] {
  const allowed = new Set(component);
  const adjacency = createAdjacency(component, edges);
  const start = [...component].sort()[0];
  if (!start) return [];
  if (adjacency.get(start)?.includes(start)) return [start];

  const search = (current: string, path: string[]): string[] | undefined => {
    for (const next of adjacency.get(current) ?? []) {
      if (!allowed.has(next)) continue;
      if (next === start) return path;
      if (path.includes(next)) continue;
      const found = search(next, [...path, next]);
      if (found) return found;
    }
    return undefined;
  };

  return search(start, [start]) ?? [...component].sort();
}

function createAdjacency(
  ids: string[],
  edges: ProjectionGraphEdge[],
): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();
  for (const id of ids) adjacency.set(id, []);
  for (const edge of edges) {
    const next = adjacency.get(edge.from);
    if (next && !next.includes(edge.to)) next.push(edge.to);
  }
  for (const next of adjacency.values()) next.sort();
  return adjacency;
}

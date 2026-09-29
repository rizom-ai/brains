import {
  GenerationAuthorizer,
  authorizeGenerationWrite,
  planContentGeneration,
  submitContentGeneration,
} from "@brains/content-service";
import type { ContentTemplate, IContentService } from "@brains/content-service";
import type {
  InMemoryTemplateRegistry,
  PermissionService,
  Template,
} from "@brains/templates";
import type {
  DataSource,
  DataSourceCapabilities,
  DataSourceRegistry,
  IEntityService,
} from "@brains/entity-service";

/**
 * What the content service double cannot invent for itself.
 *
 * The templates map is written by the shell's own registration path, and the
 * permission service is reached through a getter rather than a value because
 * a test may reassign the shell's — late binding is the point.
 */
export interface MockContentDeps {
  readonly templates: Pick<InMemoryTemplateRegistry, "get" | "list">;
  readonly entityService: IEntityService;
  getPermissionService(): PermissionService;
}

export interface MockContentServices {
  readonly contentService: IContentService;
  readonly dataSourceRegistry: DataSourceRegistry;
}

/**
 * The content service double and the registry it reads through.
 *
 * Generation is not faked: authorization and planning delegate to the runtime
 * routines, so the fake enforces production policy rather than an easier
 * version of it. What is faked is everything downstream of a decision — the
 * generated text, the formatting, the resolution — because none of that can
 * be produced without a model.
 */
export function createMockContentServices(
  deps: MockContentDeps,
): MockContentServices {
  const dataSources = new Map<string, DataSource>();

  // The real service narrows registered templates before handing them out, so
  // the fake does the same. Returning the raw Template would give tests fields
  // (layout, and anything else Template carries) that production never exposes.
  const toContentTemplate = (template: Template): ContentTemplate<unknown> => {
    const contentTemplate: ContentTemplate<unknown> = {
      name: template.name,
      description: template.description,
      schema: template.schema,
      requiredPermission: template.requiredPermission,
    };
    if (template.basePrompt) contentTemplate.basePrompt = template.basePrompt;
    if (template.formatter) contentTemplate.formatter = template.formatter;
    if (template.dataSourceId) {
      contentTemplate.dataSourceId = template.dataSourceId;
    }
    return contentTemplate;
  };

  const generationAuthorizer = (): GenerationAuthorizer =>
    new GenerationAuthorizer(deps.getPermissionService(), async () => null);
  const contentService: IContentService = {
    submitGeneration: (request, binding, signal) =>
      submitContentGeneration(contentService, request, binding, signal),
    // Delegate to the runtime routine so the fake enforces production policy.
    authorizeGenerationWrite: (data, persisted) =>
      authorizeGenerationWrite(
        {
          authorizer: generationAuthorizer(),
          templateRegistry: { get: (name) => deps.templates.get(name) },
          entityService: deps.entityService,
        },
        data,
        persisted,
      ),
    planGeneration: (request, signal) =>
      planContentGeneration(
        {
          entityService: deps.entityService,
          authorizer: generationAuthorizer(),
          templateRegistry: { get: (name) => deps.templates.get(name) },
        },
        request,
        signal,
      ),
    generateContent: async (
      templateName: string,
      context?: Record<string, unknown>,
    ) => ({
      message: `Generated content for ${templateName}`,
      summary: "Test summary",
      description: "Mock generated description for testing",
      topics: [],
      sources: [],
      ...context,
    }),
    formatContent: <T = unknown>(_templateName: string, data: T) =>
      `Formatted: ${JSON.stringify(data)}`,
    parseContent: (_templateName: string, content: string): unknown => ({
      parsed: content,
    }),
    getTemplate: (name: string): ContentTemplate<unknown> | null => {
      const template = deps.templates.get(name);
      return template ? toContentTemplate(template) : null;
    },
    listTemplates: (): ContentTemplate<unknown>[] =>
      deps.templates.list().map(toContentTemplate),
    // No data sources are wired into the fake, so nothing resolves.
    resolveContent: async <T = unknown>(): Promise<T | null> => null,
  } satisfies IContentService;

  // --- DataSource Registry ---
  const dataSourceRegistry: DataSourceRegistry = {
    register: (dataSource: DataSource): void => {
      if ("id" in dataSource && typeof dataSource.id === "string") {
        dataSources.set(dataSource.id, dataSource);
      }
    },
    get: (id: string): DataSource | undefined => dataSources.get(id),
    has: (id: string): boolean => dataSources.has(id),
    list: (): DataSource[] => Array.from(dataSources.values()),
    getIds: (): string[] => Array.from(dataSources.keys()),
    getByCapability: (capability: keyof DataSourceCapabilities): DataSource[] =>
      Array.from(dataSources.values()).filter((dataSource) => {
        switch (capability) {
          case "canFetch":
            return Boolean(dataSource.fetch);
          case "canGenerate":
            return Boolean(dataSource.generate);
          case "canTransform":
            return Boolean(dataSource.transform);
        }
      }),
    find: (predicate: (dataSource: DataSource) => boolean): DataSource[] =>
      Array.from(dataSources.values()).filter(predicate),
    clear: (): void => {
      dataSources.clear();
    },
    unregister: (id: string): void => {
      dataSources.delete(id);
    },
  };

  // Only the nominal private-field gap remains; the shape is checked above.

  return { contentService, dataSourceRegistry };
}

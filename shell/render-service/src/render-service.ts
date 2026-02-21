import type {
  ViewTemplate,
  ViewTemplateRegistry as IViewTemplateRegistry,
  OutputFormat,
  WebRenderer,
} from "./types";
import type { TemplateRegistry } from "@brains/templates";

export class RenderService implements IViewTemplateRegistry {
  private static instance: RenderService | null = null;
  private templateRegistry: TemplateRegistry;

  public static getInstance(templateRegistry: TemplateRegistry): RenderService {
    RenderService.instance ??= new RenderService(templateRegistry);
    return RenderService.instance;
  }

  public static resetInstance(): void {
    RenderService.instance = null;
  }

  public static createFresh(templateRegistry: TemplateRegistry): RenderService {
    return new RenderService(templateRegistry);
  }

  private constructor(templateRegistry: TemplateRegistry) {
    this.templateRegistry = templateRegistry;
  }

  get(name: string): ViewTemplate<unknown> | undefined {
    const template = this.templateRegistry.get(name);
    if (!template?.layout?.component) {
      return undefined; // Only return templates that have rendering components
    }

    // Convert unified Template to ViewTemplate format
    const parts = name.split(":");
    const pluginId = parts.length >= 2 && parts[0] ? parts[0] : "shell";

    const viewTemplate: ViewTemplate<unknown> = {
      name,
      schema: template.schema,
      description: template.description,
      pluginId,
      renderers: { web: template.layout.component },
      interactive: template.layout.interactive ?? false,
    };

    if (template.layout.routeLayout) {
      viewTemplate.routeLayout = template.layout.routeLayout;
    }

    return viewTemplate;
  }

  list(): ViewTemplate<unknown>[] {
    return this.templateRegistry
      .getNames()
      .map((name) => this.get(name))
      .filter(
        (template): template is ViewTemplate<unknown> => template !== undefined,
      );
  }

  validate(templateName: string, content: unknown): boolean {
    const template = this.templateRegistry.get(templateName);
    if (!template?.layout?.component) {
      return false; // Template must have rendering components to be valid for view validation
    }

    try {
      template.schema.parse(content);
      return true;
    } catch {
      return false;
    }
  }

  // ===== Advanced Template Methods =====

  findViewTemplate(filter: {
    name?: string;
    pluginId?: string;
    namePattern?: string;
  }): ViewTemplate<unknown> | undefined {
    const templates = this.list();

    return templates.find((template) => {
      if (filter.name && template.name !== filter.name) return false;
      if (filter.pluginId && template.pluginId !== filter.pluginId)
        return false;
      if (filter.namePattern) {
        const pattern = new RegExp(filter.namePattern);
        if (!pattern.test(template.name)) return false;
      }
      return true;
    });
  }

  // ===== Renderer Access Methods =====

  getRenderer(
    templateName: string,
    format: OutputFormat,
  ): WebRenderer | undefined {
    const template = this.get(templateName);
    if (!template) {
      return undefined;
    }

    return template.renderers[format];
  }

  hasRenderer(templateName: string, format: OutputFormat): boolean {
    return this.getRenderer(templateName, format) !== undefined;
  }

  listFormats(templateName: string): OutputFormat[] {
    const template = this.get(templateName);
    if (!template) {
      return [];
    }

    const formats: OutputFormat[] = [];
    if (template.renderers.web) formats.push("web");

    return formats;
  }
}

import type {
  RouteDefinition,
  ViewTemplate,
  OutputFormat,
  WebRenderer,
  ViewRegistry as IViewRegistry,
  Template,
} from "@brains/types";
import { RouteRegistry } from "./route-registry";
import { ViewTemplateRegistry } from "./view-template-registry";

/**
 * ViewRegistry - Combines route and template management
 *
 * This is the shell's implementation that owns the actual registries
 */
export class ViewRegistry implements IViewRegistry {
  private static instance: ViewRegistry | null = null;

  private routeRegistry: RouteRegistry;
  private viewTemplateRegistry: ViewTemplateRegistry;

  public static getInstance(): ViewRegistry {
    ViewRegistry.instance ??= new ViewRegistry();
    return ViewRegistry.instance;
  }

  public static resetInstance(): void {
    ViewRegistry.instance = null;
    RouteRegistry.resetInstance();
    ViewTemplateRegistry.resetInstance();
  }

  public static createFresh(): ViewRegistry {
    return new ViewRegistry();
  }

  private constructor() {
    this.routeRegistry = RouteRegistry.getInstance();
    this.viewTemplateRegistry = ViewTemplateRegistry.getInstance();
  }

  // ===== Route Methods =====

  registerRoute(definition: RouteDefinition): void {
    this.routeRegistry.register(definition);
  }

  getRoute(path: string): RouteDefinition | undefined {
    return this.routeRegistry.get(path);
  }

  listRoutes(): RouteDefinition[] {
    return this.routeRegistry.list();
  }

  // ===== View Template Methods =====

  registerTemplate<T>(name: string, template: Template<T>): void {
    // Extract plugin ID from namespaced name
    const parts = name.split(":");
    if (parts.length < 2) {
      throw new Error(
        `Template name must be namespaced (plugin-id:template-name), got: ${name}`,
      );
    }

    const pluginId = parts[0]; // Safe because we already checked parts.length >= 2
    if (!pluginId) {
      throw new Error(`Invalid template name format: ${name}`);
    }

    // Ensure template has layout and component
    if (!template.layout?.component) {
      throw new Error(
        `Template ${name} must have a layout.component for view registration`,
      );
    }

    // Convert Template to ViewTemplate
    const viewTemplate: ViewTemplate<unknown> = {
      name,
      schema: template.schema,
      description: template.description,
      pluginId,
      renderers: { web: template.layout.component as WebRenderer<unknown> },
      interactive: template.layout.interactive ?? false,
    };

    this.viewTemplateRegistry.register(viewTemplate);
  }

  registerViewTemplate(definition: ViewTemplate<unknown>): void {
    this.viewTemplateRegistry.register(definition);
  }

  getViewTemplate(name: string): ViewTemplate<unknown> | undefined {
    return this.viewTemplateRegistry.get(name);
  }

  listViewTemplates(): ViewTemplate<unknown>[] {
    return this.viewTemplateRegistry.list();
  }

  validateViewTemplate(templateName: string, content: unknown): boolean {
    return this.viewTemplateRegistry.validate(templateName, content);
  }

  // ===== Renderer Access Methods =====

  getRenderer(
    templateName: string,
    format: OutputFormat,
  ): WebRenderer | undefined {
    const template = this.viewTemplateRegistry.get(templateName);
    if (!template) {
      return undefined;
    }

    return template.renderers[format];
  }

  hasRenderer(templateName: string, format: OutputFormat): boolean {
    return this.getRenderer(templateName, format) !== undefined;
  }

  listFormats(templateName: string): OutputFormat[] {
    const template = this.viewTemplateRegistry.get(templateName);
    if (!template) {
      return [];
    }

    const formats: OutputFormat[] = [];
    if (template.renderers.web) formats.push("web");
    // Future: if (template.renderers.pdf) formats.push('pdf');
    // Future: if (template.renderers.email) formats.push('email');
    return formats;
  }
}

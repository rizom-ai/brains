import type {
  ViewTemplate,
  ViewTemplateRegistry as IViewTemplateRegistry,
  OutputFormat,
  Renderer,
} from "./render-types";
import type { TemplateRegistry } from "./registry";

export class RenderService implements IViewTemplateRegistry {
  private templateRegistry: TemplateRegistry;

  public static createFresh(templateRegistry: TemplateRegistry): RenderService {
    return new RenderService(templateRegistry);
  }

  private constructor(templateRegistry: TemplateRegistry) {
    this.templateRegistry = templateRegistry;
  }

  get(name: string): ViewTemplate | undefined {
    const template = this.templateRegistry.get(name);
    if (!template?.layout?.component) {
      return undefined; // Only return templates that have rendering components
    }

    // Convert unified Template to ViewTemplate format
    const parts = name.split(":");
    const pluginId = parts.length >= 2 && parts[0] ? parts[0] : "shell";

    const viewTemplate: ViewTemplate = {
      name,
      schema: template.schema,
      description: template.description,
      pluginId,
      renderers: { web: template.layout.component },
    };

    if (template.layout.fullscreen) {
      viewTemplate.fullscreen = template.layout.fullscreen;
    }
    if (template.runtimeScripts && template.runtimeScripts.length > 0) {
      viewTemplate.runtimeScripts = template.runtimeScripts;
    }
    if (
      template.staticAssets &&
      Object.keys(template.staticAssets).length > 0
    ) {
      viewTemplate.staticAssets = template.staticAssets;
    }

    return viewTemplate;
  }

  list(): ViewTemplate[] {
    return this.templateRegistry
      .getNames()
      .map((name) => this.get(name))
      .filter((template): template is ViewTemplate => template !== undefined);
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
  }): ViewTemplate | undefined {
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
  ): Renderer | undefined {
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
    if (template.renderers.image) formats.push("image");
    if (template.renderers.pdf) formats.push("pdf");

    return formats;
  }
}

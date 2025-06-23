import type {
  ViewTemplate,
  ViewTemplateRegistry as IViewTemplateRegistry,
} from "@brains/types";
import { ViewTemplateSchema } from "@brains/types";

export class ViewTemplateRegistry implements IViewTemplateRegistry {
  private static instance: ViewTemplateRegistry | null = null;
  private templates = new Map<string, ViewTemplate<unknown>>();

  public static getInstance(): ViewTemplateRegistry {
    ViewTemplateRegistry.instance ??= new ViewTemplateRegistry();
    return ViewTemplateRegistry.instance;
  }

  public static resetInstance(): void {
    ViewTemplateRegistry.instance = null;
  }

  public static createFresh(): ViewTemplateRegistry {
    return new ViewTemplateRegistry();
  }

  private constructor() {}

  register(template: ViewTemplate<unknown>): void {
    // Validate template definition
    const validated = ViewTemplateSchema.parse(template);

    // Check for name conflicts
    if (this.templates.has(validated.name)) {
      throw new Error(`Template "${validated.name}" is already registered`);
    }

    // Ensure the template matches our interface (schema is required)
    const templateDef: ViewTemplate<unknown> = {
      name: validated.name,
      schema: template.schema,
      component: template.component,
      ...(validated.description && { description: validated.description }),
    };

    this.templates.set(validated.name, templateDef);
  }

  unregister(name: string): void {
    this.templates.delete(name);
  }

  get(name: string): ViewTemplate<unknown> | undefined {
    return this.templates.get(name);
  }

  list(): ViewTemplate<unknown>[] {
    return Array.from(this.templates.values());
  }

  validate(templateName: string, content: unknown): boolean {
    const template = this.templates.get(templateName);
    if (!template) {
      return false;
    }

    try {
      template.schema.parse(content);
      return true;
    } catch {
      return false;
    }
  }
}

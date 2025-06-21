import type {
  PageDefinition,
  PageRegistry as IPageRegistry,
} from "@brains/types";
import { PageDefinitionSchema } from "@brains/types";

export class PageRegistry implements IPageRegistry {
  private static instance: PageRegistry | null = null;
  private pages = new Map<string, PageDefinition>();

  public static getInstance(): PageRegistry {
    PageRegistry.instance ??= new PageRegistry();
    return PageRegistry.instance;
  }

  public static resetInstance(): void {
    PageRegistry.instance = null;
  }

  public static createFresh(): PageRegistry {
    return new PageRegistry();
  }

  private constructor() {}

  register(page: PageDefinition): void {
    // Validate page definition
    const validated = PageDefinitionSchema.parse(page);

    // Check for path conflicts
    if (this.pages.has(validated.path)) {
      const existing = this.pages.get(validated.path);
      if (!existing) {
        throw new Error(`Unexpected missing page at path: ${validated.path}`);
      }
      throw new Error(
        `Page path "${validated.path}" already registered by plugin "${existing.pluginId}"`,
      );
    }

    this.pages.set(validated.path, validated);
  }

  unregister(path: string): void {
    this.pages.delete(path);
  }

  get(path: string): PageDefinition | undefined {
    return this.pages.get(path);
  }

  list(): PageDefinition[] {
    return Array.from(this.pages.values());
  }

  listByPlugin(pluginId: string): PageDefinition[] {
    return Array.from(this.pages.values()).filter(
      (page) => page.pluginId === pluginId,
    );
  }
}

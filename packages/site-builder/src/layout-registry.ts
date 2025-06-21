import type {
  LayoutDefinition,
  LayoutRegistry as ILayoutRegistry,
} from "./types";
import { LayoutDefinitionSchema } from "./types";

export class LayoutRegistry implements ILayoutRegistry {
  private static instance: LayoutRegistry | null = null;
  private layouts = new Map<string, LayoutDefinition>();

  public static getInstance(): LayoutRegistry {
    LayoutRegistry.instance ??= new LayoutRegistry();
    return LayoutRegistry.instance;
  }

  public static resetInstance(): void {
    LayoutRegistry.instance = null;
  }

  public static createFresh(): LayoutRegistry {
    return new LayoutRegistry();
  }

  private constructor() {}

  register(layout: LayoutDefinition): void {
    // Validate layout definition
    const validated = LayoutDefinitionSchema.parse(layout);

    // Check for name conflicts
    if (this.layouts.has(validated.name)) {
      throw new Error(`Layout "${validated.name}" is already registered`);
    }

    this.layouts.set(validated.name, validated);
  }

  unregister(name: string): void {
    this.layouts.delete(name);
  }

  get(name: string): LayoutDefinition | undefined {
    return this.layouts.get(name);
  }

  list(): LayoutDefinition[] {
    return Array.from(this.layouts.values());
  }

  validate(layoutName: string, content: unknown): boolean {
    const layout = this.layouts.get(layoutName);
    if (!layout) {
      return false;
    }

    try {
      layout.schema.parse(content);
      return true;
    } catch {
      return false;
    }
  }
}

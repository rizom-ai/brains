interface PrioritizedItem {
  priority: number;
  label: string;
  pluginId: string;
}

/**
 * Map-keyed registry for items sorted by (priority, label).
 *
 * Concrete subclasses provide a parse step (typically a zod schema) and
 * a per-item id selector — the registry combines `pluginId:id` to dedupe
 * registrations, support per-plugin unregister, and survive re-registration
 * during HMR/test reruns.
 */
export class PrioritizedRegistry<TInput, T extends PrioritizedItem> {
  private readonly items = new Map<string, T>();

  constructor(
    private readonly parse: (input: TInput) => T,
    private readonly idOf: (item: T) => string,
  ) {}

  public register(input: TInput): void {
    const parsed = this.parse(input);
    this.items.set(this.keyFor(parsed.pluginId, this.idOf(parsed)), parsed);
  }

  public unregister(pluginId: string, id?: string): void {
    if (id !== undefined) {
      this.items.delete(this.keyFor(pluginId, id));
      return;
    }
    const prefix = `${pluginId}:`;
    for (const key of this.items.keys()) {
      if (key.startsWith(prefix)) {
        this.items.delete(key);
      }
    }
  }

  public list(): T[] {
    return Array.from(this.items.values()).sort(
      (a, b) => a.priority - b.priority || a.label.localeCompare(b.label),
    );
  }

  private keyFor(pluginId: string, id: string): string {
    return `${pluginId}:${id}`;
  }
}

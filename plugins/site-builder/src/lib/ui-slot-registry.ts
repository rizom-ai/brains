import type { ComponentType } from "preact";

/**
 * Registration for a UI slot
 */
export interface SlotRegistration {
  /** Plugin that registered this slot */
  pluginId: string;
  /** Component to render */
  component: ComponentType<Record<string, unknown>>;
  /** Props to pass to component */
  props?: Record<string, unknown>;
  /** Priority for ordering (higher = first, default 50) */
  priority?: number;
}

/**
 * Internal slot entry with normalized priority
 */
interface SlotEntry extends SlotRegistration {
  priority: number;
}

/**
 * Registry for UI slot components
 *
 * Plugins register components to named slots (e.g., "footer-top").
 * Layouts can then render all components registered to a slot.
 */
export class UISlotRegistry {
  private slots: Map<string, SlotEntry[]> = new Map();

  /**
   * Register a component to a slot
   */
  register(slotName: string, registration: SlotRegistration): void {
    const entry: SlotEntry = {
      ...registration,
      priority: registration.priority ?? 50,
    };

    const existing = this.slots.get(slotName) ?? [];
    existing.push(entry);
    this.slots.set(slotName, existing);
  }

  /**
   * Get all registrations for a slot, sorted by priority (highest first)
   */
  getSlot(slotName: string): SlotEntry[] {
    const entries = this.slots.get(slotName) ?? [];
    return [...entries].sort((a, b) => b.priority - a.priority);
  }

  /**
   * Check if a slot has any registrations
   */
  hasSlot(slotName: string): boolean {
    const entries = this.slots.get(slotName);
    return entries !== undefined && entries.length > 0;
  }

  /**
   * Remove a specific plugin's registration from a slot
   */
  unregister(slotName: string, pluginId: string): void {
    const entries = this.slots.get(slotName);
    if (!entries) return;

    const filtered = entries.filter((e) => e.pluginId !== pluginId);
    if (filtered.length > 0) {
      this.slots.set(slotName, filtered);
    } else {
      this.slots.delete(slotName);
    }
  }

  /**
   * Remove all registrations for a plugin across all slots
   */
  unregisterAll(pluginId: string): void {
    for (const [slotName, entries] of this.slots) {
      const filtered = entries.filter((e) => e.pluginId !== pluginId);
      if (filtered.length > 0) {
        this.slots.set(slotName, filtered);
      } else {
        this.slots.delete(slotName);
      }
    }
  }

  /**
   * Get all registered slot names
   */
  getSlotNames(): string[] {
    return Array.from(this.slots.keys());
  }

  /**
   * Clear all registrations
   */
  clear(): void {
    this.slots.clear();
  }
}

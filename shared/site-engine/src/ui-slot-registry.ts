import type { LayoutSlots, SiteSlotRegistration } from "./layout-contracts";

/**
 * Registration for a UI slot.
 * Uses a pre-bound render function for type-safe heterogeneous storage.
 */
export type SlotRegistration = SiteSlotRegistration;

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
export class UISlotRegistry implements LayoutSlots {
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
   * Get all registrations for a slot, sorted by priority (highest first).
   * Returns the public registration shape — the normalized priority is an
   * internal detail consumers cannot name.
   */
  getSlot(slotName: string): SiteSlotRegistration[] {
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
    this.pruneSlot(slotName, pluginId);
  }

  /**
   * Remove all registrations for a plugin across all slots
   */
  unregisterAll(pluginId: string): void {
    for (const slotName of [...this.slots.keys()]) {
      this.pruneSlot(slotName, pluginId);
    }
  }

  private pruneSlot(slotName: string, pluginId: string): void {
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

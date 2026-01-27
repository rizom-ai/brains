import type { JSX } from "preact";

/**
 * Registration for a UI slot that plugins can provide.
 * Uses a pre-bound render function for type-safe heterogeneous storage.
 */
export interface SlotRegistration {
  /** Name of the slot to register to (e.g., "footer-top") */
  slotName: string;
  /** Plugin that registered this slot */
  pluginId: string;
  /** Pre-bound render function - type safety enforced at creation */
  render: () => JSX.Element | null;
  /** Priority for ordering (higher = first, default 50) */
  priority?: number;
}
